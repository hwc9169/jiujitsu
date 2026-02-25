import { NextResponse } from "next/server";
import { getGymIdByUserId, requireUserIdFromAuthHeader } from "@/lib/supabase/gym";
import { supabaseServer } from "@/lib/supabase/server";
import {
  compareDateOnly,
  dayOfWeekFromDateString,
  eachDateBetween,
  isValidDateOnly,
  isWithinDateRange,
  normalizeOptionalText,
} from "@/lib/calendar/utils";

type ProgramRow = {
  id: string;
  name: string;
  color: string;
  is_active: boolean;
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

type ScheduleAction = "CANCEL" | "MODIFY" | "ADD";

type ScheduleRow = {
  id: string;
  gym_id: string;
  date: string;
  routine_id: string | null;
  action: ScheduleAction;
  program_id: string | null;
  start_time: string | null;
  end_time: string | null;
  capacity: number | null;
  coach_name: string | null;
  title: string | null;
  location: string | null;
  note: string | null;
  created_at: string;
};

type CalendarInstanceKind = "CLASS" | "EVENT" | "HOLIDAY";

type CalendarInstance = {
  id: string;
  date: string;
  kind: CalendarInstanceKind;
  source: "ROUTINE" | "SCHEDULE";
  routine_id: string | null;
  schedule_id: string | null;
  schedule_action: ScheduleAction | null;
  program_id: string | null;
  program_name: string | null;
  color: string | null;
  start_time: string | null;
  end_time: string | null;
  capacity: number | null;
  coach_name: string | null;
  title: string | null;
  location: string | null;
  note: string | null;
};

const HOLIDAY_NOTE_MARKER = "__HOLIDAY__";

function toApiError(error: unknown) {
  return error instanceof Error ? error.message : "Internal server error";
}

function parseRange(searchParams: URLSearchParams) {
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  if (!isValidDateOnly(from) || !isValidDateOnly(to)) {
    throw new Error("from, to must be YYYY-MM-DD");
  }
  if (compareDateOnly(from, to) > 0) {
    throw new Error("from must be <= to");
  }
  return { from, to };
}

function routineKey(routineId: string, date: string) {
  return `R:${routineId}:${date}`;
}

function buildRoutineInstance(date: string, routine: RoutineRow, program: ProgramRow | null): CalendarInstance {
  return {
    id: routineKey(routine.id, date),
    date,
    kind: "CLASS",
    source: "ROUTINE",
    routine_id: routine.id,
    schedule_id: null,
    schedule_action: null,
    program_id: routine.program_id,
    program_name: program?.name ?? "프로그램",
    color: program?.color ?? "#0e3b2e",
    start_time: routine.start_time,
    end_time: routine.end_time,
    capacity: routine.capacity,
    coach_name: routine.coach_name,
    title: null,
    location: null,
    note: null,
  };
}

function isHolidaySchedule(schedule: ScheduleRow) {
  const title = normalizeOptionalText(schedule.title);
  const note = normalizeOptionalText(schedule.note);
  if (title !== "휴무" && note !== HOLIDAY_NOTE_MARKER) return false;

  if (schedule.action === "CANCEL" && !schedule.routine_id) {
    return true;
  }

  return (
    schedule.action === "ADD" &&
    !schedule.program_id &&
    !schedule.start_time &&
    !schedule.end_time
  );
}

function buildAddScheduleInstance(schedule: ScheduleRow, program: ProgramRow | null): CalendarInstance {
  const holiday = isHolidaySchedule(schedule);
  const programName = program?.name ?? null;
  const title = normalizeOptionalText(schedule.title);
  const resolvedKind: CalendarInstanceKind = holiday
    ? "HOLIDAY"
    : schedule.program_id
      ? "CLASS"
      : "EVENT";

  return {
    id: `S:${schedule.id}`,
    date: schedule.date,
    kind: resolvedKind,
    source: "SCHEDULE",
    routine_id: schedule.routine_id,
    schedule_id: schedule.id,
    schedule_action: "ADD",
    program_id: schedule.program_id,
    program_name: schedule.program_id ? programName ?? "프로그램" : null,
    color: schedule.program_id ? program?.color ?? "#0e3b2e" : null,
    start_time: schedule.start_time,
    end_time: schedule.end_time,
    capacity: schedule.capacity,
    coach_name: schedule.coach_name,
    title: resolvedKind === "CLASS" ? title : title ?? (holiday ? "휴무" : "일정"),
    location: schedule.location,
    note: schedule.note,
  };
}

function buildHolidayCancelInstance(schedule: ScheduleRow): CalendarInstance {
  return {
    id: `H:${schedule.date}`,
    date: schedule.date,
    kind: "HOLIDAY",
    source: "SCHEDULE",
    routine_id: null,
    schedule_id: schedule.id,
    schedule_action: "CANCEL",
    program_id: null,
    program_name: null,
    color: null,
    start_time: null,
    end_time: null,
    capacity: null,
    coach_name: null,
    title: "휴무",
    location: schedule.location,
    note: schedule.note,
  };
}

function sortInstances(a: CalendarInstance, b: CalendarInstance) {
  if (a.date !== b.date) return a.date.localeCompare(b.date);

  const aTime = a.start_time ?? "99:99";
  const bTime = b.start_time ?? "99:99";
  if (aTime !== bTime) return aTime.localeCompare(bTime);

  const aLabel = a.program_name ?? a.title ?? "";
  const bLabel = b.program_name ?? b.title ?? "";
  return aLabel.localeCompare(bLabel);
}

export async function GET(req: Request) {
  try {
    const userId = await requireUserIdFromAuthHeader(req);
    const gymId = await getGymIdByUserId(userId);
    if (!gymId) {
      return NextResponse.json({ error: "No gym" }, { status: 404 });
    }

    const url = new URL(req.url);
    const { from, to } = parseRange(url.searchParams);

    const sb = supabaseServer();
    const [programsResult, routinesResult, schedulesResult] = await Promise.all([
      sb
        .from("programs")
        .select("id, name, color, is_active")
        .eq("gym_id", gymId)
        .order("is_active", { ascending: false })
        .order("name", { ascending: true }),
      sb
        .from("routines")
        .select("id, gym_id, program_id, day_of_week, start_time, end_time, capacity, coach_name, effective_from, effective_to")
        .eq("gym_id", gymId)
        .lte("effective_from", to)
        .or(`effective_to.is.null,effective_to.gte.${from}`)
        .order("day_of_week", { ascending: true })
        .order("start_time", { ascending: true }),
      sb
        .from("schedules")
        .select("id, gym_id, date, routine_id, action, program_id, start_time, end_time, capacity, coach_name, title, location, note, created_at")
        .eq("gym_id", gymId)
        .gte("date", from)
        .lte("date", to)
        .order("created_at", { ascending: true }),
    ]);

    if (programsResult.error) throw new Error(programsResult.error.message);
    if (routinesResult.error) throw new Error(routinesResult.error.message);
    if (schedulesResult.error) throw new Error(schedulesResult.error.message);

    const programs = (programsResult.data ?? []) as ProgramRow[];
    const routines = (routinesResult.data ?? []) as RoutineRow[];
    const schedules = (schedulesResult.data ?? []) as ScheduleRow[];
    const programMap = new Map(programs.map((program) => [program.id, program]));

    const instances = new Map<string, CalendarInstance>();
    const dates = eachDateBetween(from, to);

    for (const date of dates) {
      const dayOfWeek = dayOfWeekFromDateString(date);
      if (dayOfWeek === null) continue;

      for (const routine of routines) {
        if (routine.day_of_week !== dayOfWeek) continue;
        if (!isWithinDateRange(date, routine.effective_from, routine.effective_to)) continue;
        const program = programMap.get(routine.program_id) ?? null;
        instances.set(routineKey(routine.id, date), buildRoutineInstance(date, routine, program));
      }
    }

    for (const schedule of schedules) {
      const key = schedule.routine_id ? routineKey(schedule.routine_id, schedule.date) : null;

      if (schedule.action === "CANCEL") {
        if (key) {
          instances.delete(key);
        } else {
          for (const [instanceKey, instance] of instances.entries()) {
            if (instance.date !== schedule.date) continue;
            if (instance.routine_id) {
              instances.delete(instanceKey);
            }
          }
          if (isHolidaySchedule(schedule)) {
            instances.set(`H:${schedule.date}`, buildHolidayCancelInstance(schedule));
          }
        }
        continue;
      }

      if (schedule.action === "MODIFY") {
        if (!key) continue;
        const original = instances.get(key);
        const program = schedule.program_id ? programMap.get(schedule.program_id) ?? null : null;

        if (!original) {
          if (!schedule.start_time || !schedule.end_time) continue;
          instances.set(key, {
            id: key,
            date: schedule.date,
            kind: "CLASS",
            source: "SCHEDULE",
            routine_id: schedule.routine_id,
            schedule_id: schedule.id,
            schedule_action: "MODIFY",
            program_id: schedule.program_id,
            program_name: program?.name ?? null,
            color: program?.color ?? "#0e3b2e",
            start_time: schedule.start_time,
            end_time: schedule.end_time,
            capacity: schedule.capacity,
            coach_name: schedule.coach_name,
            title: normalizeOptionalText(schedule.title),
            location: schedule.location,
            note: schedule.note,
          });
        } else {
          const nextProgramId = schedule.program_id ?? original.program_id;
          const nextProgram = nextProgramId ? programMap.get(nextProgramId) ?? null : null;
          instances.set(key, {
            ...original,
            source: "SCHEDULE",
            schedule_id: schedule.id,
            schedule_action: "MODIFY",
            program_id: nextProgramId,
            program_name: nextProgram?.name ?? original.program_name,
            color: nextProgram?.color ?? original.color,
            start_time: schedule.start_time ?? original.start_time,
            end_time: schedule.end_time ?? original.end_time,
            capacity: schedule.capacity ?? original.capacity,
            coach_name: schedule.coach_name ?? original.coach_name,
            title: schedule.title ?? original.title,
            location: schedule.location ?? original.location,
            note: schedule.note ?? original.note,
          });
        }
        continue;
      }

      if (schedule.action === "ADD") {
        const program = schedule.program_id ? programMap.get(schedule.program_id) ?? null : null;
        instances.set(`S:${schedule.id}`, buildAddScheduleInstance(schedule, program));
      }
    }

    const finalInstances = [...instances.values()].sort(sortInstances);

    return NextResponse.json({
      from,
      to,
      instances: finalInstances,
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: toApiError(error) }, { status: 500 });
  }
}
