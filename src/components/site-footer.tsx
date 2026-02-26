"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const HIDE_PREFIXES = [
  "/dashboard",
  "/app",
  "/members",
  "/settings",
  "/onboarding",
  "/admin",
  "/auth/callback",
];

function isHiddenRoute(pathname: string) {
  return HIDE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function SiteFooter() {
  const pathname = usePathname();
  if (isHiddenRoute(pathname)) return null;

  return (
    <footer className="site-footer" aria-label="사이트 하단 정보">
      <div className="site-footer-inner">
        <p className="site-footer-line">
          <strong>주짓때로</strong> | 사업자등록번호 488-03-03964 | 대표자 조호원 | 전화번호 010-8433-9169
        </p>
        <p className="site-footer-line">
          부산광역시 금정구 금정로 58, 5층(장전동) | 업태 정보통신업 | 종목 응용 소프트웨어 개발 및 공급업
        </p>
        <div className="site-footer-links">
          <Link href="/privacy" className="site-footer-link">
            개인정보처리방침
          </Link>
        </div>
      </div>
    </footer>
  );
}

