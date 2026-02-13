"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AdminShell } from "@/components/admin-shell";
import { apiFetch } from "@/lib/api_client";

type DailySalesPoint = {
  date: string;
  day: number;
  estimated_sales: number;
  member_count: number;
};

type Dashboard = {
  overdue_count: number;
  expiring_7d_count: number;
  new_this_month: number;
  unit_price: number;
  selected_month: string;
  selected_month_label: string;
  daily_sales: DailySalesPoint[];
  selected_month_sales: number;
  current_month_sales: number;
  previous_month_sales: number;
};

const DEFAULT_UNIT_PRICE = 150000;
const STORAGE_UNIT_PRICE_KEY = "jjt_unit_price";
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

export default function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [unitPrice, setUnitPrice] = useState(DEFAULT_UNIT_PRICE);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey());

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_UNIT_PRICE_KEY);
    const parsed = Number(stored);
    if (!Number.isFinite(parsed) || parsed <= 0) return;

    const rounded = Math.round(parsed);
    if (rounded === DEFAULT_UNIT_PRICE) return;

    const rafId = window.requestAnimationFrame(() => {
      setLoading(true);
      setUnitPrice(rounded);
    });

    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, []);

  useEffect(() => {
    apiFetch<Dashboard>(`/api/dashboard?unitPrice=${unitPrice}&month=${selectedMonth}`)
      .then((res) => {
        setData(res);
        setError(null);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "대시보드를 불러오지 못했습니다.");
      })
      .finally(() => setLoading(false));
  }, [unitPrice, selectedMonth]);

  const overdueCount = data?.overdue_count ?? 0;
  const expiringCount = data?.expiring_7d_count ?? 0;
  const newThisMonth = data?.new_this_month ?? 0;
  const selectedMonthKey = data?.selected_month ?? selectedMonth;
  const selectedMonthLabel = data?.selected_month_label || monthLabelFromKey(selectedMonthKey);
  const dailySales = data?.daily_sales ?? EMPTY_DAILY_SALES;
  const selectedMonthSales = data?.selected_month_sales ?? 0;
  const currentMonthSales = data?.current_month_sales ?? 0;
  const previousMonthSales = data?.previous_month_sales ?? 0;
  const unitPriceUsed = data?.unit_price ?? unitPrice;
  const maxSales = Math.max(1, ...dailySales.map((point) => point.estimated_sales));
  const monthDelta = currentMonthSales - previousMonthSales;

  const chartGeometry = useMemo(() => {
    const width = Math.max(720, dailySales.length * 24);
    const height = 260;
    const left = 32;
    const right = 20;
    const top = 18;
    const bottom = 36;
    const plotWidth = Math.max(1, width - left - right);
    const plotHeight = Math.max(1, height - top - bottom);

    const points = dailySales.map((point, index) => {
      const x = dailySales.length <= 1 ? left : left + (index / (dailySales.length - 1)) * plotWidth;
      const y = top + (1 - point.estimated_sales / maxSales) * plotHeight;
      return { x, y, day: point.day, value: point.estimated_sales };
    });

    const line = points.map((point) => `${point.x},${point.y}`).join(" ");
    const area = points.length
      ? `M ${points[0].x} ${top + plotHeight} L ${points.map((point) => `${point.x} ${point.y}`).join(" L ")} L ${points[points.length - 1].x} ${top + plotHeight} Z`
      : "";

    return { width, height, top, left, plotHeight, points, line, area };
  }, [dailySales, maxSales]);

  return (
    <AdminShell
      title="운영 대시보드"
      subtitle="이번 달 매출과 선택 월의 일별 매출 흐름을 확인하세요."
    >
      {error ? <div className="alert-error">{error}</div> : null}

      <div className="kpi-grid">
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
            <span className="sales-month-current">{selectedMonthKey}</span>
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

        <div className="panel-subhead">
          <div>이번 달 추정 매출: {loading ? "-" : formatKRW(currentMonthSales)}</div>
          <div className={monthDelta >= 0 ? "sales-delta-plus" : "sales-delta-minus"}>
            전월 대비: {loading ? "-" : `${monthDelta >= 0 ? "+" : "-"}${formatKRW(Math.abs(monthDelta))}`}
          </div>
        </div>

        <div className="sales-selected-summary">
          <p className="sales-selected-label">선택 월 매출 ({selectedMonthLabel})</p>
          <p className="sales-selected-value">
            {loading ? "-" : formatKRW(selectedMonthSales)}
          </p>
          <p className="sales-unit-note">
            월 회비 단가 {formatKRW(unitPriceUsed)} 기준 (체육관 설정에서 변경)
          </p>
        </div>

        <div className="sales-line-chart-wrap">
          <svg
            viewBox={`0 0 ${chartGeometry.width} ${chartGeometry.height}`}
            className="sales-line-chart"
            role="img"
            aria-label={`${selectedMonthLabel} 일별 매출 라인 차트`}
            preserveAspectRatio="none"
          >
            {[0, 0.25, 0.5, 0.75, 1].map((scale) => {
              const y = chartGeometry.top + chartGeometry.plotHeight * scale;
              return (
                <line
                  key={scale}
                  x1={chartGeometry.left}
                  x2={chartGeometry.width - 20}
                  y1={y}
                  y2={y}
                  className="sales-grid-line"
                />
              );
            })}

            {chartGeometry.area ? <path d={chartGeometry.area} className="sales-area-path" /> : null}
            {chartGeometry.line ? <polyline points={chartGeometry.line} className="sales-line-path" /> : null}

            {chartGeometry.points.map((point) => (
              <circle
                key={point.day}
                cx={point.x}
                cy={point.y}
                r={point.value > 0 ? 2.7 : 1.9}
                className={point.value > 0 ? "sales-point" : "sales-point-empty"}
              />
            ))}
          </svg>

          <div
            className="sales-day-labels"
            style={{ gridTemplateColumns: `repeat(${Math.max(dailySales.length, 1)}, minmax(0, 1fr))` }}
          >
            {dailySales.map((point) => (
              <span key={point.day} className={`sales-day-label ${point.day % 5 === 0 || point.day === 1 ? "show" : ""}`}>
                {point.day}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h3 className="panel-title">빠른 작업</h3>
        </div>
        <div className="quick-actions">
          <Link href="/members" className="btn btn-secondary">
            회원 목록 확인
          </Link>
          <button type="button" className="btn btn-text" disabled>
            문자 발송 로그 (준비중)
          </button>
        </div>
      </section>
    </AdminShell>
  );
}
