import { config as loadEnv } from "dotenv";
import fs from "node:fs";
import path from "node:path";

let loaded = false;

function tryLoad(envPath: string): boolean {
  if (!fs.existsSync(envPath)) return false;
  const result = loadEnv({ path: envPath, override: false });
  return !result.error;
}

/** Load repo-root .env for API routes (bundled paths break import.meta.url). */
export function ensureRootEnv() {
  if (loaded) return;

  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, ".env.local"),
    path.join(cwd, ".env"),
    path.join(cwd, "../../.env"),
    path.join(cwd, "../../../.env"),
  ];

  for (const envPath of candidates) {
    if (tryLoad(envPath)) break;
  }

  loaded = true;
}

export function getIngestApiKey(): string | undefined {
  ensureRootEnv();
  const key = process.env.INGEST_API_KEY;
  return key?.replace(/^["']|["']$/g, "").trim();
}

export function getEnv(name: string): string | undefined {
  ensureRootEnv();
  const val = process.env[name];
  return val?.replace(/^["']|["']$/g, "").trim();
}
