"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { apiFetch, clearAdminImpersonationSession } from "@/lib/api_client";
import { supabaseBrowser } from "@/lib/supabase/browser";

type MeResponse = {
  gymName: string | null;
};

type ConsoleShellProps = {
  actions?: ReactNode;
  children: ReactNode;
};

const MAIN_NAV = [
  { href: "/dashboard", label: "대시보드" },
  { href: "/dashboard/members", label: "회원 관리" },
  { href: "/app/calendar", label: "일정 관리" },
  { href: "/dashboard/messages/history", label: "문자 로그" },
];

const MOBILE_MENU_ITEMS: Array<{ href: string; label: string; disabled?: boolean }> = [
  { href: "/dashboard", label: "대시보드" },
  { href: "/dashboard/members", label: "회원 관리" },
  { href: "/app/calendar", label: "일정 관리" },
  { href: "/dashboard/messages/history", label: "문자 로그" },
];

function getMobileTopbarTitle(pathname: string) {
  if (pathname === "/dashboard/members" || pathname.startsWith("/dashboard/members/")) return "회원 관리";
  if (pathname === "/members" || pathname.startsWith("/members/")) return "회원 관리";
  if (pathname === "/app/calendar" || pathname.startsWith("/app/calendar/")) return "일정 관리";
  if (pathname === "/dashboard/messages/history" || pathname.startsWith("/dashboard/messages/history/")) return "문자 로그";
  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) return "대시보드";
  if (pathname === "/settings" || pathname.startsWith("/settings/")) return "체육관 설정";
  return "주짓때로";
}

export function ConsoleShell({ actions, children }: ConsoleShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [gymName, setGymName] = useState("도장 정보 불러오는 중...");
  const [gymMenuOpen, setGymMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const gymMenuRef = useRef<HTMLDivElement | null>(null);
  const mobileTopbarTitle = getMobileTopbarTitle(pathname);
  const isCalendarPage = pathname === "/app/calendar" || pathname.startsWith("/app/calendar/");

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
    clearAdminImpersonationSession();
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

  useEffect(() => {
    if (!mobileNavOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileNavOpen]);

  return (
    <div className="admin-root">
      <aside className="admin-sidebar">
        <Link href="/dashboard" className="brand-wrap" aria-label="주짓때로 대시보드">
          <Image
            src="/jiujiteiro-icon.png"
            alt="주짓때로"
            className="brand-logo"
            width={1280}
            height={960}
            priority
          />
        </Link>

        <nav className="admin-nav">
          {MAIN_NAV.map((item) => {
            const active = item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
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

      <button
        type="button"
        className={`mobile-drawer-backdrop ${mobileNavOpen ? "open" : ""}`}
        aria-label="메뉴 닫기"
        onClick={() => setMobileNavOpen(false)}
      />
      <aside id="mobile-navigation" className={`mobile-drawer ${mobileNavOpen ? "open" : ""}`} aria-hidden={!mobileNavOpen}>
        <div className="mobile-drawer-head">
          <Link href="/dashboard" className="mobile-drawer-logo-wrap" onClick={() => setMobileNavOpen(false)}>
            <Image
              src="/jiujiteiro-icon.png"
              alt="주짓때로"
              className="mobile-drawer-logo"
              width={1280}
              height={960}
              priority
            />
          </Link>
          <button
            type="button"
            className="mobile-drawer-close"
            aria-label="메뉴 닫기"
            onClick={() => setMobileNavOpen(false)}
          >
            ×
          </button>
        </div>

        <nav className="mobile-drawer-nav">
          {MOBILE_MENU_ITEMS.map((item) => {
            if (item.disabled) {
              return (
                <span key={item.label} className="mobile-drawer-link mobile-drawer-link-disabled">
                  {item.label}
                </span>
              );
            }
            const active = item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`mobile-drawer-link ${active ? "active" : ""}`}
                aria-current={active ? "page" : undefined}
                onClick={() => setMobileNavOpen(false)}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mobile-drawer-bottom">
          <p className="mobile-drawer-gym-label">내 체육관</p>
          <p className="mobile-drawer-gym-name">{gymName}</p>
          <div className="mobile-drawer-actions">
            <Link href="/settings" className="mobile-drawer-action" onClick={() => setMobileNavOpen(false)}>
              체육관 설정
            </Link>
            <button
              type="button"
              className="mobile-drawer-action mobile-drawer-action-danger"
              onClick={() => {
                setMobileNavOpen(false);
                void logout();
              }}
            >
              로그아웃
            </button>
          </div>
        </div>
      </aside>

      <main className={`admin-main ${isCalendarPage ? "admin-main-calendar" : ""}`}>
        <header className="admin-topbar admin-topbar-plain-shell">
          <div className="topbar-heading topbar-heading-compact">
            <button
              type="button"
              className="mobile-menu-trigger"
              aria-label="메뉴 열기"
              aria-expanded={mobileNavOpen}
              aria-controls="mobile-navigation"
              onClick={() => setMobileNavOpen(true)}
            >
              <span />
              <span />
              <span />
            </button>
            <h1 className="topbar-mobile-title">{mobileTopbarTitle}</h1>
          </div>
          {actions ? <div className="topbar-actions">{actions}</div> : null}
        </header>

        <section className={`admin-content ${isCalendarPage ? "admin-content-calendar" : ""}`}>{children}</section>
      </main>
    </div>
  );
}
