import { NextResponse } from "next/server";
import { getGymIdByUserId, requireUserIdFromAuthHeader } from "@/lib/supabase/gym";
import { supabaseServer } from "@/lib/supabase/server";

function isUnauthorizedErrorMessage(message: string) {
  return message.includes("Missing Authorization Bearer token") || message.includes("Invalid token");
}

export async function GET(req: Request) {
  try {
    const userId = await requireUserIdFromAuthHeader(req);
    const gymId = await getGymIdByUserId(userId);
    const sb = supabaseServer();

    let gymName: string | null = null;
    if (gymId) {
      const { data, error } = await sb.from("gyms").select("name").eq("id", gymId).limit(1).maybeSingle();
      if (error) throw new Error(error.message);
      gymName = data?.name ?? null;
    }

    return NextResponse.json({ userId, gymId: gymId ?? null, gymName });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Internal server error";
    const status = isUnauthorizedErrorMessage(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
