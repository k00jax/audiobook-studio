import { describe, expect, it } from "vitest";
import {
  buildTeleprompterLines,
  effectiveTeleprompterDuration,
  lineIndexAtTime,
} from "./teleprompter-sync";

describe("buildTeleprompterLines", () => {
  it("preserves paragraph breaks and assigns proportional timing", () => {
    const lines = buildTeleprompterLines("Hello world\n\nSecond paragraph");

    expect(lines).toHaveLength(2);
    expect(lines[0].text).toBe("Hello world");
    expect(lines[1].text).toBe("Second paragraph");
    expect(lines[0].endRatio).toBe(lines[1].startRatio);
    expect(lines[1].endRatio).toBe(1);
  });
});

describe("lineIndexAtTime", () => {
  const text = "One two three\n\nFour five\n\nSix";
  const lines = buildTeleprompterLines(text);

  it("returns first line at start", () => {
    expect(lineIndexAtTime(lines, 0, 60)).toBe(0);
  });

  it("advances through lines over duration", () => {
    const duration = 60;
    const inFirst = duration * (lines[0].startRatio + lines[0].endRatio) / 2;
    const inSecond = duration * (lines[1].startRatio + lines[1].endRatio) / 2;

    expect(lineIndexAtTime(lines, inFirst, duration)).toBe(0);
    expect(lineIndexAtTime(lines, inSecond, duration)).toBe(1);
    expect(lineIndexAtTime(lines, duration, duration)).toBe(2);
  });
});

describe("effectiveTeleprompterDuration", () => {
  it("uses audio duration when available", () => {
    const lines = buildTeleprompterLines("hello world");
    expect(effectiveTeleprompterDuration(120, lines, 60)).toBe(120);
  });

  it("falls back to estimated duration from text", () => {
    const lines = buildTeleprompterLines("one two three four five six");
    expect(effectiveTeleprompterDuration(0, lines)).toBeGreaterThan(0);
  });
});
