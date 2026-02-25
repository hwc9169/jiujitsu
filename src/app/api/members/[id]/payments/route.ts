import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getGymIdByUserId, requireUserIdFromAuthHeader } from "@/lib/supabase/gym";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function normalizeDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || !DATE_REGEX.test(trimmed)) return null;
  return trimmed;
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeMonths(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n <= 0 || n > 36) return null;
  return n;
}

function normalizeAmount(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

function toDateOnly(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function toDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addMonthsToDateString(baseDate: string, months: number): string {
  const base = toDateOnly(baseDate);
  const monthStart = new Date(base.getFullYear(), base.getMonth() + months, 1);
  const endDay = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
  const day = Math.min(base.getDate(), endDay);
  return toDateString(new Date(monthStart.getFullYear(), monthStart.getMonth(), day));
}

async function ensureActiveMember(memberId: string, gymId: string) {
  const sb = supabaseServer();
  const { data, error } = await sb
    .from("members")
    .select("id")
    .eq("id", memberId)
    .eq("gym_id", gymId)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return !!data?.id;
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Internal server error";
}

export async function GET(req: Request, { params }: RouteContext) {
  try {
    const userId = await requireUserIdFromAuthHeader(req);
    const gymId = await getGymIdByUserId(userId);
    if (!gymId) return NextResponse.json({ error: "No gym" }, { status: 404 });

    const { id: memberId } = await params;
    const memberExists = await ensureActiveMember(memberId, gymId);
    if (!memberExists) return NextResponse.json({ error: "member not found" }, { status: 404 });

    const sb = supabaseServer();
    const { data, error } = await sb
      .from("payments")
      .select("id, gym_id, member_id, payment_date, start_date, expire_date, months, amount, memo, created_at, updated_at")
      .eq("gym_id", gymId)
      .eq("member_id", memberId)
      .order("payment_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return NextResponse.json({ items: data ?? [] });
  } catch (error: unknown) {
    return NextResponse.json({ error: toErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: RouteContext) {
  try {
    const userId = await requireUserIdFromAuthHeader(req);
    const gymId = await getGymIdByUserId(userId);
    if (!gymId) return NextResponse.json({ error: "No gym" }, { status: 404 });

    const { id: memberId } = await params;
    const body = await req.json();

    const paymentDate = normalizeDate(body?.payment_date);
    const months = normalizeMonths(body?.months);
    const amount = normalizeAmount(body?.amount);
    const memo = normalizeText(body?.memo);

    if (!paymentDate) {
      return NextResponse.json({ error: "payment_date must be YYYY-MM-DD" }, { status: 400 });
    }
    if (!months) {
      return NextResponse.json({ error: "months must be an integer between 1 and 36" }, { status: 400 });
    }
    if (!amount) {
      return NextResponse.json({ error: "amount must be a positive integer" }, { status: 400 });
    }

    const memberExists = await ensureActiveMember(memberId, gymId);
    if (!memberExists) return NextResponse.json({ error: "member not found" }, { status: 404 });

    const startDate = paymentDate;
    const expireDate = addMonthsToDateString(startDate, months);

    const sb = supabaseServer();
    const { data: payment, error: paymentError } = await sb
      .from("payments")
      .insert({
        gym_id: gymId,
        member_id: memberId,
        payment_date: paymentDate,
        start_date: startDate,
        expire_date: expireDate,
        months,
        amount,
        memo,
      })
      .select("id, gym_id, member_id, payment_date, start_date, expire_date, months, amount, memo, created_at, updated_at")
      .single();

    if (paymentError) throw new Error(paymentError.message);

    const { data: member, error: memberUpdateError } = await sb
      .from("members")
      .update({
        start_date: startDate,
        expire_date: expireDate,
        membership_state: "ACTIVE",
        paused_at: null,
      })
      .eq("id", memberId)
      .eq("gym_id", gymId)
      .is("deleted_at", null)
      .select("id, start_date, expire_date, membership_state, paused_at")
      .single();

    if (memberUpdateError) {
      await sb
        .from("payments")
        .delete()
        .eq("id", payment.id)
        .eq("gym_id", gymId);
      throw new Error(memberUpdateError.message);
    }

    return NextResponse.json({ payment, member }, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json({ error: toErrorMessage(error) }, { status: 500 });
  }
}
