"use client";

import { type FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";

const KAKAO_JS_KEY = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;
const KAKAO_SDK_URL = "https://t1.kakaocdn.net/kakao_js_sdk/2.7.9/kakao.min.js";

type KakaoAuthorizeOptions = {
  redirectUri: string;
  prompt?: string;
  scope?: string;
};

type KakaoSdk = {
  init: (key: string) => void;
  isInitialized: () => boolean;
  Auth: {
    authorize: (options: KakaoAuthorizeOptions) => void;
  };
};

declare global {
  interface Window {
    Kakao?: KakaoSdk;
  }
}

function toFriendlyAuthError(message: string) {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("provider is not enabled") ||
    (normalized.includes("provider") && normalized.includes("is not enabled"))
  ) {
    return "카카오 로그인이 비활성화되어 있습니다. Supabase Auth 설정에서 Kakao Provider를 활성화해 주세요.";
  }
  if (normalized.includes("redirect")) {
    return "인증 리다이렉트 설정을 확인해 주세요.";
  }
  if (normalized.includes("kakao sdk")) {
    return "카카오 SDK 초기화에 실패했습니다. JavaScript SDK 도메인과 JavaScript 키를 확인해 주세요.";
  }
  if (normalized.includes("invalid login credentials")) {
    return "이메일 또는 비밀번호가 올바르지 않습니다.";
  }
  if (normalized.includes("email not confirmed")) {
    return "이메일 인증 후 로그인해 주세요.";
  }
  return message;
}

function loadKakaoSdk(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("Kakao SDK can only be loaded in browser"));
      return;
    }

    if (window.Kakao) {
      resolve();
      return;
    }

    const existingScript = document.querySelector<HTMLScriptElement>("script[data-kakao-sdk='true']");
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener("error", () => reject(new Error("Failed to load Kakao SDK")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = KAKAO_SDK_URL;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.dataset.kakaoSdk = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Kakao SDK"));
    document.head.appendChild(script);
  });
}

export default function LoginPage() {
  const router = useRouter();

  const [checkingSession, setCheckingSession] = useState(true);
  const [kakaoReady, setKakaoReady] = useState(false);
  const [kakaoLoading, setKakaoLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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

  useEffect(() => {
    let mounted = true;

    const setup = async () => {
      try {
        if (!KAKAO_JS_KEY) throw new Error("Missing NEXT_PUBLIC_KAKAO_JS_KEY");
        await loadKakaoSdk();
        if (!window.Kakao) throw new Error("Kakao SDK is unavailable");

        if (!window.Kakao.isInitialized()) {
          window.Kakao.init(KAKAO_JS_KEY);
        }
        if (!window.Kakao.isInitialized()) {
          throw new Error("Kakao SDK initialization failed");
        }

        if (!mounted) return;
        setKakaoReady(true);
      } catch (e: unknown) {
        if (!mounted) return;
        setErr(e instanceof Error ? toFriendlyAuthError(e.message) : "카카오 SDK 초기화에 실패했습니다.");
      }
    };

    setup().catch(() => {
      if (!mounted) return;
      setErr("카카오 SDK 초기화에 실패했습니다.");
    });

    return () => {
      mounted = false;
    };
  }, []);

  const signInWithKakao = async () => {
    setErr(null);
    setKakaoLoading(true);
    try {
      if (!window.Kakao || !kakaoReady) {
        throw new Error("Kakao SDK is unavailable");
      }

      const redirectTo = `${window.location.origin}/auth/callback`;
      window.Kakao.Auth.authorize({
        redirectUri: redirectTo,
        prompt: "select_account",
        scope: "openid",
      });
    } catch (e: unknown) {
      setErr(e instanceof Error ? toFriendlyAuthError(e.message) : "카카오 로그인 중 오류가 발생했습니다.");
      setKakaoLoading(false);
    }
  };

  const signInWithEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErr(null);

    const normalizedEmail = email.trim();
    if (!normalizedEmail || !password) {
      setErr("이메일과 비밀번호를 입력해 주세요.");
      return;
    }

    setEmailLoading(true);
    try {
      const sb = supabaseBrowser();
      const { error } = await sb.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      if (error) throw error;
      router.replace("/app");
    } catch (e: unknown) {
      setErr(e instanceof Error ? toFriendlyAuthError(e.message) : "이메일 로그인 중 오류가 발생했습니다.");
    } finally {
      setEmailLoading(false);
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
        <p className="auth-subtitle">이메일 또는 카카오로 로그인하세요.</p>

        {err ? <div className="alert-error">{err}</div> : null}

        <form className="auth-fields" onSubmit={signInWithEmail}>
          <label className="field-label">
            이메일
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
            />
          </label>
          <label className="field-label">
            비밀번호
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="비밀번호"
            />
          </label>
          <button
            type="submit"
            className="btn btn-primary auth-action"
            disabled={checkingSession || kakaoLoading || emailLoading}
          >
            {emailLoading ? "이메일 로그인 중..." : "이메일로 로그인"}
          </button>
        </form>

        <div className="auth-divider" role="separator" aria-label="카카오 로그인 구분선">
          <span>또는 카카오 로그인</span>
        </div>

        <div className="auth-actions">
          <button
            type="button"
            className="btn btn-kakao auth-action"
            onClick={signInWithKakao}
            disabled={kakaoLoading || emailLoading || checkingSession || !kakaoReady}
          >
            {checkingSession
              ? "로그인 상태 확인 중..."
              : !kakaoReady
                ? "카카오 SDK 준비 중..."
                : kakaoLoading
                  ? "카카오로 이동 중..."
                  : "카카오로 시작하기"}
          </button>
        </div>
      </div>
    </div>
  );
}
