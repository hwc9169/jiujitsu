import { NextResponse } from "next/server";
import { getGymIdByUserId, requireUserIdFromAuthHeader } from "@/lib/supabase/gym";
import {
  ensureGymScheduleSlug,
  generateUniqueScheduleSlug,
  getGymPublicScheduleSettings,
  isScheduleSlugTaken,
  normalizeAccessCode,
  normalizeScheduleSlug,
} from "@/lib/public-schedule";
import { supabaseServer } from "@/lib/supabase/server";

const ADMIN_ROLES = new Set(["OWNER", "ADMIN"]);

type GymMembershipRow = {
  gym_id: string;
  role: string | null;
};

function isLocalBypassEnabled() {
  return process.env.NODE_ENV === "development" && process.env.LOCAL_DEV_AUTH_BYPASS === "true";
}

function isUnauthorizedErrorMessage(message: string) {
  return message.includes("Missing Authorization Bearer token") || message.includes("Invalid token");
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Internal server error";
}

function toRoleName(role: string | null | undefined) {
  return (role ?? "").trim().toUpperCase();
}

function buildShareUrl(origin: string, slug: string | null) {
  if (!slug) return null;
  return `${origin}/g/${slug}`;
}

function toResponse(origin: string, row: Awaited<ReturnType<typeof getGymPublicScheduleSettings>>) {
  if (!row) return null;
  return {
    enabled: row.public_schedule_enabled,
    slug: row.public_schedule_slug,
    shareUrl: buildShareUrl(origin, row.public_schedule_slug),
    accessCodeEnabled: Boolean(row.public_schedule_access_code),
  };
}

async function getMembershipByUserId(userId: string) {
  const sb = supabaseServer();
  const { data, error } = await sb
    .from("gym_users")
    .select("gym_id, role")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data ?? null) as GymMembershipRow | null;
}

async function requireAdminGymContext(userId: string) {
  const membership = await getMembershipByUserId(userId);
  if (!membership?.gym_id) {
    if (isLocalBypassEnabled()) {
      const gymId = await getGymIdByUserId(userId);
      if (gymId) return { gymId, role: "OWNER" };
    }
    throw new Error("No gym");
  }

  const role = toRoleName(membership.role);
  if (!ADMIN_ROLES.has(role) && !isLocalBypassEnabled()) {
    throw new Error("Only gym admins can change public schedule settings");
  }

  return { gymId: membership.gym_id, role };
}

export async function GET(req: Request) {
  try {
    const userId = await requireUserIdFromAuthHeader(req);
    const { gymId } = await requireAdminGymContext(userId);

    let settings = await getGymPublicScheduleSettings(gymId);
    if (!settings) return NextResponse.json({ error: "Gym not found" }, { status: 404 });
    if (!settings.public_schedule_slug) {
      await ensureGymScheduleSlug(settings.id, settings.name);
      settings = await getGymPublicScheduleSettings(gymId);
      if (!settings) return NextResponse.json({ error: "Gym not found" }, { status: 404 });
    }

    const origin = new URL(req.url).origin;
    return NextResponse.json({ settings: toResponse(origin, settings) });
  } catch (error: unknown) {
    const message = toErrorMessage(error);
    const status = isUnauthorizedErrorMessage(message)
      ? 401
      : message === "No gym"
        ? 404
        : message.includes("Only gym admins")
          ? 403
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(req: Request) {
  try {
    const userId = await requireUserIdFromAuthHeader(req);
    const { gymId } = await requireAdminGymContext(userId);

    const current = await getGymPublicScheduleSettings(gymId);
    if (!current) return NextResponse.json({ error: "Gym not found" }, { status: 404 });

    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const patch: Record<string, unknown> = {};

    if ("enabled" in body) {
      if (typeof body.enabled !== "boolean") {
        return NextResponse.json({ error: "enabled must be boolean" }, { status: 400 });
      }
      patch.public_schedule_enabled = body.enabled;
    }

    if ("slug" in body) {
      if (typeof body.slug !== "string") {
        return NextResponse.json({ error: "slug must be string" }, { status: 400 });
      }
      const rawSlug = body.slug.trim();
      if (!rawSlug) {
        patch.public_schedule_slug = await generateUniqueScheduleSlug(current.name, current.id);
      } else {
        const normalizedSlug = normalizeScheduleSlug(rawSlug);
        if (!normalizedSlug) {
          return NextResponse.json(
            { error: "slug must be lowercase letters, numbers, hyphen (3~64 chars)" },
            { status: 400 },
          );
        }
        const taken = await isScheduleSlugTaken(normalizedSlug, current.id);
        if (taken) {
          return NextResponse.json({ error: "slug is already in use" }, { status: 409 });
        }
        patch.public_schedule_slug = normalizedSlug;
      }
    }

    if ("accessCode" in body) {
      if (body.accessCode == null || body.accessCode === "") {
        patch.public_schedule_access_code = null;
      } else {
        const normalized = normalizeAccessCode(body.accessCode);
        if (!normalized) {
          return NextResponse.json({ error: "accessCode must be a non-empty string up to 50 chars" }, { status: 400 });
        }
        patch.public_schedule_access_code = normalized;
      }
    }

    const willEnable = (patch.public_schedule_enabled as boolean | undefined) ?? current.public_schedule_enabled;
    const nextSlug = (patch.public_schedule_slug as string | undefined) ?? current.public_schedule_slug;
    if (willEnable && !nextSlug) {
      patch.public_schedule_slug = await generateUniqueScheduleSlug(current.name, current.id);
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const sb = supabaseServer();
    const { data, error } = await sb
      .from("gyms")
      .update(patch)
      .eq("id", current.id)
      .select("id, name, public_schedule_enabled, public_schedule_slug, public_schedule_access_code")
      .single();

    if (error) {
      const lowered = error.message.toLowerCase();
      if (lowered.includes("duplicate key") || lowered.includes("unique")) {
        return NextResponse.json({ error: "slug is already in use" }, { status: 409 });
      }
      throw new Error(error.message);
    }

    const origin = new URL(req.url).origin;
    return NextResponse.json({ settings: toResponse(origin, data) });
  } catch (error: unknown) {
    const message = toErrorMessage(error);
    const status = isUnauthorizedErrorMessage(message)
      ? 401
      : message === "No gym"
        ? 404
        : message.includes("Only gym admins")
          ? 403
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
