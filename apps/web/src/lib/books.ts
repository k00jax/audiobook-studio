import {
  getDb,
  newId,
  parseFolderLabels,
  type BookRow,
} from "./db";
import { listProjectFolderNames } from "./watch-library";

/** Reuse the oldest book with this title (avoids duplicate shells when source_key is missing). */
export function findBookByTitle(title: string): string | null {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT id FROM books WHERE title = ? ORDER BY created_at ASC LIMIT 1",
    )
    .get(title) as { id: string } | undefined;
  return row?.id ?? null;
}

export function findOrCreateBook(
  sourceKey: string,
  displayTitle: string,
): string {
  const db = getDb();

  const byKey = db
    .prepare("SELECT id FROM books WHERE source_key = ?")
    .get(sourceKey) as { id: string } | undefined;
  if (byKey?.id) return byKey.id;

  const existingId = findBookByTitle(displayTitle);
  if (existingId) return existingId;

  const id = newId();
  db.prepare(
    "INSERT INTO books (id, title, source_key) VALUES (?, ?, ?)",
  ).run(id, displayTitle, sourceKey);
  return id;
}

type BookWithCount = {
  id: string;
  title: string;
  created_at: string;
  chapters: { count: number }[];
};

export function findBookBySourceKey(sourceKey: string): string | null {
  const db = getDb();
  const row = db
    .prepare("SELECT id FROM books WHERE source_key = ?")
    .get(sourceKey) as { id: string } | undefined;
  return row?.id ?? null;
}

/** One card per project folder under WATCH_FOLDER. */
export function listLibraryProjects(): BookWithCount[] {
  const folders = listProjectFolderNames();
  const db = getDb();

  return folders.map((name) => {
    const id =
      findBookBySourceKey(name) ??
      findBookByTitle(name) ??
      findOrCreateBook(name, name);

    const countRow = db
      .prepare(
        `
        SELECT COUNT(*) AS chapter_count
        FROM chapters
        WHERE book_id = ?
      `,
      )
      .get(id) as { chapter_count: number };

    return {
      id,
      title: name,
      created_at: "",
      chapters: [{ count: countRow.chapter_count }],
    };
  });
}

export function getBookById(bookId: string): BookRow | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM books WHERE id = ?")
    .get(bookId) as BookRow | undefined;
  return row ?? null;
}

export function getBookFolderLabels(bookId: string): Record<string, string> {
  const book = getBookById(bookId);
  if (!book) return {};
  return parseFolderLabels(book.folder_labels);
}

export function updateBookTitle(bookId: string, title: string): void {
  getDb()
    .prepare("UPDATE books SET title = ? WHERE id = ?")
    .run(title, bookId);
}

export function updateBookFolderLabels(
  bookId: string,
  labels: Record<string, string>,
): void {
  getDb()
    .prepare("UPDATE books SET folder_labels = ? WHERE id = ?")
    .run(JSON.stringify(labels), bookId);
}

/** One library card per title — prefer the book that already has chapters. */
export function dedupeLibraryBooks(books: BookWithCount[]): BookWithCount[] {
  const byTitle = new Map<string, BookWithCount>();

  for (const book of books) {
    const count = book.chapters?.[0]?.count ?? 0;
    const prev = byTitle.get(book.title);
    if (!prev) {
      byTitle.set(book.title, book);
      continue;
    }
    const prevCount = prev.chapters?.[0]?.count ?? 0;
    const pickCurrent =
      count > prevCount ||
      (count === prevCount && book.created_at < prev.created_at);
    if (pickCurrent) byTitle.set(book.title, book);
  }

  return [...byTitle.values()]
    .filter((b) => (b.chapters?.[0]?.count ?? 0) > 0)
    .sort((a, b) => a.title.localeCompare(b.title));
}

/** Merge scattered duplicate book shells into one canonical title. */
export function consolidateDuplicateBooks(
  canonicalTitle: string,
  alsoMergeTitles: string[] = [],
) {
  const db = getDb();
  const titles = [canonicalTitle, ...alsoMergeTitles];
  const placeholders = titles.map(() => "?").join(", ");
  const books = db
    .prepare(`SELECT id, title FROM books WHERE title IN (${placeholders})`)
    .all(...titles) as Array<{ id: string; title: string }>;

  if (!books.length) return { canonicalId: null, merged: 0, removed: 0 };

  const canonicalId =
    findBookByTitle(canonicalTitle) ??
    findOrCreateBook(canonicalTitle, canonicalTitle);

  const canonicalChapters = db
    .prepare("SELECT source_path FROM chapters WHERE book_id = ?")
    .all(canonicalId) as Array<{ source_path: string | null }>;

  const pathsInCanonical = new Set(
    canonicalChapters
      .map((c) => c.source_path)
      .filter((p): p is string => Boolean(p)),
  );

  let merged = 0;
  let removed = 0;

  for (const book of books) {
    if (book.id === canonicalId) continue;

    const chapters = db
      .prepare("SELECT id, source_path FROM chapters WHERE book_id = ?")
      .all(book.id) as Array<{ id: string; source_path: string | null }>;

    for (const chapter of chapters) {
      if (chapter.source_path && !pathsInCanonical.has(chapter.source_path)) {
        db.prepare("UPDATE chapters SET book_id = ? WHERE id = ?").run(
          canonicalId,
          chapter.id,
        );
        pathsInCanonical.add(chapter.source_path);
        merged++;
      } else {
        db.prepare("DELETE FROM parts WHERE chapter_id = ?").run(chapter.id);
        db.prepare("DELETE FROM sections WHERE chapter_id = ?").run(chapter.id);
        db.prepare("DELETE FROM chapters WHERE id = ?").run(chapter.id);
        removed++;
      }
    }

    const count = db
      .prepare("SELECT COUNT(*) AS n FROM chapters WHERE book_id = ?")
      .get(book.id) as { n: number };

    if (!count.n) {
      db.prepare("DELETE FROM books WHERE id = ?").run(book.id);
    }
  }

  db.prepare("UPDATE books SET title = ? WHERE id = ?").run(
    canonicalTitle,
    canonicalId,
  );

  return { canonicalId, merged, removed };
}
