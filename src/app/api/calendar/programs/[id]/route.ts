import { NextResponse } from "next/server";
import { getGymIdByUserId, requireUserIdFromAuthHeader } from "@/lib/supabase/gym";
import { supabaseServer } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const HEX_COLOR_REGEX = /^#([0-9a-fA-F]{6})$/;

function normalizeText(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeColor(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!HEX_COLOR_REGEX.test(normalized)) return null;
  return normalized.toLowerCase();
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Internal server error";
}

export async function PATCH(req: Request, { params }: RouteContext) {
  try {
    const userId = await requireUserIdFromAuthHeader(req);
    const gymId = await getGymIdByUserId(userId);
    if (!gymId) return NextResponse.json({ error: "No gym" }, { status: 404 });

    const { id } = await params;
    const body = await req.json();

    const patch: Record<string, unknown> = {};

    if ("name" in body) {
      const name = normalizeText(body.name);
      if (!name) return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
      if (name.length > 60) {
        return NextResponse.json({ error: "name must be <= 60 characters" }, { status: 400 });
      }
      patch.name = name;
    }

    if ("color" in body) {
      const color = normalizeColor(body.color);
      if (!color) return NextResponse.json({ error: "color must be #RRGGBB" }, { status: 400 });
      patch.color = color;
    }

    if ("is_active" in body) {
      patch.is_active = body.is_active === true;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const sb = supabaseServer();
    const { data, error } = await sb
      .from("programs")
      .update(patch)
      .eq("id", id)
      .eq("gym_id", gymId)
      .select("id, gym_id, name, color, is_active, created_at")
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ program: data });
  } catch (error: unknown) {
    return NextResponse.json({ error: toErrorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: RouteContext) {
  try {
    const userId = await requireUserIdFromAuthHeader(req);
    const gymId = await getGymIdByUserId(userId);
    if (!gymId) return NextResponse.json({ error: "No gym" }, { status: 404 });

    const { id } = await params;

    const sb = supabaseServer();
    const { data: routines, error: routineSelectError } = await sb
      .from("routines")
      .select("id")
      .eq("gym_id", gymId)
      .eq("program_id", id);

    if (routineSelectError) throw new Error(routineSelectError.message);

    const routineIds = (routines ?? []).map((row) => row.id as string).filter(Boolean);

    if (routineIds.length > 0) {
      const { error: scheduleByRoutineError } = await sb
        .from("schedules")
        .delete()
        .eq("gym_id", gymId)
        .in("routine_id", routineIds);

      if (scheduleByRoutineError) throw new Error(scheduleByRoutineError.message);
    }

    const { error: scheduleByProgramError } = await sb
      .from("schedules")
      .delete()
      .eq("gym_id", gymId)
      .eq("program_id", id);

    if (scheduleByProgramError) throw new Error(scheduleByProgramError.message);

    const { error: routineDeleteError } = await sb
      .from("routines")
      .delete()
      .eq("gym_id", gymId)
      .eq("program_id", id);

    if (routineDeleteError) throw new Error(routineDeleteError.message);

    const { data, error } = await sb
      .from("programs")
      .delete()
      .eq("id", id)
      .eq("gym_id", gymId)
      .select("id, gym_id, name, color, is_active, created_at")
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ program: data });
  } catch (error: unknown) {
    return NextResponse.json({ error: toErrorMessage(error) }, { status: 500 });
  }
}
