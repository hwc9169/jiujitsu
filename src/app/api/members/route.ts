// app/api/members/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { requireUserIdFromAuthHeader, getGymIdByUserId } from "@/lib/supabase/gym";
import type { MemberGender } from "@/lib/types";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const BELT_VALUES = ["흰띠", "그레이띠", "오렌지띠", "초록띠", "파란띠", "보라띠", "갈색띠", "검은띠"] as const;
const BELT_GRAL_VALUES = [0, 1, 2, 3, 4] as const;

function normalizeGender(value: unknown): MemberGender | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (["남", "남자", "male", "m"].includes(normalized)) return "남";
  if (["여", "여자", "female", "f"].includes(normalized)) return "여";
  return null;
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeBelt(value: unknown): (typeof BELT_VALUES)[number] | null {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  if ((BELT_VALUES as readonly string[]).includes(normalized)) {
    return normalized as (typeof BELT_VALUES)[number];
  }
  return null;
}

function normalizeBeltGral(value: unknown): (typeof BELT_GRAL_VALUES)[number] | null {
  if (value == null || value === "") return null;
  const num = typeof value === "number" ? value : (typeof value === "string" ? Number(value) : NaN);
  if (!Number.isInteger(num)) return null;
  if (!(BELT_GRAL_VALUES as readonly number[]).includes(num)) return null;
  return num as (typeof BELT_GRAL_VALUES)[number];
}

function normalizePhone(value: unknown): string {
  return typeof value === "string" ? value.replace(/\D/g, "") : "";
}

function normalizeDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (!DATE_REGEX.test(normalized)) return null;
  return normalized;
}

export async function GET(req: Request) {
  try {
    const userId = await requireUserIdFromAuthHeader(req);
    const gymId = await getGymIdByUserId(userId);
    if (!gymId) return NextResponse.json({ error: "No gym" }, { status: 404 });

    const url = new URL(req.url);
    const status = url.searchParams.get("status"); // NORMAL | EXPIRING | OVERDUE
    const q = url.searchParams.get("q") || "";
    const page = Number(url.searchParams.get("page") || "1");
    const pageSize = Math.min(Number(url.searchParams.get("pageSize") || "50"), 200);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const sb = supabaseServer();

    let query = sb
      .from("v_members_with_status")
      .select("*", { count: "exact" })
      .eq("gym_id", gymId)
      .is("deleted_at", null)
      .order("expire_date", { ascending: true })
      .range(from, to);

    if (status && ["NORMAL", "EXPIRING", "OVERDUE"].includes(status)) {
      query = query.eq("status", status);
    }
    if (q) {
      // 이름 or 폰번호 부분검색
      query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%`);
    }

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);

    return NextResponse.json({ items: data ?? [], count: count ?? 0, page, pageSize });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const userId = await requireUserIdFromAuthHeader(req);
    const gymId = await getGymIdByUserId(userId);
    if (!gymId) return NextResponse.json({ error: "No gym" }, { status: 404 });

    const body = await req.json();
    const { name, gender, memo } = body;
    const phone = normalizePhone(body.phone);
    const normalizedGender = normalizeGender(gender);
    const startDate = normalizeDate(body.start_date);
    const expireDate = normalizeDate(body.expire_date);
    const birthDate = normalizeDate(body.birth_date);
    const belt = normalizeBelt(body.belt);
    const beltGral = normalizeBeltGral(body.belt_gral);

    if (body.start_date != null && body.start_date !== "" && !startDate) {
      return NextResponse.json({ error: "start_date must be YYYY-MM-DD" }, { status: 400 });
    }
    if (body.birth_date != null && body.birth_date !== "" && !birthDate) {
      return NextResponse.json({ error: "birth_date must be YYYY-MM-DD" }, { status: 400 });
    }
    if (body.belt != null && body.belt !== "" && !belt) {
      return NextResponse.json({ error: "belt is invalid" }, { status: 400 });
    }
    if (body.belt_gral != null && body.belt_gral !== "" && beltGral == null) {
      return NextResponse.json({ error: "belt_gral is invalid" }, { status: 400 });
    }
    if (!name || !phone || !expireDate || !normalizedGender || !belt || beltGral == null) {
      return NextResponse.json({ error: "name, phone, gender, belt, belt_gral, expire_date are required" }, { status: 400 });
    }

    const sb = supabaseServer();
    const { data, error } = await sb
      .from("members")
      .insert({
        gym_id: gymId,
        name,
        phone,
        gender: normalizedGender,
        belt,
        belt_gral: beltGral,
        birth_date: birthDate,
        start_date: startDate,
        expire_date: expireDate,
        membership_state: "ACTIVE",
        paused_at: null,
        paused_days_total: 0,
        memo: memo ?? null,
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ member: data }, { status: 201 });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 },
    );
  }
}
