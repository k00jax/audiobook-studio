import { getDb } from "./db";

export function markChapterDictatedIfComplete(chapterId: string) {
  const db = getDb();
  const parts = db
    .prepare("SELECT status FROM parts WHERE chapter_id = ?")
    .all(chapterId) as Array<{ status: string }>;

  if (!parts.length || !parts.every((p) => p.status === "ready")) return;

  const chapter = db
    .prepare("SELECT content_hash FROM chapters WHERE id = ?")
    .get(chapterId) as { content_hash: string | null } | undefined;

  if (!chapter?.content_hash) return;

  db.prepare(
    "UPDATE chapters SET dictated_content_hash = ? WHERE id = ?",
  ).run(chapter.content_hash, chapterId);
}

export function syncDictatedHashForChapters(chapterIds: string[]) {
  for (const chapterId of chapterIds) {
    markChapterDictatedIfComplete(chapterId);
  }
}
