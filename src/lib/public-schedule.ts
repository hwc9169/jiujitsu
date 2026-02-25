import { randomUUID, timingSafeEqual } from "node:crypto";
import { toDateString } from "@/lib/calendar/utils";
import { supabaseServer } from "@/lib/supabase/server";

const MIN_SLUG_LENGTH = 3;
const MAX_SLUG_LENGTH = 64;
const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_ACCESS_CODE_LENGTH = 50;

const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

const WEEKDAY_LABEL: Record<number, string> = {
  0: "일요일",
  1: "월요일",
  2: "화요일",
  3: "수요일",
  4: "목요일",
  5: "금요일",
  6: "토요일",
};

type GymPublicSettingsRow = {
  id: string;
  name: string;
  public_schedule_enabled: boolean;
  public_schedule_slug: string | null;
  public_schedule_access_code: string | null;
};

type ProgramPublicRow = {
  name: string;
  color: string;
  is_active: boolean;
};

type RoutinePublicRow = {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  effective_from: string;
  program: ProgramPublicRow | ProgramPublicRow[] | null;
};

export type PublicScheduleItem = {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  program_name: string;
  color: string;
};

export type PublicScheduleDay = {
  day_of_week: number;
  day_label: string;
  items: PublicScheduleItem[];
};

export type PublicSchedulePayload = {
  gym_name: string;
  slug: string;
  week: PublicScheduleDay[];
  generated_at: string;
};

export type PublicScheduleLookupResult =
  | { status: "ok"; data: PublicSchedulePayload }
  | { status: "not_found" }
  | { status: "locked" };

function toTodayDateOnly() {
  const now = new Date();
  return toDateString(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
}

function slugBaseFromName(name: string) {
  const ascii = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const fallback = ascii.length > 0 ? ascii : "gym";
  const clipped = fallback.slice(0, MAX_SLUG_LENGTH).replace(/-+$/g, "");
  if (clipped.length >= MIN_SLUG_LENGTH) return clipped;
  return `gym-${randomUUID().slice(0, 6)}`;
}

function normalizeSlugBase(base: string) {
  const cleaned = base
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!cleaned) return null;
  if (cleaned.length < MIN_SLUG_LENGTH) return null;
  if (cleaned.length > MAX_SLUG_LENGTH) return cleaned.slice(0, MAX_SLUG_LENGTH).replace(/-+$/g, "");
  return cleaned;
}

function normalizeTimeLabel(value: string) {
  return value.slice(0, 5);
}

function isGymRow(value: unknown): value is GymPublicSettingsRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.name === "string" &&
    typeof row.public_schedule_enabled === "boolean"
  );
}

function pickProgram(value: RoutinePublicRow["program"]): ProgramPublicRow | null {
  if (!value) return null;
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || typeof candidate !== "object") return null;
  const row = candidate as Record<string, unknown>;
  if (typeof row.name !== "string" || typeof row.color !== "string" || typeof row.is_active !== "boolean") {
    return null;
  }
  return {
    name: row.name,
    color: row.color,
    is_active: row.is_active,
  };
}

function safeCodeCompare(expected: string, provided: string | null) {
  if (!provided) return false;
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  if (expectedBuffer.length !== providedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, providedBuffer);
}

function toWeekTemplate(routines: RoutinePublicRow[]) {
  const dayMap = new Map<number, PublicScheduleDay>();

  for (const dayOfWeek of WEEKDAY_ORDER) {
    dayMap.set(dayOfWeek, {
      day_of_week: dayOfWeek,
      day_label: WEEKDAY_LABEL[dayOfWeek],
      items: [],
    });
  }

  for (const routine of routines) {
    const day = dayMap.get(routine.day_of_week);
    if (!day) continue;

    const program = pickProgram(routine.program);
    if (!program || !program.is_active) continue;

    day.items.push({
      id: routine.id,
      day_of_week: routine.day_of_week,
      start_time: normalizeTimeLabel(routine.start_time),
      end_time: normalizeTimeLabel(routine.end_time),
      program_name: program.name,
      color: program.color || "#0e3b2e",
    });
  }

  for (const day of dayMap.values()) {
    day.items.sort((a, b) => {
      if (a.start_time !== b.start_time) return a.start_time.localeCompare(b.start_time);
      return a.program_name.localeCompare(b.program_name, "ko-KR");
    });
  }

  return WEEKDAY_ORDER.map((dayOfWeek) => dayMap.get(dayOfWeek)!);
}

export function normalizeScheduleSlug(input: string) {
  const normalized = normalizeSlugBase(input.trim());
  if (!normalized) return null;
  if (!SLUG_REGEX.test(normalized)) return null;
  return normalized;
}

export function normalizeAccessCode(input: unknown) {
  if (input == null) return null;
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_ACCESS_CODE_LENGTH) return null;
  return trimmed;
}

export async function isScheduleSlugTaken(slug: string, excludeGymId?: string) {
  const sb = supabaseServer();
  let query = sb.from("gyms").select("id").eq("public_schedule_slug", slug).limit(1);
  if (excludeGymId) query = query.neq("id", excludeGymId);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data?.id);
}

export async function generateUniqueScheduleSlug(gymName: string, excludeGymId?: string) {
  const base = slugBaseFromName(gymName);

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const suffix = attempt === 0 ? "" : `-${attempt + 1}`;
    const trimmedBase = base.slice(0, Math.max(MIN_SLUG_LENGTH, MAX_SLUG_LENGTH - suffix.length)).replace(/-+$/g, "");
    const candidate = `${trimmedBase || "gym"}${suffix}`;
    const taken = await isScheduleSlugTaken(candidate, excludeGymId);
    if (!taken) return candidate;
  }

  return `gym-${randomUUID().slice(0, 12)}`;
}

export async function getGymPublicScheduleSettings(gymId: string) {
  const sb = supabaseServer();
  const { data, error } = await sb
    .from("gyms")
    .select("id, name, public_schedule_enabled, public_schedule_slug, public_schedule_access_code")
    .eq("id", gymId)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!isGymRow(data)) return null;
  return data;
}

export async function ensureGymScheduleSlug(gymId: string, gymName: string) {
  const existing = await getGymPublicScheduleSettings(gymId);
  if (existing?.public_schedule_slug) return existing.public_schedule_slug;

  const slug = await generateUniqueScheduleSlug(gymName, gymId);
  const sb = supabaseServer();
  const { error } = await sb
    .from("gyms")
    .update({ public_schedule_slug: slug })
    .eq("id", gymId);
  if (error) throw new Error(error.message);
  return slug;
}

export async function readPublicScheduleBySlug(rawSlug: string, providedAccessCode: string | null = null): Promise<PublicScheduleLookupResult> {
  const slug = normalizeScheduleSlug(rawSlug);
  if (!slug) return { status: "not_found" };

  const sb = supabaseServer();
  const { data: gymData, error: gymError } = await sb
    .from("gyms")
    .select("id, name, public_schedule_enabled, public_schedule_slug, public_schedule_access_code")
    .eq("public_schedule_slug", slug)
    .limit(1)
    .maybeSingle();

  if (gymError) throw new Error(gymError.message);
  if (!isGymRow(gymData)) return { status: "not_found" };
  if (!gymData.public_schedule_enabled) return { status: "not_found" };

  const accessCode = normalizeAccessCode(providedAccessCode);
  if (gymData.public_schedule_access_code && !safeCodeCompare(gymData.public_schedule_access_code, accessCode)) {
    return { status: "locked" };
  }

  const today = toTodayDateOnly();
  const { data: routinesData, error: routinesError } = await sb
    .from("routines")
    .select("id, day_of_week, start_time, end_time, effective_from, program:programs(name, color, is_active)")
    .eq("gym_id", gymData.id)
    .lte("effective_from", today)
    .order("day_of_week", { ascending: true })
    .order("start_time", { ascending: true });

  if (routinesError) throw new Error(routinesError.message);

  const routines = (routinesData ?? []) as RoutinePublicRow[];

  return {
    status: "ok",
    data: {
      gym_name: gymData.name,
      slug,
      week: toWeekTemplate(routines),
      generated_at: new Date().toISOString(),
    },
  };
}
