import { supabaseBrowser } from "@/lib/supabase/browser";

type FetchOptions = Omit<RequestInit, "headers"> & {
  headers?: Record<string, string>;
};

const isLocalDevBypassEnabled =
  process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_LOCAL_DEV_AUTH_BYPASS === "true";

async function getAccessToken(): Promise<string | null> {
  if (isLocalDevBypassEnabled) return null;

  const sb = supabaseBrowser();
  const { data, error } = await sb.auth.getSession();
  if (error) throw new Error(error.message);
  const token = data.session?.access_token;
  if (!token) throw new Error("Not authenticated");
  return token;
}

export async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const token = await getAccessToken();
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(options.headers ?? {}),
  };
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
