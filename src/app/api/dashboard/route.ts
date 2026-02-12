import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { requireUserIdFromAuthHeader, getGymIdByUserId } from "@/lib/supabase/gym";

type DashboardCounts = {
  overdue_count: number;
  expiring_7d_count: number;
  new_this_month: number;
};

type MemberRevenueRow = {
  start_date: string | null;
  expire_date: string;
  created_at: string;
};

type DailySalesPoint = {
  date: string;
  day: number;
  estimated_sales: number;
  member_count: number;
};

type MonthRef = {
  year: number;
  month: number;
  key: string;
  label: string;
};

const DEFAULT_UNIT_PRICE = 150000;
const MIN_UNIT_PRICE = 10000;
const MAX_UNIT_PRICE = 500000;

function parseDateOnly(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function parseISODate(value: string) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function monthKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function monthKeyFromParts(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function monthLabel(year: number, month: number) {
  return `${year}년 ${month}월`;
}

function normalizeMonth(raw: string | null) {
  const now = new Date();
  const fallbackYear = now.getFullYear();
  const fallbackMonth = now.getMonth() + 1;

  if (!raw) {
    return {
      year: fallbackYear,
      month: fallbackMonth,
      key: monthKeyFromParts(fallbackYear, fallbackMonth),
      label: monthLabel(fallbackYear, fallbackMonth),
    } satisfies MonthRef;
  }

  const matched = /^(\d{4})-(\d{2})$/.exec(raw);
  if (!matched) {
    return {
      year: fallbackYear,
      month: fallbackMonth,
      key: monthKeyFromParts(fallbackYear, fallbackMonth),
      label: monthLabel(fallbackYear, fallbackMonth),
    } satisfies MonthRef;
  }

  const year = Number(matched[1]);
  const month = Number(matched[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return {
      year: fallbackYear,
      month: fallbackMonth,
      key: monthKeyFromParts(fallbackYear, fallbackMonth),
      label: monthLabel(fallbackYear, fallbackMonth),
    } satisfies MonthRef;
  }

  return {
    year,
    month,
    key: monthKeyFromParts(year, month),
    label: monthLabel(year, month),
  } satisfies MonthRef;
}

function shiftMonth(base: MonthRef, delta: number) {
  const shifted = new Date(base.year, base.month - 1 + delta, 1);
  const year = shifted.getFullYear();
  const month = shifted.getMonth() + 1;
  return {
    year,
    month,
    key: monthKeyFromParts(year, month),
    label: monthLabel(year, month),
  } satisfies MonthRef;
}

function durationMonths(startDateRaw: string, expireDateRaw: string) {
  const start = parseDateOnly(startDateRaw);
  const end = parseDateOnly(expireDateRaw);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 1;
  const diff = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  return Math.max(1, diff);
}

function getDailySeries(year: number, month: number) {
  const days = new Date(year, month, 0).getDate();
  const points: DailySalesPoint[] = [];

  for (let day = 1; day <= days; day += 1) {
    points.push({
      date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      day,
      estimated_sales: 0,
      member_count: 0,
    });
  }

  return points;
}

export async function GET(req: Request) {
  try {
    const userId = await requireUserIdFromAuthHeader(req);
    const gymId = await getGymIdByUserId(userId);
    if (!gymId) return NextResponse.json({ error: "No gym" }, { status: 404 });

    const url = new URL(req.url);
    const selectedMonth = normalizeMonth(url.searchParams.get("month"));
    const currentMonth = normalizeMonth(null);
    const previousMonth = shiftMonth(currentMonth, -1);
    const unitPriceParam = Number(url.searchParams.get("unitPrice") || DEFAULT_UNIT_PRICE);
    const unitPrice = Math.min(MAX_UNIT_PRICE, Math.max(MIN_UNIT_PRICE, Number.isFinite(unitPriceParam) ? unitPriceParam : DEFAULT_UNIT_PRICE));

    const sb = supabaseServer();
    const { data, error } = await sb.rpc("dashboard_counts", { p_gym_id: gymId });

    // rpc 안 만들었으면 아래처럼 raw SQL view/rpc 만들거나,
    // members 테이블로 filter count를 3번 쏘면 됨.
    if (error) {
      return NextResponse.json({ error: "RPC not found. Create dashboard_counts RPC or implement 3 queries." }, { status: 501 });
    }

    const { data: membersData, error: membersError } = await sb
      .from("members")
      .select("start_date, expire_date, created_at")
      .eq("gym_id", gymId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });

    if (membersError) {
      return NextResponse.json({ error: membersError.message }, { status: 500 });
    }

    const dailySales = getDailySeries(selectedMonth.year, selectedMonth.month);
    const monthlyMap = new Map<string, { estimated_sales: number; member_count: number }>();

    for (const member of (membersData ?? []) as MemberRevenueRow[]) {
      if (!member.expire_date) continue;
      const startSource = member.start_date || member.created_at.slice(0, 10);
      if (!startSource) continue;

      const startDate = member.start_date ? parseDateOnly(member.start_date) : parseISODate(member.created_at);
      if (Number.isNaN(startDate.getTime())) continue;

      const estimatedSales = durationMonths(startSource, member.expire_date) * unitPrice;
      const key = monthKey(startDate);
      const monthBucket = monthlyMap.get(key) ?? { estimated_sales: 0, member_count: 0 };
      monthBucket.member_count += 1;
      monthBucket.estimated_sales += estimatedSales;
      monthlyMap.set(key, monthBucket);

      if (key !== selectedMonth.key) continue;

      const dayIndex = startDate.getDate() - 1;
      if (dayIndex < 0 || dayIndex >= dailySales.length) continue;

      dailySales[dayIndex].member_count += 1;
      dailySales[dayIndex].estimated_sales += estimatedSales;
    }

    const selectedMonthSales = dailySales.reduce((sum, point) => sum + point.estimated_sales, 0);
    const currentMonthSales = monthlyMap.get(currentMonth.key)?.estimated_sales ?? 0;
    const previousMonthSales = monthlyMap.get(previousMonth.key)?.estimated_sales ?? 0;

    return NextResponse.json({
      ...(data as DashboardCounts),
      unit_price: unitPrice,
      selected_month: selectedMonth.key,
      selected_month_label: selectedMonth.label,
      daily_sales: dailySales,
      selected_month_sales: selectedMonthSales,
      current_month_sales: currentMonthSales,
      previous_month_sales: previousMonthSales,
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal server error" }, { status: 500 });
  }
}
