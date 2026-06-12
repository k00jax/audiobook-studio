import type { ChapterRow } from "@/lib/types";

function filenameFromPath(sourcePath: string | null, fallback: string): string {
  if (!sourcePath) return fallback;
  const base = sourcePath.split("/").pop() ?? fallback;
  return base.replace(/\.(md|markdown|txt)$/i, "") || fallback;
}

/** Sort key: preface first, numbered chapters in order, epilogue last. */
export function chapterPathSortKey(
  sourcePath: string | null,
  title: string,
): string {
  const base = filenameFromPath(sourcePath, title);
  const lower = base.toLowerCase();

  if (/^preface|^foreword/.test(lower)) return `00-${base}`;
  if (/^introduction/.test(lower)) return `01-${base}`;
  if (/^prologue/.test(lower)) return `02-${base}`;

  const ch = lower.match(/^ch(\d+)/);
  if (ch) return `10-${ch[1].padStart(4, "0")}-${base}`;

  if (/^epilogue/.test(lower)) return `90-${base}`;
  return `50-${base}`;
}

/** Folder path containing a chapter file (empty string = book root). */
export function chapterParentPath(sourcePath: string | null): string {
  if (!sourcePath) return "";
  const parts = sourcePath.split("/").filter(Boolean);
  if (parts.length <= 1) return "";
  return parts.slice(0, -1).join("/");
}

/** True when the manuscript file lives directly in the project root (not in a subfolder). */
export function isChapterAtBookRoot(sourcePath: string | null): boolean {
  return chapterParentPath(sourcePath) === "";
}

export function compareChapterOrder(a: ChapterRow, b: ChapterRow): number {
  const oa = a.sort_order;
  const ob = b.sort_order;
  if (oa != null && ob != null && oa !== ob) return oa - ob;
  if (oa != null && ob == null) return -1;
  if (oa == null && ob != null) return 1;

  const pa = chapterPathSortKey(a.source_path, a.title);
  const pb = chapterPathSortKey(b.source_path, b.title);
  return pa.localeCompare(pb, undefined, { numeric: true, sensitivity: "base" });
}

/** Move draggedId before targetId in a sibling id list. */
export function reorderBefore(
  ids: string[],
  draggedId: string,
  targetId: string,
): string[] {
  if (draggedId === targetId) return ids;
  const without = ids.filter((id) => id !== draggedId);
  const targetIndex = without.indexOf(targetId);
  if (targetIndex < 0) return ids;
  without.splice(targetIndex, 0, draggedId);
  return without;
}

export function sortOrdersFromIds(ids: string[], step = 1000): Record<string, number> {
  return Object.fromEntries(ids.map((id, index) => [id, index * step]));
}

export function siblingsInParent(
  chapters: ChapterRow[],
  parentPath: string,
): ChapterRow[] {
  return chapters
    .filter((ch) => chapterParentPath(ch.source_path) === parentPath)
    .sort(compareChapterOrder);
}
