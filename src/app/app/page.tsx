"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api_client";

type MeResponse = { userId: string; gymId: string | null };

export default function AppEntryPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        const me = await apiFetch<MeResponse>("/api/me");
        if (!me.gymId) router.replace("/onboarding");
        else router.replace("/dashboard");
      } catch (e: any) {
        // 토큰 없으면 로그인으로
        router.replace("/login");
      }
    };
    run();
  }, [router]);

  return error ? <div>{error}</div> : null;
}