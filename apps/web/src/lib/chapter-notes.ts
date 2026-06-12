import "server-only";
import fs from "node:fs";
import path from "node:path";
import { filenameFromPath } from "@/lib/chapter-tree";
import { sanitizePathSegment } from "@/lib/audio-storage";
import { ensureProjectNotesDir, isUnderWatchFolder } from "@/lib/watch-library";

export type ChapterBookmark = {
  id: string;
  number: number;
  filename: string;
  chapter_key: string;
  position_sec: number;
  part_id: string | null;
  content_hash: string;
  note: string | null;
  created_at: string;
};

function chapterKeyFromSourcePath(sourcePath: string | null): string {
  const base = filenameFromPath(sourcePath, "chapter");
  return sanitizePathSegment(base);
}

function bookmarkFilename(chapterKey: string, number: number): string {
  const num = String(number).padStart(3, "0");
  return `${chapterKey}-bookmark-${num}.md`;
}

function parseBookmarkFile(
  absolutePath: string,
  chapterKey: string,
): ChapterBookmark | null {
  let raw: string;
  try {
    raw = fs.readFileSync(absolutePath, "utf8");
  } catch {
    return null;
  }

  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)?$/u.exec(raw);
  if (!match) return null;

  const meta: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }

  const positionSec = Number(meta.position_sec);
  const contentHash = meta.content_hash ?? "";
  if (!Number.isFinite(positionSec) || !contentHash) return null;

  const filename = path.basename(absolutePath);
  const numberMatch = filename.match(/-bookmark-(\d+)\.md$/i);
  const number = numberMatch ? Number(numberMatch[1]) : 0;

  const bodyNote = match[2]?.trim() || null;

  return {
    id: filename.replace(/\.md$/i, ""),
    number,
    filename,
    chapter_key: chapterKey,
    position_sec: positionSec,
    part_id: meta.part_id || null,
    content_hash: contentHash,
    note: bodyNote,
    created_at: meta.created_at ?? new Date().toISOString(),
  };
}

function nextBookmarkNumber(notesDir: string, chapterKey: string): number {
  if (!fs.existsSync(notesDir)) return 1;
  let max = 0;
  const prefix = `${chapterKey}-bookmark-`;
  for (const entry of fs.readdirSync(notesDir)) {
    if (!entry.startsWith(prefix) || !entry.endsWith(".md")) continue;
    const num = Number(entry.slice(prefix.length, -3));
    if (Number.isFinite(num)) max = Math.max(max, num);
  }
  return max + 1;
}

export function listChapterBookmarks(
  projectKey: string,
  sourcePath: string | null,
  contentHash: string | null,
): ChapterBookmark[] {
  if (!contentHash) return [];

  const chapterKey = chapterKeyFromSourcePath(sourcePath);
  const notesDir = ensureProjectNotesDir(projectKey);
  if (!fs.existsSync(notesDir)) return [];

  const prefix = `${chapterKey}-bookmark-`;
  const bookmarks: ChapterBookmark[] = [];

  for (const entry of fs.readdirSync(notesDir)) {
    if (!entry.startsWith(prefix) || !entry.endsWith(".md")) continue;
    const absolute = path.join(notesDir, entry);
    if (!isUnderWatchFolder(absolute)) continue;
    const parsed = parseBookmarkFile(absolute, chapterKey);
    if (parsed && parsed.content_hash === contentHash) {
      bookmarks.push(parsed);
    }
  }

  return bookmarks.sort((a, b) => a.number - b.number);
}

export function createChapterBookmark(input: {
  projectKey: string;
  sourcePath: string | null;
  contentHash: string;
  positionSec: number;
  partId?: string | null;
  note?: string | null;
}): ChapterBookmark {
  const chapterKey = chapterKeyFromSourcePath(input.sourcePath);
  const notesDir = ensureProjectNotesDir(input.projectKey);
  const number = nextBookmarkNumber(notesDir, chapterKey);
  const filename = bookmarkFilename(chapterKey, number);
  const absolute = path.join(notesDir, filename);

  if (!isUnderWatchFolder(absolute)) {
    throw new Error("Invalid bookmark path");
  }

  const createdAt = new Date().toISOString();
  const trimmedNote = input.note?.trim() || null;
  const positionSec = Math.round(input.positionSec * 100) / 100;

  const yamlLines = [
    "---",
    `position_sec: ${positionSec}`,
    `part_id: ${input.partId ?? ""}`,
    `content_hash: ${input.contentHash}`,
    `created_at: ${createdAt}`,
    "---",
  ];

  const body = trimmedNote ? `\n${trimmedNote}\n` : "\n";
  fs.writeFileSync(absolute, `${yamlLines.join("\n")}${body}`, "utf8");

  return {
    id: filename.replace(/\.md$/i, ""),
    number,
    filename,
    chapter_key: chapterKey,
    position_sec: positionSec,
    part_id: input.partId ?? null,
    content_hash: input.contentHash,
    note: trimmedNote,
    created_at: createdAt,
  };
}
