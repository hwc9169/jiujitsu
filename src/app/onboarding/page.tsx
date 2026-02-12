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
      const res = await apiFetch<CreateGymResponse>("/api/gyms", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      router.replace("/app/dashboard");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 420, margin: "40px auto" }}>
      <h1>도장 생성</h1>
      <p>도장 이름을 입력하면 바로 시작합니다.</p>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 킹즈 주짓수 ○○점" />
      <br />
      {err && <p style={{ color: "red" }}>{err}</p>}
      <button disabled={loading || !name.trim()} onClick={createGym}>
        {loading ? "생성 중..." : "생성하기"}
      </button>
    </div>
  );
}