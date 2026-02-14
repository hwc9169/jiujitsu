import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { requireUserIdFromAuthHeader, getGymIdByUserId } from "@/lib/supabase/gym";
import type { MemberGender } from "@/lib/types";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const ONE_DAY_MS = 86_400_000;
const BELT_VALUES = ["흰띠", "그레이띠", "오렌지띠", "초록띠", "파란띠", "보라띠", "갈색띠", "검은띠"] as const;
const BELT_GRAL_VALUES = [0, 1, 2, 3, 4] as const;

function normalizeGender(value: unknown): MemberGender | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (["남", "남자", "male", "m"].includes(normalized)) return "남";
  if (["여", "여자", "female", "f"].includes(normalized)) return "여";
  return null;
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeBelt(value: unknown): (typeof BELT_VALUES)[number] | null {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  if ((BELT_VALUES as readonly string[]).includes(normalized)) {
    return normalized as (typeof BELT_VALUES)[number];
  }
  return null;
}

function normalizeBeltGral(value: unknown): (typeof BELT_GRAL_VALUES)[number] | null {
  if (value == null || value === "") return null;
  const num = typeof value === "number" ? value : (typeof value === "string" ? Number(value) : NaN);
  if (!Number.isInteger(num)) return null;
  if (!(BELT_GRAL_VALUES as readonly number[]).includes(num)) return null;
  return num as (typeof BELT_GRAL_VALUES)[number];
}

function normalizePhone(value: unknown): string {
  return typeof value === "string" ? value.replace(/\D/g, "") : "";
}

function normalizeDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (!DATE_REGEX.test(normalized)) return null;
  return normalized;
}

function toDateOnly(dateString: string): Date {
  const [y, m, d] = dateString.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDaysToDateString(base: string, days: number): string {
  const date = toDateOnly(base);
  date.setDate(date.getDate() + days);
  return toDateString(date);
}

export async function PATCH(req: Request, { params }: RouteContext) {
  try {
    const userId = await requireUserIdFromAuthHeader(req);
    const gymId = await getGymIdByUserId(userId);
    if (!gymId) return NextResponse.json({ error: "No gym" }, { status: 404 });

    const { id } = await params;
    const patch = await req.json();
    const action = typeof patch?.action === "string" ? patch.action.toUpperCase() : null;

    const sb = supabaseServer();

    if (action === "PAUSE") {
      const { data, error } = await sb
        .from("members")
        .update({
          membership_state: "PAUSED",
          paused_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("gym_id", gymId)
        .is("deleted_at", null)
        .select("*")
        .single();

      if (error) throw new Error(error.message);
      return NextResponse.json({ member: data });
    }

    if (action === "RESUME") {
      const { data: currentMember, error: currentError } = await sb
        .from("members")
        .select("id, expire_date, membership_state, paused_at, paused_days_total")
        .eq("id", id)
        .eq("gym_id", gymId)
        .is("deleted_at", null)
        .single();

      if (currentError) throw new Error(currentError.message);

      const membershipState = (currentMember?.membership_state as string | null) ?? "ACTIVE";
      if (membershipState !== "PAUSED") {
        return NextResponse.json({ error: "member is not paused" }, { status: 400 });
      }

      let pausedDays = 0;
      if (typeof currentMember?.paused_at === "string" && currentMember.paused_at) {
        const pausedStart = new Date(currentMember.paused_at);
        const today = new Date();
        const pausedStartMidnight = new Date(pausedStart.getFullYear(), pausedStart.getMonth(), pausedStart.getDate());
        const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        pausedDays = Math.max(0, Math.floor((todayMidnight.getTime() - pausedStartMidnight.getTime()) / ONE_DAY_MS));
      }

      const currentExpireDate = String(currentMember?.expire_date ?? "");
      const nextExpireDate = pausedDays > 0 ? addDaysToDateString(currentExpireDate, pausedDays) : currentExpireDate;
      const pausedDaysTotal = Number(currentMember?.paused_days_total ?? 0) + pausedDays;

      const { data, error } = await sb
        .from("members")
        .update({
          membership_state: "ACTIVE",
          paused_at: null,
          paused_days_total: pausedDaysTotal,
          expire_date: nextExpireDate,
        })
        .eq("id", id)
        .eq("gym_id", gymId)
        .is("deleted_at", null)
        .select("*")
        .single();

      if (error) throw new Error(error.message);
      return NextResponse.json({ member: data });
    }

    // 허용 필드만
    const allowed: Record<string, unknown> = {};
    for (const k of ["name", "phone", "gender", "belt", "belt_gral", "birth_date", "start_date", "expire_date", "memo"]) {
      if (k in patch) allowed[k] = patch[k];
    }
    if ("phone" in allowed) allowed.phone = normalizePhone(allowed.phone);
    if ("gender" in allowed) {
      const normalizedGender = normalizeGender(allowed.gender);
      if (!normalizedGender) {
        return NextResponse.json({ error: "gender must be 남 or 여" }, { status: 400 });
      }
      allowed.gender = normalizedGender;
    }
    if ("belt" in allowed) {
      if (allowed.belt == null || allowed.belt === "") {
        allowed.belt = null;
      } else {
        const normalizedBelt = normalizeBelt(allowed.belt);
        if (!normalizedBelt) {
          return NextResponse.json({ error: "belt is invalid" }, { status: 400 });
        }
        allowed.belt = normalizedBelt;
      }
    }
    if ("belt_gral" in allowed) {
      const normalizedBeltGral = normalizeBeltGral(allowed.belt_gral);
      if (normalizedBeltGral == null) {
        return NextResponse.json({ error: "belt_gral must be 0~4" }, { status: 400 });
      }
      allowed.belt_gral = normalizedBeltGral;
    }
    if ("birth_date" in allowed) {
      if (allowed.birth_date == null || allowed.birth_date === "") {
        allowed.birth_date = null;
      } else {
        const normalizedBirthDate = normalizeDate(allowed.birth_date);
        if (!normalizedBirthDate) {
          return NextResponse.json({ error: "birth_date must be YYYY-MM-DD" }, { status: 400 });
        }
        allowed.birth_date = normalizedBirthDate;
      }
    }
    if ("start_date" in allowed) {
      if (allowed.start_date == null || allowed.start_date === "") {
        allowed.start_date = null;
      } else {
        const normalizedStartDate = normalizeDate(allowed.start_date);
        if (!normalizedStartDate) {
          return NextResponse.json({ error: "start_date must be YYYY-MM-DD" }, { status: 400 });
        }
        allowed.start_date = normalizedStartDate;
      }
    }
    if ("expire_date" in allowed) {
      const normalizedExpireDate = normalizeDate(allowed.expire_date);
      if (!normalizedExpireDate) {
        return NextResponse.json({ error: "expire_date must be YYYY-MM-DD" }, { status: 400 });
      }
      allowed.expire_date = normalizedExpireDate;
    }

    const { data, error } = await sb
      .from("members")
      .update(allowed)
      .eq("id", id)
      .eq("gym_id", gymId)
      .is("deleted_at", null)
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ member: data });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request, { params }: RouteContext) {
  try {
    const userId = await requireUserIdFromAuthHeader(req);
    const gymId = await getGymIdByUserId(userId);
    if (!gymId) return NextResponse.json({ error: "No gym" }, { status: 404 });

    const { id } = await params;

    const sb = supabaseServer();
    const { data, error } = await sb
      .from("members")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .eq("gym_id", gymId)
      .is("deleted_at", null)
      .select("id")
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, id: data.id });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 },
    );
  }
}
