export function getConfig() {
  return {
    sectionDelimiter: process.env.SECTION_DELIMITER ?? "---",
    partBudgetSeconds: Number(process.env.PART_BUDGET_SECONDS ?? "86400"),
    wordsPerMinute: Number(process.env.WORDS_PER_MINUTE ?? "150"),
    defaultBookTitle: process.env.DEFAULT_BOOK_TITLE ?? "My Book",
    ttsParallelJobs: getTtsParallelJobs(),
  };
}

/** How many TTS jobs may run at once (chapters/parts in parallel). */
export function getTtsParallelJobs(): number {
  const raw = Number(process.env.TTS_PARALLEL_JOBS ?? "3");
  if (!Number.isFinite(raw)) return 3;
  return Math.min(8, Math.max(1, Math.floor(raw)));
}
