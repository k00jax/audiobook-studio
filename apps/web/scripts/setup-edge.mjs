#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const python = process.env.EDGE_PYTHON?.trim() || "python";
const voice = process.env.EDGE_VOICE?.trim() || "en-US-AndrewNeural";

function run(command, args) {
  return new Promise((resolve, reject) => {
    console.log(`> ${command} ${args.join(" ")}`);
    const child = spawn(command, args, { stdio: "inherit", shell: false });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

async function main() {
  console.log("Installing edge-tts (Python)...");
  await run(python, ["-m", "pip", "install", "edge-tts"]);

  console.log("");
  console.log("Edge TTS is ready (free Microsoft neural voices, requires internet).");
  console.log("");
  console.log("Add to your .env:");
  console.log("TTS_PROVIDER=edge");
  console.log(`EDGE_VOICE=${voice}`);
  console.log("");
  console.log("Popular voices:");
  console.log("  en-US-AndrewNeural   (male, natural)");
  console.log("  en-US-AriaNeural     (female)");
  console.log("  en-US-GuyNeural      (male)");
  console.log("  en-US-JennyNeural    (female)");
  console.log("");
  console.log("List all: python -m edge_tts --list-voices");
  console.log("Try it:  npm run edge:test");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
