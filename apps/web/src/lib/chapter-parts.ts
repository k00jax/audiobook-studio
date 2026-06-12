import type { splitChapter } from "@book-reader/core";
import { getDb, newId } from "./db";

export function isDictatableStatus(status: string): boolean {
  return status === "draft" || status === "failed" || status === "pending";
}

export function insertParts(
  chapterId: string,
  parts: ReturnType<typeof splitChapter>["parts"],
) {
  if (parts.length === 0) return;

  const db = getDb();
  const insert = db.prepare(`
    INSERT INTO parts (
      id, chapter_id, part_index, label, body, section_indexes,
      word_count, estimated_seconds, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    for (const p of parts) {
      insert.run(
        newId(),
        chapterId,
        p.index,
        p.label,
        p.body,
        JSON.stringify(p.sectionIndexes),
        p.wordCount,
        p.estimatedSeconds,
        "draft",
      );
    }
  });

  tx();
}
