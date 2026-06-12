import { spawn } from "node:child_process";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  type AudioAlignment,
  isAudioAlignment,
} from "../audio-alignment";
import { ensureRootEnv } from "../env";
import { splitTextForTts } from "../tts-chunks";
import {
  getHeaderPauseDurations,
  parseTtsSegments,
} from "../tts-text";
import type { SynthesizedAudio } from "./piper";

const EDGE_MAX_CHARS = Number(process.env.EDGE_MAX_CHARS ?? "4000");

function edgeScriptPath(): string {
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, "apps/web/scripts/edge-synthesize.py"),
    path.join(cwd, "scripts/edge-synthesize.py"),
    path.join(cwd, "../apps/web/scripts/edge-synthesize.py"),
    path.join(cwd, "../../apps/web/scripts/edge-synthesize.py"),
  ];
  for (const candidate of candidates) {
    if (fsSync.existsSync(candidate)) return candidate;
  }
  return path.join(cwd, "apps/web/scripts/edge-synthesize.py");
}

export function getEdgeConfig() {
  ensureRootEnv();
  return {
    python: process.env.EDGE_PYTHON?.trim() || "python",
    voice: process.env.EDGE_VOICE?.trim() || "en-US-AndrewNeural",
    scriptPath: process.env.EDGE_SCRIPT?.trim() || edgeScriptPath(),
  };
}

function runCommand(
  command: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(
        new Error(
          `Edge TTS failed (exit ${code}): ${stderr.trim() || stdout.trim() || "unknown error"}`,
        ),
      );
    });
  });
}

export async function assertEdgeReady(): Promise<void> {
  const { python } = getEdgeConfig();
  try {
    await runCommand(python, ["-m", "edge_tts", "--version"]);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Edge TTS not available";
    throw new Error(
      `${message}. Install with: pip install edge-tts (or npm run setup:edge)`,
    );
  }
}

function paragraphCount(text: string): number {
  if (!text.trim()) return 0;
  return text.split(/\n\n+/).length;
}

async function synthesizeEdgeChunk(
  text: string,
): Promise<{ buffer: Buffer; alignment: AudioAlignment | null }> {
  const { python, voice, scriptPath } = getEdgeConfig();
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "book-reader-edge-"));
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

    const buffer = await fs.readFile(outputFile);
    let alignment: AudioAlignment | null = null;
    try {
      const raw = JSON.parse(await fs.readFile(alignmentFile, "utf8")) as unknown;
      if (isAudioAlignment(raw)) alignment = raw;
    } catch {
      alignment = null;
    }

    return { buffer, alignment };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

async function generateSilenceMp3(durationSec: number): Promise<Buffer> {
  if (durationSec <= 0) {
    return Buffer.alloc(0);
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "book-reader-edge-silence-"));
  const outputFile = path.join(tmpDir, "silence.mp3");
  try {
    await runCommand("ffmpeg", [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "anullsrc=r=24000:cl=mono",
      "-t",
      String(durationSec),
      "-c:a",
      "libmp3lame",
      "-q:a",
      "9",
      outputFile,
    ]);
    return fs.readFile(outputFile);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

async function concatMp3WithFfmpeg(buffers: Buffer[]): Promise<Buffer> {
  const nonEmpty = buffers.filter((buffer) => buffer.length > 0);
  if (nonEmpty.length === 0) {
    throw new Error("Cannot concatenate empty audio");
  }
  if (nonEmpty.length === 1) return nonEmpty[0];

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "book-reader-edge-concat-"));
  try {
    const partPaths: string[] = [];
    for (let i = 0; i < nonEmpty.length; i++) {
      const partPath = path.join(tmpDir, `part-${i}.mp3`);
      await fs.writeFile(partPath, nonEmpty[i]);
      partPaths.push(partPath);
    }

    const listFile = path.join(tmpDir, "list.txt");
    const listBody = partPaths
      .map((p) => `file '${p.replace(/\\/g, "/")}'`)
      .join("\n");
    await fs.writeFile(listFile, listBody, "utf8");

    const outputFile = path.join(tmpDir, "merged.mp3");
    await runCommand("ffmpeg", [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listFile,
      "-c",
      "copy",
      outputFile,
    ]);
    return fs.readFile(outputFile);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

async function mergeMp3Chunks(buffers: Buffer[]): Promise<Buffer> {
  const nonEmpty = buffers.filter((buffer) => buffer.length > 0);
  if (nonEmpty.length === 0) {
    throw new Error("Cannot merge empty audio");
  }
  if (nonEmpty.length === 1) return nonEmpty[0];
  try {
    return await concatMp3WithFfmpeg(nonEmpty);
  } catch {
    throw new Error(
      "Edge TTS produced multiple chunks; install ffmpeg on PATH to merge long chapters, or shorten parts.",
    );
  }
}

type SpeechPiece = {
  kind: "speech";
  buffer: Buffer;
  alignment: AudioAlignment | null;
  paragraphCount: number;
};

type SilencePiece = {
  kind: "silence";
  durationSec: number;
  buffer: Buffer;
};

type AudioPiece = SpeechPiece | SilencePiece;

function mergePiecesWithSilence(
  pieces: AudioPiece[],
): AudioAlignment | undefined {
  const speechPieces = pieces.filter(
    (piece): piece is SpeechPiece => piece.kind === "speech",
  );
  if (speechPieces.some((piece) => !piece.alignment)) {
    return undefined;
  }

  let timeOffset = 0;
  let paragraphOffset = 0;
  const mergedParagraphs: AudioAlignment["paragraphs"] = [];

  for (const piece of pieces) {
    if (piece.kind === "silence") {
      timeOffset += piece.durationSec;
      continue;
    }

    const alignment = piece.alignment!;
    for (const paragraph of alignment.paragraphs) {
      mergedParagraphs.push({
        index: paragraphOffset + paragraph.index,
        startSec: paragraph.startSec + timeOffset,
        endSec: paragraph.endSec + timeOffset,
      });
    }
    paragraphOffset += piece.paragraphCount;
    timeOffset += alignment.durationSec;
  }

  return {
    version: 1,
    durationSec: timeOffset,
    paragraphs: mergedParagraphs,
  };
}

async function synthesizeSpeechText(text: string): Promise<AudioPiece[]> {
  const chunks = splitTextForTts(text.trim(), EDGE_MAX_CHARS);
  const pieces: AudioPiece[] = [];

  for (const chunk of chunks) {
    const result = await synthesizeEdgeChunk(chunk);
    pieces.push({
      kind: "speech",
      buffer: result.buffer,
      alignment: result.alignment,
      paragraphCount: paragraphCount(chunk),
    });
  }

  return pieces;
}

export async function synthesizeWithEdge(text: string): Promise<SynthesizedAudio> {
  await assertEdgeReady();
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("Cannot synthesize empty text");
  }

  ensureRootEnv();
  const { beforeMs, afterMs } = getHeaderPauseDurations();
  const beforeSec = beforeMs / 1000;
  const afterSec = afterMs / 1000;

  const segments = parseTtsSegments(trimmed);
  const pieces: AudioPiece[] = [];

  for (const segment of segments) {
    if (segment.kind === "header") {
      if (beforeSec > 0) {
        pieces.push({
          kind: "silence",
          durationSec: beforeSec,
          buffer: await generateSilenceMp3(beforeSec),
        });
      }

      const headerSpeech = await synthesizeSpeechText(segment.text);
      pieces.push(...headerSpeech);

      if (afterSec > 0) {
        pieces.push({
          kind: "silence",
          durationSec: afterSec,
          buffer: await generateSilenceMp3(afterSec),
        });
      }
      continue;
    }

    pieces.push(...(await synthesizeSpeechText(segment.text)));
  }

  const mp3Buffers = pieces.map((piece) => piece.buffer);
  const mergedAlignment = mergePiecesWithSilence(pieces);

  return {
    buffer: await mergeMp3Chunks(mp3Buffers),
    contentType: "audio/mpeg",
    extension: "mp3",
    alignment: mergedAlignment,
  };
}
