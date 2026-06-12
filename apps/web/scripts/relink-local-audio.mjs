/**
 * Reconnect existing MP3 files on disk to chapter parts in the local library DB.
 *
 *   npm run relink:audio-local
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

function getWatchFolder() {
  const configured = process.env.WATCH_FOLDER?.trim();
  if (!configured) {
    throw new Error("Set WATCH_FOLDER to the library root");
  }
  return path.isAbsolute(configured)
    ? configured
    : path.resolve(repoRoot, configured);
}

function filenameFromPath(sourcePath, fallback = "") {
  if (!sourcePath) return fallback;
  const base = sourcePath.split("/").pop() ?? fallback;
  return base.replace(/\.(md|markdown|txt)$/i, "") || fallback;
}

function audioUrlForRelativePath(relativePath) {
  return `/api/audio/${relativePath
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/")}`;
}

function candidateRelativePaths(bookKey, chapterKey, partIndex) {
  const book = bookKey.replace(/\\/g, "/");
  const chapter = chapterKey.replace(/\\/g, "/");
  const partNum = String(partIndex + 1).padStart(2, "0");
  return [
    `${book}/${chapter}.mp3`,
    `${book}/${chapter}/part-${partNum}.mp3`,
    `${book}/${chapter}-part-${partNum}.mp3`,
  ];
}

/** Index logical paths like WTFAYTA/ch01.mp3 from each project's AUDIO folder. */
function indexProjectAudio(watchRoot) {
  const index = new Map();
  if (!fs.existsSync(watchRoot)) return index;

  for (const entry of fs.readdirSync(watchRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;

    const bookKey = entry.name;
    const audioDir = path.join(watchRoot, bookKey, "AUDIO");
    if (!fs.existsSync(audioDir)) continue;

    function walk(dir, prefix = "") {
      for (const file of fs.readdirSync(dir, { withFileTypes: true })) {
        const rel = prefix ? `${prefix}/${file.name}` : file.name;
        if (file.isDirectory()) {
          walk(path.join(dir, file.name), rel.replace(/\\/g, "/"));
          continue;
        }
        if (!/\.(mp3|wav|mpeg)$/i.test(file.name)) continue;

        const relPosix = rel.replace(/\\/g, "/");
        index.set(`${bookKey}/${relPosix}`, path.join(dir, rel));
      }
    }

    walk(audioDir);
  }

  return index;
}

function findOnDisk(index, bookKey, chapterKey, partIndex) {
  for (const candidate of candidateRelativePaths(bookKey, chapterKey, partIndex)) {
    if (index.has(candidate)) return candidate;
  }
  return null;
}

function main() {
  const dbPath = getLibraryDbPath();
  if (!fs.existsSync(dbPath)) {
    console.error(`Library database not found: ${dbPath}`);
    process.exit(1);
  }

  const db = new Database(dbPath);
  const watchRoot = getWatchFolder();
  const index = indexProjectAudio(watchRoot);
  console.log(`Library DB: ${dbPath}`);
  console.log(`Library root: ${watchRoot}`);
  console.log(`Found ${index.size} audio file(s) on disk`);

  const parts = db
    .prepare(
      `
      SELECT
        p.id,
        p.part_index,
        p.status,
        p.audio_path,
        p.chapter_id,
        c.source_path,
        c.content_hash,
        b.source_key,
        b.title AS book_title
      FROM parts p
      JOIN chapters c ON c.id = p.chapter_id
      JOIN books b ON b.id = c.book_id
      ORDER BY p.part_index
    `,
    )
    .all();

  let linked = 0;
  let skipped = 0;
  const chaptersToSync = new Set();

  const updatePart = db.prepare(`
    UPDATE parts SET
      status = 'ready',
      audio_path = ?,
      audio_url = ?,
      error_message = NULL,
      processed_at = ?
    WHERE id = ?
  `);

  for (const part of parts) {
    const bookKey = part.source_key ?? part.book_title ?? "book";
    const chapterKey =
      filenameFromPath(part.source_path, "") ||
      `chapter-${part.chapter_id.slice(0, 8)}`;

    const relativePath = findOnDisk(index, bookKey, chapterKey, part.part_index);
    if (!relativePath) {
      skipped++;
      continue;
    }

    if (part.status === "ready" && part.audio_path === relativePath) {
      skipped++;
      continue;
    }

    updatePart.run(
      relativePath,
      audioUrlForRelativePath(relativePath),
      new Date().toISOString(),
      part.id,
    );

    chaptersToSync.add(part.chapter_id);
    linked++;
    console.log(`Linked: ${relativePath}`);
  }

  for (const chapterId of chaptersToSync) {
    const chapterParts = db
      .prepare("SELECT status FROM parts WHERE chapter_id = ?")
      .all(chapterId);

    if (
      !chapterParts.length ||
      !chapterParts.every((p) => p.status === "ready")
    ) {
      continue;
    }

    const chapter = db
      .prepare("SELECT content_hash FROM chapters WHERE id = ?")
      .get(chapterId);

    if (chapter?.content_hash) {
      db.prepare(
        "UPDATE chapters SET dictated_content_hash = ? WHERE id = ?",
      ).run(chapter.content_hash, chapterId);
    }
  }

  console.log(`Done — linked ${linked}, skipped ${skipped}`);
}

main();
