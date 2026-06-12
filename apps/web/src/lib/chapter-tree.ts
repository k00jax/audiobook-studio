import type { ChapterRow } from "@/lib/types";
import { compareChapterOrder } from "@/lib/chapter-reorder";

/** Filename without extension from a chapter source_path. */
export function filenameFromPath(
  sourcePath: string | null,
  fallback: string,
): string {
  if (!sourcePath) return fallback;
  const base = sourcePath.split("/").pop() ?? fallback;
  return base.replace(/\.(md|markdown|txt)$/i, "") || fallback;
}

function titleCaseWords(text: string): string {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/** Human-readable label from a chapter filename (e.g. ch15_honest_path → Ch 15 — Honest Path). */
export function formatChapterFilename(base: string): string {
  const preface = base.match(/^preface[_\-]?(\d*)$/i);
  if (preface) return preface[1] ? `Preface ${preface[1]}` : "Preface";

  const epilogue = base.match(/^epilogue$/i);
  if (epilogue) return "Epilogue";

  const ch = base.match(/^ch(\d+)[_\-]*(.*)$/i);
  if (ch) {
    const num = parseInt(ch[1], 10);
    const rest = ch[2].replace(/_/g, " ").trim();
    return rest ? `Ch ${num} — ${titleCaseWords(rest)}` : `Ch ${num}`;
  }

  return titleCaseWords(base.replace(/_/g, " "));
}

const PLACEHOLDER_TITLES = new Set(["My Book", "PLATO", ""]);

/** True when the stored title is still the raw filename (or a placeholder). */
export function isAutoChapterTitle(
  title: string,
  bookTitle: string,
  sourcePath: string | null,
): boolean {
  if (!title || PLACEHOLDER_TITLES.has(title) || title === bookTitle) return true;
  const fromFile = filenameFromPath(sourcePath, "");
  if (!fromFile) return false;
  return title === fromFile || title === formatChapterFilename(fromFile);
}

/** Prefer filename unless the user set a custom chapter title. */
export function displayChapterTitle(
  chapter: { title: string; source_path: string | null },
  bookTitle: string,
): string {
  const fromFile = filenameFromPath(chapter.source_path, "");
  if (!fromFile) return chapter.title || "Untitled";

  if (isAutoChapterTitle(chapter.title, bookTitle, chapter.source_path)) {
    return formatChapterFilename(fromFile);
  }

  return chapter.title;
}

export type TreeFolder = {
  type: "folder";
  path: string;
  name: string;
  children: TreeNode[];
};

export type TreeChapter = {
  type: "chapter";
  chapter: ChapterRow;
};

export type TreeNode = TreeFolder | TreeChapter;

function folderName(path: string, labels: Record<string, string>): string {
  return labels[path] ?? path.split("/").pop() ?? path;
}

export function buildChapterTree(
  chapters: TreeChapter["chapter"][],
  folderLabels: Record<string, string>,
): TreeNode[] {
  const root: TreeNode[] = [];

  const sorted = [...chapters].sort(compareChapterOrder);

  for (const chapter of sorted) {
    const rel = chapter.source_path ?? chapter.title;
    const parts = rel.split("/").filter(Boolean);

    if (parts.length <= 1) {
      root.push({ type: "chapter", chapter });
      continue;
    }

    const folderParts = parts.slice(0, -1);
    let currentList = root;
    let pathSoFar = "";

    for (const segment of folderParts) {
      pathSoFar = pathSoFar ? `${pathSoFar}/${segment}` : segment;

      let folder = currentList.find(
        (n) => n.type === "folder" && n.path === pathSoFar,
      ) as TreeFolder | undefined;

      if (!folder) {
        folder = {
          type: "folder",
          path: pathSoFar,
          name: folderName(pathSoFar, folderLabels),
          children: [],
        };
        currentList.push(folder);
      }

      currentList = folder.children;
    }

    currentList.push({ type: "chapter", chapter });
  }

  sortTreeNodes(root);
  return root;
}

function sortTreeNodes(nodes: TreeNode[]): void {
  nodes.sort((a, b) => {
    if (a.type === "folder" && b.type === "folder") {
      return a.name.localeCompare(b.name, undefined, { numeric: true });
    }
    if (a.type === "folder") return -1;
    if (b.type === "folder") return 1;
    return compareChapterOrder(a.chapter, b.chapter);
  });

  for (const node of nodes) {
    if (node.type === "folder") sortTreeNodes(node.children);
  }
}

export function shouldBackfillChapterTitle(
  title: string,
  bookTitle: string,
  sourcePath: string | null,
): boolean {
  if (!sourcePath) return false;
  const fromFile = filenameFromPath(sourcePath, "");
  if (!fromFile) return false;
  const formatted = formatChapterFilename(fromFile);
  if (title === formatted) return false;
  return isAutoChapterTitle(title, bookTitle, sourcePath);
}
