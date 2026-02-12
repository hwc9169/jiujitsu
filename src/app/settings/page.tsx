"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin-shell";
import { apiFetch } from "@/lib/api_client";

type MeResponse = {
  gymName: string | null;
};

const DEFAULT_UNIT_PRICE = 150000;
const STORAGE_UNIT_PRICE_KEY = "jjt_unit_price";

function formatKRW(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

export default function SettingsPage() {
  const [gymName, setGymName] = useState<string>("-");
  const [error, setError] = useState<string | null>(null);
  const [unitPriceInput, setUnitPriceInput] = useState(String(DEFAULT_UNIT_PRICE));
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<MeResponse>("/api/me")
      .then((res) => {
        setGymName(res.gymName?.trim() || "-");
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "정보를 불러오지 못했습니다.");
      });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_UNIT_PRICE_KEY);
    const parsed = Number(stored);
    if (!Number.isFinite(parsed) || parsed <= 0) return;

    const rafId = window.requestAnimationFrame(() => {
      setUnitPriceInput(String(Math.round(parsed)));
    });
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, []);

  const saveUnitPrice = () => {
    const parsed = Number(unitPriceInput.replace(/[^\d]/g, ""));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setSavedMessage("유효한 월 회비 단가를 입력해 주세요.");
      return;
    }
    const rounded = Math.round(parsed);
    setUnitPriceInput(String(rounded));
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_UNIT_PRICE_KEY, String(rounded));
    }
    setSavedMessage(`월 회비 단가를 ${formatKRW(rounded)}로 저장했습니다.`);
  };

  return (
    <AdminShell
      title="체육관 설정"
      subtitle="체육관 정보와 운영 기본값을 확인하는 페이지입니다."
    >
      {error ? <div className="alert-error">{error}</div> : null}

      <section className="panel">
        <div className="panel-header">
          <h3 className="panel-title">기본 정보</h3>
        </div>
        <div className="settings-grid">
          <div className="settings-item">
            <p className="settings-label">체육관 이름</p>
            <p className="settings-value">{gymName}</p>
          </div>
          <div className="settings-item">
            <p className="settings-label">브랜드</p>
            <p className="settings-value">주짓때로</p>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h3 className="panel-title">매출 설정</h3>
        </div>
        <div className="settings-grid">
          <div className="settings-item">
            <p className="settings-label">월 회비 단가</p>
            <div className="settings-row">
              <input
                className="input settings-input"
                inputMode="numeric"
                value={unitPriceInput}
                onChange={(e) => setUnitPriceInput(e.target.value.replace(/[^\d]/g, ""))}
                placeholder="150000"
              />
              <button type="button" className="btn btn-secondary" onClick={saveUnitPrice}>
                저장
              </button>
            </div>
            {savedMessage ? <p className="settings-help">{savedMessage}</p> : null}
          </div>
        </div>
      </section>
    </AdminShell>
  );
}
