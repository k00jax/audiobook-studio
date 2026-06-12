import { NextResponse } from "next/server";
import { getBookById } from "@/lib/books";
import { isSyncAuthorized } from "@/lib/sync-auth";
import { syncProjectFromDisk } from "@/lib/sync-from-disk";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  if (!isSyncAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { bookId } = await params;
  const book = getBookById(bookId);
  if (!book) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  try {
    const projectKey = book.source_key ?? book.title;
    const result = await syncProjectFromDisk(projectKey);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
