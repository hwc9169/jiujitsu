"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";

export default function LoginPage() {
  const router = useRouter();
  const sb = supabaseBrowser();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const signIn = async () => {
    setErr(null);
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return setErr(error.message);
    router.replace("/app");
  };

  const signUp = async () => {
    setErr(null);
    const { error } = await sb.auth.signUp({ email, password });
    if (error) return setErr(error.message);
    // 이메일 인증 OFF면 바로 로그인됨. ON이면 안내문 추가.
    router.replace("/app");
  };

  return (
    <div style={{ maxWidth: 360, margin: "40px auto" }}>
      <h1>Login</h1>
      <input placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <br />
      <input placeholder="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <br />
      {err && <p style={{ color: "red" }}>{err}</p>}
      <button onClick={signIn}>Sign in</button>{" "}
      <button onClick={signUp}>Sign up</button>
    </div>
  );
}