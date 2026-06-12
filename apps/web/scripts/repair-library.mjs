/**
 * Merge duplicate book shells in the local SQLite library.
 *
 *   npm run repair:library
 */
import { config as loadEnv } from "dotenv";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../..");
loadEnv({ path: path.join(repoRoot, ".env") });

function getLibraryDbPath() {
  const configured = process.env.LIBRARY_DB_PATH?.trim();
  if (configured) {
    return path.isAbsolute(configured)
      ? configured
      : path.resolve(repoRoot, configured);
  }
  return path.join(repoRoot, "data", "library.db");
}

const dbPath = getLibraryDbPath();
if (!fs.existsSync(dbPath)) {
  console.error(`Library database not found: ${dbPath}`);
  process.exit(1);
}

const db = new Database(dbPath);
const canonicalTitle = process.argv[2] ?? process.env.DEFAULT_BOOK_TITLE ?? "My Book";

const books = db
  .prepare("SELECT id, title FROM books WHERE title = ? OR title = ?")
  .all(canonicalTitle, "My Book");

if (!books.length) {
  console.log("No duplicate books to repair.");
  process.exit(0);
}

const canonicalId =
  db
    .prepare("SELECT id FROM books WHERE title = ? ORDER BY created_at ASC LIMIT 1")
    .get(canonicalTitle)?.id ??
  books[0].id;

const pathsInCanonical = new Set(
  db
    .prepare("SELECT source_path FROM chapters WHERE book_id = ?")
    .all(canonicalId)
    .map((r) => r.source_path)
    .filter(Boolean),
);

let merged = 0;
let removed = 0;

for (const book of books) {
  if (book.id === canonicalId) continue;

  const chapters = db
    .prepare("SELECT id, source_path FROM chapters WHERE book_id = ?")
    .all(book.id);

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
    .get(book.id).n;

  if (!count) {
    db.prepare("DELETE FROM books WHERE id = ?").run(book.id);
  }
}

db.prepare("UPDATE books SET title = ? WHERE id = ?").run(canonicalTitle, canonicalId);

const bookCount = db.prepare("SELECT COUNT(*) AS n FROM books").get().n;
const chapterCount = db.prepare("SELECT COUNT(*) AS n FROM chapters").get().n;

console.log(`Repaired "${canonicalTitle}" — merged ${merged}, removed ${removed}`);
console.log(`Library now has ${bookCount} book(s), ${chapterCount} chapter(s)`);
