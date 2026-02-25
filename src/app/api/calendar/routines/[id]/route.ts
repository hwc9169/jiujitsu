import { NextResponse } from "next/server";
import { addDays, compareDateOnly, isTimeRangeValid, isValidDateOnly, isValidTimeOnly, normalizeOptionalText, normalizeTimeOnly } from "@/lib/calendar/utils";
import { getGymIdByUserId, requireUserIdFromAuthHeader } from "@/lib/supabase/gym";
import { supabaseServer } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type RoutineRow = {
  id: string;
  gym_id: string;
  program_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  capacity: number | null;
  coach_name: string | null;
  effective_from: string;
  effective_to: string | null;
};

function toDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateOnly(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function todayDateOnly() {
  const now = new Date();
  return toDateString(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
}

function nextWeekdayOnOrAfter(baseDate: string, dayOfWeek: number) {
  const date = parseDateOnly(baseDate);
  if (Number.isNaN(date.getTime())) return null;
  const diff = (dayOfWeek - date.getDay() + 7) % 7;
  date.setDate(date.getDate() + diff);
  return toDateString(date);
}

function parseDayOfWeek(value: unknown) {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(num) || num < 0 || num > 6) return null;
  return num;
}

function parseOptionalCapacity(value: unknown): { ok: boolean; value: number | null } {
  if (value == null || value === "") return { ok: true, value: null };
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return { ok: false, value: null };
  return { ok: true, value: parsed };
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Internal server error";
}

async function ensureProgramInGym(programId: string, gymId: string) {
  const sb = supabaseServer();
  const { data, error } = await sb
    .from("programs")
    .select("id")
    .eq("id", programId)
    .eq("gym_id", gymId)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.id ? true : false;
}

async function getRoutineById(id: string, gymId: string) {
  const sb = supabaseServer();
  const { data, error } = await sb
    .from("routines")
    .select("id, gym_id, program_id, day_of_week, start_time, end_time, capacity, coach_name, effective_from, effective_to")
    .eq("id", id)
    .eq("gym_id", gymId)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as RoutineRow | null;
}

export async function PATCH(req: Request, { params }: RouteContext) {
  try {
    const userId = await requireUserIdFromAuthHeader(req);
    const gymId = await getGymIdByUserId(userId);
    if (!gymId) return NextResponse.json({ error: "No gym" }, { status: 404 });

    const { id } = await params;
    const body = await req.json();
    const routine = await getRoutineById(id, gymId);
    if (!routine) return NextResponse.json({ error: "routine not found" }, { status: 404 });

    const nextProgramId = typeof body?.program_id === "string" && body.program_id.trim().length > 0
      ? body.program_id.trim()
      : routine.program_id;
    const nextDayOfWeek = "day_of_week" in body ? parseDayOfWeek(body.day_of_week) : routine.day_of_week;
    const nextStartTime = "start_time" in body
      ? (typeof body.start_time === "string" && isValidTimeOnly(body.start_time) ? normalizeTimeOnly(body.start_time) : null)
      : routine.start_time;
    const nextEndTime = "end_time" in body
      ? (typeof body.end_time === "string" && isValidTimeOnly(body.end_time) ? normalizeTimeOnly(body.end_time) : null)
      : routine.end_time;

    const capacityParsed = "capacity" in body
      ? parseOptionalCapacity(body.capacity)
      : { ok: true, value: routine.capacity };
    const nextCoachName = "coach_name" in body ? normalizeOptionalText(body.coach_name) : routine.coach_name;

    if (nextDayOfWeek == null) return NextResponse.json({ error: "day_of_week must be 0~6" }, { status: 400 });
    if (!nextStartTime || !nextEndTime) return NextResponse.json({ error: "start_time/end_time must be HH:mm" }, { status: 400 });
    if (!isTimeRangeValid(nextStartTime, nextEndTime)) {
      return NextResponse.json({ error: "start_time must be before end_time" }, { status: 400 });
    }
    if (!capacityParsed.ok) {
      return NextResponse.json({ error: "capacity must be a non-negative integer" }, { status: 400 });
    }

    const programExists = await ensureProgramInGym(nextProgramId, gymId);
    if (!programExists) return NextResponse.json({ error: "program not found" }, { status: 404 });

    const baseNextWeek = addDays(todayDateOnly(), 7);
    if (!baseNextWeek) {
      return NextResponse.json({ error: "failed to resolve next week date" }, { status: 500 });
    }

    let applyFrom = nextWeekdayOnOrAfter(baseNextWeek, nextDayOfWeek);
    if (!applyFrom) {
      return NextResponse.json({ error: "failed to resolve routine apply date" }, { status: 500 });
    }

    if (compareDateOnly(applyFrom, routine.effective_from) <= 0) {
      const nextAfterEffective = addDays(routine.effective_from, 1);
      if (!nextAfterEffective) {
        return NextResponse.json({ error: "failed to resolve current effective range" }, { status: 500 });
      }
      const adjustedApplyFrom = nextWeekdayOnOrAfter(nextAfterEffective, nextDayOfWeek);
      if (!adjustedApplyFrom) {
        return NextResponse.json({ error: "failed to resolve adjusted routine apply date" }, { status: 500 });
      }
      applyFrom = adjustedApplyFrom;
    }

    if (routine.effective_to && compareDateOnly(applyFrom, routine.effective_to) > 0) {
      return NextResponse.json({ error: "cannot update routine because it already ends before next week" }, { status: 400 });
    }

    const previousEffectiveTo = addDays(applyFrom, -1);
    if (!previousEffectiveTo) {
      return NextResponse.json({ error: "invalid apply_from" }, { status: 400 });
    }

    const sb = supabaseServer();

    const { error: closeError } = await sb
      .from("routines")
      .update({ effective_to: previousEffectiveTo })
      .eq("id", routine.id)
      .eq("gym_id", gymId);
    if (closeError) throw new Error(closeError.message);

    const { data: inserted, error: insertError } = await sb
      .from("routines")
      .insert({
        gym_id: gymId,
        program_id: nextProgramId,
        day_of_week: nextDayOfWeek,
        start_time: nextStartTime,
        end_time: nextEndTime,
        capacity: capacityParsed.value,
        coach_name: nextCoachName,
        effective_from: applyFrom,
        effective_to: routine.effective_to,
      })
      .select("id, gym_id, program_id, day_of_week, start_time, end_time, capacity, coach_name, effective_from, effective_to, created_at, program:programs(id, name, color, is_active)")
      .single();

    if (insertError) {
      const { error: rollbackError } = await sb
        .from("routines")
        .update({ effective_to: routine.effective_to })
        .eq("id", routine.id)
        .eq("gym_id", gymId);
      if (rollbackError) {
        throw new Error(`insert failed: ${insertError.message}; rollback failed: ${rollbackError.message}`);
      }
      throw new Error(insertError.message);
    }

    return NextResponse.json({
      routine: inserted,
      previous: {
        id: routine.id,
        effective_to: previousEffectiveTo,
      },
      applied_from: applyFrom,
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: toErrorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: RouteContext) {
  try {
    const userId = await requireUserIdFromAuthHeader(req);
    const gymId = await getGymIdByUserId(userId);
    if (!gymId) return NextResponse.json({ error: "No gym" }, { status: 404 });

    const { id } = await params;
    const routine = await getRoutineById(id, gymId);
    if (!routine) return NextResponse.json({ error: "routine not found" }, { status: 404 });

    const url = new URL(req.url);
    const applyFrom = url.searchParams.get("applyFrom") ?? todayDateOnly();
    if (!isValidDateOnly(applyFrom)) {
      return NextResponse.json({ error: "applyFrom must be YYYY-MM-DD" }, { status: 400 });
    }
    const today = todayDateOnly();
    if (compareDateOnly(applyFrom, today) < 0) {
      return NextResponse.json({ error: "applyFrom cannot be in the past" }, { status: 400 });
    }
    if (routine.effective_to && compareDateOnly(applyFrom, routine.effective_to) > 0) {
      return NextResponse.json({ error: "routine is already out of effective range" }, { status: 400 });
    }

    const sb = supabaseServer();
    if (compareDateOnly(applyFrom, routine.effective_from) <= 0) {
      const { error } = await sb
        .from("routines")
        .delete()
        .eq("id", routine.id)
        .eq("gym_id", gymId);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, mode: "deleted" });
    }

    const previousEffectiveTo = addDays(applyFrom, -1);
    if (!previousEffectiveTo) {
      return NextResponse.json({ error: "invalid applyFrom" }, { status: 400 });
    }

    const { error } = await sb
      .from("routines")
      .update({ effective_to: previousEffectiveTo })
      .eq("id", routine.id)
      .eq("gym_id", gymId);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, mode: "truncated", effective_to: previousEffectiveTo });
  } catch (error: unknown) {
    return NextResponse.json({ error: toErrorMessage(error) }, { status: 500 });
  }
}
