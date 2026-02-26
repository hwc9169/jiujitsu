import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { requireUserIdFromAuthHeader } from "@/lib/supabase/gym";
import { supabaseServer } from "@/lib/supabase/server";
import {
  SOLAPI_TEMPLATE_KEY,
  daysLeftFromToday,
  normalizePhoneForMessage,
  sendSolapiAlimtalkGroup,
  type SolapiAlimtalkRecipient,
  type SolapiTemplateVariables,
} from "@/lib/solapi";

type RouteContext = {
  params: Promise<{ gymId: string }>;
};

type MemberRow = {
  id: string;
  name: string;
  phone: string;
  expire_date: string;
  membership_state: "ACTIVE" | "PAUSED" | null;
  paused_at: string | null;
};

type GymRow = {
  id: string;
  name: string;
  contact_phone: string | null;
};

type GymUserRow = {
  role: "OWNER" | "STAFF" | string;
};

const ONE_DAY_MS = 86_400_000;

function parseDateOnly(dateString: string) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function toDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDaysToDateString(baseDate: string, days: number) {
  const date = parseDateOnly(baseDate);
  date.setDate(date.getDate() + days);
  return toDateString(date);
}

function resolveEffectiveExpireDate(member: MemberRow) {
  if (member.membership_state !== "PAUSED" || !member.paused_at) {
    return member.expire_date;
  }

  const pausedStart = new Date(member.paused_at);
  if (Number.isNaN(pausedStart.getTime())) {
    return member.expire_date;
  }

  const pausedStartMidnight = new Date(pausedStart.getFullYear(), pausedStart.getMonth(), pausedStart.getDate());
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const pausedDays = Math.max(
    0,
    Math.floor((todayMidnight.getTime() - pausedStartMidnight.getTime()) / ONE_DAY_MS),
  );
  return pausedDays > 0 ? addDaysToDateString(member.expire_date, pausedDays) : member.expire_date;
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.trim()).filter(Boolean);
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Internal server error";
}

function validateMemberIds(memberIds: string[]) {
  if (memberIds.length === 0) {
    throw new Error("member_ids must not be empty");
  }
  if (memberIds.length > 10000) {
    throw new Error("member_ids must not exceed 10000");
  }
}

export async function POST(req: Request, { params }: RouteContext) {
  try {
    const { gymId } = await params;
    const userId = await requireUserIdFromAuthHeader(req);

    const payload = await req.json().catch(() => ({}));
    const memberIds = toStringArray(payload?.member_ids);
    validateMemberIds(memberIds);
    const dedupedMemberIds = Array.from(new Set(memberIds));

    const sb = supabaseServer();

    const { data: gymUser, error: gymUserError } = await sb
      .from("gym_users")
      .select("role")
      .eq("gym_id", gymId)
      .eq("user_id", userId)
      .maybeSingle<GymUserRow>();

    if (gymUserError) throw new Error(gymUserError.message);
    if (!gymUser || !["OWNER", "STAFF"].includes(gymUser.role)) {
      return NextResponse.json({ error: "Only gym admins can send messages." }, { status: 403 });
    }

    const { data: gym, error: gymError } = await sb
      .from("gyms")
      .select("id, name, contact_phone")
      .eq("id", gymId)
      .maybeSingle<GymRow>();

    if (gymError) throw new Error(gymError.message);
    if (!gym) {
      return NextResponse.json({ error: "Gym not found" }, { status: 404 });
    }

    const { data: members, error: membersError } = await sb
      .from("members")
      .select("id, name, phone, expire_date, membership_state, paused_at")
      .eq("gym_id", gymId)
      .is("deleted_at", null)
      .in("id", dedupedMemberIds);

    if (membersError) throw new Error(membersError.message);

    const memberList = (members ?? []) as MemberRow[];
    if (memberList.length === 0) {
      return NextResponse.json({ error: "No valid members found for member_ids" }, { status: 400 });
    }

    const memberMap = new Map(memberList.map((member) => [member.id, member]));
    const orderedMembers = dedupedMemberIds
      .map((id) => memberMap.get(id))
      .filter((member): member is MemberRow => Boolean(member));

    const fallbackContactPhone = normalizePhoneForMessage(process.env.SOLAPI_FROM_NUMBER ?? "");
    const gymContactPhone = normalizePhoneForMessage(gym.contact_phone) || fallbackContactPhone;
    if (!gymContactPhone) {
      return NextResponse.json({ error: "Gym contact phone is missing" }, { status: 400 });
    }

    const now = new Date().toISOString();

    const { data: createdJob, error: jobError } = await sb
      .from("message_jobs")
      .insert({
        gym_id: gymId,
        requested_by: userId,
        mode: "bulk",
        template_key: SOLAPI_TEMPLATE_KEY,
        status: "processing",
        requested_count: dedupedMemberIds.length,
        sent_count: 0,
        failed_count: 0,
        blocked_count: 0,
        sent_at: now,
      })
      .select("id")
      .single();

    if (jobError) throw new Error(jobError.message);

    const jobId = createdJob.id;

    const queuedRecipients: Array<{ outboxId: string; recipient: SolapiAlimtalkRecipient }> = [];
    const outboxRows = orderedMembers.map((member) => {
      const toPhone = normalizePhoneForMessage(member.phone);
      const effectiveExpireDate = resolveEffectiveExpireDate(member);
      const variables: SolapiTemplateVariables = {
        "#{gym_name}": gym.name,
        "#{member_name}": member.name,
        "#{expiry_date}": effectiveExpireDate,
        "#{days_left}": daysLeftFromToday(effectiveExpireDate),
        "#{contact_phone}": gymContactPhone,
      };

      const outboxId = randomUUID();
      if (toPhone.length < 9) {
        return {
          id: outboxId,
          job_id: jobId,
          gym_id: gymId,
          member_id: member.id,
          member_name: member.name,
          to_phone: toPhone,
          template_key: SOLAPI_TEMPLATE_KEY,
          template_variables: variables,
          status: "blocked",
          error_message: "Invalid member phone",
        };
      }

      queuedRecipients.push({ outboxId, recipient: { to: toPhone, variables } });
      return {
        id: outboxId,
        job_id: jobId,
        gym_id: gymId,
        member_id: member.id,
        member_name: member.name,
        to_phone: toPhone,
        template_key: SOLAPI_TEMPLATE_KEY,
        template_variables: variables,
        status: "queued",
      };
    });

    const { error: outboxError } = await sb.from("message_outbox").insert(outboxRows);
    if (outboxError) throw new Error(outboxError.message);

    const blockedCount = outboxRows.filter((row) => row.status === "blocked").length;

    if (queuedRecipients.length === 0) {
      const status = blockedCount > 0 ? "failed" : "completed";
      const { error: updateNoRecipientError } = await sb
        .from("message_jobs")
        .update({
          status,
          sent_count: 0,
          failed_count: 0,
          blocked_count: blockedCount,
          completed_at: new Date().toISOString(),
          error_message: blockedCount > 0 ? "No sendable recipients" : null,
        })
        .eq("id", jobId);

      if (updateNoRecipientError) throw new Error(updateNoRecipientError.message);

      return NextResponse.json({
        ok: true,
        job_id: jobId,
        counts: {
          requested: dedupedMemberIds.length,
          sent: 0,
          failed: 0,
          blocked: blockedCount,
        },
      });
    }

    try {
      const providerResult = await sendSolapiAlimtalkGroup(queuedRecipients.map((entry) => entry.recipient));
      const sentAt = new Date().toISOString();

      const { error: markSentError } = await sb
        .from("message_outbox")
        .update({
          status: "sent",
          provider_status: "accepted",
          provider_group_id: providerResult.groupId,
          provider_response: providerResult.response,
          sent_at: sentAt,
        })
        .eq("job_id", jobId)
        .eq("status", "queued");

      if (markSentError) throw new Error(markSentError.message);

      const sentCount = queuedRecipients.length;
      const failedCount = 0;
      const status = blockedCount > 0 ? "partial_failed" : "completed";

      const { error: updateJobError } = await sb
        .from("message_jobs")
        .update({
          status,
          sent_count: sentCount,
          failed_count: failedCount,
          blocked_count: blockedCount,
          provider_group_id: providerResult.groupId,
          provider_response: providerResult.response,
          completed_at: new Date().toISOString(),
        })
        .eq("id", jobId);

      if (updateJobError) throw new Error(updateJobError.message);

      return NextResponse.json({
        ok: true,
        job_id: jobId,
        counts: {
          requested: dedupedMemberIds.length,
          sent: sentCount,
          failed: failedCount,
          blocked: blockedCount,
        },
      });
    } catch (sendError: unknown) {
      const sendErrorMessage = toErrorMessage(sendError);
      const failedAt = new Date().toISOString();

      const { error: markFailedOutboxError } = await sb
        .from("message_outbox")
        .update({
          status: "failed",
          error_message: sendErrorMessage,
          provider_status: "failed",
          sent_at: failedAt,
        })
        .eq("job_id", jobId)
        .eq("status", "queued");

      if (markFailedOutboxError) throw new Error(markFailedOutboxError.message);

      const failedCount = queuedRecipients.length;
      const { error: updateJobFailedError } = await sb
        .from("message_jobs")
        .update({
          status: "failed",
          sent_count: 0,
          failed_count: failedCount,
          blocked_count: blockedCount,
          error_message: sendErrorMessage,
          completed_at: new Date().toISOString(),
        })
        .eq("id", jobId);

      if (updateJobFailedError) throw new Error(updateJobFailedError.message);

      return NextResponse.json(
        {
          error: sendErrorMessage,
          job_id: jobId,
          counts: {
            requested: dedupedMemberIds.length,
            sent: 0,
            failed: failedCount,
            blocked: blockedCount,
          },
        },
        { status: 502 },
      );
    }
  } catch (error: unknown) {
    const message = toErrorMessage(error);
    const status =
      message === "member_ids must not be empty" ||
      message === "member_ids must not exceed 10000"
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
