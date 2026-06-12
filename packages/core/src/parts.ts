import type { Part, Section, SplitOptions } from "./types";
import { estimateSeconds } from "./estimate";
import { parseSections } from "./sections";

function partLabel(
  chapterLabel: string | undefined,
  partIndex: number,
  totalParts: number,
): string {
  const prefix = chapterLabel?.trim() || "Chapter";
  if (totalParts <= 1) return prefix;
  return `${prefix} — Part ${partIndex + 1}`;
}

/**
 * Group whole sections into parts until adding the next section would exceed
 * the time budget. Never splits inside a section.
 */
export function groupSectionsIntoParts(
  sections: Section[],
  partBudgetSeconds: number,
  chapterLabel?: string,
): Part[] {
  if (sections.length === 0) return [];

  const parts: Part[] = [];
  let currentSections: Section[] = [];
  let currentSeconds = 0;

  const flush = () => {
    if (currentSections.length === 0) return;
    const body = currentSections.map((s) => s.body).join("\n\n");
    const wordCount = currentSections.reduce((n, s) => n + s.wordCount, 0);
    parts.push({
      index: parts.length,
      label: "",
      sectionIndexes: currentSections.map((s) => s.index),
      body,
      wordCount,
      estimatedSeconds: estimateSeconds(wordCount),
    });
    currentSections = [];
    currentSeconds = 0;
  };

  for (const section of sections) {
    const wouldExceed =
      currentSections.length > 0 &&
      currentSeconds + section.estimatedSeconds > partBudgetSeconds;

    if (wouldExceed) flush();

    currentSections.push(section);
    currentSeconds += section.estimatedSeconds;
  }

  flush();
  const totalParts = parts.length;
  return parts.map((part, index) => ({
    ...part,
    label: partLabel(chapterLabel, index, totalParts),
  }));
}

export function splitChapter(text: string, options: SplitOptions) {
  const wpm = options.wordsPerMinute ?? 150;
  const sections = parseSections(text, options.sectionDelimiter).map((s) => ({
    ...s,
    estimatedSeconds: estimateSeconds(s.wordCount, wpm),
  }));
  const parts = groupSectionsIntoParts(
    sections,
    options.partBudgetSeconds,
    options.chapterLabel,
  );
  return { sections, parts };
}
