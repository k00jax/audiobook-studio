/**
 * Prepare manuscript text for speech synthesis.
 * Strips markdown heading markers and hashtag punctuation so TTS does not say "hash".
 */
export type TtsSegment = {
  kind: "prose" | "header";
  text: string;
};

const MARKDOWN_HEADER = /^#{1,6}\s+(.*)$/;

/** Horizontal rules and setext underlines (===, ---, ***, ___) — not speech. */
const MARKDOWN_DECORATION = /^(\*{3,}|-{3,}|_{3,}|={3,})\s*$/;

function stripInlineHashtags(line: string): string {
  return line.replace(/(^|\s)#(\w[\w-]*)/g, "$1$2");
}

export function isMarkdownDecorationLine(line: string): boolean {
  return MARKDOWN_DECORATION.test(line.trim());
}

export function isMarkdownHeaderLine(line: string): boolean {
  return MARKDOWN_HEADER.test(line);
}

/** Split raw chapter text into header and prose blocks (headers still include # in source). */
export function parseTtsSegments(raw: string): TtsSegment[] {
  const segments: TtsSegment[] = [];
  const proseLines: string[] = [];

  const flushProse = () => {
    const joined = proseLines.join("\n").trim();
    proseLines.length = 0;
    if (joined) {
      segments.push({ kind: "prose", text: joined });
    }
  };

  for (const line of raw.split("\n")) {
    const headerMatch = line.match(MARKDOWN_HEADER);
    if (headerMatch) {
      flushProse();
      const title = headerMatch[1].trim();
      if (title) {
        segments.push({ kind: "header", text: title });
      }
      continue;
    }

    if (isMarkdownDecorationLine(line)) {
      continue;
    }

    proseLines.push(stripInlineHashtags(line));
  }

  flushProse();
  return segments;
}

export function getHeaderPauseDurations(): { beforeMs: number; afterMs: number } {
  const beforeMs = Number(process.env.TTS_HEADER_PAUSE_BEFORE_MS ?? "550");
  const afterMs = Number(process.env.TTS_HEADER_PAUSE_AFTER_MS ?? "750");
  return {
    beforeMs: Number.isFinite(beforeMs) && beforeMs >= 0 ? beforeMs : 550,
    afterMs: Number.isFinite(afterMs) && afterMs >= 0 ? afterMs : 750,
  };
}

/** Clean text for display (teleprompter) — no extra pause padding. */
export function prepareTextForTts(text: string): string {
  const segments = parseTtsSegments(text);
  if (segments.length === 0) return "";

  return segments.map((segment) => segment.text).join("\n\n").trim();
}

/** Piper/OpenAI: extra blank lines around headers approximate a natural pause. */
export function prepareTextForTtsWithPauses(text: string): string {
  const segments = parseTtsSegments(text);
  if (segments.length === 0) return "";

  const parts: string[] = [];
  for (const segment of segments) {
    if (segment.kind === "header") {
      parts.push("", "", segment.text, "", "");
    } else {
      parts.push(segment.text);
    }
  }

  return parts.join("\n").trim();
}
