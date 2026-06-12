import { NextResponse } from "next/server";
import { getBookById } from "@/lib/books";
import { countPendingChapterChanges } from "@/lib/chapter-file-meta";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  const { bookId } = await params;
  const book = getBookById(bookId);
  if (!book) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  const projectKey = book.source_key ?? book.title;
  const status = countPendingChapterChanges(bookId, projectKey);

  return NextResponse.json({
    ok: true,
    ...status,
  });
}
