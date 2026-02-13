"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";

function toFriendlyAuthError(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("provider is not enabled")) {
    return "카카오 로그인이 비활성화되어 있습니다. Supabase Auth 설정에서 Kakao Provider를 활성화해 주세요.";
  }
  if (normalized.includes("redirect")) {
    return "인증 리다이렉트 설정을 확인해 주세요.";
  }
  return message;
}

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      try {
        const authError = searchParams.get("error");
        const authErrorDescription = searchParams.get("error_description");
        if (authError) {
          throw new Error(authErrorDescription ?? authError);
        }

        const sb = supabaseBrowser();
        const code = searchParams.get("code");

        if (code) {
          const { error: exchangeError } = await sb.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
        } else {
          // implicit flow fallback
          await sb.auth.getSession();
        }

        if (!mounted) return;
        router.replace("/app");
      } catch (e: unknown) {
        if (!mounted) return;
        setError(e instanceof Error ? toFriendlyAuthError(e.message) : "인증 처리 중 오류가 발생했습니다.");
      }
    };

    run().catch(() => {
      if (!mounted) return;
      setError("인증 처리 중 오류가 발생했습니다.");
    });

    return () => {
      mounted = false;
    };
  }, [router, searchParams]);

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <p className="auth-eyebrow">주짓때로</p>
        <h1 className="auth-title">카카오 로그인 처리 중</h1>
        <p className="auth-subtitle">
          {error ?? "잠시만 기다려 주세요. 로그인 정보를 확인하고 있습니다."}
        </p>
        {error ? (
          <button
            type="button"
            className="btn btn-primary auth-action"
            onClick={() => router.replace("/login")}
          >
            로그인으로 돌아가기
          </button>
        ) : null}
      </div>
    </div>
  );
}
