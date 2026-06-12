#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");
const python = process.env.EDGE_PYTHON?.trim() || "python";
const voice = process.env.EDGE_VOICE?.trim() || "en-US-AndrewNeural";
const sampleRaw =
  process.argv.slice(2).join(" ").trim() ||
  "# Preface\n\nThe unexamined life is not worth living. This is Microsoft Edge neural speech — no hash symbol spoken.";

function prepareTextForTts(text) {
  return text
    .split("\n")
    .map((line) => {
      let out = line.replace(/^#{1,6}\s+/, "");
      out = out.replace(/(^|\s)#(\w[\w-]*)/g, "$1$2");
      return out;
    })
    .join("\n")
    .trim();
}

const sampleText = prepareTextForTts(sampleRaw);

const outDir = path.join(repoRoot, "tools", "edge");
const outFile = path.join(outDir, "audition.mp3");
const scriptPath = path.join(__dirname, "edge-synthesize.py");
const inputFile = path.join(outDir, "audition-input.txt");

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
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(inputFile, sampleText, "utf8");

  await run(python, [
    scriptPath,
    "--voice",
    voice,
    "--input",
    inputFile,
    "--output",
    outFile,
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
