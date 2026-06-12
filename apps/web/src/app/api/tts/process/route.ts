import { NextResponse } from "next/server";
import { getIngestApiKey } from "@/lib/env";
import { processNextPendingPart } from "@/lib/tts";

export async function POST(request: Request) {
  const expectedKey = getIngestApiKey();
  const apiKey = request.headers.get("x-ingest-key");
  if (!expectedKey || !apiKey || apiKey !== expectedKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processNextPendingPart();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "TTS failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
