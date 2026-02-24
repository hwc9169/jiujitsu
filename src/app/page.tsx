"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { getAdminImpersonationSession } from "@/lib/api_client";

const isLocalDevBypassEnabled =
  process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_LOCAL_DEV_AUTH_BYPASS === "true";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const run = async () => {
      if (isLocalDevBypassEnabled) {
        router.replace("/app");
        return;
      }
      if (getAdminImpersonationSession()) {
        router.replace("/app");
        return;
      }

      const sb = supabaseBrowser();
      const { data } = await sb.auth.getSession();
      if (data.session) router.replace("/app");
      else router.replace("/login");
    };
    run();
  }, [router]);

  return null;
}
