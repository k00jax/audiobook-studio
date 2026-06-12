export const OPENAI_TTS_MAX_CHARS = 4096;

/**
 * Split text for OpenAI TTS (4096 char limit). Prefers paragraph and sentence breaks.
 */
export function splitTextForTts(
  text: string,
  maxLength = OPENAI_TTS_MAX_CHARS,
): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= maxLength) return [trimmed];

  const chunks: string[] = [];
  let remaining = trimmed;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    let window = remaining.slice(0, maxLength);
    const breakAt = findBreakIndex(window, maxLength);
    if (breakAt > 0) {
      window = remaining.slice(0, breakAt);
    }

    const piece = window.trim();
    if (!piece) {
      // Hard split if no break found (very long token)
      chunks.push(remaining.slice(0, maxLength));
      remaining = remaining.slice(maxLength).trim();
      continue;
    }

    chunks.push(piece);
    remaining = remaining.slice(window.length).trim();
  }

  return chunks;
}

function findBreakIndex(window: string, maxLength: number): number {
  const minBreak = Math.floor(maxLength * 0.5);

  const paragraph = window.lastIndexOf("\n\n");
  if (paragraph >= minBreak) return paragraph + 2;

  for (const sep of [". ", "? ", "! ", ".\n"]) {
    const idx = window.lastIndexOf(sep);
    if (idx >= minBreak) return idx + sep.length;
  }

  const line = window.lastIndexOf("\n");
  if (line >= minBreak) return line + 1;

  const space = window.lastIndexOf(" ");
  if (space >= minBreak) return space + 1;

  return -1;
}
