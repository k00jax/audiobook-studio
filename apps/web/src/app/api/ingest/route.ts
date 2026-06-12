import { NextResponse } from "next/server";
import { getIngestApiKey } from "@/lib/env";
import { ingestChapter } from "@/lib/ingest";

export async function POST(request: Request) {
  const expectedKey = getIngestApiKey();
  const apiKey = request.headers.get("x-ingest-key");
  if (!expectedKey || !apiKey || apiKey !== expectedKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    chapterTitle: string;
    content: string;
    sourcePath?: string;
    bookTitle?: string;
    bookSourceKey?: string;
    bookId?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.chapterTitle || !body.content) {
    return NextResponse.json(
      { error: "chapterTitle and content required" },
      { status: 400 },
    );
  }

  try {
    const result = await ingestChapter({
      bookId: body.bookId,
      bookTitle: body.bookTitle,
      bookSourceKey: body.bookSourceKey,
      chapterTitle: body.chapterTitle,
      sourcePath: body.sourcePath,
      content: body.content,
    });

    return NextResponse.json({
      ok: true,
      bookId: result.bookId,
      chapterId: result.chapterId,
      sectionCount: result.sections.length,
      partCount: result.parts.length,
      unchanged: "unchanged" in result ? result.unchanged : false,
      parts: result.parts.map((p) => ({
        label: p.label,
        estimatedSeconds: p.estimatedSeconds,
        sectionIndexes: p.sectionIndexes,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ingest failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
