import { NextResponse } from "next/server";
import { getBookById } from "@/lib/books";
import { deleteCompiledAudio } from "@/lib/compiled-audio";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ bookId: string; compiledId: string }> },
) {
  const { bookId, compiledId } = await params;
  const book = getBookById(bookId);
  if (!book) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  const projectKey = book.source_key ?? book.title;
  const deleted = deleteCompiledAudio(projectKey, compiledId);
  if (!deleted) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
