import { NextResponse } from "next/server";
import { getChapterText, updateChapterTitle } from "@/lib/fetch-book-chapters";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ chapterId: string }> },
) {
  const { chapterId } = await params;
  const data = getChapterText(chapterId);

  if (!data) {
    return NextResponse.json({ error: "Chapter not found" }, { status: 404 });
  }

  return NextResponse.json({
    source_path: data.source_path,
    raw_text: data.raw_text,
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ chapterId: string }> },
) {
  const { chapterId } = await params;

  let body: { title?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.title?.trim()) {
    return NextResponse.json({ error: "title required" }, { status: 400 });
  }

  updateChapterTitle(chapterId, body.title.trim());
  return NextResponse.json({ ok: true, title: body.title.trim() });
}
