// app/api/gyms/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { requireUserIdFromAuthHeader, getGymIdByUserId } from "@/lib/supabase/gym";

export async function POST(req: Request) {
  try {
    const userId = await requireUserIdFromAuthHeader(req);
    const { name } = await req.json();

    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const sb = supabaseServer();

    // 이미 gym이 있으면 재생성 막기(원하면 허용 가능)
    const existingGymId = await getGymIdByUserId(userId);
    if (existingGymId) {
      return NextResponse.json({ error: "Gym already exists for this user", gymId: existingGymId }, { status: 409 });
    }

    // 1) gyms insert
    const { data: gym, error: gymErr } = await sb
      .from("gyms")
      .insert({ name })
      .select("id, name, created_at")
      .single();
    if (gymErr) throw new Error(gymErr.message);

    // 2) gym_users insert (OWNER)
    const { error: guErr } = await sb
      .from("gym_users")
      .insert({ gym_id: gym.id, user_id: userId, role: "OWNER" });
    if (guErr) throw new Error(guErr.message);

    // 3) seed templates
    const { error: seedErr } = await sb.rpc("seed_default_templates", { p_gym_id: gym.id });
    if (seedErr) throw new Error(seedErr.message);

    return NextResponse.json({ gym });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}