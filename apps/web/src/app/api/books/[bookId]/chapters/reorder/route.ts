import { NextResponse } from "next/server";
import { chapterParentPath } from "@/lib/chapter-reorder";
import { persistSiblingChapterOrder } from "@/lib/chapter-reorder-server";
import { reorderChaptersInFolder } from "@/lib/fetch-book-chapters";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  const { bookId } = await params;

  let body: { parentPath?: string; chapterIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parentPath = body.parentPath ?? "";
  const chapterIds = body.chapterIds?.filter(Boolean) ?? [];
  if (chapterIds.length === 0) {
    return NextResponse.json({ error: "chapterIds required" }, { status: 400 });
  }

  const chapters = reorderChaptersInFolder(bookId, chapterIds);

  if (!chapters.length || chapters.length !== chapterIds.length) {
    return NextResponse.json({ error: "Invalid chapter list" }, { status: 400 });
  }

  for (const chapter of chapters) {
    if (chapterParentPath(chapter.source_path) !== parentPath) {
      return NextResponse.json(
        { error: "Chapters must share the same folder" },
        { status: 400 },
      );
    }
  }

  try {
    persistSiblingChapterOrder(bookId, parentPath, chapterIds);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save order";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const sortOrders = Object.fromEntries(
    chapterIds.map((id, index) => [id, index * 1000]),
  );

  return NextResponse.json({
    ok: true,
    parentPath,
    chapterIds,
    sortOrders,
  });
}
