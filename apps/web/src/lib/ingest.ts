import { splitChapter } from "@book-reader/core";
import { consolidateDuplicateBooks, findOrCreateBook } from "./books";
import { chapterParentPath } from "./chapter-reorder";
import { insertParts } from "./chapter-parts";
import { getConfig } from "./config";
import { getDb, newId } from "./db";

export type IngestInput = {
  bookId?: string;
  bookTitle?: string;
  bookSourceKey?: string;
  chapterTitle: string;
  sourcePath?: string;
  content: string;
  sourceModifiedAt?: string | null;
};

function touchSourceModified(
  chapterId: string,
  sourceModifiedAt: string | null | undefined,
) {
  if (!sourceModifiedAt) return;
  getDb()
    .prepare("UPDATE chapters SET source_modified_at = ? WHERE id = ?")
    .run(sourceModifiedAt, chapterId);
}

export async function ingestChapter(input: IngestInput) {
  const config = getConfig();
  const db = getDb();
  let bookId = input.bookId;
  const sourceKey =
    input.bookSourceKey ?? input.bookTitle ?? config.defaultBookTitle;
  const displayTitle = input.bookTitle ?? sourceKey;

  if (!bookId) {
    bookId = findOrCreateBook(sourceKey, displayTitle);
    const merged = consolidateDuplicateBooks(displayTitle, [
      config.defaultBookTitle,
    ]);
    if (merged.canonicalId) bookId = merged.canonicalId;
  }

  const { sections, parts } = splitChapter(input.content, {
    sectionDelimiter: config.sectionDelimiter,
    partBudgetSeconds: config.partBudgetSeconds,
    wordsPerMinute: config.wordsPerMinute,
    chapterLabel: input.chapterTitle,
  });

  const contentHash = await hashText(input.content);

  if (input.sourcePath) {
    const existing = db
      .prepare(
        "SELECT id, content_hash FROM chapters WHERE book_id = ? AND source_path = ?",
      )
      .get(bookId, input.sourcePath) as
      | { id: string; content_hash: string }
      | undefined;

    if (existing?.content_hash === contentHash) {
      touchSourceModified(existing.id, input.sourceModifiedAt);
      const metaUpdated = Boolean(input.sourceModifiedAt);
      return {
        bookId,
        chapterId: existing.id,
        sections: [],
        parts: [],
        unchanged: true as const,
        metaUpdated,
      };
    }
  }

  const now = new Date().toISOString();
  let chapterId: string;

  if (input.sourcePath) {
    const existing = db
      .prepare(
        "SELECT id FROM chapters WHERE book_id = ? AND source_path = ?",
      )
      .get(bookId, input.sourcePath) as { id: string } | undefined;

    if (existing) {
      chapterId = existing.id;
      db.prepare(
        `
        UPDATE chapters SET
          title = ?, content_hash = ?, raw_text = ?,
          section_count = ?, part_count = ?, updated_at = ?,
          source_modified_at = ?
        WHERE id = ?
      `,
      ).run(
        input.chapterTitle,
        contentHash,
        input.content,
        sections.length,
        parts.length,
        now,
        input.sourceModifiedAt ?? null,
        chapterId,
      );
    } else {
      chapterId = newId();
      db.prepare(
        `
        INSERT INTO chapters (
          id, book_id, title, source_path, content_hash, raw_text,
          section_count, part_count, created_at, updated_at, source_modified_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      ).run(
        chapterId,
        bookId,
        input.chapterTitle,
        input.sourcePath,
        contentHash,
        input.content,
        sections.length,
        parts.length,
        now,
        now,
        input.sourceModifiedAt ?? null,
      );
    }
  } else {
    chapterId = newId();
    db.prepare(
      `
      INSERT INTO chapters (
        id, book_id, title, source_path, content_hash, raw_text,
        section_count, part_count, created_at, updated_at, source_modified_at
      ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      chapterId,
      bookId,
      input.chapterTitle,
      contentHash,
      input.content,
      sections.length,
      parts.length,
      now,
      now,
      input.sourceModifiedAt ?? null,
    );
  }

  assignChapterSortOrderIfNew(bookId, chapterId, input.sourcePath ?? null);

  db.prepare("DELETE FROM sections WHERE chapter_id = ?").run(chapterId);
  db.prepare("DELETE FROM parts WHERE chapter_id = ?").run(chapterId);

  if (sections.length > 0) {
    const insertSection = db.prepare(`
      INSERT INTO sections (id, chapter_id, section_index, body, word_count, estimated_seconds)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const s of sections) {
      insertSection.run(
        newId(),
        chapterId,
        s.index,
        s.body,
        s.wordCount,
        s.estimatedSeconds,
      );
    }
  }

  insertParts(chapterId, parts);

  return { bookId, chapterId, sections, parts };
}

function assignChapterSortOrderIfNew(
  bookId: string,
  chapterId: string,
  sourcePath: string | null,
) {
  const db = getDb();
  const current = db
    .prepare("SELECT sort_order FROM chapters WHERE id = ?")
    .get(chapterId) as { sort_order: number | null } | undefined;

  if (current?.sort_order != null) return;

  const parentPath = chapterParentPath(sourcePath);
  const siblings = db
    .prepare("SELECT id, source_path, sort_order FROM chapters WHERE book_id = ?")
    .all(bookId) as Array<{
    id: string;
    source_path: string | null;
    sort_order: number | null;
  }>;

  let maxOrder = -1000;
  for (const sibling of siblings) {
    if (sibling.id === chapterId) continue;
    if (chapterParentPath(sibling.source_path) !== parentPath) continue;
    if (sibling.sort_order != null) {
      maxOrder = Math.max(maxOrder, sibling.sort_order);
    }
  }

  db.prepare("UPDATE chapters SET sort_order = ? WHERE id = ?").run(
    maxOrder + 1000,
    chapterId,
  );
}

async function hashText(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
