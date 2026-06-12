import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export function runCommand(
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
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} exited ${code}: ${stderr || stdout}`));
    });
  });
}

export async function generateSilenceMp3(durationSec: number): Promise<Buffer> {
  if (durationSec <= 0) return Buffer.alloc(0);

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "book-reader-silence-"));
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

export async function concatMp3Buffers(buffers: Buffer[]): Promise<Buffer> {
  const nonEmpty = buffers.filter((buffer) => buffer.length > 0);
  if (nonEmpty.length === 0) {
    throw new Error("Cannot concatenate empty audio");
  }
  if (nonEmpty.length === 1) return nonEmpty[0];

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "book-reader-concat-"));
  try {
    const partPaths: string[] = [];
    for (let i = 0; i < nonEmpty.length; i++) {
      const partPath = path.join(tmpDir, `part-${i}.mp3`);
      await fs.writeFile(partPath, nonEmpty[i]);
      partPaths.push(partPath);
    }

    const listFile = path.join(tmpDir, "list.txt");
    const listBody = partPaths
      .map((p) => `file '${p.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`)
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

/** Insert silence between each segment; no trailing silence after the last segment. */
export async function concatMp3WithGap(
  segmentPaths: string[],
  gapSec: number,
): Promise<Buffer> {
  if (segmentPaths.length === 0) {
    throw new Error("No audio segments to compile");
  }

  const buffers: Buffer[] = [];
  const silence =
    gapSec > 0 && segmentPaths.length > 1
      ? await generateSilenceMp3(gapSec)
      : Buffer.alloc(0);

  for (let i = 0; i < segmentPaths.length; i++) {
    buffers.push(await fs.readFile(segmentPaths[i]));
    if (silence.length > 0 && i < segmentPaths.length - 1) {
      buffers.push(silence);
    }
  }

  return concatMp3Buffers(buffers);
}

export async function probeAudioDurationSec(absolutePath: string): Promise<number> {
  try {
    const { stdout } = await runCommand("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      absolutePath,
    ]);
    const sec = Number(stdout.trim());
    return Number.isFinite(sec) && sec > 0 ? sec : 0;
  } catch {
    return 0;
  }
}
