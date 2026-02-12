"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api_client";
import { supabaseBrowser } from "@/lib/supabase/browser";

type MeResponse = {
  gymName: string | null;
};

type AdminShellProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
};

const MAIN_NAV = [
  { href: "/dashboard", label: "대시보드" },
  { href: "/members", label: "회원 관리" },
];

const SOON_NAV = ["CSV 업로드 (준비중)", "문자 로그 (준비중)"];

export function AdminShell({ title, subtitle, actions, children }: AdminShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [gymName, setGymName] = useState("도장 정보 불러오는 중...");
  const [gymMenuOpen, setGymMenuOpen] = useState(false);
  const gymMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let mounted = true;

    apiFetch<MeResponse>("/api/me")
      .then((data) => {
        if (!mounted) return;
        setGymName(data.gymName?.trim() || "도장 미연결");
      })
      .catch(() => {
        if (!mounted) return;
        setGymName("도장 확인 실패");
      });

    return () => {
      mounted = false;
    };
  }, []);

  const logout = async () => {
    const sb = supabaseBrowser();
    await sb.auth.signOut();
    router.replace("/login");
  };

  useEffect(() => {
    if (!gymMenuOpen) return;

    const onMouseDown = (event: MouseEvent) => {
      if (!gymMenuRef.current) return;
      const target = event.target;
      if (target instanceof Node && !gymMenuRef.current.contains(target)) {
        setGymMenuOpen(false);
      }
    };

    window.addEventListener("mousedown", onMouseDown);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
    };
  }, [gymMenuOpen]);

  return (
    <div className="admin-root">
      <aside className="admin-sidebar">
        <Link href="/dashboard" className="brand-wrap" aria-label="주짓때로 대시보드">
          <Image
            src="/jiujittaero-icon.png"
            alt="주짓때로"
            className="brand-logo"
            width={1280}
            height={960}
            priority
          />
        </Link>

        <nav className="admin-nav">
          {MAIN_NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-link ${active ? "active" : ""}`}
                aria-current={active ? "page" : undefined}
                onClick={() => setGymMenuOpen(false)}
              >
                {item.label}
              </Link>
            );
          })}

          {SOON_NAV.map((label) => (
            <span key={label} className="nav-link nav-link-disabled">
              {label}
            </span>
          ))}
        </nav>
        <div className="sidebar-gym">
          <div className="sidebar-gym-head">
            <p className="sidebar-gym-label">내 체육관</p>
            <div className="sidebar-menu" ref={gymMenuRef}>
              <button
                type="button"
                className="gym-menu-icon"
                aria-haspopup="menu"
                aria-expanded={gymMenuOpen}
                aria-label="체육관 메뉴 열기"
                onClick={() => setGymMenuOpen((prev) => !prev)}
              >
                ⋮
              </button>
              {gymMenuOpen ? (
                <div className="sidebar-dropup" role="menu" aria-label="내 체육관 메뉴">
                  <Link
                    href="/settings"
                    className="sidebar-dropup-item"
                    role="menuitem"
                    onClick={() => setGymMenuOpen(false)}
                  >
                    체육관 설정
                  </Link>
                  <button type="button" className="sidebar-dropup-item sidebar-dropup-danger" onClick={logout}>
                    로그아웃
                  </button>
                </div>
              ) : null}
            </div>
          </div>
          <p className="sidebar-gym-name">{gymName}</p>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar">
          <div>
            <h1 className="page-title">{title}</h1>
            {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
          </div>
          {actions ? <div className="topbar-actions">{actions}</div> : null}
        </header>

        <section className="admin-content">{children}</section>
      </main>
    </div>
  );
}
