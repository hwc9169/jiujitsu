import { supabaseBrowser } from "@/lib/supabase/browser";

type FetchOptions = Omit<RequestInit, "headers"> & {
  headers?: Record<string, string>;
};
  
async function getAccessToken(): Promise<string> {
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
    Authorization: `Bearer ${token}`,
    ...(options.headers ?? {}),
  };
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
