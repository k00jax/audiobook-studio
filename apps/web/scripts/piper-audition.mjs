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
const sampleText =
  process.argv.slice(2).join(" ").trim() ||
  "The unexamined life is not worth living. This is Piper, a fast local voice running on your machine.";

const outDir = path.join(repoRoot, "tools", "piper");
const outFile = path.join(outDir, "audition.wav");

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
  fs.mkdirSync(outDir, { recursive: true });
  const modelPath = path.join(voicesDir, `${voice}.onnx`);
  if (!fs.existsSync(modelPath)) {
    console.error(`Voice model not found: ${modelPath}`);
    console.error("Run: npm run setup:piper");
    process.exit(1);
  }

  await run(python, [
    "-m",
    "piper",
    "-m",
    voice,
    "--data-dir",
    voicesDir,
    "-f",
    outFile,
    "--",
    sampleText,
  ]);

  console.log("");
  console.log(`Saved: ${outFile}`);
  console.log("Opening in your default audio player...");

  if (process.platform === "win32") {
    await run("cmd", ["/c", "start", "", outFile]);
  } else if (process.platform === "darwin") {
    await run("open", [outFile]);
  } else {
    await run("xdg-open", [outFile]);
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
