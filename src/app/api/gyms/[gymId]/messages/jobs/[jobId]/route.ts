import { NextResponse } from "next/server";
import { requireUserIdFromAuthHeader } from "@/lib/supabase/gym";
import { supabaseServer } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ gymId: string; jobId: string }>;
};

type GymUserRow = {
  role: "OWNER" | "STAFF" | string;
};

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Internal server error";
}

export async function GET(_req: Request, { params }: RouteContext) {
  try {
    const { gymId, jobId } = await params;
    const userId = await requireUserIdFromAuthHeader(_req);
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

    const { data: job, error: jobError } = await sb
      .from("message_jobs")
      .select(
        "id, gym_id, mode, template_key, status, requested_count, sent_count, failed_count, blocked_count, error_message, created_at, sent_at, completed_at",
      )
      .eq("gym_id", gymId)
      .eq("id", jobId)
      .maybeSingle();

    if (jobError) throw new Error(jobError.message);
    if (!job) {
      return NextResponse.json({ error: "Message job not found" }, { status: 404 });
    }

    const { data: recipients, error: recipientsError } = await sb
      .from("message_outbox")
      .select("id, member_id, member_name, to_phone, status, error_message, created_at, sent_at")
      .eq("job_id", jobId)
      .order("created_at", { ascending: true });

    if (recipientsError) throw new Error(recipientsError.message);

    return NextResponse.json({
      job,
      recipients: recipients ?? [],
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: toErrorMessage(error) }, { status: 500 });
  }
}
