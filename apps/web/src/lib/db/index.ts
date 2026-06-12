import "server-only";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { ensureRootEnv } from "../env";

let db: Database.Database | null = null;

function repoRoot(): string {
  const cwd = process.cwd();
  const candidates = [cwd, path.join(cwd, ".."), path.join(cwd, "../..")];
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "package.json"))) {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(candidate, "package.json"), "utf8"),
      ) as { workspaces?: string[] };
      if (pkg.workspaces) return candidate;
    }
  }
  return path.join(cwd, "../..");
}

export function getLibraryDbPath(): string {
  ensureRootEnv();
  const configured = process.env.LIBRARY_DB_PATH?.trim();
  if (configured) {
    return path.isAbsolute(configured)
      ? configured
      : path.resolve(repoRoot(), configured);
  }
  return path.join(repoRoot(), "data", "library.db");
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  source_key TEXT,
  folder_labels TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS books_source_key_idx
  ON books(source_key)
  WHERE source_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS chapters (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  source_path TEXT,
  content_hash TEXT NOT NULL,
  dictated_content_hash TEXT,
  raw_text TEXT NOT NULL,
  section_count INTEGER NOT NULL DEFAULT 0,
  part_count INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(book_id, source_path)
);

CREATE TABLE IF NOT EXISTS sections (
  id TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  section_index INTEGER NOT NULL,
  body TEXT NOT NULL,
  word_count INTEGER NOT NULL,
  estimated_seconds INTEGER NOT NULL,
  UNIQUE(chapter_id, section_index)
);

CREATE TABLE IF NOT EXISTS parts (
  id TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  part_index INTEGER NOT NULL,
  label TEXT NOT NULL,
  body TEXT NOT NULL,
  section_indexes TEXT NOT NULL DEFAULT '[]',
  word_count INTEGER NOT NULL,
  estimated_seconds INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  audio_path TEXT,
  audio_url TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  processed_at TEXT,
  UNIQUE(chapter_id, part_index)
);

CREATE TABLE IF NOT EXISTS playback_state (
  part_id TEXT PRIMARY KEY REFERENCES parts(id) ON DELETE CASCADE,
  position_ms INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS parts_status_created_idx
  ON parts(status, created_at);
`;

export function newId(): string {
  return crypto.randomUUID();
}

export function getDb(): Database.Database {
  if (db) return db;

  const dbPath = getLibraryDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  migrateDb(db);

  return db;
}

function migrateDb(database: Database.Database) {
  const columns = database
    .prepare("PRAGMA table_info(chapters)")
    .all() as Array<{ name: string }>;
  if (!columns.some((col) => col.name === "source_modified_at")) {
    database.exec("ALTER TABLE chapters ADD COLUMN source_modified_at TEXT");
  }
}

export type BookRow = {
  id: string;
  title: string;
  source_key: string | null;
  folder_labels: string;
  created_at: string;
};

export type ChapterRowDb = {
  id: string;
  book_id: string;
  title: string;
  source_path: string | null;
  content_hash: string;
  dictated_content_hash: string | null;
  raw_text: string;
  section_count: number;
  part_count: number;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
  source_modified_at: string | null;
};

export type PartRowDb = {
  id: string;
  chapter_id: string;
  part_index: number;
  label: string;
  body: string;
  section_indexes: string;
  word_count: number;
  estimated_seconds: number;
  status: string;
  audio_path: string | null;
  audio_url: string | null;
  error_message: string | null;
  created_at: string;
  processed_at: string | null;
};

export function parseFolderLabels(raw: string): Record<string, string> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
  } catch {
    /* ignore */
  }
  return {};
}
