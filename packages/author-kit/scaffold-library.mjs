#!/usr/bin/env node
/**
 * Scaffold a new author library folder with CLAUDE.md, README, and a sample book.
 * Usage: node packages/author-kit/scaffold-library.mjs "C:\Users\You\OneDrive\My Audiobooks"
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templatesDir = path.join(__dirname, "templates");

function copyTemplate(relativePath, libraryRoot) {
  const src = path.join(templatesDir, relativePath);
  const dest = path.join(libraryRoot, relativePath);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (!fs.existsSync(dest)) {
    fs.copyFileSync(src, dest);
    console.log(`  created ${relativePath}`);
  } else {
    console.log(`  skip (exists) ${relativePath}`);
  }
}

function main() {
  const libraryRoot = process.argv[2]?.trim();
  if (!libraryRoot) {
    console.error(
      "Usage: node packages/author-kit/scaffold-library.mjs <library-folder-path>",
    );
    process.exit(1);
  }

  const resolved = path.resolve(libraryRoot);
  fs.mkdirSync(resolved, { recursive: true });

  console.log(`Scaffolding library at:\n  ${resolved}\n`);

  copyTemplate("CLAUDE.md", resolved);
  copyTemplate("README.md", resolved);
  copyTemplate("My First Book/ch01_sample.md", resolved);

  const audioDir = path.join(resolved, "My First Book", "AUDIO");
  const notesDir = path.join(resolved, "My First Book", "Notes");
  fs.mkdirSync(audioDir, { recursive: true });
  fs.mkdirSync(notesDir, { recursive: true });
  console.log("  created My First Book/AUDIO/");
  console.log("  created My First Book/Notes/");

  console.log("\nDone. Set WATCH_FOLDER to this path in your .env file.");
}

main();
