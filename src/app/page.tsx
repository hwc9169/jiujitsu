"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const run = async () => {
      const sb = supabaseBrowser();
      const { data } = await sb.auth.getSession();
      if (data.session) router.replace("/app");
      else router.replace("/login");
    };
    run();
  }, [router]);

  return null;
}