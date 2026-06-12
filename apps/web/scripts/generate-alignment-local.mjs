/**
 * Generate paragraph alignment sidecars for existing audio (Edge TTS only).
 * Re-synthesizes speech to capture word-boundary timing — does not replace MP3s.
 *
 *   npm run align:audio-local
 */
import { config as loadEnv } from "dotenv";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

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

if ((process.env.TTS_PROVIDER ?? "edge").trim() !== "edge") {
  console.error("align:audio-local requires TTS_PROVIDER=edge");
  process.exit(1);
}

const dbPath = getLibraryDbPath();
if (!fsSync.existsSync(dbPath)) {
  console.error(`Library database not found: ${dbPath}`);
  process.exit(1);
}

const db = new Database(dbPath);

function getAudioOutputDir() {
  const configured = process.env.AUDIO_OUTPUT_DIR?.trim();
  if (configured) {
    return path.isAbsolute(configured)
      ? configured
      : path.resolve(repoRoot, configured);
  }
  return path.join(repoRoot, "generated-audio");
}

function resolveAudioFilePath(relativePath) {
  const root = path.resolve(getAudioOutputDir());
  const normalized = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
  const absolute = path.resolve(root, normalized);
  if (!absolute.startsWith(root + path.sep) && absolute !== root) return null;
  return absolute;
}

function alignmentRelativePathForAudio(relativeAudioPath) {
  return relativeAudioPath.replace(/\.(mp3|wav|mpeg)$/i, ".alignment.json");
}

function prepareTextForTts(text) {
  const lines = text.split("\n").map((line) => {
    let out = line.replace(/^#{1,6}\s+/, "");
    out = out.replace(/(^|\s)#(\w[\w-]*)/g, "$1$2");
    return out;
  });
  return lines.join("\n").trim();
}

function edgeScriptPath() {
  const candidate = path.join(repoRoot, "apps/web/scripts/edge-synthesize.py");
  return candidate;
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(undefined);
      else reject(new Error(stderr.trim() || `exit ${code}`));
    });
  });
}

async function synthesizeAlignment(text) {
  const python = process.env.EDGE_PYTHON?.trim() || "python";
  const voice = process.env.EDGE_VOICE?.trim() || "en-US-AndrewNeural";
  const scriptPath = process.env.EDGE_SCRIPT?.trim() || edgeScriptPath();
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "book-reader-align-"));
  const inputFile = path.join(tmpDir, "input.txt");
  const outputFile = path.join(tmpDir, "output.mp3");
  const alignmentFile = path.join(tmpDir, "output.alignment.json");

  try {
    await fs.writeFile(inputFile, text, "utf8");
    await runCommand(python, [
      scriptPath,
      "--voice",
      voice,
      "--input",
      inputFile,
      "--output",
      outputFile,
      "--alignment",
      alignmentFile,
    ]);
    return JSON.parse(await fs.readFile(alignmentFile, "utf8"));
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

async function main() {
  console.log(`Audio folder: ${getAudioOutputDir()}`);

  const parts = db
    .prepare(
      `
      SELECT p.id, p.body, p.audio_path, p.status, c.title AS chapter_title
      FROM parts p
      JOIN chapters c ON c.id = p.chapter_id
      WHERE p.status = 'ready' AND p.audio_path IS NOT NULL
    `,
    )
    .all();

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const part of parts ?? []) {
    if (!part.audio_path || !part.body?.trim()) {
      skipped++;
      continue;
    }

    const alignRelative = alignmentRelativePathForAudio(part.audio_path);
    const alignAbsolute = resolveAudioFilePath(alignRelative);
    if (alignAbsolute && fsSync.existsSync(alignAbsolute)) {
      skipped++;
      continue;
    }

    const title = part.chapter_title ?? part.id.slice(0, 8);
    process.stdout.write(`Aligning: ${title}… `);

    try {
      const prepared = prepareTextForTts(part.body);
      const alignment = await synthesizeAlignment(prepared);
      if (!alignment?.paragraphs?.length) {
        console.log("no paragraphs");
        failed++;
        continue;
      }

      if (!alignAbsolute) throw new Error("Invalid alignment path");
      await fs.mkdir(path.dirname(alignAbsolute), { recursive: true });
      await fs.writeFile(
        alignAbsolute,
        JSON.stringify(alignment, null, 2),
        "utf8",
      );
      console.log(`ok (${alignment.paragraphs.length} paragraphs)`);
      created++;
    } catch (err) {
      console.log("failed");
      console.error(err instanceof Error ? err.message : err);
      failed++;
    }
  }

  console.log(`Done — created ${created}, skipped ${skipped}, failed ${failed}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
