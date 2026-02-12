// app/api/members/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { requireUserIdFromAuthHeader, getGymIdByUserId } from "@/lib/supabase/gym";
import type { MemberGender } from "@/lib/types";

function normalizeGender(value: unknown): MemberGender | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (["남", "남자", "male", "m"].includes(normalized)) return "남";
  if (["여", "여자", "female", "f"].includes(normalized)) return "여";
  return null;
}

function normalizePhone(value: unknown): string {
  return typeof value === "string" ? value.replace(/\D/g, "") : "";
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
    const { name, gender, start_date, expire_date, memo } = body;
    const phone = normalizePhone(body.phone);
    const normalizedGender = normalizeGender(gender);

    if (!name || !phone || !expire_date || !normalizedGender) {
      return NextResponse.json({ error: "name, phone, gender, expire_date are required" }, { status: 400 });
    }

    const sb = supabaseServer();
    const { data, error } = await sb
      .from("members")
      .insert({
        gym_id: gymId,
        name,
        phone,
        gender: normalizedGender,
        start_date: start_date ?? null,
        expire_date,
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
