// lib/supabase/gym.ts
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


export async function getGymIdByUserId(userId: string) {
  const sb = supabaseServer();
  const { data, error } = await sb
    .from("gym_users")
    .select("gym_id, role")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.gym_id) return null;
  return data.gym_id as string;
}