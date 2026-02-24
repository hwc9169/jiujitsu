"use client";

import { type FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import {
  clearAdminImpersonationSession,
  getAdminImpersonationSession,
  setAdminImpersonationSession,
} from "@/lib/api_client";

function toFriendlyAuthError(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("invalid token")) {
    return "인증 토큰이 유효하지 않습니다.";
  }
  if (normalized.includes("관리자 코드")) {
    return message;
  }
  if (normalized.includes("찾을 수 없습니다")) {
    return message;
  }
  return message;
}

export default function AdminLoginPage() {
  const router = useRouter();
  const [checkingSession, setCheckingSession] = useState(true);
  const [loading, setLoading] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [adminCode, setAdminCode] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const sb = supabaseBrowser();

    const run = async () => {
      const adminSession = getAdminImpersonationSession();
      if (adminSession) {
        const adminRes = await fetch("/api/me", {
          method: "GET",
          headers: {
            "X-Admin-Impersonation-Email": adminSession.email,
            "X-Admin-Impersonation-Code": adminSession.code,
          },
          cache: "no-store",
        });
        if (!mounted) return;
        if (adminRes.ok) {
          router.replace("/app");
          return;
        }
        clearAdminImpersonationSession();
      }

      const { data, error } = await sb.auth.getSession();
      if (!mounted) return;
      if (error) {
        setErr(toFriendlyAuthError(error.message));
        setCheckingSession(false);
        return;
      }
      if (data.session) {
        clearAdminImpersonationSession();
        router.replace("/app");
        return;
      }
      setCheckingSession(false);
    };

    run().catch((e: unknown) => {
      if (!mounted) return;
      setErr(e instanceof Error ? toFriendlyAuthError(e.message) : "로그인 상태를 확인하지 못했습니다.");
      setCheckingSession(false);
    });

    return () => {
      mounted = false;
    };
  }, [router]);

  const signInAsAdmin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErr(null);

    const targetEmail = userEmail.trim().toLowerCase();
    const normalizedCode = adminCode.trim();
    if (!targetEmail || !normalizedCode) {
      setErr("유저 이메일과 관리자 코드를 입력해 주세요.");
      return;
    }

    setLoading(true);
    try {
      clearAdminImpersonationSession();
      const sb = supabaseBrowser();
      await sb.auth.signOut();

      const response = await fetch("/api/me", {
        method: "GET",
        headers: {
          "X-Admin-Impersonation-Email": targetEmail,
          "X-Admin-Impersonation-Code": normalizedCode,
        },
        cache: "no-store",
      });
      const json = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(json.error ?? "관리자 코드 로그인에 실패했습니다.");
      }

      setAdminImpersonationSession(targetEmail, normalizedCode);
      router.replace("/app");
    } catch (e: unknown) {
      setErr(e instanceof Error ? toFriendlyAuthError(e.message) : "관리자 코드 로그인 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1 className="auth-title">관리자 코드 로그인</h1>
        <p className="auth-subtitle">유저 이메일과 관리자 코드로 해당 계정에 접속합니다.</p>

        {err ? <div className="alert-error">{err}</div> : null}

        <form className="auth-fields" onSubmit={signInAsAdmin}>
          <label className="field-label">
            유저 이메일
            <input
              className="input"
              type="email"
              value={userEmail}
              onChange={(e) => setUserEmail(e.target.value)}
              autoComplete="off"
              placeholder="target-user@example.com"
            />
          </label>
          <label className="field-label">
            관리자 코드
            <input
              className="input"
              type="password"
              value={adminCode}
              onChange={(e) => setAdminCode(e.target.value)}
              autoComplete="off"
              placeholder="관리자 코드"
            />
          </label>
          <button type="submit" className="btn btn-primary auth-action" disabled={checkingSession || loading}>
            {checkingSession ? "로그인 상태 확인 중..." : loading ? "관리자 코드 확인 중..." : "로그인"}
          </button>
        </form>

        <Link href="/login" className="btn btn-secondary auth-action">
          일반 로그인으로 돌아가기
        </Link>
      </div>
    </div>
  );
}
