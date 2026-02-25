import type { CSSProperties } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { readPublicScheduleBySlug } from "@/lib/public-schedule";
import styles from "./public-schedule.module.css";

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

const WEEKDAY_HEADERS = [
  { label: "월", className: "" },
  { label: "화", className: "" },
  { label: "수", className: "" },
  { label: "목", className: "" },
  { label: "금", className: "" },
  { label: "토", className: "sat" },
  { label: "일", className: "sun" },
] as const;

type CalendarCell = {
  key: string;
  day: number;
  day_of_week: number;
  in_month: boolean;
  is_today: boolean;
};

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toMonthKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function parseMonthKey(value: string | null | undefined) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  return new Date(year, month - 1, 1);
}

function shiftMonth(base: Date, delta: number) {
  return new Date(base.getFullYear(), base.getMonth() + delta, 1);
}

function monthLabel(date: Date) {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
}

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18" fill="currentColor">
      <path d="M14.7 6.7a1 1 0 0 1 0 1.4L10.83 12l3.87 3.9a1 1 0 0 1-1.42 1.4l-4.57-4.6a1 1 0 0 1 0-1.4l4.57-4.6a1 1 0 0 1 1.42 0Z" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18" fill="currentColor">
      <path d="M9.3 6.7a1 1 0 0 0 0 1.4L13.17 12l-3.87 3.9a1 1 0 0 0 1.42 1.4l4.57-4.6a1 1 0 0 0 0-1.4l-4.57-4.6a1 1 0 0 0-1.42 0Z" />
    </svg>
  );
}

function toMondayFirstOffset(date: Date) {
  return (date.getDay() + 6) % 7;
}

function buildMonthCells(cursor: Date) {
  const firstDate = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const offset = toMondayFirstOffset(firstDate);
  const gridStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1 - offset);
  const todayKey = toDateKey(new Date());

  return Array.from({ length: 42 }).map((_, index) => {
    const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index);
    return {
      key: toDateKey(date),
      day: date.getDate(),
      day_of_week: date.getDay(),
      in_month: date.getMonth() === cursor.getMonth(),
      is_today: toDateKey(date) === todayKey,
    } satisfies CalendarCell;
  });
}

export default async function PublicSchedulePage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const rawCode = resolvedSearchParams.code;
  const rawMonth = resolvedSearchParams.month;
  const accessCode = typeof rawCode === "string" ? rawCode : Array.isArray(rawCode) ? rawCode[0] : null;
  const monthParam = typeof rawMonth === "string" ? rawMonth : Array.isArray(rawMonth) ? rawMonth[0] : null;

  const result = await readPublicScheduleBySlug(slug, accessCode);
  if (result.status !== "ok") notFound();

  const payload = result.data;
  const hasAnyClass = payload.week.some((day) => day.items.length > 0);
  const monthCursor = parseMonthKey(monthParam) ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const prevMonth = shiftMonth(monthCursor, -1);
  const nextMonth = shiftMonth(monthCursor, 1);
  const monthCells = buildMonthCells(monthCursor);
  const dayMap = new Map(payload.week.map((day) => [day.day_of_week, day.items]));

  const buildMonthHref = (monthDate: Date) => {
    const query = new URLSearchParams();
    query.set("month", toMonthKey(monthDate));
    if (accessCode) query.set("code", accessCode);
    return `/g/${payload.slug}?${query.toString()}`;
  };

  return (
    <main className={styles.page}>
      <section className={styles.container}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>주짓때로 공개 시간표</p>
          <h1 className={styles.title}>{payload.gym_name}</h1>
        </header>

        <section className={`panel ${styles.calendarPanel}`}>
          <div className="calendar-month-header">
            <div className="calendar-month-toolbar">
              <div className={styles.monthToolbarLeft}>
                <Link href={buildMonthHref(prevMonth)} className="btn btn-secondary calendar-nav-btn" aria-label="이전 달">
                  <ChevronLeftIcon />
                </Link>
                <h3 className="panel-title calendar-month-title">{monthLabel(monthCursor)}</h3>
                <Link href={buildMonthHref(nextMonth)} className="btn btn-secondary calendar-nav-btn" aria-label="다음 달">
                  <ChevronRightIcon />
                </Link>
              </div>
              {hasAnyClass ? null : <p className={styles.emptyInline}>등록된 공개 수업이 없습니다.</p>}
            </div>
          </div>

          <div className="calendar-grid-shell">
            <div className="calendar-grid-head">
              {WEEKDAY_HEADERS.map((weekday) => (
                <span
                  key={weekday.label}
                  className={`calendar-grid-weekday ${weekday.className}`}
                >
                  {weekday.label}
                </span>
              ))}
            </div>

            <div className="calendar-grid">
              {monthCells.map((cell) => {
                const items = dayMap.get(cell.day_of_week) ?? [];
                const visibleItems = items.slice(0, 3);
                const isWeekend = cell.day_of_week === 0 || cell.day_of_week === 6;
                return (
                  <article
                    key={cell.key}
                    className={`calendar-cell ${cell.in_month ? "in-month" : "out-month"}`}
                  >
                    <div className="calendar-cell-head">
                      <span className={`calendar-cell-day ${cell.is_today ? "today" : ""} ${isWeekend ? "weekend" : ""}`}>
                        {cell.day}
                      </span>
                    </div>

                    <div className="calendar-cell-events">
                      {visibleItems.map((item) => (
                        <span
                          key={`${cell.key}-${item.id}-${item.start_time}`}
                          className="calendar-chip calendar-chip-class"
                          style={{ "--calendar-chip-color": item.color } as CSSProperties}
                        >
                          {item.start_time} {item.program_name}
                        </span>
                      ))}
                      {items.length > 3 ? <span className="calendar-chip calendar-chip-more">+{items.length - 3}</span> : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
