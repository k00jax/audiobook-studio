export type TeleprompterLine = {
  id: number;
  /** Raw line text from the source document (may be empty). */
  text: string;
  /** Relative speaking weight for timing (word count, with pauses for blank lines). */
  weight: number;
  /** Start of this line as a fraction of total audio duration (0–1). */
  startRatio: number;
  /** End of this line as a fraction of total audio duration (0–1). */
  endRatio: number;
};

function lineWeight(line: string): number {
  const words = line.trim().split(/\s+/).filter(Boolean).length;
  return words > 0 ? words : 0.25;
}

/** Split source text into paragraphs and assign proportional timing weights. */
export function buildTeleprompterLines(text: string): TeleprompterLine[] {
  if (!text) return [];

  const rawLines = text.split(/\n\n+/);
  const weights = rawLines.map(lineWeight);
  const total = weights.reduce((sum, w) => sum + w, 0) || 1;

  let acc = 0;
  return rawLines.map((lineText, id) => {
    const weight = weights[id];
    const startRatio = acc / total;
    acc += weight;
    return {
      id,
      text: lineText,
      weight,
      startRatio,
      endRatio: acc / total,
    };
  });
}

/** Map playback position to the active line index. */
export function lineIndexAtTime(
  lines: TeleprompterLine[],
  currentTimeSec: number,
  durationSec: number,
): number {
  if (lines.length === 0) return -1;
  if (durationSec <= 0 || !Number.isFinite(durationSec)) return 0;

  const ratio = Math.min(1, Math.max(0, currentTimeSec / durationSec));

  for (let i = lines.length - 1; i >= 0; i--) {
    if (ratio >= lines[i].startRatio) return i;
  }

  return 0;
}

/** Seconds into the track for the start of a line. */
export function timeAtLineStart(
  line: TeleprompterLine,
  durationSec: number,
): number {
  return line.startRatio * durationSec;
}

/** Local time within a line (seconds from line start). */
export function localTimeInLine(
  line: TeleprompterLine,
  currentTimeSec: number,
  durationSec: number,
): number {
  if (durationSec <= 0) return 0;
  const start = timeAtLineStart(line, durationSec);
  const end = line.endRatio * durationSec;
  return Math.min(Math.max(0, currentTimeSec - start), end - start);
}

/** Index of the spoken word within a line ( -1 if line has no words ). */
export function activeWordIndex(
  lineText: string,
  localTimeSec: number,
  lineDurationSec: number,
): number {
  const words = lineText.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return -1;
  if (lineDurationSec <= 0) return 0;

  const ratio = Math.min(1, Math.max(0, localTimeSec / lineDurationSec));
  return Math.min(words.length - 1, Math.floor(ratio * words.length));
}

export function lineDurationSec(
  line: TeleprompterLine,
  durationSec: number,
): number {
  return (line.endRatio - line.startRatio) * durationSec;
}

/** Fallback duration from word count when audio metadata is not ready yet. */
export function estimatedDurationFromLines(
  lines: TeleprompterLine[],
  wordsPerMinute = 150,
): number {
  const words = lines.reduce(
    (sum, line) =>
      sum + line.text.trim().split(/\s+/).filter(Boolean).length,
    0,
  );
  if (words === 0) return 0;
  return Math.max(1, (words / wordsPerMinute) * 60);
}

export function effectiveTeleprompterDuration(
  audioDurationSec: number,
  lines: TeleprompterLine[],
  fallbackSec?: number,
): number {
  if (audioDurationSec > 0 && Number.isFinite(audioDurationSec)) {
    return audioDurationSec;
  }
  if (fallbackSec != null && fallbackSec > 0) {
    return fallbackSec;
  }
  return estimatedDurationFromLines(lines);
}

/** Fallback schedule with explicit speech/pause segments on the wall clock. */
export function buildTeleprompterSchedule(
  text: string,
  audioDurationSec: number,
  wordsPerMinute = 150,
  spokenDurationOverride?: number,
): Array<{
  id: number;
  text: string;
  speechSec: number;
  pauseAfterSec: number;
  wallStartSec: number;
}> {
  const lines = buildTeleprompterLines(text);
  if (lines.length === 0 || audioDurationSec <= 0) return [];

  const spokenDuration =
    spokenDurationOverride && spokenDurationOverride > 0
      ? spokenDurationOverride
      : estimatedDurationFromLines(lines, wordsPerMinute);
  const totalWeight = lines.reduce((sum, line) => sum + line.weight, 0) || 1;
  const pauseBudget = Math.max(0, audioDurationSec - spokenDuration);
  const gapCount = Math.max(0, lines.length - 1);
  const pauseEach = gapCount > 0 ? pauseBudget / gapCount : 0;

  let wall = 0;
  return lines.map((line, id) => {
    const speechSec = (line.weight / totalWeight) * spokenDuration;
    const wallStartSec = wall;
    wall += speechSec;
    const pauseAfterSec = id < lines.length - 1 ? pauseEach : 0;
    wall += pauseAfterSec;
    return {
      id,
      text: line.text,
      speechSec,
      pauseAfterSec,
      wallStartSec,
    };
  });
}

/** Map wall-clock playback time to active paragraph (holds through pauses). */
export function lineIndexFromSchedule(
  schedule: Array<{
    id: number;
    wallStartSec: number;
    speechSec: number;
    pauseAfterSec: number;
  }>,
  currentTimeSec: number,
): number {
  if (schedule.length === 0) return -1;

  for (let i = schedule.length - 1; i >= 0; i--) {
    const entry = schedule[i];
    if (currentTimeSec >= entry.wallStartSec) {
      return entry.id;
    }
  }

  return schedule[0]?.id ?? 0;
}

export function timeAtScheduleParagraph(
  schedule: Array<{ id: number; wallStartSec: number }>,
  paragraphId: number,
): number {
  return schedule.find((p) => p.id === paragraphId)?.wallStartSec ?? 0;
}
