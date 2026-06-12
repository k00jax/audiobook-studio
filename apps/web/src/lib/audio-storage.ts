import "server-only";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { alignmentRelativePathForAudio } from "@/lib/audio-alignment";
import { ensureRootEnv } from "@/lib/env";
import { filenameFromPath } from "@/lib/chapter-tree";
import {
  bookKeyFromSourcePath,
  ensureProjectAudioDir,
  getAudioOutputDirForBook,
  isUnderWatchFolder,
} from "@/lib/watch-library";

export type AudioFileContext = {
  bookKey: string;
  chapterKey: string;
  partIndex: number;
  extension: string;
};

function repoRoot(): string {
  return path.resolve(process.cwd(), "../..");
}

/** @deprecated Use getAudioOutputDirForBook(bookKey). Kept for legacy scripts. */
export function getAudioOutputDir(): string {
  ensureRootEnv();
  const configured = process.env.AUDIO_OUTPUT_DIR?.trim();
  if (configured) {
    return path.isAbsolute(configured)
      ? configured
      : path.resolve(repoRoot(), configured);
  }
  return path.join(repoRoot(), "generated-audio");
}

export function sanitizePathSegment(name: string): string {
  return (
    name
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) || "untitled"
  );
}

/** Logical path stored in DB and used in /api/audio URLs: `{bookKey}/{chapter}.mp3` */
export function buildAudioRelativePath(ctx: AudioFileContext): string {
  const book = sanitizePathSegment(ctx.bookKey);
  const chapter = sanitizePathSegment(ctx.chapterKey);
  const ext = ctx.extension.replace(/^\./, "") || "mp3";
  if (ctx.partIndex === 0) {
    return path.posix.join(book, `${chapter}.${ext}`);
  }
  const part = String(ctx.partIndex + 1).padStart(2, "0");
  return path.posix.join(book, `${chapter}-part-${part}.${ext}`);
}

export function buildAudioContext(
  bookKey: string,
  sourcePath: string | null,
  chapterId: string,
  partIndex: number,
  extension: string,
): AudioFileContext {
  const chapterKey =
    filenameFromPath(sourcePath, "") || `chapter-${chapterId.slice(0, 8)}`;
  return {
    bookKey,
    chapterKey,
    partIndex,
    extension,
  };
}

export function audioUrlForRelativePath(relativePath: string): string {
  const encoded = relativePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `/api/audio/${encoded}`;
}

function resolveUnderBookAudioDir(relativePath: string): string | null {
  const normalized = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length < 2) return null;

  const bookKey = segments[0];
  const fileWithinAudio = segments.slice(1).join("/");
  const absolute = path.resolve(
    getAudioOutputDirForBook(bookKey),
    fileWithinAudio,
  );

  if (!isUnderWatchFolder(absolute)) return null;
  return absolute;
}

function resolveUnderLegacyOutputDir(relativePath: string): string | null {
  const root = path.resolve(getAudioOutputDir());
  const normalized = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
  const absolute = path.resolve(root, normalized);
  if (!absolute.startsWith(`${root}${path.sep}`) && absolute !== root) {
    return null;
  }
  return absolute;
}

export function resolveAudioFilePath(relativePath: string): string | null {
  const perBook = resolveUnderBookAudioDir(relativePath);
  if (perBook) {
    return perBook;
  }

  const legacy = resolveUnderLegacyOutputDir(relativePath);
  if (legacy && fsSync.existsSync(legacy)) {
    return legacy;
  }

  return null;
}

export function contentTypeForExtension(ext: string): string {
  switch (ext.toLowerCase().replace(/^\./, "")) {
    case "json":
      return "application/json";
    case "wav":
      return "audio/wav";
    case "mpeg":
    case "mp3":
      return "audio/mpeg";
    default:
      return "application/octet-stream";
  }
}

export function localAudioFileExists(relativePath: string): boolean {
  const absolute = resolveAudioFilePath(relativePath);
  if (!absolute) return false;
  try {
    return fsSync.existsSync(absolute);
  } catch {
    return false;
  }
}

/** Prefer a local audio file when present on disk. */
export function resolvePlaybackAudioUrl(
  audioPath: string | null | undefined,
  audioUrl: string | null | undefined,
): string | null {
  if (
    audioPath &&
    !audioPath.includes("://") &&
    localAudioFileExists(audioPath)
  ) {
    return audioUrlForRelativePath(audioPath);
  }
  return audioUrl ?? null;
}

export function isRemoteSupabaseAudioUrl(url: string | null | undefined): boolean {
  return Boolean(url?.includes("supabase.co/storage"));
}

export async function saveAudioFile(
  relativePath: string,
  buffer: Buffer,
): Promise<string> {
  const bookKey = bookKeyFromSourcePath(relativePath);
  let absolute: string | null = null;

  if (bookKey) {
    const normalized = relativePath.replace(/\\/g, "/");
    const fileWithinAudio = normalized.split("/").slice(1).join("/");
    ensureProjectAudioDir(bookKey);
    absolute = path.resolve(getAudioOutputDirForBook(bookKey), fileWithinAudio);
    if (!isUnderWatchFolder(absolute)) {
      throw new Error("Invalid audio output path");
    }
  } else {
    absolute = resolveUnderLegacyOutputDir(relativePath);
  }

  if (!absolute) {
    throw new Error("Invalid audio output path");
  }

  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, buffer);
  return relativePath.replace(/\\/g, "/");
}

export async function saveAlignmentFile(
  audioRelativePath: string,
  alignment: unknown,
): Promise<string> {
  const relativePath = alignmentRelativePathForAudio(audioRelativePath);
  const absolute = resolveAudioFilePath(relativePath);
  if (!absolute) {
    throw new Error("Invalid alignment output path");
  }
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, JSON.stringify(alignment, null, 2), "utf8");
  return relativePath.replace(/\\/g, "/");
}
