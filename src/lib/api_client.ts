import { supabaseBrowser } from "@/lib/supabase/browser";

type FetchOptions = Omit<RequestInit, "headers"> & {
  headers?: Record<string, string>;
};

type AdminImpersonationSession = {
  email: string;
  code: string;
};

const isLocalDevBypassEnabled =
  process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_LOCAL_DEV_AUTH_BYPASS === "true";
const ADMIN_IMPERSONATION_STORAGE_KEY = "jiujittaero.admin_impersonation.v1";

function readAdminImpersonationSession(): AdminImpersonationSession | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(ADMIN_IMPERSONATION_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AdminImpersonationSession>;
    const email = typeof parsed.email === "string" ? parsed.email.trim() : "";
    const code = typeof parsed.code === "string" ? parsed.code.trim() : "";
    if (!email || !code) return null;
    return { email, code };
  } catch {
    return null;
  }
}

export function getAdminImpersonationSession() {
  return readAdminImpersonationSession();
}

export function setAdminImpersonationSession(email: string, code: string) {
  if (typeof window === "undefined") return;
  const payload: AdminImpersonationSession = { email: email.trim(), code: code.trim() };
  window.localStorage.setItem(ADMIN_IMPERSONATION_STORAGE_KEY, JSON.stringify(payload));
}

export function clearAdminImpersonationSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ADMIN_IMPERSONATION_STORAGE_KEY);
}

async function getAccessToken(): Promise<string | null> {
  const adminImpersonation = readAdminImpersonationSession();
  if (adminImpersonation) return null;
  if (isLocalDevBypassEnabled) return null;

  const sb = supabaseBrowser();
  const { data, error } = await sb.auth.getSession();
  if (error) throw new Error(error.message);
  const token = data.session?.access_token;
  if (!token) throw new Error("Not authenticated");
  return token;
}

export async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const adminImpersonation = readAdminImpersonationSession();
  const token = await getAccessToken();
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(options.headers ?? {}),
  };
  if (adminImpersonation) {
    headers["X-Admin-Impersonation-Email"] = adminImpersonation.email;
    headers["X-Admin-Impersonation-Code"] = adminImpersonation.code;
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (!isFormData && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(path, {
    ...options,
    headers,
    cache: "no-store",
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error || `Request failed: ${res.status}`;
    throw new Error(msg);
  }
  return json as T;
}
