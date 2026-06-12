import { NextResponse } from "next/server";
import { isChapterAtBookRoot } from "@/lib/chapter-reorder";
import { getBookById } from "@/lib/books";
import { compileBookAudio } from "@/lib/compiled-audio";
import { fetchBookChapters } from "@/lib/fetch-book-chapters";

export const maxDuration = 300;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  const { bookId } = await params;
  const book = getBookById(bookId);
  if (!book) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  let body: { name?: string; chapterIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = body.name?.trim();
  const chapterIds = body.chapterIds?.filter(Boolean) ?? [];
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (chapterIds.length === 0) {
    return NextResponse.json(
      { error: "Select at least one chapter" },
      { status: 400 },
    );
  }

  const projectKey = book.source_key ?? book.title;
  const chapters = fetchBookChapters(bookId).filter((ch) =>
    isChapterAtBookRoot(ch.source_path),
  );

  try {
    const entry = await compileBookAudio({
      bookKey: projectKey,
      name,
      chapters,
      chapterIds,
    });
    return NextResponse.json({ ok: true, compiled: entry });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Compile failed" },
      { status: 400 },
    );
  }
}
