import { NextResponse } from "next/server";

export async function POST() {
  // TODO: send SMS via provider + log message
  return NextResponse.json(
    { message: "Message sending not implemented yet" },
    { status: 501 }
  );
}
