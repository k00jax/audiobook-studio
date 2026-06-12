import "server-only";
import fs from "node:fs";
import path from "node:path";
import { getWatchFolder } from "./watch-library";

export function resolveChapterFilePath(
  bookSourceKey: string,
  sourcePath: string | null,
): string | null {
  if (!sourcePath) return null;
  return path.join(getWatchFolder(), bookSourceKey, sourcePath);
}

export function getFileModifiedMs(absolutePath: string): number | null {
  try {
    return fs.statSync(absolutePath).mtimeMs;
  } catch {
    return null;
  }
}

export function fileModifiedIso(absolutePath: string): string | null {
  const ms = getFileModifiedMs(absolutePath);
  return ms == null ? null : new Date(ms).toISOString();
}
