export type AudioAlignmentParagraph = {
  index: number;
  startSec: number;
  endSec: number;
};

export type AudioAlignment = {
  version: 1;
  durationSec: number;
  paragraphs: AudioAlignmentParagraph[];
};

export function alignmentRelativePathForAudio(relativeAudioPath: string): string {
  return relativeAudioPath.replace(/\.(mp3|wav|mpeg)$/i, ".alignment.json");
}

export function alignmentUrlForAudioUrl(audioUrl: string): string {
  return audioUrl.replace(/\.(mp3|wav|mpeg)(\?.*)?$/i, ".alignment.json");
}

export function isAudioAlignment(value: unknown): value is AudioAlignment {
  if (!value || typeof value !== "object") return false;
  const v = value as AudioAlignment;
  return (
    v.version === 1 &&
    typeof v.durationSec === "number" &&
    Array.isArray(v.paragraphs) &&
    v.paragraphs.every(
      (p) =>
        typeof p.index === "number" &&
        typeof p.startSec === "number" &&
        typeof p.endSec === "number",
    )
  );
}

export function mergeAudioAlignments(
  parts: AudioAlignment[],
  paragraphCounts: number[],
): AudioAlignment {
  let timeOffset = 0;
  let paragraphOffset = 0;
  const merged: AudioAlignmentParagraph[] = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    for (const paragraph of part.paragraphs) {
      merged.push({
        index: paragraphOffset + paragraph.index,
        startSec: paragraph.startSec + timeOffset,
        endSec: paragraph.endSec + timeOffset,
      });
    }
    paragraphOffset += paragraphCounts[i] ?? part.paragraphs.length;
    const chunkEnd = part.paragraphs.reduce(
      (max, p) => Math.max(max, p.endSec),
      part.durationSec,
    );
    timeOffset += chunkEnd;
  }

  return {
    version: 1,
    durationSec: timeOffset,
    paragraphs: merged,
  };
}

/** Stretch alignment timestamps when sidecar duration differs from the MP3. */
export function scaleAlignmentToDuration(
  alignment: AudioAlignment,
  audioDurationSec: number,
): AudioAlignment {
  if (
    audioDurationSec <= 0 ||
    alignment.durationSec <= 0 ||
    Math.abs(audioDurationSec - alignment.durationSec) < 0.5
  ) {
    return alignment;
  }

  const ratio = audioDurationSec / alignment.durationSec;
  return {
    version: 1,
    durationSec: audioDurationSec,
    paragraphs: alignment.paragraphs.map((p) => ({
      index: p.index,
      startSec: p.startSec * ratio,
      endSec: p.endSec * ratio,
    })),
  };
}

export function lineIndexFromAlignment(
  alignment: AudioAlignment,
  currentTimeSec: number,
): number {
  if (alignment.paragraphs.length === 0) return -1;

  const sorted = [...alignment.paragraphs].sort(
    (a, b) => a.startSec - b.startSec,
  );

  let active = sorted[0]?.index ?? 0;
  for (const paragraph of sorted) {
    if (currentTimeSec >= paragraph.startSec) {
      active = paragraph.index;
    }
  }
  return active;
}

export function timeAtParagraphFromAlignment(
  alignment: AudioAlignment,
  paragraphIndex: number,
): number {
  const match = alignment.paragraphs.find((p) => p.index === paragraphIndex);
  return match?.startSec ?? 0;
}
