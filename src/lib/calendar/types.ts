export type ScheduleAction = "CANCEL" | "MODIFY" | "ADD";

export type Program = {
  id: string;
  gym_id: string;
  name: string;
  color: string;
  is_active: boolean;
  created_at: string;
};

export type Routine = {
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
  created_at: string;
  program: Pick<Program, "id" | "name" | "color" | "is_active"> | null;
};

export type Schedule = {
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
  program: Pick<Program, "id" | "name" | "color" | "is_active"> | null;
};

export type CalendarInstanceKind = "CLASS" | "EVENT" | "HOLIDAY";

export type CalendarInstance = {
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
