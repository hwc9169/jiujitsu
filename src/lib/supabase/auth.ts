import { supabaseServer } from "./server";

export async function requireUserIdFromAuthHeader(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) throw new Error("Missing Authorization Bearer token");

  const sb = supabaseServer();
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) throw new Error("Invalid token");
  return data.user.id;
}


