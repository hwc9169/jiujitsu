export type MemberStatus = "NORMAL" | "EXPIRING" | "OVERDUE";
export type MemberGender = "남" | "여";

export type Member = {
  id: string;
  gym_id: string;
  name: string;
  phone: string;
  gender: MemberGender | null;
  start_date: string | null;
  expire_date: string; // YYYY-MM-DD
  memo: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  status?: MemberStatus | "DELETED";
};
