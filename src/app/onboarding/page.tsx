"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api_client";

type CreateGymResponse = { gym: { id: string; name: string } };

export default function OnboardingPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const createGym = async () => {
    setErr(null);
    setLoading(true);
    try {
      await apiFetch<CreateGymResponse>("/api/gyms", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      router.replace("/app/dashboard");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "도장 생성 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <p className="auth-eyebrow">주짓때로</p>
        <h1 className="auth-title">체육관 생성</h1>
        <p className="auth-subtitle">체육관 이름을 입력하면 바로 운영 화면으로 이동합니다.</p>

        <label className="field-label">
          체육관 이름
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 킹즈 주짓수 ○○점"
          />
        </label>

        {err ? <div className="alert-error">{err}</div> : null}

        <div className="auth-actions">
          <button
            type="button"
            className="btn btn-accent auth-action"
            disabled={loading || !name.trim()}
            onClick={createGym}
          >
            {loading ? "생성 중..." : "체육관 생성"}
          </button>
        </div>
      </div>
    </div>
  );
}
