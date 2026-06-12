import { describe, expect, it } from "vitest";
import { splitChapter } from "./parts";

describe("splitChapter", () => {
  it("splits only on explicit delimiter, never mid-section", () => {
    const text = [
      "Opening line stays in section one.",
      "Still section one.",
      "---",
      "Section two starts here.",
      "---",
      "Section three is short.",
    ].join("\n");

    const { sections, parts } = splitChapter(text, {
      sectionDelimiter: "---",
      partBudgetSeconds: 9999,
      chapterLabel: "Ch 1",
    });

    expect(sections).toHaveLength(3);
    expect(parts).toHaveLength(1);
    expect(parts[0].label).toBe("Ch 1");
    expect(parts[0].sectionIndexes).toEqual([0, 1, 2]);
  });

  it("groups sections by time budget without breaking sections", () => {
    const section = (words: number) =>
      Array.from({ length: words }, (_, i) => `word${i}`).join(" ");

    const text = [
      section(80),
      "---",
      section(80),
      "---",
      section(80),
    ].join("\n");

    const { parts } = splitChapter(text, {
      sectionDelimiter: "---",
      partBudgetSeconds: 60,
      wordsPerMinute: 150,
      chapterLabel: "Ch 2",
    });

    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) {
      expect(part.sectionIndexes.length).toBeGreaterThan(0);
    }
  });
});
