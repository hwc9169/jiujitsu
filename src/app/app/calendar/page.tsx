"use client";

import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminShell } from "@/components/admin-shell";
import { apiFetch } from "@/lib/api_client";
import type { CalendarInstance, Program, Routine } from "@/lib/calendar/types";
import { compareDateOnly } from "@/lib/calendar/utils";

type CalendarResponse = {
  from: string;
  to: string;
  instances: CalendarInstance[];
};

type ProgramsResponse = {
  items: Program[];
};

type ProgramMutationResponse = {
  program: Program;
};

type RoutinesResponse = {
  items: Routine[];
};

type ProgramFormState = {
  name: string;
  color: string;
};

type RoutineFormState = {
  mode: "create" | "edit";
  id?: string;
  program_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
};

type ClassFormState = {
  mode: "create" | "edit";
  schedule_id?: string;
  date: string;
  program_id: string;
  start_time: string;
  end_time: string;
  capacity: string;
  coach_name: string;
  note: string;
};

type EventFormState = {
  mode: "create" | "edit";
  schedule_id?: string;
  date: string;
  title: string;
  location: string;
  note: string;
  start_time: string;
  end_time: string;
};

type HolidayFormState = {
  mode: "create" | "edit";
  schedule_id?: string;
  start_date: string;
  end_date: string;
};

const WEEK_DAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;
const PROGRAM_COLOR_OPTIONS = [
  { key: "gray", label: "회색", value: "#6b7280" },
  { key: "brown", label: "갈색", value: "#8b5a3c" },
  { key: "orange", label: "주황색", value: "#f97316" },
  { key: "yellow", label: "노란색", value: "#facc15" },
  { key: "green", label: "녹색", value: "#16a34a" },
  { key: "blue", label: "파란색", value: "#3b82f6" },
  { key: "purple", label: "보라색", value: "#8b5cf6" },
  { key: "pink", label: "분홍색", value: "#ec4899" },
  { key: "red", label: "빨간색", value: "#ef4444" },
] as const;
const PROGRAM_COLOR_SET = new Set(PROGRAM_COLOR_OPTIONS.map((option) => option.value.toLowerCase()));
const DEFAULT_PROGRAM_COLOR = PROGRAM_COLOR_OPTIONS[4].value;

function normalizeProgramColor(color: string | null | undefined) {
  const normalized = (color ?? "").trim().toLowerCase();
  return PROGRAM_COLOR_SET.has(normalized) ? normalized : DEFAULT_PROGRAM_COLOR;
}

function sortPrograms(list: Program[]) {
  return [...list].sort((a, b) => {
    if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
    return a.name.localeCompare(b.name, "ko-KR");
  });
}

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

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function shiftMonth(base: Date, delta: number) {
  return new Date(base.getFullYear(), base.getMonth() + delta, 1);
}

function monthLabel(date: Date) {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
}

function getMonthRange(date: Date) {
  const from = toDateString(new Date(date.getFullYear(), date.getMonth(), 1));
  const to = toDateString(new Date(date.getFullYear(), date.getMonth() + 1, 0));
  return { from, to };
}

function normalizeTime(value: string | null | undefined) {
  if (!value) return "";
  return value.slice(0, 5);
}

function formatTimeRange(startTime: string | null, endTime: string | null) {
  const start = normalizeTime(startTime);
  const end = normalizeTime(endTime);
  if (!start && !end) return "종일";
  if (start && end) return `${start} - ${end}`;
  return start || end;
}

function buildMonthCells(cursor: Date) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const offset = first.getDay();
  const gridStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1 - offset);
  return Array.from({ length: 42 }).map((_, index) => {
    const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index);
    return {
      date: toDateString(date),
      day: date.getDate(),
      inMonth: date.getMonth() === cursor.getMonth(),
    };
  });
}

function atLeastToday(date: string) {
  const today = todayDateOnly();
  return compareDateOnly(date, today) < 0 ? today : date;
}

function dayName(dayOfWeek: number) {
  return WEEK_DAYS[dayOfWeek] ?? "?";
}

function MaterialEditIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 17.25V21h3.75l11.06-11.06-3.75-3.75L3 17.25Z" />
      <path d="M20.71 7.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83Z" />
    </svg>
  );
}

function MaterialDeleteIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12Zm2.46-4.88 1.41 1.41L12 13.41l2.12 2.12 1.41-1.41L13.41 12l2.12-2.12-1.41-1.41L12 10.59 9.88 8.47 8.47 9.88 10.59 12l-2.13 2.12ZM15.5 4l-1-1h-5l-1 1H5v2h14V4h-3.5Z" />
    </svg>
  );
}

function MaterialMoreVertIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm0 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z" />
    </svg>
  );
}

function MaterialPaletteIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3C7.03 3 3 6.58 3 11c0 3.3 2.51 6.14 6.09 7.35.52.17.91.64.91 1.19 0 .81.65 1.46 1.46 1.46h1.08c4.61 0 8.46-3.84 8.46-8.46C21 7.28 16.97 3 12 3Zm-5.5 9a1.5 1.5 0 1 1 0-3.01A1.5 1.5 0 0 1 6.5 12Zm3-4a1.5 1.5 0 1 1 0-3.01A1.5 1.5 0 0 1 9.5 8Zm5 0a1.5 1.5 0 1 1 0-3.01A1.5 1.5 0 0 1 14.5 8Zm3 4a1.5 1.5 0 1 1 0-3.01A1.5 1.5 0 0 1 17.5 12Z" />
    </svg>
  );
}

export default function CalendarPage() {
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(todayDateOnly());
  const [activeTab, setActiveTab] = useState<"calendar" | "routine">("calendar");

  const [instances, setInstances] = useState<CalendarInstance[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [dayAgendaOpen, setDayAgendaOpen] = useState(false);
  const dayAgendaDialogRef = useRef<HTMLDivElement | null>(null);
  const [dayAgendaModalHeight, setDayAgendaModalHeight] = useState(0);
  const [dayAgendaAnchor, setDayAgendaAnchor] = useState<{
    right: number;
    centerY: number;
    width: number;
  } | null>(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [programForm, setProgramForm] = useState<ProgramFormState | null>(null);
  const [routineForm, setRoutineForm] = useState<RoutineFormState | null>(null);
  const [classForm, setClassForm] = useState<ClassFormState | null>(null);
  const [eventForm, setEventForm] = useState<EventFormState | null>(null);
  const [holidayForm, setHolidayForm] = useState<HolidayFormState | null>(null);
  const [programMenuId, setProgramMenuId] = useState<string | null>(null);
  const [programColorListId, setProgramColorListId] = useState<string | null>(null);
  const [editingProgramId, setEditingProgramId] = useState<string | null>(null);
  const [editingProgramName, setEditingProgramName] = useState("");

  const monthRange = useMemo(() => getMonthRange(monthCursor), [monthCursor]);
  const cells = useMemo(() => buildMonthCells(monthCursor), [monthCursor]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [calendarData, programsData, routinesData] = await Promise.all([
        apiFetch<CalendarResponse>(`/api/calendar?from=${monthRange.from}&to=${monthRange.to}`),
        apiFetch<ProgramsResponse>("/api/calendar/programs?includeInactive=true"),
        apiFetch<RoutinesResponse>("/api/calendar/routines?includeExpired=false"),
      ]);

      setInstances(calendarData.instances ?? []);
      setPrograms(sortPrograms(programsData.items ?? []));
      setRoutines(routinesData.items ?? []);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "캘린더 데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [monthRange.from, monthRange.to]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (compareDateOnly(selectedDate, monthRange.from) < 0 || compareDateOnly(selectedDate, monthRange.to) > 0) {
      setSelectedDate(monthRange.from);
    }
  }, [monthRange.from, monthRange.to, selectedDate]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target?.closest(".calendar-program-actions-menu")) {
        setProgramMenuId(null);
        setProgramColorListId(null);
      }
    };
    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  const instanceMap = useMemo(() => {
    const map = new Map<string, CalendarInstance[]>();
    for (const instance of instances) {
      const prev = map.get(instance.date);
      if (prev) prev.push(instance);
      else map.set(instance.date, [instance]);
    }
    return map;
  }, [instances]);

  const selectedItems = useMemo(() => {
    return instanceMap.get(selectedDate) ?? [];
  }, [instanceMap, selectedDate]);

  useEffect(() => {
    if (!dayAgendaOpen) {
      setDayAgendaModalHeight(0);
      return;
    }
    const dialog = dayAgendaDialogRef.current;
    if (!dialog) return;
    const updateHeight = () => {
      const nextHeight = dialog.getBoundingClientRect().height;
      setDayAgendaModalHeight((prev) => (Math.abs(prev - nextHeight) < 1 ? prev : nextHeight));
    };
    updateHeight();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(updateHeight);
    observer.observe(dialog);
    return () => observer.disconnect();
  }, [dayAgendaOpen, selectedDate, selectedItems.length]);

  const dayAgendaPosition = useMemo(() => {
    if (!dayAgendaAnchor || typeof window === "undefined") return undefined;
    const padding = 16;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const modalWidth = Math.min(300, Math.max(280, viewportWidth - padding * 2));
    const targetLeft = dayAgendaAnchor.right;

    const left = Math.min(
      Math.max(targetLeft, padding),
      Math.max(padding, viewportWidth - modalWidth - padding),
    );
    const modalHalfHeight = dayAgendaModalHeight / 2;
    const top = Math.min(
      Math.max(dayAgendaAnchor.centerY - modalHalfHeight, padding),
      Math.max(padding, viewportHeight - dayAgendaModalHeight - padding),
    );

    return {
      left: `${Math.round(left)}px`,
      top: `${Math.round(top)}px`,
    } as const;
  }, [dayAgendaAnchor, dayAgendaModalHeight]);

  const programMap = useMemo(() => {
    return new Map(programs.map((program) => [program.id, program]));
  }, [programs]);

  const activePrograms = useMemo(() => {
    return programs.filter((program) => program.is_active);
  }, [programs]);

  const routinesByDay = useMemo(() => {
    const days = Array.from({ length: 7 }).map(() => [] as Routine[]);
    for (const routine of routines) {
      if (routine.day_of_week < 0 || routine.day_of_week > 6) continue;
      days[routine.day_of_week].push(routine);
    }
    for (const dayRoutines of days) {
      dayRoutines.sort((a, b) => {
        const aStart = normalizeTime(a.start_time);
        const bStart = normalizeTime(b.start_time);
        if (aStart !== bStart) return aStart.localeCompare(bStart);
        return a.effective_from.localeCompare(b.effective_from);
      });
    }
    return days;
  }, [routines]);

  const openClassCreate = (date: string) => {
    const defaultProgram = activePrograms[0]?.id ?? programs[0]?.id ?? "";
    setClassForm({
      mode: "create",
      date,
      program_id: defaultProgram,
      start_time: "19:00",
      end_time: "20:00",
      capacity: "",
      coach_name: "",
      note: "",
    });
    setDayAgendaOpen(false);
    setQuickAddOpen(false);
  };

  const openProgramCreate = () => {
    setProgramForm({
      name: "",
      color: DEFAULT_PROGRAM_COLOR,
    });
  };

  const openProgramRename = (program: Program) => {
    setProgramMenuId(null);
    setProgramColorListId(null);
    setEditingProgramId(program.id);
    setEditingProgramName(program.name);
  };

  const openRoutineCreate = (dayOfWeek = 1) => {
    const defaultProgram = activePrograms[0]?.id ?? programs[0]?.id ?? "";
    setRoutineForm({
      mode: "create",
      day_of_week: dayOfWeek,
      program_id: defaultProgram,
      start_time: "19:00",
      end_time: "20:00",
    });
  };

  const openRoutineEdit = (routine: Routine) => {
    setRoutineForm({
      mode: "edit",
      id: routine.id,
      day_of_week: routine.day_of_week,
      program_id: routine.program_id,
      start_time: normalizeTime(routine.start_time),
      end_time: normalizeTime(routine.end_time),
    });
  };

  const handleEditInstance = (item: CalendarInstance) => {
    if (item.source === "ROUTINE" && item.routine_id) {
      const routine = routines.find((entry) => entry.id === item.routine_id);
      if (routine) {
        setDayAgendaOpen(false);
        openRoutineEdit(routine);
      }
      return;
    }

    if (!item.schedule_id) return;

    if (item.kind === "HOLIDAY") {
      setDayAgendaOpen(false);
      setHolidayForm({
        mode: "edit",
        schedule_id: item.schedule_id,
        start_date: item.date,
        end_date: item.date,
      });
      return;
    }

    if (item.program_id) {
      setDayAgendaOpen(false);
      setClassForm({
        mode: "edit",
        schedule_id: item.schedule_id,
        date: item.date,
        program_id: item.program_id,
        start_time: normalizeTime(item.start_time),
        end_time: normalizeTime(item.end_time),
        capacity: item.capacity == null ? "" : String(item.capacity),
        coach_name: item.coach_name ?? "",
        note: item.note ?? "",
      });
      return;
    }

    setDayAgendaOpen(false);
    setEventForm({
      mode: "edit",
      schedule_id: item.schedule_id,
      date: item.date,
      title: item.title ?? "",
      location: item.location ?? "",
      note: item.note ?? "",
      start_time: normalizeTime(item.start_time),
      end_time: normalizeTime(item.end_time),
    });
  };

  const handleDeleteInstance = async (item: CalendarInstance) => {
    const ok = confirm("이 일정을 삭제할까요?");
    if (!ok) return;

    try {
      setSaving(true);
      if (item.source === "ROUTINE" && item.routine_id) {
        const applyFrom = atLeastToday(item.date);
        await apiFetch(`/api/calendar/routines/${item.routine_id}?applyFrom=${applyFrom}`, {
          method: "DELETE",
        });
      } else if (item.schedule_id) {
        await apiFetch(`/api/calendar/schedules/${item.schedule_id}`, {
          method: "DELETE",
        });
      }
      await loadAll();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "삭제에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleProgramSave = async () => {
    if (!programForm) return;
    if (!programForm.name.trim()) {
      alert("프로그램 이름을 입력해 주세요.");
      return;
    }
    if (!PROGRAM_COLOR_SET.has(programForm.color.toLowerCase())) {
      alert("지원되는 색상만 선택해 주세요.");
      return;
    }
    try {
      setSaving(true);
      const result = await apiFetch<ProgramMutationResponse>("/api/calendar/programs", {
        method: "POST",
        body: JSON.stringify({
          name: programForm.name,
          color: programForm.color,
        }),
      });
      setPrograms((prev) => sortPrograms([...prev, result.program]));
      setProgramForm(null);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "프로그램 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleProgramDelete = async (program: Program) => {
    if (!confirm(`${program.name} 프로그램을 삭제할까요?`)) return;

    try {
      setSaving(true);
      await apiFetch<ProgramMutationResponse>(`/api/calendar/programs/${program.id}`, { method: "DELETE" });
      setPrograms((prev) => prev.filter((entry) => entry.id !== program.id));
      setRoutines((prev) => prev.filter((entry) => entry.program_id !== program.id));
      setInstances((prev) => prev.filter((entry) => entry.program_id !== program.id));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "프로그램 삭제에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleProgramColorUpdate = async (program: Program, color: string) => {
    const nextColor = normalizeProgramColor(color);
    if (nextColor === normalizeProgramColor(program.color)) return;
    try {
      setSaving(true);
      const result = await apiFetch<ProgramMutationResponse>(`/api/calendar/programs/${program.id}`, {
        method: "PATCH",
        body: JSON.stringify({ color: nextColor }),
      });
      setPrograms((prev) =>
        sortPrograms(prev.map((entry) => (entry.id === result.program.id ? result.program : entry))),
      );
      setProgramColorListId(null);
      setProgramMenuId(null);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "프로그램 색상 변경에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const cancelProgramNameEdit = () => {
    setEditingProgramId(null);
    setEditingProgramName("");
  };

  const handleProgramNameSave = async (program: Program) => {
    if (saving || editingProgramId !== program.id) return;
    const nextName = editingProgramName.trim();
    if (!nextName) {
      alert("프로그램 이름을 입력해 주세요.");
      return;
    }
    if (nextName === program.name) {
      cancelProgramNameEdit();
      return;
    }
    try {
      setSaving(true);
      const result = await apiFetch<ProgramMutationResponse>(`/api/calendar/programs/${program.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: nextName }),
      });
      setPrograms((prev) =>
        sortPrograms(prev.map((entry) => (entry.id === result.program.id ? result.program : entry))),
      );
      cancelProgramNameEdit();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "프로그램 이름 수정에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleRoutineSave = async () => {
    if (!routineForm) return;
    if (!routineForm.program_id) {
      alert("프로그램을 선택해 주세요.");
      return;
    }
    try {
      setSaving(true);
      if (routineForm.mode === "create") {
        await apiFetch("/api/calendar/routines", {
          method: "POST",
          body: JSON.stringify({
            program_id: routineForm.program_id,
            day_of_week: routineForm.day_of_week,
            start_time: routineForm.start_time,
            end_time: routineForm.end_time,
          }),
        });
      } else {
        await apiFetch(`/api/calendar/routines/${routineForm.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            program_id: routineForm.program_id,
            start_time: routineForm.start_time,
            end_time: routineForm.end_time,
          }),
        });
      }
      setRoutineForm(null);
      await loadAll();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "반복 수업 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleRoutineDelete = async (routine: Routine) => {
    const applyFrom = atLeastToday(selectedDate);
    if (!confirm(`${dayName(routine.day_of_week)} ${normalizeTime(routine.start_time)} 루틴을 ${applyFrom}부터 종료할까요?`)) {
      return;
    }

    try {
      setSaving(true);
      await apiFetch(`/api/calendar/routines/${routine.id}?applyFrom=${applyFrom}`, {
        method: "DELETE",
      });
      await loadAll();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "반복 수업 종료에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleClassSave = async () => {
    if (!classForm) return;
    if (!classForm.program_id) {
      alert("프로그램을 선택해 주세요.");
      return;
    }
    if (!classForm.start_time || !classForm.end_time) {
      alert("시작/종료 시간을 입력해 주세요.");
      return;
    }

    try {
      setSaving(true);
      const payload = {
        action: "ADD",
        date: classForm.date,
        program_id: classForm.program_id,
        start_time: classForm.start_time,
        end_time: classForm.end_time,
        capacity: classForm.capacity === "" ? null : Number(classForm.capacity),
        coach_name: classForm.coach_name || null,
        note: classForm.note || null,
      };

      if (classForm.mode === "create") {
        await apiFetch("/api/calendar/schedules", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch(`/api/calendar/schedules/${classForm.schedule_id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      }
      setClassForm(null);
      await loadAll();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "수업 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleEventSave = async () => {
    if (!eventForm) return;
    if (!eventForm.title.trim()) {
      alert("대회/이벤트 제목을 입력해 주세요.");
      return;
    }
    if ((eventForm.start_time && !eventForm.end_time) || (!eventForm.start_time && eventForm.end_time)) {
      alert("시간은 시작/종료를 함께 입력해 주세요.");
      return;
    }

    try {
      setSaving(true);
      const payload = {
        action: "ADD",
        date: eventForm.date,
        title: eventForm.title,
        location: eventForm.location || null,
        note: eventForm.note || null,
        start_time: eventForm.start_time || null,
        end_time: eventForm.end_time || null,
      };

      if (eventForm.mode === "create") {
        await apiFetch("/api/calendar/schedules", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch(`/api/calendar/schedules/${eventForm.schedule_id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      }
      setEventForm(null);
      await loadAll();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "대회/이벤트 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleHolidaySave = async () => {
    if (!holidayForm) return;
    try {
      setSaving(true);
      if (holidayForm.mode === "create") {
        await apiFetch("/api/calendar/schedules", {
          method: "POST",
          body: JSON.stringify({
            action: "HOLIDAY",
            start_date: holidayForm.start_date,
            end_date: holidayForm.end_date,
          }),
        });
      } else {
        await apiFetch(`/api/calendar/schedules/${holidayForm.schedule_id}`, {
          method: "PATCH",
          body: JSON.stringify({
            action: "CANCEL",
            date: holidayForm.start_date,
            routine_id: null,
            program_id: null,
            start_time: null,
            end_time: null,
            capacity: null,
            coach_name: null,
            title: "휴무",
            note: "__HOLIDAY__",
          }),
        });
      }
      setHolidayForm(null);
      await loadAll();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "휴무 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminShell
      title="일정 관리 (베타)"
      subtitle="월간 캘린더에서 수업, 대회, 휴무를 관리하세요."
    >
      {error ? <div className="alert-error">{error}</div> : null}

      <section className="calendar-layout">
        <div className="panel calendar-main-panel">
          <div className="calendar-view-tabs" role="tablist" aria-label="일정 보기">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "calendar"}
              className={`calendar-view-tab ${activeTab === "calendar" ? "active" : ""}`}
              onClick={() => setActiveTab("calendar")}
            >
              캘린더
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "routine"}
              className={`calendar-view-tab ${activeTab === "routine" ? "active" : ""}`}
              onClick={() => setActiveTab("routine")}
            >
              주간루틴
            </button>
          </div>

          {activeTab === "calendar" ? (
            <>
              <div className="calendar-month-header">
                <div className="calendar-month-toolbar">
                  <button
                    type="button"
                    className="btn btn-secondary calendar-today-btn"
                    onClick={() => {
                      const today = new Date();
                      setMonthCursor(startOfMonth(today));
                      setSelectedDate(todayDateOnly());
                    }}
                  >
                    오늘
                  </button>

                  <div className="calendar-month-nav">
                    <button
                      type="button"
                      className="btn btn-secondary calendar-nav-btn"
                      onClick={() => setMonthCursor((prev) => shiftMonth(prev, -1))}
                      aria-label="이전 달"
                    >
                      &lt;
                    </button>
                    <h3 className="panel-title calendar-month-title">{monthLabel(monthCursor)}</h3>
                    <button
                      type="button"
                      className="btn btn-secondary calendar-nav-btn"
                      onClick={() => setMonthCursor((prev) => shiftMonth(prev, 1))}
                      aria-label="다음 달"
                    >
                      &gt;
                    </button>
                  </div>
                </div>
              </div>

              <div className="calendar-grid-shell">
                <div className="calendar-grid-head">
                  {WEEK_DAYS.map((dayLabel, index) => (
                    <div key={dayLabel} className={`calendar-grid-weekday ${index === 0 ? "sun" : ""} ${index === 6 ? "sat" : ""}`}>
                      {dayLabel}
                    </div>
                  ))}
                </div>

                <div className="calendar-grid">
                  {cells.map((cell) => {
                    const items = instanceMap.get(cell.date) ?? [];
                    const active = cell.date === selectedDate;
                    const isToday = cell.date === todayDateOnly();
                    return (
                      <button
                        type="button"
                        key={cell.date}
                        className={`calendar-cell ${cell.inMonth ? "in-month" : "out-month"} ${active ? "active" : ""}`}
                        onClick={(event) => {
                          setSelectedDate(cell.date);
                          const tileRect = event.currentTarget.getBoundingClientRect();
                          setDayAgendaAnchor({
                            right: tileRect.right,
                            centerY: tileRect.top + tileRect.height / 2,
                            width: tileRect.width,
                          });
                          setDayAgendaOpen(true);
                        }}
                      >
                        <div className="calendar-cell-head">
                          <span className={`calendar-cell-day ${isToday ? "today" : ""}`}>{cell.day}</span>
                        </div>

                        <div className="calendar-cell-events">
                          {items.slice(0, 4).map((item) => {
                            if (item.kind === "HOLIDAY") {
                              return (
                                <span key={item.id} className="calendar-chip calendar-chip-holiday">
                                  휴무
                                </span>
                              );
                            }
                            if (item.kind === "EVENT") {
                              return (
                                <span key={item.id} className="calendar-chip calendar-chip-event">
                                  🏆 {item.title ?? "대회"}
                                </span>
                              );
                            }
                            const chipStyle = { "--calendar-chip-color": item.color ?? "#0e3b2e" } as CSSProperties;
                            return (
                              <span key={item.id} className="calendar-chip calendar-chip-class" style={chipStyle}>
                                {normalizeTime(item.start_time)} {item.program_name ?? item.title ?? "수업"}
                              </span>
                            );
                          })}
                          {items.length > 4 ? (
                            <span className="calendar-chip calendar-chip-more">+{items.length - 4}</span>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="panel-header">
                <h3 className="panel-title">주간 루틴</h3>
                <button type="button" className="btn btn-primary" onClick={() => openRoutineCreate(1)} disabled={saving}>
                  + 루틴 추가
                </button>
              </div>
              <div className="calendar-routine-shell">
                <div className="calendar-routine-grid">
                  {WEEK_DAYS.map((dayLabel, index) => (
                    <article key={dayLabel} className="calendar-routine-day">
                      <div className="calendar-routine-day-head">
                        <h5>{dayLabel}</h5>
                        <button type="button" className="btn btn-secondary" onClick={() => openRoutineCreate(index)}>
                          + 추가
                        </button>
                      </div>

                      <div className="calendar-routine-day-list">
                        {routinesByDay[index].length === 0 ? (
                          <p className="empty-state">반복 수업 없음</p>
                        ) : (
                          routinesByDay[index].map((routine) => {
                            const program = programMap.get(routine.program_id);
                            return (
                              <div key={routine.id} className="calendar-routine-item">
                                <p className="calendar-routine-time">
                                  {normalizeTime(routine.start_time)} - {normalizeTime(routine.end_time)}
                                </p>
                                <p className="calendar-routine-program">{program?.name ?? "프로그램"}</p>
                                <p className="calendar-routine-meta">
                                  적용: {routine.effective_from}{routine.effective_to ? ` ~ ${routine.effective_to}` : " ~"}
                                </p>
                                <div className="calendar-inline-actions">
                                  <button type="button" className="btn btn-secondary" onClick={() => openRoutineEdit(routine)}>
                                    편집
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-danger"
                                    onClick={() => void handleRoutineDelete(routine)}
                                  >
                                    종료
                                  </button>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <aside className="panel calendar-program-panel">
          <div className="panel-header">
            <h3 className="panel-title">프로그램 리스트</h3>
            <button type="button" className="btn btn-primary" onClick={openProgramCreate} disabled={saving}>
              + 추가
            </button>
          </div>
          <div className="calendar-program-panel-body">
            {loading ? (
              <p className="empty-state">프로그램을 불러오는 중...</p>
            ) : programs.filter((program) => program.is_active).length === 0 ? (
              <p className="empty-state">등록된 프로그램이 없습니다.</p>
            ) : (
              <ul className="calendar-program-list">
                {programs.filter((program) => program.is_active).map((program) => (
                  <li
                    key={program.id}
                    className="calendar-program-list-item"
                    style={{ "--program-tile-color": normalizeProgramColor(program.color) } as CSSProperties}
                  >
                    <div className="calendar-program-list-main">
                      {editingProgramId === program.id ? (
                        <input
                          className="input calendar-program-name-input"
                          value={editingProgramName}
                          onChange={(event) => setEditingProgramName(event.target.value)}
                          onBlur={() => {
                            void handleProgramNameSave(program);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              void handleProgramNameSave(program);
                            }
                            if (event.key === "Escape") {
                              event.preventDefault();
                              cancelProgramNameEdit();
                            }
                          }}
                          autoFocus
                          disabled={saving}
                          aria-label="프로그램 이름 입력"
                        />
                      ) : (
                        <p className="calendar-program-list-title">{program.name}</p>
                      )}
                    </div>
                    <div className="calendar-program-actions-menu">
                      <button
                        type="button"
                        className="icon-btn"
                        data-tooltip="프로그램 메뉴"
                        aria-label="프로그램 메뉴"
                        title="프로그램 메뉴"
                        onClick={() => {
                          if (programMenuId === program.id) {
                            setProgramMenuId(null);
                            setProgramColorListId(null);
                            return;
                          }
                          setProgramMenuId(program.id);
                          setProgramColorListId(null);
                        }}
                        disabled={saving}
                        aria-expanded={programMenuId === program.id}
                      >
                        <MaterialMoreVertIcon />
                      </button>
                      {programMenuId === program.id ? (
                        <div className="calendar-program-dropdown" role="menu" aria-label={`${program.name} 메뉴`}>
                          <div className="program-dropdown-actions">
                            <button
                              type="button"
                              className="icon-btn"
                              data-tooltip="프로그램 이름 수정"
                              aria-label="프로그램 이름 수정"
                              title="프로그램 이름 수정"
                              onClick={() => openProgramRename(program)}
                              disabled={saving}
                            >
                              <MaterialEditIcon />
                            </button>
                            <button
                              type="button"
                              className="icon-btn icon-btn-danger"
                              data-tooltip="프로그램 삭제"
                              aria-label="프로그램 삭제"
                              title="프로그램 삭제"
                              onClick={() => {
                                cancelProgramNameEdit();
                                setProgramMenuId(null);
                                setProgramColorListId(null);
                                void handleProgramDelete(program);
                              }}
                              disabled={saving}
                            >
                              <MaterialDeleteIcon />
                            </button>
                            <button
                              type="button"
                              className="icon-btn"
                              data-tooltip="색상 변경"
                              aria-label="색상 변경"
                              title="색상 변경"
                              onClick={() => setProgramColorListId((prev) => (prev === program.id ? null : program.id))}
                              disabled={saving}
                            >
                              <MaterialPaletteIcon />
                            </button>
                          </div>
                          {programColorListId === program.id ? (
                            <div className="program-color-option-list" role="group" aria-label="프로그램 색상 선택">
                              {PROGRAM_COLOR_OPTIONS.map((option) => {
                                const active = option.value.toLowerCase() === normalizeProgramColor(program.color);
                                return (
                                  <button
                                    key={option.key}
                                    type="button"
                                    className={`program-color-option ${active ? "active" : ""}`}
                                    onClick={() => {
                                      void handleProgramColorUpdate(program, option.value);
                                    }}
                                    disabled={saving}
                                  >
                                    <span
                                      className="program-color-option-swatch"
                                      style={{ "--swatch-color": option.value } as CSSProperties}
                                      aria-hidden="true"
                                    />
                                    <span className="program-color-option-label">{option.label}</span>
                                  </button>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </section>

      {dayAgendaOpen ? (
        <div className="modal-overlay calendar-day-dialog-overlay" onClick={() => setDayAgendaOpen(false)}>
          <div
            ref={dayAgendaDialogRef}
            className="modal-card calendar-day-dialog"
            style={dayAgendaPosition}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header calendar-day-dialog-header">
              <h3 className="modal-title">{selectedDate} 일정</h3>
            </div>
            <div className="modal-body calendar-day-dialog-body">
              {loading ? (
                <p className="empty-state">일정을 불러오는 중...</p>
              ) : selectedItems.length === 0 ? (
                <p className="empty-state">등록된 일정이 없습니다.</p>
              ) : (
                <ul className="calendar-side-list">
                  {selectedItems.map((item) => (
                    <li key={item.id} className="calendar-side-item">
                      <div className="calendar-side-item-main">
                        <p className="calendar-side-time">{formatTimeRange(item.start_time, item.end_time)}</p>
                        <p className="calendar-side-title">
                          {item.kind === "EVENT"
                            ? `🏆 ${item.title ?? "대회"}`
                            : item.kind === "HOLIDAY"
                              ? "휴무"
                              : item.program_name ?? item.title ?? "수업"}
                        </p>
                        {item.coach_name ? <p className="calendar-side-meta">코치: {item.coach_name}</p> : null}
                      </div>
                      <div className="calendar-side-actions">
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => handleEditInstance(item)}
                          disabled={saving}
                        >
                          편집
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger"
                          onClick={() => void handleDeleteInstance(item)}
                          disabled={saving}
                        >
                          삭제
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <div className="modal-footer calendar-day-dialog-footer">
                <button
                  type="button"
                  className="btn btn-primary calendar-day-dialog-add-btn"
                  onClick={() => openClassCreate(atLeastToday(selectedDate))}
                  disabled={saving}
                >
                  일정 추가
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {quickAddOpen ? (
        <div className="modal-overlay" onClick={() => setQuickAddOpen(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">일정 추가</h3>
            </div>
            <div className="modal-body">
              <p className="panel-subhead">선택 날짜: {atLeastToday(selectedDate)}</p>
              <div className="field-grid">
                <button type="button" className="btn btn-primary" onClick={() => openClassCreate(atLeastToday(selectedDate))}>
                  일정 추가
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {programForm ? (
        <div className="modal-overlay" onClick={() => setProgramForm(null)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">프로그램 추가</h3>
            </div>
            <div className="modal-body">
              <label className="field-label">
                프로그램 이름
                <input
                  className="input"
                  value={programForm.name}
                  onChange={(event) => setProgramForm((prev) => (prev ? { ...prev, name: event.target.value } : prev))}
                  placeholder="예: 기수업"
                />
              </label>
              <label className="field-label">
                색상
                <select
                  className="input"
                  value={programForm.color}
                  onChange={(event) => setProgramForm((prev) => (prev ? { ...prev, color: event.target.value } : prev))}
                >
                  {PROGRAM_COLOR_OPTIONS.map((option) => (
                    <option key={option.key} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setProgramForm(null)}>
                  취소
                </button>
                <button type="button" className="btn btn-primary" onClick={() => void handleProgramSave()} disabled={saving}>
                  저장
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {routineForm ? (
        <div className="modal-overlay" onClick={() => setRoutineForm(null)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{routineForm.mode === "create" ? "루틴 추가" : "루틴 수정"}</h3>
            </div>
            <div className="modal-body">
              <label className="field-label">
                프로그램
                <select
                  className="input"
                  value={routineForm.program_id}
                  onChange={(event) => setRoutineForm((prev) => (prev ? { ...prev, program_id: event.target.value } : prev))}
                >
                  <option value="">선택</option>
                  {programs.map((program) => (
                    <option key={program.id} value={program.id}>
                      {program.name}{program.is_active ? "" : " (비활성)"}
                    </option>
                  ))}
                </select>
              </label>
              <div className="settings-item">
                <p className="settings-label">요일</p>
                <p className="settings-value">{dayName(routineForm.day_of_week)}</p>
              </div>
              <div className="field-grid calendar-two-col">
                <label className="field-label">
                  시작 시간
                  <input
                    className="input"
                    type="time"
                    value={routineForm.start_time}
                    onChange={(event) => setRoutineForm((prev) => (prev ? { ...prev, start_time: event.target.value } : prev))}
                  />
                </label>
                <label className="field-label">
                  종료 시간
                  <input
                    className="input"
                    type="time"
                    value={routineForm.end_time}
                    onChange={(event) => setRoutineForm((prev) => (prev ? { ...prev, end_time: event.target.value } : prev))}
                  />
                </label>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setRoutineForm(null)}>
                  취소
                </button>
                <button type="button" className="btn btn-primary" onClick={() => void handleRoutineSave()} disabled={saving}>
                  저장
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {classForm ? (
        <div className="modal-overlay" onClick={() => setClassForm(null)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{classForm.mode === "create" ? "수업 추가" : "수업 수정"}</h3>
            </div>
            <div className="modal-body">
              <label className="field-label">
                날짜
                <input
                  className="input"
                  type="date"
                  min={todayDateOnly()}
                  value={classForm.date}
                  onChange={(event) => setClassForm((prev) => (prev ? { ...prev, date: event.target.value } : prev))}
                />
              </label>
              <label className="field-label">
                프로그램
                <select
                  className="input"
                  value={classForm.program_id}
                  onChange={(event) => setClassForm((prev) => (prev ? { ...prev, program_id: event.target.value } : prev))}
                >
                  <option value="">선택</option>
                  {programs.map((program) => (
                    <option key={program.id} value={program.id}>
                      {program.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="field-grid calendar-two-col">
                <label className="field-label">
                  시작 시간
                  <input
                    className="input"
                    type="time"
                    value={classForm.start_time}
                    onChange={(event) => setClassForm((prev) => (prev ? { ...prev, start_time: event.target.value } : prev))}
                  />
                </label>
                <label className="field-label">
                  종료 시간
                  <input
                    className="input"
                    type="time"
                    value={classForm.end_time}
                    onChange={(event) => setClassForm((prev) => (prev ? { ...prev, end_time: event.target.value } : prev))}
                  />
                </label>
              </div>
              {classForm.mode === "edit" ? (
                <div className="field-grid calendar-two-col">
                  <label className="field-label">
                    코치명
                    <input
                      className="input"
                      value={classForm.coach_name}
                      onChange={(event) => setClassForm((prev) => (prev ? { ...prev, coach_name: event.target.value } : prev))}
                    />
                  </label>
                  <label className="field-label">
                    정원
                    <input
                      className="input"
                      inputMode="numeric"
                      value={classForm.capacity}
                      onChange={(event) => setClassForm((prev) => (prev ? { ...prev, capacity: event.target.value.replace(/[^\d]/g, "") } : prev))}
                    />
                  </label>
                </div>
              ) : null}
              <label className="field-label">
                메모
                <textarea
                  className="textarea"
                  value={classForm.note}
                  onChange={(event) => setClassForm((prev) => (prev ? { ...prev, note: event.target.value } : prev))}
                />
              </label>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setClassForm(null)}>
                  취소
                </button>
                <button type="button" className="btn btn-primary" onClick={() => void handleClassSave()} disabled={saving}>
                  저장
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {eventForm ? (
        <div className="modal-overlay" onClick={() => setEventForm(null)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{eventForm.mode === "create" ? "대회/이벤트 추가" : "대회/이벤트 수정"}</h3>
            </div>
            <div className="modal-body">
              <label className="field-label">
                날짜
                <input
                  className="input"
                  type="date"
                  min={todayDateOnly()}
                  value={eventForm.date}
                  onChange={(event) => setEventForm((prev) => (prev ? { ...prev, date: event.target.value } : prev))}
                />
              </label>
              <label className="field-label">
                제목
                <input
                  className="input"
                  value={eventForm.title}
                  onChange={(event) => setEventForm((prev) => (prev ? { ...prev, title: event.target.value } : prev))}
                  placeholder="예: 주짓수 대회"
                />
              </label>
              <div className="field-grid calendar-two-col">
                <label className="field-label">
                  시작 시간
                  <input
                    className="input"
                    type="time"
                    value={eventForm.start_time}
                    onChange={(event) => setEventForm((prev) => (prev ? { ...prev, start_time: event.target.value } : prev))}
                  />
                </label>
                <label className="field-label">
                  종료 시간
                  <input
                    className="input"
                    type="time"
                    value={eventForm.end_time}
                    onChange={(event) => setEventForm((prev) => (prev ? { ...prev, end_time: event.target.value } : prev))}
                  />
                </label>
              </div>
              <label className="field-label">
                장소
                <input
                  className="input"
                  value={eventForm.location}
                  onChange={(event) => setEventForm((prev) => (prev ? { ...prev, location: event.target.value } : prev))}
                  placeholder="선택 입력"
                />
              </label>
              <label className="field-label">
                메모
                <textarea
                  className="textarea"
                  value={eventForm.note}
                  onChange={(event) => setEventForm((prev) => (prev ? { ...prev, note: event.target.value } : prev))}
                />
              </label>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setEventForm(null)}>
                  취소
                </button>
                <button type="button" className="btn btn-primary" onClick={() => void handleEventSave()} disabled={saving}>
                  저장
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {holidayForm ? (
        <div className="modal-overlay" onClick={() => setHolidayForm(null)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{holidayForm.mode === "create" ? "휴무 설정" : "휴무 수정"}</h3>
            </div>
            <div className="modal-body">
              <label className="field-label">
                시작일
                <input
                  className="input"
                  type="date"
                  min={todayDateOnly()}
                  value={holidayForm.start_date}
                  onChange={(event) => setHolidayForm((prev) => (prev ? { ...prev, start_date: event.target.value } : prev))}
                />
              </label>
              <label className="field-label">
                종료일
                <input
                  className="input"
                  type="date"
                  min={holidayForm.start_date}
                  value={holidayForm.end_date}
                  onChange={(event) => setHolidayForm((prev) => (prev ? { ...prev, end_date: event.target.value } : prev))}
                  disabled={holidayForm.mode === "edit"}
                />
              </label>
              {holidayForm.mode === "create" ? (
                <p className="settings-help">기간 휴무를 설정하면 날짜별 schedule이 자동 생성됩니다.</p>
              ) : (
                <p className="settings-help">기존 휴무는 단일 날짜 기준으로 수정됩니다.</p>
              )}
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setHolidayForm(null)}>
                  취소
                </button>
                <button type="button" className="btn btn-primary" onClick={() => void handleHolidaySave()} disabled={saving}>
                  저장
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </AdminShell>
  );
}
