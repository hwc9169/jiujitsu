import { NextResponse } from "next/server";
import {
  compareDateOnly,
  eachDateBetween,
  isTimeRangeValid,
  isValidDateOnly,
  isValidTimeOnly,
  normalizeOptionalText,
  normalizeTimeOnly,
} from "@/lib/calendar/utils";
import { getGymIdByUserId, requireUserIdFromAuthHeader } from "@/lib/supabase/gym";
import { supabaseServer } from "@/lib/supabase/server";

const HOLIDAY_NOTE_MARKER = "__HOLIDAY__";

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

function resolveRange(url: URL) {
  const date = url.searchParams.get("date");
  if (date) {
    if (!isValidDateOnly(date)) throw new Error("date must be YYYY-MM-DD");
    return { from: date, to: date };
  }

  const from = url.searchParams.get("from") ?? todayDateOnly();
  const to = url.searchParams.get("to") ?? from;
  if (!isValidDateOnly(from) || !isValidDateOnly(to)) {
    throw new Error("from/to must be YYYY-MM-DD");
  }
  if (compareDateOnly(from, to) > 0) {
    throw new Error("from must be <= to");
  }
  return { from, to };
}

type ScheduleAction = "CANCEL" | "MODIFY" | "ADD";

export async function GET(req: Request) {
  try {
    const userId = await requireUserIdFromAuthHeader(req);
    const gymId = await getGymIdByUserId(userId);
    if (!gymId) return NextResponse.json({ error: "No gym" }, { status: 404 });

    const url = new URL(req.url);
    const { from, to } = resolveRange(url);

    const sb = supabaseServer();
    const { data, error } = await sb
      .from("schedules")
      .select("id, gym_id, date, routine_id, action, program_id, start_time, end_time, capacity, coach_name, title, location, note, created_at, program:programs(id, name, color, is_active)")
      .eq("gym_id", gymId)
      .gte("date", from)
      .lte("date", to)
      .order("date", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);
    return NextResponse.json({ from, to, items: data ?? [] });
  } catch (error: unknown) {
    return NextResponse.json({ error: toErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const userId = await requireUserIdFromAuthHeader(req);
    const gymId = await getGymIdByUserId(userId);
    if (!gymId) return NextResponse.json({ error: "No gym" }, { status: 404 });

    const body = await req.json();
    const rawAction = typeof body?.action === "string" ? body.action.trim().toUpperCase() : "";
    const today = todayDateOnly();

    if (rawAction === "HOLIDAY") {
      const startDate = typeof body?.start_date === "string" && isValidDateOnly(body.start_date) ? body.start_date : "";
      const endDate = body?.end_date == null || body?.end_date === ""
        ? startDate
        : (typeof body?.end_date === "string" && isValidDateOnly(body.end_date) ? body.end_date : "");

      if (!startDate || !endDate) {
        return NextResponse.json({ error: "start_date/end_date must be YYYY-MM-DD" }, { status: 400 });
      }
      if (compareDateOnly(startDate, endDate) > 0) {
        return NextResponse.json({ error: "start_date must be <= end_date" }, { status: 400 });
      }
      if (compareDateOnly(startDate, today) < 0) {
        return NextResponse.json({ error: "holiday cannot start in the past" }, { status: 400 });
      }

      const dates = eachDateBetween(startDate, endDate);
      if (dates.length > 370) {
        return NextResponse.json({ error: "holiday range is too large" }, { status: 400 });
      }

      const sb = supabaseServer();
      const { data: existingRows, error: existingError } = await sb
        .from("schedules")
        .select("date")
        .eq("gym_id", gymId)
        .eq("action", "CANCEL")
        .is("routine_id", null)
        .gte("date", startDate)
        .lte("date", endDate)
        .or(`title.eq.휴무,note.eq.${HOLIDAY_NOTE_MARKER}`);
      if (existingError) throw new Error(existingError.message);

      const existingDates = new Set((existingRows ?? []).map((row) => String(row.date)));
      const toInsert = dates
        .filter((date) => !existingDates.has(date))
        .map((date) => ({
          gym_id: gymId,
          date,
          routine_id: null,
          action: "CANCEL" as const,
          title: "휴무",
          note: HOLIDAY_NOTE_MARKER,
        }));

      if (toInsert.length === 0) {
        return NextResponse.json({ items: [], created_count: 0 });
      }

      const { data, error } = await sb
        .from("schedules")
        .insert(toInsert)
        .select("id, gym_id, date, routine_id, action, program_id, start_time, end_time, capacity, coach_name, title, location, note, created_at, program:programs(id, name, color, is_active)");
      if (error) throw new Error(error.message);

      return NextResponse.json({ items: data ?? [], created_count: toInsert.length }, { status: 201 });
    }

    if (rawAction !== "CANCEL" && rawAction !== "MODIFY" && rawAction !== "ADD") {
      return NextResponse.json({ error: "action must be CANCEL | MODIFY | ADD | HOLIDAY" }, { status: 400 });
    }
    const action = rawAction as ScheduleAction;

    const date = typeof body?.date === "string" && isValidDateOnly(body.date) ? body.date : "";
    if (!date) return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
    if (compareDateOnly(date, today) < 0) {
      return NextResponse.json({ error: "schedule date cannot be in the past" }, { status: 400 });
    }

    const routineId = typeof body?.routine_id === "string" && body.routine_id.trim().length > 0 ? body.routine_id.trim() : null;
    const programId = typeof body?.program_id === "string" && body.program_id.trim().length > 0 ? body.program_id.trim() : null;
    const startTime = body?.start_time == null || body?.start_time === ""
      ? null
      : (typeof body?.start_time === "string" && isValidTimeOnly(body.start_time) ? normalizeTimeOnly(body.start_time) : null);
    const endTime = body?.end_time == null || body?.end_time === ""
      ? null
      : (typeof body?.end_time === "string" && isValidTimeOnly(body.end_time) ? normalizeTimeOnly(body.end_time) : null);
    const coachName = normalizeOptionalText(body?.coach_name);
    const title = normalizeOptionalText(body?.title);
    const location = normalizeOptionalText(body?.location);
    const note = normalizeOptionalText(body?.note);
    const capacityParsed = parseOptionalCapacity(body?.capacity);

    if (!capacityParsed.ok) {
      return NextResponse.json({ error: "capacity must be a non-negative integer" }, { status: 400 });
    }
    if ((startTime && !endTime) || (!startTime && endTime)) {
      return NextResponse.json({ error: "start_time/end_time must be provided together" }, { status: 400 });
    }
    if (startTime && endTime && !isTimeRangeValid(startTime, endTime)) {
      return NextResponse.json({ error: "start_time must be before end_time" }, { status: 400 });
    }

    if (action === "MODIFY" && !routineId) {
      return NextResponse.json({ error: "routine_id is required for MODIFY" }, { status: 400 });
    }
    if (action === "ADD" && !programId && !title) {
      return NextResponse.json({ error: "title is required for event ADD" }, { status: 400 });
    }
    if (action === "ADD" && programId && (!startTime || !endTime)) {
      return NextResponse.json({ error: "class ADD requires start_time/end_time" }, { status: 400 });
    }

    if (routineId) {
      const routineExists = await ensureRoutineInGym(routineId, gymId);
      if (!routineExists) return NextResponse.json({ error: "routine not found" }, { status: 404 });
    }
    if (programId) {
      const programExists = await ensureProgramInGym(programId, gymId);
      if (!programExists) return NextResponse.json({ error: "program not found" }, { status: 404 });
    }

    const sb = supabaseServer();
    const { data, error } = await sb
      .from("schedules")
      .insert({
        gym_id: gymId,
        date,
        routine_id: routineId,
        action,
        program_id: programId,
        start_time: startTime,
        end_time: endTime,
        capacity: capacityParsed.value,
        coach_name: coachName,
        title,
        location,
        note,
      })
      .select("id, gym_id, date, routine_id, action, program_id, start_time, end_time, capacity, coach_name, title, location, note, created_at, program:programs(id, name, color, is_active)")
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ schedule: data }, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json({ error: toErrorMessage(error) }, { status: 500 });
  }
}
