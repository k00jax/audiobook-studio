export type Section = {
  index: number;
  body: string;
  wordCount: number;
  estimatedSeconds: number;
};

export type Part = {
  index: number;
  label: string;
  sectionIndexes: number[];
  body: string;
  wordCount: number;
  estimatedSeconds: number;
};

export type SplitOptions = {
  /** Line that separates sections (exact match after trim). Default: --- */
  sectionDelimiter: string;
  /** Target max seconds per part; whole sections only. */
  partBudgetSeconds: number;
  /** Words per minute for duration estimates. */
  wordsPerMinute?: number;
  /** Prefix for part labels, e.g. "Chapter 1". */
  chapterLabel?: string;
};
