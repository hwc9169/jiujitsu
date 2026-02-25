import { NextResponse } from "next/server";
import {
  isTimeRangeValid,
  isValidDateOnly,
  isValidTimeOnly,
  normalizeOptionalText,
  normalizeTimeOnly,
} from "@/lib/calendar/utils";
import { getGymIdByUserId, requireUserIdFromAuthHeader } from "@/lib/supabase/gym";
import { supabaseServer } from "@/lib/supabase/server";

type ProgramRow = {
  id: string;
  gym_id: string;
  is_active: boolean;
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

async function ensureProgramInGym(programId: string, gymId: string) {
  const sb = supabaseServer();
  const { data, error } = await sb
    .from("programs")
    .select("id, gym_id, is_active")
    .eq("id", programId)
    .eq("gym_id", gymId)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data ?? null) as ProgramRow | null;
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Internal server error";
}

export async function GET(req: Request) {
  try {
    const userId = await requireUserIdFromAuthHeader(req);
    const gymId = await getGymIdByUserId(userId);
    if (!gymId) return NextResponse.json({ error: "No gym" }, { status: 404 });

    const sb = supabaseServer();
    const { data, error } = await sb
      .from("routines")
      .select("id, gym_id, program_id, day_of_week, start_time, end_time, capacity, coach_name, effective_from, created_at, program:programs(id, name, color, is_active)")
      .eq("gym_id", gymId)
      .order("day_of_week", { ascending: true })
      .order("start_time", { ascending: true })
      .order("effective_from", { ascending: true });

    if (error) throw new Error(error.message);
    return NextResponse.json({ items: data ?? [] });
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
    const programId = typeof body?.program_id === "string" ? body.program_id.trim() : "";
    const dayOfWeek = parseDayOfWeek(body?.day_of_week);
    const startTime =
      typeof body?.start_time === "string" && isValidTimeOnly(body.start_time)
        ? normalizeTimeOnly(body.start_time)
        : null;
    const endTime =
      typeof body?.end_time === "string" && isValidTimeOnly(body.end_time)
        ? normalizeTimeOnly(body.end_time)
        : null;
    const coachName = normalizeOptionalText(body?.coach_name);
    const effectiveFrom =
      typeof body?.effective_from === "string" && isValidDateOnly(body.effective_from)
        ? body.effective_from
        : todayDateOnly();
    const capacityParsed = parseOptionalCapacity(body?.capacity);

    if (!programId) return NextResponse.json({ error: "program_id is required" }, { status: 400 });
    if (dayOfWeek == null) return NextResponse.json({ error: "day_of_week must be 0~6" }, { status: 400 });
    if (!startTime || !endTime) return NextResponse.json({ error: "start_time/end_time must be HH:mm" }, { status: 400 });
    if (!isTimeRangeValid(startTime, endTime)) {
      return NextResponse.json({ error: "start_time must be before end_time" }, { status: 400 });
    }
    if (!capacityParsed.ok) {
      return NextResponse.json({ error: "capacity must be a non-negative integer" }, { status: 400 });
    }

    const program = await ensureProgramInGym(programId, gymId);
    if (!program) return NextResponse.json({ error: "program not found" }, { status: 404 });

    const sb = supabaseServer();
    const payload = {
      gym_id: gymId,
      program_id: programId,
      day_of_week: dayOfWeek,
      start_time: startTime,
      end_time: endTime,
      capacity: capacityParsed.value,
      coach_name: coachName,
      effective_from: effectiveFrom,
    };

    const { data, error } = await sb
      .from("routines")
      .insert(payload)
      .select("id, gym_id, program_id, day_of_week, start_time, end_time, capacity, coach_name, effective_from, created_at, program:programs(id, name, color, is_active)")
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ routine: data }, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json({ error: toErrorMessage(error) }, { status: 500 });
  }
}
