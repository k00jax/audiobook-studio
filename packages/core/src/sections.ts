import { countWords, estimateSeconds } from "./estimate";
import type { Section } from "./types";

const DEFAULT_DELIMITER = "---";

/**
 * Split chapter text into sections using only an explicit delimiter line.
 * No heading detection or paragraph inference.
 */
export function parseSections(
  text: string,
  sectionDelimiter = DEFAULT_DELIMITER,
): Section[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const blocks: string[] = [];
  let current: string[] = [];

  for (const line of normalized.split("\n")) {
    if (line.trim() === sectionDelimiter) {
      blocks.push(current.join("\n").trim());
      current = [];
      continue;
    }
    current.push(line);
  }
  blocks.push(current.join("\n").trim());

  const chunks = blocks.filter(Boolean);

  return chunks.map((body, index) => {
    const wordCount = countWords(body);
    return {
      index,
      body,
      wordCount,
      estimatedSeconds: estimateSeconds(wordCount),
    };
  });
}
