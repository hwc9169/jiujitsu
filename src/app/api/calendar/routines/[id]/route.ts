import { NextResponse } from "next/server";
import { isTimeRangeValid, isValidTimeOnly, normalizeOptionalText, normalizeTimeOnly } from "@/lib/calendar/utils";
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
};

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

async function getRoutineById(id: string, gymId: string): Promise<RoutineRow | null> {
  const sb = supabaseServer();
  const { data, error } = await sb
    .from("routines")
    .select("id, gym_id, program_id, day_of_week, start_time, end_time, capacity, coach_name, effective_from")
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

    const nextProgramId =
      typeof body?.program_id === "string" && body.program_id.trim().length > 0
        ? body.program_id.trim()
        : routine.program_id;
    const nextDayOfWeek = "day_of_week" in body ? parseDayOfWeek(body.day_of_week) : routine.day_of_week;
    const nextStartTime =
      "start_time" in body
        ? (typeof body.start_time === "string" && isValidTimeOnly(body.start_time)
          ? normalizeTimeOnly(body.start_time)
          : null)
        : routine.start_time;
    const nextEndTime =
      "end_time" in body
        ? (typeof body.end_time === "string" && isValidTimeOnly(body.end_time)
          ? normalizeTimeOnly(body.end_time)
          : null)
        : routine.end_time;

    const capacityParsed = "capacity" in body ? parseOptionalCapacity(body.capacity) : { ok: true, value: routine.capacity };
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

    const sb = supabaseServer();
    const { data, error } = await sb
      .from("routines")
      .update({
        program_id: nextProgramId,
        day_of_week: nextDayOfWeek,
        start_time: nextStartTime,
        end_time: nextEndTime,
        capacity: capacityParsed.value,
        coach_name: nextCoachName,
      })
      .eq("id", routine.id)
      .eq("gym_id", gymId)
      .select("id, gym_id, program_id, day_of_week, start_time, end_time, capacity, coach_name, effective_from, created_at, program:programs(id, name, color, is_active)")
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ routine: data });
  } catch (error: unknown) {
    return NextResponse.json({ error: toErrorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: RouteContext) {
  try {
    const userId = await requireUserIdFromAuthHeader(_req);
    const gymId = await getGymIdByUserId(userId);
    if (!gymId) return NextResponse.json({ error: "No gym" }, { status: 404 });

    const { id } = await params;
    const routine = await getRoutineById(id, gymId);
    if (!routine) return NextResponse.json({ error: "routine not found" }, { status: 404 });

    const sb = supabaseServer();
    const { error } = await sb.from("routines").delete().eq("id", routine.id).eq("gym_id", gymId);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: toErrorMessage(error) }, { status: 500 });
  }
}
