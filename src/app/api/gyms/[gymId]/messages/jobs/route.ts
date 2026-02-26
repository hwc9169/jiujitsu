import { NextResponse } from "next/server";
import { requireUserIdFromAuthHeader } from "@/lib/supabase/gym";
import { supabaseServer } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ gymId: string }>;
};

type GymUserRow = {
  role: "OWNER" | "STAFF" | string;
};

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Internal server error";
}

export async function GET(req: Request, { params }: RouteContext) {
  try {
    const { gymId } = await params;
    const userId = await requireUserIdFromAuthHeader(req);
    const sb = supabaseServer();

    const { data: gymUser, error: gymUserError } = await sb
      .from("gym_users")
      .select("role")
      .eq("gym_id", gymId)
      .eq("user_id", userId)
      .maybeSingle<GymUserRow>();

    if (gymUserError) throw new Error(gymUserError.message);
    if (!gymUser || !["OWNER", "STAFF"].includes(gymUser.role)) {
      return NextResponse.json({ error: "Only gym admins can access message logs." }, { status: 403 });
    }

    const url = new URL(req.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || "50"), 1), 200);

    const { data, error } = await sb
      .from("message_jobs")
      .select(
        "id, gym_id, mode, template_key, status, requested_count, sent_count, failed_count, blocked_count, error_message, created_at, sent_at, completed_at",
      )
      .eq("gym_id", gymId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw new Error(error.message);

    return NextResponse.json({ items: data ?? [] });
  } catch (error: unknown) {
    return NextResponse.json({ error: toErrorMessage(error) }, { status: 500 });
  }
}
