// app/api/gyms/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { requireUserIdFromAuthHeader, getGymIdByUserId } from "@/lib/supabase/gym";

const DEFAULT_PROGRAMS = [
  { name: "기 수업", color: "#0e3b2e" },
  { name: "노기 수업", color: "#1f4d3d" },
  { name: "오픈매트", color: "#7a8b83" },
] as const;

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

    // 4) seed default programs
    const { error: programErr } = await sb.from("programs").insert(
      DEFAULT_PROGRAMS.map((program) => ({
        gym_id: gym.id,
        name: program.name,
        color: program.color,
        is_active: true,
      })),
    );
    if (programErr) throw new Error(programErr.message);

    return NextResponse.json({ gym });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create gym" },
      { status: 500 },
    );
  }
}
