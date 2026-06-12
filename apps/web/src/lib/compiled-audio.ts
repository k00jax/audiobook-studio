import "server-only";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { audioUrlForRelativePath, resolveAudioFilePath, sanitizePathSegment } from "@/lib/audio-storage";
import { compareChapterOrder } from "@/lib/chapter-reorder";
import { chapterHasCurrentAudio } from "@/lib/chapter-status";
import type { ChapterRow, CompiledAudioEntry } from "@/lib/types";
import {
  concatMp3WithGap,
  probeAudioDurationSec,
} from "@/lib/ffmpeg-audio";
import { ensureProjectAudioDir, isUnderWatchFolder } from "@/lib/watch-library";
import { newId } from "@/lib/db";

export type { CompiledAudioEntry };

type ManifestFile = {
  version: 1;
  entries: CompiledAudioEntry[];
};

const MANIFEST_NAME = "compiled-manifest.json";
const COMPILE_GAP_SEC = 2;

function compiledDirForBook(bookKey: string): string {
  return path.join(ensureProjectAudioDir(bookKey), "compiled");
}

function manifestPath(bookKey: string): string {
  return path.join(compiledDirForBook(bookKey), MANIFEST_NAME);
}

function readManifest(bookKey: string): ManifestFile {
  const filePath = manifestPath(bookKey);
  if (!fs.existsSync(filePath)) {
    return { version: 1, entries: [] };
  }
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as ManifestFile;
    if (parsed?.version === 1 && Array.isArray(parsed.entries)) {
      return parsed;
    }
  } catch {
    /* ignore corrupt manifest */
  }
  return { version: 1, entries: [] };
}

function writeManifest(bookKey: string, manifest: ManifestFile): void {
  const dir = compiledDirForBook(bookKey);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, MANIFEST_NAME);
  if (!isUnderWatchFolder(filePath)) {
    throw new Error("Invalid manifest path");
  }
  fs.writeFileSync(filePath, JSON.stringify(manifest, null, 2), "utf8");
}

export function listCompiledAudio(bookKey: string): CompiledAudioEntry[] {
  return readManifest(bookKey).entries;
}

export function reorderCompiledAudio(
  bookKey: string,
  compiledIds: string[],
): CompiledAudioEntry[] {
  const manifest = readManifest(bookKey);
  const byId = new Map(manifest.entries.map((entry) => [entry.id, entry]));

  const reordered: CompiledAudioEntry[] = [];
  for (const id of compiledIds) {
    const entry = byId.get(id);
    if (entry) reordered.push(entry);
  }

  for (const entry of manifest.entries) {
    if (!compiledIds.includes(entry.id)) {
      reordered.push(entry);
    }
  }

  manifest.entries = reordered;
  writeManifest(bookKey, manifest);
  return reordered;
}

function readyPartAudioPaths(chapter: ChapterRow): string[] {
  return chapter.parts
    .filter((p) => p.status === "ready")
    .sort((a, b) => a.part_index - b.part_index)
    .map((p) => p.audio_path)
    .filter((p): p is string => Boolean(p))
    .map((relative) => resolveAudioFilePath(relative))
    .filter((p): p is string => Boolean(p));
}

export async function compileBookAudio(input: {
  bookKey: string;
  name: string;
  chapters: ChapterRow[];
  chapterIds: string[];
}): Promise<CompiledAudioEntry> {
  const trimmedName = input.name.trim();
  if (!trimmedName) {
    throw new Error("Name is required");
  }

  const selected = input.chapterIds
    .map((id) => input.chapters.find((ch) => ch.id === id))
    .filter((ch): ch is ChapterRow => Boolean(ch))
    .sort(compareChapterOrder);

  if (selected.length === 0) {
    throw new Error("Select at least one chapter");
  }

  for (const chapter of selected) {
    if (!chapterHasCurrentAudio(chapter)) {
      throw new Error(
        `"${chapter.title}" does not have up-to-date audio — dictate it first.`,
      );
    }
  }

  const segmentPaths: string[] = [];
  for (const chapter of selected) {
    const paths = readyPartAudioPaths(chapter);
    if (paths.length === 0) {
      throw new Error(`No audio files found for "${chapter.title}"`);
    }
    segmentPaths.push(...paths);
  }

  const merged = await concatMp3WithGap(segmentPaths, COMPILE_GAP_SEC);

  const bookSegment = sanitizePathSegment(input.bookKey);
  const baseFilename = sanitizePathSegment(trimmedName)
    .replace(/\s+/g, "-")
    .toLowerCase();
  const filename = `${baseFilename}.mp3`;
  const absolute = path.join(compiledDirForBook(input.bookKey), filename);

  if (!isUnderWatchFolder(absolute)) {
    throw new Error("Invalid compiled audio path");
  }

  const relativePath = `${bookSegment}/compiled/${filename}`;

  await fsPromises.mkdir(path.dirname(absolute), { recursive: true });
  await fsPromises.writeFile(absolute, merged);

  const durationSec =
    (await probeAudioDurationSec(absolute)) ||
    selected.reduce(
      (sum, ch) =>
        sum +
        ch.parts
          .filter((p) => p.status === "ready")
          .reduce((s, p) => s + (p.estimated_seconds ?? 0), 0),
      0,
    ) +
    Math.max(0, segmentPaths.length - 1) * COMPILE_GAP_SEC;

  const entry: CompiledAudioEntry = {
    id: newId(),
    name: trimmedName,
    filename,
    relativePath: relativePath.replace(/\\/g, "/"),
    audioUrl: audioUrlForRelativePath(relativePath.replace(/\\/g, "/")),
    chapterIds: selected.map((ch) => ch.id),
    chapterTitles: selected.map((ch) => ch.title),
    durationSec,
    createdAt: new Date().toISOString(),
  };

  const manifest = readManifest(input.bookKey);
  manifest.entries.push(entry);
  writeManifest(input.bookKey, manifest);

  return entry;
}

export function deleteCompiledAudio(bookKey: string, compiledId: string): boolean {
  const manifest = readManifest(bookKey);
  const index = manifest.entries.findIndex((e) => e.id === compiledId);
  if (index < 0) return false;

  const [removed] = manifest.entries.splice(index, 1);
  const absolute = resolveAudioFilePath(removed.relativePath);
  if (absolute && fs.existsSync(absolute)) {
    fs.unlinkSync(absolute);
  }
  writeManifest(bookKey, manifest);
  return true;
}
