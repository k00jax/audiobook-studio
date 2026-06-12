import type { NextConfig } from "next";
import { config as loadEnv } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(appDir, "../..");

// Monorepo: single .env at repo root (not apps/web)
loadEnv({ path: path.join(repoRoot, ".env") });

const nextConfig: NextConfig = {
  transpilePackages: ["@book-reader/core"],
  outputFileTracingRoot: repoRoot,
  serverExternalPackages: ["better-sqlite3"],
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
