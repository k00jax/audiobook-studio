import { describe, expect, it } from "vitest";
import {
  lineIndexFromAlignment,
  mergeAudioAlignments,
  scaleAlignmentToDuration,
  timeAtParagraphFromAlignment,
} from "./audio-alignment";

describe("mergeAudioAlignments", () => {
  it("offsets paragraph times across chunks", () => {
    const merged = mergeAudioAlignments(
      [
        {
          version: 1,
          durationSec: 10,
          paragraphs: [
            { index: 0, startSec: 0, endSec: 4 },
            { index: 1, startSec: 4, endSec: 10 },
          ],
        },
        {
          version: 1,
          durationSec: 6,
          paragraphs: [{ index: 0, startSec: 0, endSec: 6 }],
        },
      ],
      [2, 1],
    );

    expect(merged.durationSec).toBe(16);
    expect(merged.paragraphs).toEqual([
      { index: 0, startSec: 0, endSec: 4 },
      { index: 1, startSec: 4, endSec: 10 },
      { index: 2, startSec: 10, endSec: 16 },
    ]);
  });
});

describe("lineIndexFromAlignment", () => {
  const alignment = {
    version: 1 as const,
    durationSec: 30,
    paragraphs: [
      { index: 0, startSec: 0, endSec: 10 },
      { index: 1, startSec: 10, endSec: 22 },
      { index: 2, startSec: 22, endSec: 30 },
    ],
  };

  it("returns paragraph from measured timestamps", () => {
    expect(lineIndexFromAlignment(alignment, 0)).toBe(0);
    expect(lineIndexFromAlignment(alignment, 9.9)).toBe(0);
    expect(lineIndexFromAlignment(alignment, 10)).toBe(1);
    expect(lineIndexFromAlignment(alignment, 25)).toBe(2);
  });
});

describe("scaleAlignmentToDuration", () => {
  it("stretches timestamps to match mp3 length", () => {
    const scaled = scaleAlignmentToDuration(
      {
        version: 1,
        durationSec: 100,
        paragraphs: [{ index: 0, startSec: 0, endSec: 50 }, { index: 1, startSec: 50, endSec: 100 }],
      },
      110,
    );
    expect(scaled.durationSec).toBe(110);
    expect(scaled.paragraphs[1].startSec).toBeCloseTo(55);
  });
});
