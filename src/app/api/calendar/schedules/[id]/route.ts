import { NextResponse } from "next/server";
import { compareDateOnly, isTimeRangeValid, isValidDateOnly, isValidTimeOnly, normalizeOptionalText, normalizeTimeOnly } from "@/lib/calendar/utils";
import { getGymIdByUserId, requireUserIdFromAuthHeader } from "@/lib/supabase/gym";
import { supabaseServer } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type ScheduleRow = {
  id: string;
  gym_id: string;
  date: string;
  routine_id: string | null;
  action: "CANCEL" | "MODIFY" | "ADD";
  program_id: string | null;
  start_time: string | null;
  end_time: string | null;
  capacity: number | null;
  coach_name: string | null;
  title: string | null;
  location: string | null;
  note: string | null;
};

function toDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayDateOnly() {
  const now = new Date();
  return toDateString(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
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
  return !!data?.id;
}

async function ensureRoutineInGym(routineId: string, gymId: string) {
  const sb = supabaseServer();
  const { data, error } = await sb
    .from("routines")
    .select("id")
    .eq("id", routineId)
    .eq("gym_id", gymId)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return !!data?.id;
}

async function getSchedule(id: string, gymId: string) {
  const sb = supabaseServer();
  const { data, error } = await sb
    .from("schedules")
    .select("id, gym_id, date, routine_id, action, program_id, start_time, end_time, capacity, coach_name, title, location, note")
    .eq("id", id)
    .eq("gym_id", gymId)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as ScheduleRow | null;
}

export async function PATCH(req: Request, { params }: RouteContext) {
  try {
    const userId = await requireUserIdFromAuthHeader(req);
    const gymId = await getGymIdByUserId(userId);
    if (!gymId) return NextResponse.json({ error: "No gym" }, { status: 404 });

    const { id } = await params;
    const schedule = await getSchedule(id, gymId);
    if (!schedule) return NextResponse.json({ error: "schedule not found" }, { status: 404 });

    const today = todayDateOnly();
    if (compareDateOnly(schedule.date, today) < 0) {
      return NextResponse.json({ error: "past schedules cannot be changed" }, { status: 400 });
    }

    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "invalid body" }, { status: 400 });
    }

    const patch: Record<string, unknown> = {};

    const nextAction = "action" in body
      ? (typeof body.action === "string" ? body.action.trim().toUpperCase() : "")
      : schedule.action;
    if (nextAction !== "CANCEL" && nextAction !== "MODIFY" && nextAction !== "ADD") {
      return NextResponse.json({ error: "action must be CANCEL | MODIFY | ADD" }, { status: 400 });
    }

    const nextDate = "date" in body
      ? (typeof body.date === "string" && isValidDateOnly(body.date) ? body.date : "")
      : schedule.date;
    if (!nextDate) return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
    if (compareDateOnly(nextDate, today) < 0) {
      return NextResponse.json({ error: "schedule date cannot be in the past" }, { status: 400 });
    }

    const nextRoutineId = "routine_id" in body
      ? (typeof body.routine_id === "string" && body.routine_id.trim().length > 0 ? body.routine_id.trim() : null)
      : schedule.routine_id;
    const nextProgramId = "program_id" in body
      ? (typeof body.program_id === "string" && body.program_id.trim().length > 0 ? body.program_id.trim() : null)
      : schedule.program_id;

    const parsedStart = "start_time" in body
      ? (body.start_time == null || body.start_time === ""
          ? null
          : (typeof body.start_time === "string" && isValidTimeOnly(body.start_time) ? normalizeTimeOnly(body.start_time) : "__invalid__"))
      : schedule.start_time;
    const parsedEnd = "end_time" in body
      ? (body.end_time == null || body.end_time === ""
          ? null
          : (typeof body.end_time === "string" && isValidTimeOnly(body.end_time) ? normalizeTimeOnly(body.end_time) : "__invalid__"))
      : schedule.end_time;

    if (parsedStart === "__invalid__" || parsedEnd === "__invalid__") {
      return NextResponse.json({ error: "start_time/end_time must be HH:mm" }, { status: 400 });
    }

    const nextStartTime = parsedStart;
    const nextEndTime = parsedEnd;

    if ((nextStartTime && !nextEndTime) || (!nextStartTime && nextEndTime)) {
      return NextResponse.json({ error: "start_time/end_time must be provided together" }, { status: 400 });
    }
    if (nextStartTime && nextEndTime && !isTimeRangeValid(nextStartTime, nextEndTime)) {
      return NextResponse.json({ error: "start_time must be before end_time" }, { status: 400 });
    }

    const nextCapacity = "capacity" in body ? parseOptionalCapacity(body.capacity) : { ok: true, value: schedule.capacity };
    if (!nextCapacity.ok) {
      return NextResponse.json({ error: "capacity must be a non-negative integer" }, { status: 400 });
    }

    const nextCoachName = "coach_name" in body ? normalizeOptionalText(body.coach_name) : schedule.coach_name;
    const nextTitle = "title" in body ? normalizeOptionalText(body.title) : schedule.title;
    const nextLocation = "location" in body ? normalizeOptionalText(body.location) : schedule.location;
    const nextNote = "note" in body ? normalizeOptionalText(body.note) : schedule.note;

    if (nextAction === "MODIFY" && !nextRoutineId) {
      return NextResponse.json({ error: "routine_id is required for MODIFY" }, { status: 400 });
    }
    if (nextAction === "ADD" && !nextProgramId && !nextTitle) {
      return NextResponse.json({ error: "title is required for event ADD" }, { status: 400 });
    }
    if (nextAction === "ADD" && nextProgramId && (!nextStartTime || !nextEndTime)) {
      return NextResponse.json({ error: "class ADD requires start_time/end_time" }, { status: 400 });
    }

    if (nextRoutineId) {
      const routineExists = await ensureRoutineInGym(nextRoutineId, gymId);
      if (!routineExists) return NextResponse.json({ error: "routine not found" }, { status: 404 });
    }
    if (nextProgramId) {
      const programExists = await ensureProgramInGym(nextProgramId, gymId);
      if (!programExists) return NextResponse.json({ error: "program not found" }, { status: 404 });
    }

    patch.action = nextAction;
    patch.date = nextDate;
    patch.routine_id = nextRoutineId;
    patch.program_id = nextProgramId;
    patch.start_time = nextStartTime;
    patch.end_time = nextEndTime;
    patch.capacity = nextCapacity.value;
    patch.coach_name = nextCoachName;
    patch.title = nextTitle;
    patch.location = nextLocation;
    patch.note = nextNote;

    const sb = supabaseServer();
    const { data, error } = await sb
      .from("schedules")
      .update(patch)
      .eq("id", schedule.id)
      .eq("gym_id", gymId)
      .select("id, gym_id, date, routine_id, action, program_id, start_time, end_time, capacity, coach_name, title, location, note, created_at, program:programs(id, name, color, is_active)")
      .single();
    if (error) throw new Error(error.message);

    return NextResponse.json({ schedule: data });
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
    const schedule = await getSchedule(id, gymId);
    if (!schedule) return NextResponse.json({ error: "schedule not found" }, { status: 404 });

    const today = todayDateOnly();
    if (compareDateOnly(schedule.date, today) < 0) {
      return NextResponse.json({ error: "past schedules cannot be removed" }, { status: 400 });
    }

    const sb = supabaseServer();
    const { error } = await sb
      .from("schedules")
      .delete()
      .eq("id", schedule.id)
      .eq("gym_id", gymId);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: toErrorMessage(error) }, { status: 500 });
  }
}
