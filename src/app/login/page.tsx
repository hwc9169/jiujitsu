"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
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

export default function LoginPage() {
  const router = useRouter();

  const [checkingSession, setCheckingSession] = useState(true);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const sb = supabaseBrowser();

    sb.auth.getSession()
      .then(({ data, error }) => {
        if (!mounted) return;
        if (error) {
          setErr(toFriendlyAuthError(error.message));
          setCheckingSession(false);
          return;
        }
        if (data.session) {
          router.replace("/app");
          return;
        }
        setCheckingSession(false);
      })
      .catch((e: unknown) => {
        if (!mounted) return;
        setErr(e instanceof Error ? toFriendlyAuthError(e.message) : "로그인 상태를 확인하지 못했습니다.");
        setCheckingSession(false);
      });

    const { data: authListener } = sb.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        router.replace("/app");
      }
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [router]);

  const signInWithKakao = async () => {
    setErr(null);
    setLoading(true);
    try {
      const sb = supabaseBrowser();
      const redirectTo = `${window.location.origin}/auth/callback`;
      const { error } = await sb.auth.signInWithOAuth({
        provider: "kakao",
        options: {
          redirectTo,
          queryParams: { prompt: "select_account" },
        },
      });

      if (error) {
        setErr(toFriendlyAuthError(error.message));
        setLoading(false);
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? toFriendlyAuthError(e.message) : "카카오 로그인 중 오류가 발생했습니다.");
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-logo-wrap" aria-hidden="true">
          <Image
            src="/jiujittaero-icon.png"
            alt="주짓때로 로고"
            width={1280}
            height={960}
            className="auth-logo"
            priority
          />
        </div>
        <h1 className="auth-title">관리자 로그인</h1>

        {err ? <div className="alert-error">{err}</div> : null}

        <div className="auth-actions">
          <button
            type="button"
            className="btn btn-kakao auth-action"
            onClick={signInWithKakao}
            disabled={loading || checkingSession}
          >
            {checkingSession ? "로그인 상태 확인 중..." : loading ? "카카오로 이동 중..." : "카카오로 시작하기"}
          </button>
        </div>
      </div>
    </div>
  );
}
