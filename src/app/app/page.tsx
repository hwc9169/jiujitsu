"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api_client";

type MeResponse = { userId: string; gymId: string | null };

export default function AppEntryPage() {
  const router = useRouter();

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      try {
        const me = await apiFetch<MeResponse>("/api/me");
        if (!mounted) return;
        if (!me.gymId) router.replace("/onboarding");
        else router.replace("/dashboard");
      } catch {
        if (!mounted) return;
        router.replace("/login");
      }
    };

    run().catch(() => {
      if (!mounted) return;
      router.replace("/login");
    });

    return () => {
      mounted = false;
    };
  }, [router]);

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <p className="auth-eyebrow">주짓때로</p>
        <h1 className="auth-title">로그인 확인 중</h1>
        <p className="auth-subtitle">잠시만 기다려 주세요.</p>
      </div>
    </div>
  );
}
