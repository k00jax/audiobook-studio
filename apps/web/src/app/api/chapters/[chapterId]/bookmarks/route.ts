import { NextResponse } from "next/server";
import {
  createChapterBookmark,
  listChapterBookmarks,
} from "@/lib/chapter-notes";
import { getDb } from "@/lib/db";

function getChapterBookmarkContext(chapterId: string) {
  return getDb()
    .prepare(
      `
      SELECT c.source_path, c.content_hash, b.source_key, b.title
      FROM chapters c
      JOIN books b ON b.id = c.book_id
      WHERE c.id = ?
    `,
    )
    .get(chapterId) as
    | {
        source_path: string | null;
        content_hash: string | null;
        source_key: string | null;
        title: string;
      }
    | undefined;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ chapterId: string }> },
) {
  const { chapterId } = await params;
  const ctx = getChapterBookmarkContext(chapterId);
  if (!ctx) {
    return NextResponse.json({ error: "Chapter not found" }, { status: 404 });
  }

  const projectKey = ctx.source_key ?? ctx.title;
  const bookmarks = listChapterBookmarks(
    projectKey,
    ctx.source_path,
    ctx.content_hash,
  );

  return NextResponse.json({ bookmarks });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ chapterId: string }> },
) {
  const { chapterId } = await params;
  const ctx = getChapterBookmarkContext(chapterId);
  if (!ctx) {
    return NextResponse.json({ error: "Chapter not found" }, { status: 404 });
  }

  if (!ctx.content_hash) {
    return NextResponse.json(
      { error: "Chapter has no content hash — sync from disk first." },
      { status: 400 },
    );
  }

  let body: { positionSec?: number; partId?: string | null; note?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const positionSec = body.positionSec;
  if (positionSec == null || !Number.isFinite(positionSec) || positionSec < 0) {
    return NextResponse.json(
      { error: "positionSec required (non-negative number)" },
      { status: 400 },
    );
  }

  const projectKey = ctx.source_key ?? ctx.title;
  const bookmark = createChapterBookmark({
    projectKey,
    sourcePath: ctx.source_path,
    contentHash: ctx.content_hash,
    positionSec,
    partId: body.partId ?? null,
    note: body.note ?? null,
  });

  return NextResponse.json({ ok: true, bookmark });
}
