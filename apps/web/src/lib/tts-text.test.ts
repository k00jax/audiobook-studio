import { describe, expect, it } from "vitest";
import {
  isMarkdownHeaderLine,
  parseTtsSegments,
  prepareTextForTts,
  prepareTextForTtsWithPauses,
} from "./tts-text";

describe("parseTtsSegments", () => {
  it("splits markdown headers from prose", () => {
    expect(
      parseTtsSegments("# Chapter One\n\nBody text.\n\n## A Section\n\nMore."),
    ).toEqual([
      { kind: "header", text: "Chapter One" },
      { kind: "prose", text: "Body text." },
      { kind: "header", text: "A Section" },
      { kind: "prose", text: "More." },
    ]);
  });

  it("skips markdown horizontal rules like === and ---", () => {
    expect(
      parseTtsSegments(
        "Chapter 1\n===\n\n## Setting Aside What You Think You Know\n\nBody.",
      ),
    ).toEqual([
      { kind: "prose", text: "Chapter 1" },
      { kind: "header", text: "Setting Aside What You Think You Know" },
      { kind: "prose", text: "Body." },
    ]);
  });
});

describe("prepareTextForTts", () => {
  it("strips markdown heading hashes", () => {
    expect(prepareTextForTts("# Chapter One\n\nBody text.")).toBe(
      "Chapter One\n\nBody text.",
    );
    expect(prepareTextForTts("## A Section")).toBe("A Section");
  });

  it("strips inline hashtag markers but keeps the word", () => {
    expect(prepareTextForTts("See also #philosophy here")).toBe(
      "See also philosophy here",
    );
  });

  it("leaves hash in contexts like C#", () => {
    expect(prepareTextForTts("Learning C# today")).toBe("Learning C# today");
  });

  it("detects markdown header lines", () => {
    expect(isMarkdownHeaderLine("## Preface")).toBe(true);
    expect(isMarkdownHeaderLine("Not a header")).toBe(false);
  });
});

describe("prepareTextForTtsWithPauses", () => {
  it("adds extra blank lines around headers for a longer pause", () => {
    const prepared = prepareTextForTtsWithPauses("Intro.\n\n# Title\n\nParagraph.");
    expect(prepared).toContain("Intro.");
    expect(prepared).toContain("Title\n\n\nParagraph.");
  });
});
