import "server-only";
import fs from "node:fs";
import path from "node:path";
import { ensureRootEnv } from "./env";

function repoRoot(): string {
  const cwd = process.cwd();
  const candidates = [cwd, path.join(cwd, ".."), path.join(cwd, "../..")];
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "package.json"))) {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(candidate, "package.json"), "utf8"),
      ) as { workspaces?: string[] };
      if (pkg.workspaces) return candidate;
    }
  }
  return path.join(cwd, "../..");
}

/** Root folder containing one subfolder per book/project. */
export function getWatchFolder(): string {
  ensureRootEnv();
  const configured = process.env.WATCH_FOLDER?.trim();
  if (!configured) {
    throw new Error("WATCH_FOLDER is not configured");
  }
  return path.isAbsolute(configured)
    ? configured
    : path.resolve(repoRoot(), configured);
}

/** Immediate subfolders of WATCH_FOLDER — each is a book/project. */
export function listProjectFolderNames(): string[] {
  const root = getWatchFolder();
  if (!fs.existsSync(root)) return [];

  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

export function bookKeyFromSourcePath(sourcePath: string | null): string | null {
  if (!sourcePath) return null;
  const [first] = sourcePath.split("/").filter(Boolean);
  return first ?? null;
}

/** Each project stores dictated audio in `{project}/AUDIO/`. */
export function getAudioOutputDirForBook(bookKey: string): string {
  return path.join(getWatchFolder(), bookKey, "AUDIO");
}

/** Listener notes and bookmarks: `{project}/Notes/`. */
export function getNotesDirForBook(bookKey: string): string {
  return path.join(getWatchFolder(), bookKey, "Notes");
}

export function ensureProjectNotesDir(bookKey: string): string {
  const dir = getNotesDirForBook(bookKey);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function ensureProjectAudioDir(bookKey: string): string {
  const dir = getAudioOutputDirForBook(bookKey);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function isUnderWatchFolder(absolutePath: string): boolean {
  const root = path.resolve(getWatchFolder());
  const resolved = path.resolve(absolutePath);
  return resolved === root || resolved.startsWith(`${root}${path.sep}`);
}
