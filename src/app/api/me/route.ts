import { NextResponse } from "next/server";
import { requireUserIdFromAuthHeader } from "@/lib/supabase/gym";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(req: Request) {
  try {
    const userId = await requireUserIdFromAuthHeader(req);
    const sb = supabaseServer();

    // gym_users -> gyms 조인
    const { data, error } = await sb
      .from("gym_users")
      .select("gym_id, role, gyms:gyms(id, name)")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);

    const gymId = data?.gym_id ?? null;
    const gymName = (data as any)?.gyms?.name ?? null;

    return NextResponse.json({ userId, gymId, gymName });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 401 });
  }
}