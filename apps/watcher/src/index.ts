import { config as loadEnv } from "dotenv";
import { watch } from "chokidar";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../..");
loadEnv({ path: path.join(repoRoot, ".env") });

const WATCH_FOLDER = process.env.WATCH_FOLDER;
const INGEST_API_KEY = process.env.INGEST_API_KEY?.replace(/^["']|["']$/g, "").trim();

if (!WATCH_FOLDER) {
  console.error("Set WATCH_FOLDER to the library root (parent of project folders).");
  process.exit(1);
}

if (!INGEST_API_KEY) {
  console.error("Set INGEST_API_KEY (must match the web app).");
  process.exit(1);
}

function normalizeBaseUrl(raw: string): string {
  return raw.replace(/\/$/, "").replace("://localhost", "://127.0.0.1");
}

let webAppBaseUrl = normalizeBaseUrl(
  process.env.WEB_APP_URL ?? "http://127.0.0.1:3001",
);

const EXTENSIONS = new Set([".md", ".txt", ".markdown"]);

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function pingWebApp(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function discoverWebAppUrl(): Promise<string | null> {
  if (await pingWebApp(webAppBaseUrl)) return webAppBaseUrl;

  const configuredPort = Number(new URL(webAppBaseUrl).port || "3000");
  const ports = [3000, 3001, 3002, 3003, configuredPort].filter(
    (p, i, a) => a.indexOf(p) === i,
  );

  for (const port of ports) {
    const candidate = `http://127.0.0.1:${port}`;
    if (candidate === webAppBaseUrl) continue;
    if (await pingWebApp(candidate)) {
      console.log(
        `Web app found at ${candidate} (set WEB_APP_URL=${candidate} in .env to skip auto-detect)`,
      );
      return candidate;
    }
  }
  return null;
}

async function waitForWebApp(maxAttempts = 45): Promise<boolean> {
  for (let i = 1; i <= maxAttempts; i++) {
    const found = await discoverWebAppUrl();
    if (found) {
      webAppBaseUrl = found;
      return true;
    }
    if (i === 1) {
      console.log(`Waiting for web app (configured: ${webAppBaseUrl}) …`);
    }
    await sleep(2000);
  }
  return false;
}

function formatFetchError(err: unknown): string {
  if (err instanceof TypeError && err.message === "fetch failed") {
    const cause = (err as NodeJS.ErrnoException).cause as
      | { code?: string }
      | undefined;
    if (cause?.code === "ECONNREFUSED") {
      return `Web app not reachable at ${webAppBaseUrl} — is "npm run dev" running?`;
    }
  }
  return err instanceof Error ? err.message : String(err);
}

function bookFromSourcePath(sourcePath: string): {
  bookSourceKey: string;
  bookTitle: string;
} | null {
  const segments = sourcePath.split("/").filter(Boolean);
  if (segments.length < 2) return null;
  const bookSourceKey = segments[0];
  return { bookSourceKey, bookTitle: bookSourceKey };
}

function shouldIgnorePath(filePath: string): boolean {
  const rel = path.relative(WATCH_FOLDER!, filePath).replace(/\\/g, "/");
  if (!rel || rel.startsWith("..")) return true;
  const segments = rel.split("/");
  if (segments.includes("AUDIO")) return true;
  return false;
}

async function ingestFile(filePath: string) {
  if (shouldIgnorePath(filePath)) return;

  const ext = path.extname(filePath).toLowerCase();
  if (!EXTENSIONS.has(ext)) return;

  if (!(await pingWebApp(webAppBaseUrl))) {
    const found = await discoverWebAppUrl();
    if (!found) {
      console.error(
        `Skipping ${path.basename(filePath)} — web app not running. Start: npm run dev`,
      );
      return;
    }
    webAppBaseUrl = found;
  }

  const content = await readFile(filePath, "utf8");
  const rel = path.relative(WATCH_FOLDER!, filePath).replace(/\\/g, "/");
  const book = bookFromSourcePath(rel);
  if (!book) {
    console.warn(`Skipping ${rel} — place chapter files inside a project folder.`);
    return;
  }

  const chapterSourcePath = rel.slice(book.bookSourceKey.length + 1);
  const chapterTitle = path.basename(filePath, path.extname(filePath));

  let res: Response;
  try {
    res = await fetch(`${webAppBaseUrl}/api/ingest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ingest-key": INGEST_API_KEY!,
      },
      body: JSON.stringify({
        chapterTitle,
        sourcePath: chapterSourcePath,
        bookTitle: book.bookTitle,
        bookSourceKey: book.bookSourceKey,
        content,
      }),
    });
  } catch (err) {
    console.error(`Ingest failed for ${rel}: ${formatFetchError(err)}`);
    return;
  }

  const data = await res.json();
  if (!res.ok) {
    console.error(
      `Ingest failed for ${rel} (${res.status}):`,
      data.error ?? res.statusText,
    );
    return;
  }

  if (data.unchanged) {
    console.log(`Unchanged ${rel}`);
    return;
  }

  console.log(
    `Ingested ${rel}: ${data.sectionCount} sections → ${data.partCount} parts`,
  );
}

const pending = new Map<string, ReturnType<typeof setTimeout>>();

function schedule(filePath: string) {
  if (shouldIgnorePath(filePath)) return;

  const existing = pending.get(filePath);
  if (existing) clearTimeout(existing);
  pending.set(
    filePath,
    setTimeout(() => {
      pending.delete(filePath);
      void ingestFile(filePath).catch((err) =>
        console.error(path.basename(filePath), formatFetchError(err)),
      );
    }, 800),
  );
}

console.log(`Watching ${WATCH_FOLDER} (project subfolders) → ${webAppBaseUrl}`);

const ready = await waitForWebApp();
if (ready) {
  console.log(`Web app ready at ${webAppBaseUrl}`);
} else {
  console.warn(`
Web app not detected yet — watcher will stay running.
Start in another terminal:  npm run dev
Then touch/save a chapter file to trigger ingest, or restart the watcher.
`);
}

const watcher = watch(WATCH_FOLDER, {
  ignored: (watchPath) => shouldIgnorePath(watchPath),
  persistent: true,
  ignoreInitial: !ready,
  depth: 99,
});

watcher.on("add", schedule);
watcher.on("change", schedule);

if (ready) {
  console.log("Scanning existing chapter files…");
  try {
    const res = await fetch(`${webAppBaseUrl}/api/sync`, {
      method: "POST",
      headers: { "x-ingest-key": INGEST_API_KEY! },
    });
    const data = await res.json();
    if (res.ok) {
      console.log(
        `Library sync: ${data.ingested} ingested, ${data.unchanged} unchanged`,
      );
    } else {
      console.warn("Library sync failed:", data.error ?? res.statusText);
    }
  } catch (err) {
    console.warn("Library sync failed:", formatFetchError(err));
  }
}
