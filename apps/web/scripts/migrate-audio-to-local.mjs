/**
 * Copy existing Supabase-hosted audio into generated-audio/ and update DB rows.
 * Run once after switching to local audio storage.
 *
 *   npm run migrate:audio-local
 */
import { config as loadEnv } from "dotenv";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../..");
loadEnv({ path: path.join(repoRoot, ".env") });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const userId = process.env.WATCHER_USER_ID;

if (!url || !key || !userId) {
  console.error(
    "Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, WATCHER_USER_ID",
  );
  process.exit(1);
}

const supabase = createClient(url, key);

function getAudioOutputDir() {
  const configured = process.env.AUDIO_OUTPUT_DIR?.trim();
  if (configured) {
    return path.isAbsolute(configured)
      ? configured
      : path.resolve(repoRoot, configured);
  }
  return path.join(repoRoot, "generated-audio");
}

function filenameFromPath(sourcePath, fallback = "") {
  if (!sourcePath) return fallback;
  const base = sourcePath.split("/").pop() ?? fallback;
  return base.replace(/\.(md|markdown|txt)$/i, "") || fallback;
}

function sanitizeSegment(name) {
  return (
    name
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) || "untitled"
  );
}

function buildRelativePath(bookKey, sourcePath, chapterId, partIndex, ext) {
  const book = sanitizeSegment(bookKey);
  const chapter =
    sanitizeSegment(filenameFromPath(sourcePath, "")) ||
    `chapter-${chapterId.slice(0, 8)}`;
  const extension = (ext || "mp3").replace(/^\./, "");
  if (partIndex === 0) {
    return path.posix.join(book, `${chapter}.${extension}`);
  }
  const part = String(partIndex + 1).padStart(2, "0");
  return path.posix.join(book, `${chapter}-part-${part}.${extension}`);
}

function audioUrlForRelativePath(relativePath) {
  return `/api/audio/${relativePath
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/")}`;
}

function extensionFromUrlOrPath(audioUrl, audioPath) {
  const fromPath = path.extname(audioPath ?? "").replace(/^\./, "");
  if (fromPath) return fromPath;
  try {
    const u = new URL(audioUrl);
    return path.extname(u.pathname).replace(/^\./, "") || "mp3";
  } catch {
    return "mp3";
  }
}

async function downloadFromSupabaseStorage(storagePath) {
  const { data, error } = await supabase.storage
    .from("audio")
    .download(storagePath);
  if (error) throw error;
  return Buffer.from(await data.arrayBuffer());
}

async function downloadAudio(part, userId) {
  if (part.audio_url?.includes("supabase.co/storage")) {
    const res = await fetch(part.audio_url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${part.audio_url}`);
    return Buffer.from(await res.arrayBuffer());
  }

  const ext = extensionFromUrlOrPath(part.audio_url, part.audio_path);
  const legacyPath = `${userId}/${part.chapter_id}/${part.part_index}.${ext}`;
  try {
    return await downloadFromSupabaseStorage(legacyPath);
  } catch {
    // fall through
  }

  if (part.audio_path && !part.audio_path.startsWith("/api/")) {
    return downloadFromSupabaseStorage(part.audio_path);
  }

  throw new Error("No downloadable audio source");
}

async function main() {
  const outputDir = getAudioOutputDir();
  await fs.mkdir(outputDir, { recursive: true });
  console.log(`Audio output: ${outputDir}`);

  const { data: parts, error } = await supabase
    .from("parts")
    .select(
      `
      id,
      part_index,
      chapter_id,
      audio_path,
      audio_url,
      status,
      chapters (
        id,
        source_path,
        books ( source_key, title )
      )
    `,
    )
    .eq("user_id", userId)
    .eq("status", "ready")
    .not("audio_url", "is", null);

  if (error) throw error;

  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const part of parts ?? []) {
    const chapter = part.chapters;
    if (!chapter) {
      skipped++;
      continue;
    }

    const book = chapter.books;
    const bookKey = book?.source_key ?? book?.title ?? "book";
    const ext = extensionFromUrlOrPath(part.audio_url, part.audio_path);
    const relativePath = buildRelativePath(
      bookKey,
      chapter.source_path,
      chapter.id,
      part.part_index,
      ext,
    );
    const absolutePath = path.join(outputDir, ...relativePath.split("/"));

    if (fsSync.existsSync(absolutePath)) {
      if (
        part.audio_path === relativePath &&
        part.audio_url?.startsWith("/api/audio/")
      ) {
        skipped++;
        continue;
      }
      await supabase
        .from("parts")
        .update({
          audio_path: relativePath,
          audio_url: audioUrlForRelativePath(relativePath),
        })
        .eq("id", part.id);
      migrated++;
      console.log(`Updated DB (file exists): ${relativePath}`);
      continue;
    }

    try {
      const buffer = await downloadAudio(part, userId);
      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      await fs.writeFile(absolutePath, buffer);

      await supabase
        .from("parts")
        .update({
          audio_path: relativePath,
          audio_url: audioUrlForRelativePath(relativePath),
        })
        .eq("id", part.id);

      migrated++;
      console.log(`Migrated: ${relativePath}`);
    } catch (err) {
      failed++;
      console.error(
        `Failed part ${part.id}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  console.log(
    `\nDone. Migrated/updated: ${migrated}, skipped: ${skipped}, failed: ${failed}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
