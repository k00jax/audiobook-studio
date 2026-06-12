import { NextResponse } from "next/server";
import {
  getBookById,
  getBookFolderLabels,
  updateBookFolderLabels,
  updateBookTitle,
} from "@/lib/books";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  const { bookId } = await params;

  let body: { title?: string; folderPath?: string; folderName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.title) {
    const book = getBookById(bookId);
    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }
    updateBookTitle(bookId, body.title.trim());
    return NextResponse.json({ ok: true, title: body.title.trim() });
  }

  if (body.folderPath != null && body.folderName) {
    const book = getBookById(bookId);
    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    const labels = {
      ...getBookFolderLabels(bookId),
      [body.folderPath]: body.folderName.trim(),
    };

    updateBookFolderLabels(bookId, labels);
    return NextResponse.json({ ok: true, folder_labels: labels });
  }

  return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
}
