import { NextResponse } from "next/server";
import { getGymIdByUserId, requireUserIdFromAuthHeader } from "@/lib/supabase/gym";
import { supabaseServer } from "@/lib/supabase/server";

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

function parseIncludeInactive(raw: string | null) {
  if (!raw) return true;
  return raw !== "false";
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Internal server error";
}

export async function GET(req: Request) {
  try {
    const userId = await requireUserIdFromAuthHeader(req);
    const gymId = await getGymIdByUserId(userId);
    if (!gymId) return NextResponse.json({ error: "No gym" }, { status: 404 });

    const url = new URL(req.url);
    const includeInactive = parseIncludeInactive(url.searchParams.get("includeInactive"));
    const q = normalizeText(url.searchParams.get("q"));

    const sb = supabaseServer();
    let query = sb
      .from("programs")
      .select("id, gym_id, name, color, is_active, created_at")
      .eq("gym_id", gymId)
      .order("is_active", { ascending: false })
      .order("name", { ascending: true });

    if (!includeInactive) query = query.eq("is_active", true);
    if (q) query = query.ilike("name", `%${q}%`);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return NextResponse.json({ items: data ?? [] });
  } catch (error: unknown) {
    return NextResponse.json({ error: toErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const userId = await requireUserIdFromAuthHeader(req);
    const gymId = await getGymIdByUserId(userId);
    if (!gymId) return NextResponse.json({ error: "No gym" }, { status: 404 });

    const body = await req.json();
    const name = normalizeText(body?.name);
    const color = normalizeColor(body?.color ?? "#0e3b2e");
    const isActive = body?.is_active !== false;

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    if (name.length > 60) {
      return NextResponse.json({ error: "name must be <= 60 characters" }, { status: 400 });
    }
    if (!color) {
      return NextResponse.json({ error: "color must be #RRGGBB" }, { status: 400 });
    }

    const sb = supabaseServer();
    const { data, error } = await sb
      .from("programs")
      .insert({
        gym_id: gymId,
        name,
        color,
        is_active: isActive,
      })
      .select("id, gym_id, name, color, is_active, created_at")
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ program: data }, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json({ error: toErrorMessage(error) }, { status: 500 });
  }
}

