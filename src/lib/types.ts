export type MemberStatus = "NORMAL" | "EXPIRING" | "OVERDUE";
export type MemberGender = "남" | "여";
export type MemberBelt = "흰띠" | "그레이띠" | "오렌지띠" | "초록띠" | "파란띠" | "보라띠" | "갈색띠" | "검은띠";
export type MemberBeltGral = 0 | 1 | 2 | 3 | 4;
export type MembershipState = "ACTIVE" | "PAUSED";

export type Member = {
  id: string;
  gym_id: string;
  name: string;
  phone: string;
  gender: MemberGender | null;
  belt: MemberBelt | null;
  belt_gral: MemberBeltGral | null;
  birth_date: string | null;
  start_date: string | null;
  expire_date: string; // YYYY-MM-DD
  membership_state: MembershipState | null;
  paused_at: string | null;
  paused_days_total: number | null;
  memo: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  status?: MemberStatus | "DELETED";
};
