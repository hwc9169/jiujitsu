"use client";

import { type CSSProperties, useEffect, useState } from "react";
import Link from "next/link";
import { ConsoleShell } from "@/components/console-shell";
import { apiFetch } from "@/lib/api_client";

type DailySalesPoint = {
  date: string;
  day: number;
  estimated_sales: number;
  member_count: number;
};

type Dashboard = {
  total_member_count: number;
  overdue_count: number;
  expiring_7d_count: number;
  new_this_month: number;
  selected_month: string;
  daily_sales: DailySalesPoint[];
  selected_month_sales: number;
};

const EMPTY_DAILY_SALES: DailySalesPoint[] = [];

function formatKRW(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonthKey(key: string, delta: number) {
  const [year, month] = key.split("-").map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return currentMonthKey();
  const shifted = new Date(year, month - 1 + delta, 1);
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabelFromKey(key: string) {
  const [year, month] = key.split("-").map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return "-";
  return `${year}년 ${month}월`;
}

function normalizeSalesValue(value: number) {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  return value;
}

function getYAxisMax(highestSales: number) {
  if (highestSales <= 0) return 100000;

  if (highestSales >= 10_000_000) {
    return Math.ceil(highestSales / 1_000_000) * 1_000_000;
  }
  if (highestSales >= 1_000_000) {
    return Math.ceil(highestSales / 100_000) * 100_000;
  }
  return Math.ceil(highestSales / 10_000) * 10_000;
}

function buildYAxisTicks(maxValue: number) {
  const steps = 4;
  const ticks: number[] = [];
  for (let i = 0; i <= steps; i += 1) {
    ticks.push((maxValue / steps) * i);
  }
  return ticks.reverse();
}

function formatYAxisValue(value: number) {
  if (value >= 10000) {
    return `${Math.round(value / 10000).toLocaleString("ko-KR")}만`;
  }
  return value.toLocaleString("ko-KR");
}

export default function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey());

  useEffect(() => {
    apiFetch<Dashboard>(`/api/dashboard?month=${selectedMonth}`)
      .then((res) => {
        setData(res);
        setError(null);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "대시보드를 불러오지 못했습니다.");
      })
      .finally(() => setLoading(false));
  }, [selectedMonth]);

  const overdueCount = data?.overdue_count ?? 0;
  const expiringCount = data?.expiring_7d_count ?? 0;
  const newThisMonth = data?.new_this_month ?? 0;
  const totalMemberCount = data?.total_member_count ?? 0;
  const selectedMonthKey = data?.selected_month ?? selectedMonth;
  const dailySales = data?.daily_sales ?? EMPTY_DAILY_SALES;
  const selectedMonthSales = data?.selected_month_sales ?? 0;
  const salesValues = dailySales.map((point) => normalizeSalesValue(Number(point.estimated_sales)));
  const highestSales = Math.max(0, ...salesValues);
  const yAxisMax = getYAxisMax(highestSales);
  const yTicks = buildYAxisTicks(yAxisMax);

  const chartGeometry = (() => {
    const width = Math.max(760, dailySales.length * 46);
    const height = 320;
    const left = 68;
    const right = 24;
    const top = 22;
    const bottom = 52;
    const plotWidth = Math.max(1, width - left - right);
    const plotHeight = Math.max(1, height - top - bottom);

    const points = dailySales.map((point, index) => {
      const x = dailySales.length <= 1 ? left : left + (index / (dailySales.length - 1)) * plotWidth;
      const rawValue = normalizeSalesValue(Number(point.estimated_sales));
      const scaledValue = Math.min(rawValue, yAxisMax);
      const y = top + (1 - scaledValue / yAxisMax) * plotHeight;
      return { x, y, day: point.day, value: rawValue };
    });

    const line = points.map((point) => `${point.x},${point.y}`).join(" ");
    const area = points.length
      ? `M ${points[0].x} ${top + plotHeight} L ${points.map((point) => `${point.x} ${point.y}`).join(" L ")} L ${points[points.length - 1].x} ${top + plotHeight} Z`
      : "";

    return { width, height, top, left, right, bottom, plotHeight, points, line, area };
  })();

  return (
    <ConsoleShell>
      {error ? <div className="alert-error">{error}</div> : null}

      <div className="kpi-grid">
        <article className="kpi-card total">
          <p className="kpi-label">전체 회원수</p>
          <p className="kpi-value">
            {loading ? "-" : totalMemberCount.toLocaleString("ko-KR")}
          </p>
          <p className="kpi-help">탈퇴 제외 전체 회원</p>
        </article>

        <article className="kpi-card overdue">
          <p className="kpi-label">미납 회원</p>
          <p className="kpi-value">
            {loading ? "-" : overdueCount.toLocaleString("ko-KR")}
          </p>
          <p className="kpi-help">만료일이 오늘보다 이전인 회원</p>
        </article>

        <article className="kpi-card expiring">
          <p className="kpi-label">7일 이내 만료</p>
          <p className="kpi-value">
            {loading ? "-" : expiringCount.toLocaleString("ko-KR")}
          </p>
          <p className="kpi-help">오늘부터 7일 내 만료 예정</p>
        </article>

        <article className="kpi-card newcomer">
          <p className="kpi-label">이번 달 신규 회원</p>
          <p className="kpi-value">
            {loading ? "-" : newThisMonth.toLocaleString("ko-KR")}
          </p>
          <p className="kpi-help">이번 달 생성된 활성 회원 기준</p>
        </article>
      </div>

      <section className="panel">
        <div className="panel-header">
          <h3 className="panel-title">일별 매출 대시보드</h3>
          <div className="sales-month-navigator">
            <button
              type="button"
              className="btn btn-secondary sales-nav-btn"
              onClick={() => {
                setLoading(true);
                setSelectedMonth((prev) => shiftMonthKey(prev, -1));
              }}
              aria-label="이전 달"
            >
              ←
            </button>
            <span className="sales-month-current">{monthLabelFromKey(selectedMonthKey)}</span>
            <button
              type="button"
              className="btn btn-secondary sales-nav-btn"
              onClick={() => {
                setLoading(true);
                setSelectedMonth((prev) => shiftMonthKey(prev, 1));
              }}
              aria-label="다음 달"
            >
              →
            </button>
          </div>
        </div>
        <div className="sales-selected-summary">
          <p className="sales-selected-label">월매출</p>
          <p className="sales-selected-value">{loading ? "-" : formatKRW(selectedMonthSales)}</p>
        </div>

        <div
          className="sales-line-chart-wrap"
          style={{ "--sales-chart-min-width": `${chartGeometry.width}px` } as CSSProperties}
        >
          <svg
            viewBox={`0 0 ${chartGeometry.width} ${chartGeometry.height}`}
            className="sales-line-chart"
            style={{ height: `${chartGeometry.height}px` }}
            role="img"
            aria-label={`${monthLabelFromKey(selectedMonthKey)} 일별 매출 라인 차트`}
            preserveAspectRatio="none"
          >
            {yTicks.map((tick) => {
              const y = chartGeometry.top + (1 - tick / yAxisMax) * chartGeometry.plotHeight;
              return (
                <g key={tick}>
                  <line
                    x1={chartGeometry.left}
                    x2={chartGeometry.width - chartGeometry.right}
                    y1={y}
                    y2={y}
                    className="sales-grid-line"
                  />
                  <text x={chartGeometry.left - 10} y={y + 4} textAnchor="end" className="sales-y-label">
                    {formatYAxisValue(tick)}
                  </text>
                </g>
              );
            })}

            <line
              x1={chartGeometry.left}
              x2={chartGeometry.left}
              y1={chartGeometry.top}
              y2={chartGeometry.top + chartGeometry.plotHeight}
              className="sales-axis-line"
            />
            <line
              x1={chartGeometry.left}
              x2={chartGeometry.width - chartGeometry.right}
              y1={chartGeometry.top + chartGeometry.plotHeight}
              y2={chartGeometry.top + chartGeometry.plotHeight}
              className="sales-axis-line"
            />

            {chartGeometry.area ? <path d={chartGeometry.area} className="sales-area-path" /> : null}
            {chartGeometry.line ? <polyline points={chartGeometry.line} className="sales-line-path" /> : null}

            {chartGeometry.points.map((point) => (
              point.value > 0 ? (
                <line
                  key={`stem-${point.day}`}
                  x1={point.x}
                  x2={point.x}
                  y1={chartGeometry.top + chartGeometry.plotHeight}
                  y2={point.y}
                  className="sales-stem-line"
                />
              ) : null
            ))}

            {chartGeometry.points.map((point) => (
              <circle
                key={point.day}
                cx={point.x}
                cy={point.y}
                r={point.value > 0 ? 3.3 : 1.9}
                className={point.value > 0 ? "sales-point" : "sales-point-empty"}
              />
            ))}

            {chartGeometry.points.map((point) => (
              <text
                key={`day-${point.day}`}
                x={point.x}
                y={chartGeometry.top + chartGeometry.plotHeight + 20}
                textAnchor="middle"
                className={`sales-x-label ${point.value > 0 ? "sales-x-label-active" : ""}`}
              >
                {point.day}일
              </text>
            ))}
          </svg>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h3 className="panel-title">빠른 작업</h3>
        </div>
        <div className="quick-actions">
          <Link href="/dashboard/members" className="btn btn-secondary">
            회원 목록 확인
          </Link>
          <button type="button" className="btn btn-text" disabled>
            문자 발송 로그 (준비중)
          </button>
        </div>
      </section>
    </ConsoleShell>
  );
}
