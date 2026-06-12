import { spawn } from "node:child_process";

import fsSync from "node:fs";

import fs from "node:fs/promises";

import os from "node:os";

import path from "node:path";

import { ensureRootEnv } from "../env";

import { splitTextForTts } from "../tts-chunks";

import { concatWav } from "../wav-concat";
import type { AudioAlignment } from "../audio-alignment";

export type SynthesizedAudio = {
  buffer: Buffer;
  contentType: string;
  extension: string;
  alignment?: AudioAlignment;
};



const PIPER_MAX_CHARS = Number(process.env.PIPER_MAX_CHARS ?? "2000");



function resolveRepoRoot(): string {

  const cwd = process.cwd();

  const candidates = [cwd, path.join(cwd, "../.."), path.join(cwd, "../../..")];

  for (const candidate of candidates) {

    if (fsSync.existsSync(path.join(candidate, "package.json"))) {

      return candidate;

    }

  }

  return cwd;

}



async function exists(filePath: string): Promise<boolean> {

  try {

    await fs.access(filePath);

    return true;

  } catch {

    return false;

  }

}



export function getPiperConfig() {

  ensureRootEnv();

  const repoRoot = resolveRepoRoot();

  const dataDir =

    process.env.PIPER_DATA_DIR?.trim() ||

    path.join(repoRoot, "tools", "piper", "voices");



  return {

    python: process.env.PIPER_PYTHON?.trim() || "python",

    voice: process.env.PIPER_VOICE?.trim() || "en_US-lessac-medium",

    dataDir,

    modelPath:

      process.env.PIPER_MODEL?.trim() ||

      path.join(dataDir, "en_US-lessac-medium.onnx"),

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

          `Piper failed (exit ${code}): ${stderr.trim() || stdout.trim() || "unknown error"}`,

        ),

      );

    });

  });

}



export async function assertPiperReady(): Promise<void> {

  const { python, voice, dataDir, modelPath } = getPiperConfig();

  if (!(await exists(modelPath))) {

    throw new Error(

      `Piper voice model not found at ${modelPath}. Run: npm run setup:piper`,

    );

  }

  if (!(await exists(dataDir))) {

    throw new Error(

      `Piper voice directory not found at ${dataDir}. Run: npm run setup:piper`,

    );

  }



  try {

    await runCommand(python, ["-m", "piper", "--help"]);

  } catch (err) {

    const message = err instanceof Error ? err.message : "Piper not available";

    throw new Error(

      `${message}. Install with: pip install piper-tts (voice: ${voice})`,

    );

  }

}



async function synthesizePiperChunk(text: string): Promise<Buffer> {

  const { python, voice, dataDir } = getPiperConfig();

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "book-reader-piper-"));

  const inputFile = path.join(tmpDir, "input.txt");

  const outputFile = path.join(tmpDir, "output.wav");



  try {

    await fs.writeFile(inputFile, text, "utf8");

    await runCommand(python, [

      "-m",

      "piper",

      "-m",

      voice,

      "--data-dir",

      dataDir,

      "-f",

      outputFile,

      "--input-file",

      inputFile,

    ]);

    return fs.readFile(outputFile);

  } finally {

    await fs.rm(tmpDir, { recursive: true, force: true });

  }

}



export async function synthesizeWithPiper(text: string): Promise<SynthesizedAudio> {

  await assertPiperReady();

  const trimmed = text.trim();

  if (!trimmed) {

    throw new Error("Cannot synthesize empty text");

  }



  const chunks = splitTextForTts(trimmed, PIPER_MAX_CHARS);

  const wavBuffers: Buffer[] = [];



  for (const chunk of chunks) {

    wavBuffers.push(await synthesizePiperChunk(chunk));

  }



  return {

    buffer: concatWav(wavBuffers),

    contentType: "audio/wav",

    extension: "wav",

  };

}


