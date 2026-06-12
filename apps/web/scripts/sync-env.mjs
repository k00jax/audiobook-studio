import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoEnv = path.join(webRoot, "../../.env");
const localEnv = path.join(webRoot, ".env.local");

if (!fs.existsSync(repoEnv)) {
  console.warn(`sync-env: missing ${repoEnv}`);
  process.exit(0);
}

fs.copyFileSync(repoEnv, localEnv);
console.log("sync-env: copied root .env → apps/web/.env.local");
