import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { requireUserIdFromAuthHeader, getGymIdByUserId } from "@/lib/supabase/gym";
import type { MemberGender } from "@/lib/types";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function normalizeGender(value: unknown): MemberGender | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (["남", "남자", "male", "m"].includes(normalized)) return "남";
  if (["여", "여자", "female", "f"].includes(normalized)) return "여";
  return null;
}

function normalizePhone(value: unknown): string {
  return typeof value === "string" ? value.replace(/\D/g, "") : "";
}

export async function PATCH(req: Request, { params }: RouteContext) {
  try {
    const userId = await requireUserIdFromAuthHeader(req);
    const gymId = await getGymIdByUserId(userId);
    if (!gymId) return NextResponse.json({ error: "No gym" }, { status: 404 });

    const { id } = await params;
    const patch = await req.json();

    // 허용 필드만
    const allowed: Record<string, unknown> = {};
    for (const k of ["name", "phone", "gender", "start_date", "expire_date", "memo"]) {
      if (k in patch) allowed[k] = patch[k];
    }
    if ("phone" in allowed) allowed.phone = normalizePhone(allowed.phone);
    if ("gender" in allowed) {
      const normalizedGender = normalizeGender(allowed.gender);
      if (!normalizedGender) {
        return NextResponse.json({ error: "gender must be 남 or 여" }, { status: 400 });
      }
      allowed.gender = normalizedGender;
    }

    const sb = supabaseServer();
    const { data, error } = await sb
      .from("members")
      .update(allowed)
      .eq("id", id)
      .eq("gym_id", gymId)
      .is("deleted_at", null)
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ member: data });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request, { params }: RouteContext) {
  try {
    const userId = await requireUserIdFromAuthHeader(req);
    const gymId = await getGymIdByUserId(userId);
    if (!gymId) return NextResponse.json({ error: "No gym" }, { status: 404 });

    const { id } = await params;

    const sb = supabaseServer();
    const { data, error } = await sb
      .from("members")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .eq("gym_id", gymId)
      .is("deleted_at", null)
      .select("id")
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, id: data.id });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 },
    );
  }
}
