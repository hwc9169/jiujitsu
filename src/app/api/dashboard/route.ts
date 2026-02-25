import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getGymIdByUserId, requireUserIdFromAuthHeader } from "@/lib/supabase/gym";

type DashboardCounts = {
  total_member_count?: number;
  overdue_count: number;
  expiring_7d_count: number;
  new_this_month: number;
};

type DailySalesPoint = {
  date: string;
  day: number;
  estimated_sales: number;
  member_count: number;
};

type PaymentRevenueRow = {
  payment_date: string;
  amount: number;
};

type MonthRef = {
  year: number;
  month: number;
  key: string;
  label: string;
};

const DATE_ONLY_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDateParts(value: string) {
  const matched = DATE_ONLY_REGEX.exec(value.trim());
  if (!matched) return null;

  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  return { year, month, day };
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

function toDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getMonthRange(month: MonthRef) {
  const start = new Date(month.year, month.month - 1, 1);
  const end = new Date(month.year, month.month, 0);
  return {
    from: toDateString(start),
    to: toDateString(end),
  };
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

function sumPaymentRows(rows: PaymentRevenueRow[] | null | undefined) {
  return (rows ?? []).reduce((sum, row) => sum + Math.max(0, Number(row.amount) || 0), 0);
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

    const selectedRange = getMonthRange(selectedMonth);
    const currentRange = getMonthRange(currentMonth);
    const previousRange = getMonthRange(previousMonth);

    const sb = supabaseServer();

    const [
      countsResult,
      membersCountResult,
      newThisMonthMembersCountResult,
      selectedPaymentsResult,
      currentPaymentsResult,
      previousPaymentsResult,
    ] = await Promise.all([
      sb.rpc("dashboard_counts", { p_gym_id: gymId }),
      sb
        .from("members")
        .select("id", { count: "exact", head: true })
        .eq("gym_id", gymId)
        .is("deleted_at", null),
      sb
        .from("members")
        .select("id", { count: "exact", head: true })
        .eq("gym_id", gymId)
        .is("deleted_at", null)
        .gte("join_date", currentRange.from)
        .lte("join_date", currentRange.to),
      sb
        .from("payments")
        .select("payment_date, amount")
        .eq("gym_id", gymId)
        .gte("payment_date", selectedRange.from)
        .lte("payment_date", selectedRange.to)
        .order("payment_date", { ascending: true }),
      sb
        .from("payments")
        .select("payment_date, amount")
        .eq("gym_id", gymId)
        .gte("payment_date", currentRange.from)
        .lte("payment_date", currentRange.to),
      sb
        .from("payments")
        .select("payment_date, amount")
        .eq("gym_id", gymId)
        .gte("payment_date", previousRange.from)
        .lte("payment_date", previousRange.to),
    ]);

    if (countsResult.error) {
      return NextResponse.json(
        { error: "RPC not found. Create dashboard_counts RPC or implement 3 queries." },
        { status: 501 },
      );
    }
    if (membersCountResult.error) {
      return NextResponse.json({ error: membersCountResult.error.message }, { status: 500 });
    }
    if (newThisMonthMembersCountResult.error) {
      return NextResponse.json({ error: newThisMonthMembersCountResult.error.message }, { status: 500 });
    }
    if (selectedPaymentsResult.error) {
      return NextResponse.json({ error: selectedPaymentsResult.error.message }, { status: 500 });
    }
    if (currentPaymentsResult.error) {
      return NextResponse.json({ error: currentPaymentsResult.error.message }, { status: 500 });
    }
    if (previousPaymentsResult.error) {
      return NextResponse.json({ error: previousPaymentsResult.error.message }, { status: 500 });
    }

    const dailySales = getDailySeries(selectedMonth.year, selectedMonth.month);
    for (const payment of (selectedPaymentsResult.data ?? []) as PaymentRevenueRow[]) {
      const parts = parseDateParts(payment.payment_date);
      if (!parts) continue;

      const dayIndex = parts.day - 1;
      if (dayIndex < 0 || dayIndex >= dailySales.length) continue;

      const amount = Math.max(0, Number(payment.amount) || 0);
      dailySales[dayIndex].member_count += 1;
      dailySales[dayIndex].estimated_sales += amount;
    }

    const selectedMonthSales = sumPaymentRows(selectedPaymentsResult.data as PaymentRevenueRow[]);
    const currentMonthSales = sumPaymentRows(currentPaymentsResult.data as PaymentRevenueRow[]);
    const previousMonthSales = sumPaymentRows(previousPaymentsResult.data as PaymentRevenueRow[]);
    const totalMemberCount = membersCountResult.count ?? 0;
    const newThisMonthJoinCount = newThisMonthMembersCountResult.count ?? 0;

    return NextResponse.json({
      ...(countsResult.data as DashboardCounts),
      total_member_count: totalMemberCount,
      new_this_month: newThisMonthJoinCount,
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
