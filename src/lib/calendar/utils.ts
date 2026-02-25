const DATE_ONLY_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_ONLY_REGEX = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

export function parseDateParts(value: string) {
  const matched = DATE_ONLY_REGEX.exec(value.trim());
  if (!matched) return null;

  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  return { year, month, day };
}

export function parseDateOnly(value: string) {
  const parts = parseDateParts(value);
  if (!parts) return null;
  const date = new Date(parts.year, parts.month - 1, parts.day);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function toDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isValidDateOnly(value: string) {
  return parseDateOnly(value) !== null;
}

export function compareDateOnly(a: string, b: string) {
  return a.localeCompare(b);
}

export function addDays(dateString: string, days: number) {
  const date = parseDateOnly(dateString);
  if (!date) return null;
  date.setDate(date.getDate() + days);
  return toDateString(date);
}

export function eachDateBetween(from: string, to: string) {
  const start = parseDateOnly(from);
  const end = parseDateOnly(to);
  if (!start || !end || start > end) return [] as string[];

  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const out: string[] = [];
  while (cursor <= end) {
    out.push(toDateString(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

export function dayOfWeekFromDateString(dateString: string) {
  const date = parseDateOnly(dateString);
  if (!date) return null;
  return date.getDay();
}

export function isValidTimeOnly(value: string) {
  return TIME_ONLY_REGEX.test(value.trim());
}

export function normalizeTimeOnly(value: string) {
  const matched = TIME_ONLY_REGEX.exec(value.trim());
  if (!matched) return null;
  const hh = matched[1];
  const mm = matched[2];
  return `${hh}:${mm}`;
}

export function isTimeRangeValid(startTime: string, endTime: string) {
  return startTime < endTime;
}

export function normalizeOptionalText(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function parseOptionalCapacity(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(num) || num < 0) return null;
  return num;
}

export function isWithinDateRange(date: string, from: string, to: string | null) {
  if (compareDateOnly(date, from) < 0) return false;
  if (to && compareDateOnly(date, to) > 0) return false;
  return true;
}
