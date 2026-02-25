import { NextResponse } from "next/server";
import { normalizeAccessCode, readPublicScheduleBySlug } from "@/lib/public-schedule";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

export async function GET(req: Request, { params }: RouteContext) {
  try {
    const { slug } = await params;
    const url = new URL(req.url);
    const codeFromQuery = url.searchParams.get("code");
    const codeFromHeader = req.headers.get("x-public-access-code");
    const accessCode = normalizeAccessCode(codeFromQuery ?? codeFromHeader);

    const result = await readPublicScheduleBySlug(slug, accessCode);
    if (result.status === "not_found") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (result.status === "locked") {
      return NextResponse.json({ error: "Access code required" }, { status: 403 });
    }

    return NextResponse.json(result.data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
