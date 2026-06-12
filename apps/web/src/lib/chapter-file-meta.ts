import "server-only";
import type { ChapterRow } from "@/lib/types";
import { formatCentralTime } from "@/lib/format-central-time";
import { getFileModifiedMs, resolveChapterFilePath } from "@/lib/chapter-files";
import { walkProjectManuscriptPaths } from "@/lib/sync-from-disk";
import { getDb } from "./db";

const MTIME_TOLERANCE_MS = 1500;

export function getChapterSyncStatus(
  bookSourceKey: string,
  sourcePath: string | null,
  syncedAt: string | null,
): {
  file_modified_at: string | null;
  file_modified_label: string | null;
  needs_sync: boolean;
  missing_on_disk: boolean;
} {
  const absolute = resolveChapterFilePath(bookSourceKey, sourcePath);
  if (!absolute) {
    return {
      file_modified_at: null,
      file_modified_label: null,
      needs_sync: false,
      missing_on_disk: true,
    };
  }

  const diskMs = getFileModifiedMs(absolute);
  if (diskMs == null) {
    return {
      file_modified_at: null,
      file_modified_label: null,
      needs_sync: false,
      missing_on_disk: true,
    };
  }

  const syncedMs = syncedAt ? Date.parse(syncedAt) : null;
  const needsSync =
    syncedMs == null || diskMs > syncedMs + MTIME_TOLERANCE_MS;

  return {
    file_modified_at: new Date(diskMs).toISOString(),
    file_modified_label: formatCentralTime(diskMs),
    needs_sync: needsSync,
    missing_on_disk: false,
  };
}

export function enrichChaptersWithFileMeta(
  bookSourceKey: string,
  chapters: ChapterRow[],
): ChapterRow[] {
  return chapters.map((chapter) => {
    const meta = getChapterSyncStatus(
      bookSourceKey,
      chapter.source_path,
      chapter.source_modified_at ?? null,
    );
    return { ...chapter, ...meta };
  });
}

export function countPendingChapterChanges(
  bookId: string,
  bookSourceKey: string,
): { hasChanges: boolean; changedCount: number; newOnDisk: number } {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT source_path, source_modified_at FROM chapters WHERE book_id = ?",
    )
    .all(bookId) as Array<{
    source_path: string | null;
    source_modified_at: string | null;
  }>;

  const knownPaths = new Set<string>();
  let changedCount = 0;

  for (const row of rows) {
    if (!row.source_path) continue;
    knownPaths.add(row.source_path);
    const status = getChapterSyncStatus(
      bookSourceKey,
      row.source_path,
      row.source_modified_at,
    );
    if (status.needs_sync) changedCount++;
  }

  const onDisk = walkProjectManuscriptPaths(bookSourceKey);
  const newOnDisk = onDisk.filter((p) => !knownPaths.has(p)).length;

  return {
    hasChanges: changedCount > 0 || newOnDisk > 0,
    changedCount,
    newOnDisk,
  };
}
