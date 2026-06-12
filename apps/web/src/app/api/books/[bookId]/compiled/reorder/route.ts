import { NextResponse } from "next/server";
import { getBookById } from "@/lib/books";
import { reorderCompiledAudio } from "@/lib/compiled-audio";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  const { bookId } = await params;
  const book = getBookById(bookId);
  if (!book) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  let body: { compiledIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const compiledIds = body.compiledIds?.filter(Boolean) ?? [];
  if (compiledIds.length === 0) {
    return NextResponse.json(
      { error: "compiledIds required" },
      { status: 400 },
    );
  }

  const projectKey = book.source_key ?? book.title;
  const entries = reorderCompiledAudio(projectKey, compiledIds);

  return NextResponse.json({ ok: true, compiled: entries });
}
