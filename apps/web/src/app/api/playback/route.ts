import { NextResponse } from "next/server";
import { savePlaybackPosition } from "@/lib/fetch-book-chapters";

export async function POST(request: Request) {
  let body: { partId?: string; positionMs?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.partId || body.positionMs == null) {
    return NextResponse.json(
      { error: "partId and positionMs required" },
      { status: 400 },
    );
  }

  savePlaybackPosition(body.partId, body.positionMs);
  return NextResponse.json({ ok: true });
}
