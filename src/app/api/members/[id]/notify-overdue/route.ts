import { NextResponse } from "next/server";
import { getGymIdByUserId, requireUserIdFromAuthHeader } from "@/lib/supabase/gym";
import { supabaseServer } from "@/lib/supabase/server";
import { sendTwilioSms } from "@/lib/twilio";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type MemberNoticeRow = {
  id: string;
  name: string;
  phone: string;
  expire_date: string;
  membership_state: "ACTIVE" | "PAUSED" | null;
  paused_at: string | null;
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

function resolveEffectiveExpireDate(member: MemberNoticeRow) {
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

function isOverdue(expireDate: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expire = parseDateOnly(expireDate);
  expire.setHours(0, 0, 0, 0);
  return expire < today;
}

function buildOverdueReminderBody(memberName: string, gymName: string | null, effectiveExpireDate: string) {
  const sender = gymName?.trim() || "주짓때로";
  return `[${sender}] ${memberName} 회원님, 회비가 미납 상태입니다. 만료일은 ${effectiveExpireDate}입니다. 확인 부탁드립니다.`;
}

export async function POST(req: Request, { params }: RouteContext) {
  try {
    const userId = await requireUserIdFromAuthHeader(req);
    const gymId = await getGymIdByUserId(userId);
    if (!gymId) return NextResponse.json({ error: "No gym" }, { status: 404 });

    const { id } = await params;
    const sb = supabaseServer();

    const { data: member, error: memberError } = await sb
      .from("members")
      .select("id, name, phone, expire_date, membership_state, paused_at")
      .eq("id", id)
      .eq("gym_id", gymId)
      .is("deleted_at", null)
      .maybeSingle<MemberNoticeRow>();

    if (memberError) throw new Error(memberError.message);
    if (!member) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    if (!member.phone?.trim()) {
      return NextResponse.json({ error: "Member phone is missing" }, { status: 400 });
    }

    const effectiveExpireDate = resolveEffectiveExpireDate(member);
    if (!isOverdue(effectiveExpireDate)) {
      return NextResponse.json({ error: "Only overdue members can receive overdue reminder SMS." }, { status: 400 });
    }

    const { data: gym, error: gymError } = await sb.from("gyms").select("name").eq("id", gymId).limit(1).maybeSingle();
    if (gymError) throw new Error(gymError.message);
    const body = buildOverdueReminderBody(member.name, gym?.name ?? null, effectiveExpireDate);

    const sms = await sendTwilioSms({
      to: member.phone,
      body,
    });

    let logWarning: string | null = null;
    const { error: logError } = await sb.from("message_logs").insert({
      gym_id: gymId,
      member_id: member.id,
      type: "OVERDUE",
      to_phone: member.phone,
      body,
      status: "SENT",
      sent_at: new Date().toISOString(),
    });
    if (logError) {
      logWarning = logError.message;
    }

    return NextResponse.json({
      ok: true,
      sid: sms.sid,
      status: sms.status,
      to: sms.to,
      log_saved: logWarning === null,
      log_warning: logWarning,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 },
    );
  }
}
