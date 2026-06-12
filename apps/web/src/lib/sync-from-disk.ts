import "server-only";
import fs from "node:fs";
import path from "node:path";
import { fileModifiedIso } from "./chapter-files";
import { ingestChapter } from "./ingest";
import { getWatchFolder, listProjectFolderNames } from "./watch-library";

const MANUSCRIPT_EXTENSIONS = new Set([".md", ".txt", ".markdown"]);

/** Skip dictated audio and other non-manuscript trees (matches folder watcher). */
function shouldSkipRelativePath(relativePath: string): boolean {
  const segments = relativePath.split("/").filter(Boolean);
  return segments.some((segment) => segment.toUpperCase() === "AUDIO");
}

function walkManuscriptFiles(
  projectKey: string,
  dir: string,
  relativePrefix: string,
): Array<{ sourcePath: string; absolutePath: string }> {
  const found: Array<{ sourcePath: string; absolutePath: string }> = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;

    const absolutePath = path.join(dir, entry.name);
    const rel = relativePrefix
      ? `${relativePrefix}/${entry.name}`.replace(/\\/g, "/")
      : entry.name;

    if (entry.isDirectory()) {
      if (shouldSkipRelativePath(rel)) continue;
      found.push(...walkManuscriptFiles(projectKey, absolutePath, rel));
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();
    if (!MANUSCRIPT_EXTENSIONS.has(ext)) continue;
    if (shouldSkipRelativePath(rel)) continue;

    found.push({ sourcePath: rel, absolutePath });
  }

  return found;
}

export function walkProjectManuscriptPaths(projectKey: string): string[] {
  const watchRoot = getWatchFolder();
  const projectDir = path.join(watchRoot, projectKey);
  if (!fs.existsSync(projectDir)) return [];
  return walkManuscriptFiles(projectKey, projectDir, "").map((f) => f.sourcePath);
}

export type SyncResult = {
  ingested: number;
  unchanged: number;
  errors: number;
  updated: number;
};

export async function syncProjectFromDisk(
  bookSourceKey: string,
): Promise<SyncResult> {
  const watchRoot = getWatchFolder();
  const projectDir = path.join(watchRoot, bookSourceKey);
  if (!fs.existsSync(projectDir)) {
    return { ingested: 0, unchanged: 0, errors: 0, updated: 0 };
  }

  const files = walkManuscriptFiles(bookSourceKey, projectDir, "");
  let ingested = 0;
  let unchanged = 0;
  let updated = 0;
  let errors = 0;

  for (const file of files) {
    try {
      const content = fs.readFileSync(file.absolutePath, "utf8");
      const sourceModifiedAt = fileModifiedIso(file.absolutePath);
      const chapterTitle = path.basename(
        file.absolutePath,
        path.extname(file.absolutePath),
      );
      const result = await ingestChapter({
        bookSourceKey,
        bookTitle: bookSourceKey,
        chapterTitle,
        sourcePath: file.sourcePath,
        content,
        sourceModifiedAt,
      });

      if ("unchanged" in result && result.unchanged) {
        unchanged++;
        if (result.metaUpdated) updated++;
      } else {
        ingested++;
      }
    } catch (err) {
      errors++;
      console.error(`Sync failed for ${file.sourcePath}:`, err);
    }
  }

  return { ingested, unchanged, errors, updated };
}

export async function syncLibraryFromDisk(): Promise<SyncResult> {
  const totals: SyncResult = {
    ingested: 0,
    unchanged: 0,
    errors: 0,
    updated: 0,
  };

  for (const projectKey of listProjectFolderNames()) {
    const result = await syncProjectFromDisk(projectKey);
    totals.ingested += result.ingested;
    totals.unchanged += result.unchanged;
    totals.errors += result.errors;
    totals.updated += result.updated;
  }

  return totals;
}
