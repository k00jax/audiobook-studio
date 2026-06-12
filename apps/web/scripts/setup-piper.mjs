#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");
const voicesDir = path.join(repoRoot, "tools", "piper", "voices");
const voice = process.env.PIPER_VOICE?.trim() || "en_US-lessac-medium";
const python = process.env.PIPER_PYTHON?.trim() || "python";

function run(command, args) {
  return new Promise((resolve, reject) => {
    console.log(`> ${command} ${args.join(" ")}`);
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: false,
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

async function main() {
  fs.mkdirSync(voicesDir, { recursive: true });

  console.log("Installing piper-tts (Python)...");
  await run(python, ["-m", "pip", "install", "piper-tts"]);

  console.log(`Downloading voice: ${voice}`);
  await run(python, [
    "-m",
    "piper.download_voices",
    voice,
    "--data-dir",
    voicesDir,
  ]);

  const modelPath = path.join(voicesDir, `${voice}.onnx`);
  if (!fs.existsSync(modelPath)) {
    throw new Error(`Voice model missing after download: ${modelPath}`);
  }

  console.log("");
  console.log("Piper is ready.");
  console.log(`Voice model: ${modelPath}`);
  console.log("");
  console.log("Add to your .env:");
  console.log("TTS_PROVIDER=piper");
  console.log(`PIPER_VOICE=${voice}`);
  console.log(`PIPER_DATA_DIR=${voicesDir}`);
  console.log("");
  console.log("Try it: npm run piper:test");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
