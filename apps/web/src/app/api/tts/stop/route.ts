import { NextResponse } from "next/server";
import { stopActiveTts } from "@/lib/tts";

export async function POST() {
  const generation = stopActiveTts();
  return NextResponse.json({ ok: true, generation });
}
