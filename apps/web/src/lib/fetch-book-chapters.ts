import type { ChapterRow } from "@/lib/types";
import { resolvePlaybackAudioUrl } from "@/lib/audio-storage";
import { getDb, type PartRowDb } from "./db";

function mapPart(p: PartRowDb) {
  return {
    id: p.id,
    label: p.label,
    part_index: p.part_index,
    status: p.status,
    estimated_seconds: p.estimated_seconds,
    audio_url: resolvePlaybackAudioUrl(p.audio_path, p.audio_url),
    audio_path: p.audio_path,
    error_message: p.error_message,
    body: p.body,
  };
}

export function fetchBookChapters(bookId: string): ChapterRow[] {
  const db = getDb();
  const chapters = db
    .prepare(
      `
      SELECT id, title, source_path, part_count, section_count, sort_order,
             content_hash, dictated_content_hash, source_modified_at
      FROM chapters
      WHERE book_id = ?
    `,
    )
    .all(bookId) as Array<{
    id: string;
    title: string;
    source_path: string | null;
    part_count: number;
    section_count: number;
    sort_order: number | null;
    content_hash: string | null;
    dictated_content_hash: string | null;
    source_modified_at: string | null;
  }>;

  const partsStmt = db.prepare(`
    SELECT id, chapter_id, part_index, label, body, status,
           estimated_seconds, audio_path, audio_url, error_message
    FROM parts
    WHERE chapter_id = ?
    ORDER BY part_index ASC
  `);

  return chapters.map((ch) => {
    const parts = partsStmt.all(ch.id) as PartRowDb[];
    return {
      id: ch.id,
      title: ch.title ?? "Untitled",
      source_path: ch.source_path,
      part_count: ch.part_count ?? 0,
      section_count: ch.section_count ?? 0,
      sort_order: ch.sort_order,
      content_hash: ch.content_hash,
      dictated_content_hash: ch.dictated_content_hash,
      source_modified_at: ch.source_modified_at,
      parts: parts.map(mapPart),
    };
  });
}

export function getChapterText(chapterId: string): {
  source_path: string | null;
  raw_text: string;
} | null {
  const db = getDb();
  const row = db
    .prepare("SELECT source_path, raw_text FROM chapters WHERE id = ?")
    .get(chapterId) as
    | { source_path: string | null; raw_text: string }
    | undefined;
  return row ?? null;
}

export function updateChapterTitle(chapterId: string, title: string): void {
  getDb()
    .prepare(
      "UPDATE chapters SET title = ?, updated_at = ? WHERE id = ?",
    )
    .run(title, new Date().toISOString(), chapterId);
}

export function getPlaybackForParts(
  partIds: string[],
): Record<string, number> {
  if (partIds.length === 0) return {};
  const db = getDb();
  const placeholders = partIds.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT part_id, position_ms FROM playback_state WHERE part_id IN (${placeholders})`,
    )
    .all(...partIds) as Array<{ part_id: string; position_ms: number }>;

  return Object.fromEntries(rows.map((r) => [r.part_id, r.position_ms]));
}

export function savePlaybackPosition(
  partId: string,
  positionMs: number,
): void {
  getDb()
    .prepare(
      `
      INSERT INTO playback_state (part_id, position_ms, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(part_id) DO UPDATE SET
        position_ms = excluded.position_ms,
        updated_at = excluded.updated_at
    `,
    )
    .run(partId, Math.floor(positionMs), new Date().toISOString());
}

export function reorderChaptersInFolder(
  bookId: string,
  chapterIds: string[],
): Array<{ id: string; source_path: string | null; sort_order: number | null }> {
  const db = getDb();
  const placeholders = chapterIds.map(() => "?").join(", ");
  return db
    .prepare(
      `SELECT id, source_path, sort_order FROM chapters WHERE book_id = ? AND id IN (${placeholders})`,
    )
    .all(bookId, ...chapterIds) as Array<{
    id: string;
    source_path: string | null;
    sort_order: number | null;
  }>;
}

export function updateChapterSortOrder(
  chapterId: string,
  sortOrder: number,
): void {
  getDb()
    .prepare(
      "UPDATE chapters SET sort_order = ?, updated_at = ? WHERE id = ?",
    )
    .run(sortOrder, new Date().toISOString(), chapterId);
}
