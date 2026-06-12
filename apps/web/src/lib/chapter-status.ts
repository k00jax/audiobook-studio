import type { PartRow } from "@/lib/types";

export function isDictatableStatus(status: string): boolean {
  return status === "draft" || status === "failed" || status === "pending";
}

export type ChapterSourceStatus = "new" | "updated" | "current";

export function chapterSourceStatus(chapter: {
  content_hash?: string | null;
  dictated_content_hash?: string | null;
  parts: PartRow[];
}): ChapterSourceStatus {
  const contentHash = chapter.content_hash ?? null;
  const dictatedHash = chapter.dictated_content_hash ?? null;

  if (contentHash && dictatedHash && contentHash !== dictatedHash) {
    return "updated";
  }

  const hasReady = chapter.parts.some((p) => p.status === "ready");
  if (!dictatedHash && !hasReady) {
    return "new";
  }

  return "current";
}

/** Whether this chapter can be selected to compile combined audio. */
export function chapterSelectableForCompile(chapter: {
  content_hash?: string | null;
  dictated_content_hash?: string | null;
  parts: PartRow[];
}): boolean {
  return chapterHasCurrentAudio(chapter);
}

/** Whether this chapter can be selected for batch dictation from the list. */
export function chapterIsBusy(chapter: { parts: PartRow[] }): boolean {
  return chapter.parts.some(
    (p) => p.status === "queued" || p.status === "processing",
  );
}

/** Row badge while TTS is queued or running for this chapter. */
export function chapterTtsRowStatus(
  chapter: { parts: PartRow[] },
): "generating" | "queued" | null {
  if (chapter.parts.some((p) => p.status === "processing")) {
    return "generating";
  }
  if (chapter.parts.some((p) => p.status === "queued")) {
    return "queued";
  }
  return null;
}

export function chapterSelectableForDictate(chapter: {
  content_hash?: string | null;
  dictated_content_hash?: string | null;
  parts: PartRow[];
}): boolean {
  if (chapter.parts.length === 0) return false;
  if (chapterIsBusy(chapter)) return false;
  return !chapterHasCurrentAudio(chapter);
}

export type DictationProgress = {
  totalChapters: number;
  completedChapters: number;
  remainingChapters: number;
  totalParts: number;
  completedParts: number;
  remainingParts: number;
  processingChapterTitle: string | null;
  processingPartLabel: string | null;
  queuedParts: number;
  processingParts: number;
};

export function computeDictationProgress(
  chapters: Array<{
    id: string;
    title: string;
    parts: PartRow[];
    content_hash?: string | null;
    dictated_content_hash?: string | null;
  }>,
  scopeChapterIds: string[],
): DictationProgress {
  const scoped = chapters.filter((ch) => scopeChapterIds.includes(ch.id));
  let totalParts = 0;
  let completedParts = 0;
  let remainingParts = 0;
  let queuedParts = 0;
  let processingParts = 0;
  let processingChapterTitle: string | null = null;
  let processingPartLabel: string | null = null;

  for (const ch of scoped) {
    for (const part of ch.parts) {
      if (part.status === "queued" || part.status === "processing") {
        totalParts++;
        remainingParts++;
        if (part.status === "queued") queuedParts++;
        else {
          processingParts++;
          processingChapterTitle = ch.title;
          processingPartLabel = part.label;
        }
      } else if (part.status === "ready" && part.audio_url) {
        totalParts++;
        completedParts++;
      }
    }
  }

  const completedChapters = scoped.filter((ch) =>
    chapterHasCurrentAudio(ch),
  ).length;
  const totalChapters = scoped.length;
  const remainingChapters = totalChapters - completedChapters;

  return {
    totalChapters,
    completedChapters,
    remainingChapters,
    totalParts,
    completedParts,
    remainingParts,
    processingChapterTitle,
    processingPartLabel,
    queuedParts,
    processingParts,
  };
}

/** @deprecated Use chapterSelectableForDictate */
export function chapterCanDictate(chapter: {
  content_hash?: string | null;
  dictated_content_hash?: string | null;
  parts: PartRow[];
}): boolean {
  return chapterSelectableForDictate(chapter);
}

export function chapterHasCurrentAudio(chapter: {
  content_hash?: string | null;
  dictated_content_hash?: string | null;
  parts: PartRow[];
}): boolean {
  if (chapterSourceStatus(chapter) !== "current") return false;
  return chapter.parts.some((p) => p.status === "ready" && p.audio_url);
}

export function chapterStatusLabel(status: ChapterSourceStatus): string {
  switch (status) {
    case "new":
      return "New";
    case "updated":
      return "Text changed";
    case "current":
      return "";
  }
}
