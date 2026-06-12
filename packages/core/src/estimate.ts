const DEFAULT_WPM = 150;

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function estimateSeconds(
  wordCount: number,
  wordsPerMinute = DEFAULT_WPM,
): number {
  if (wordCount <= 0) return 0;
  return Math.ceil((wordCount / wordsPerMinute) * 60);
}
