import { describe, expect, it } from "vitest";
import { chapterPathSortKey } from "./chapter-reorder";
import { displayChapterTitle, formatChapterFilename } from "./chapter-tree";

describe("formatChapterFilename", () => {
  it("formats numbered chapter filenames", () => {
    expect(formatChapterFilename("ch15_honest_path")).toBe(
      "Ch 15 — Honest Path",
    );
    expect(formatChapterFilename("ch01_apocalyptic_preacher")).toBe(
      "Ch 1 — Apocalyptic Preacher",
    );
  });

  it("formats preface and epilogue", () => {
    expect(formatChapterFilename("preface_01")).toBe("Preface 01");
    expect(formatChapterFilename("epilogue")).toBe("Epilogue");
  });
});

describe("chapterPathSortKey", () => {
  it("orders preface before numbered chapters", () => {
    expect(
      chapterPathSortKey("preface_01.md", "preface").localeCompare(
        chapterPathSortKey("ch01_apocalyptic_preacher.md", "ch01"),
      ),
    ).toBeLessThan(0);
    expect(
      chapterPathSortKey("ch14_ground_of_being.md", "ch14").localeCompare(
        chapterPathSortKey("ch15_honest_path.md", "ch15"),
      ),
    ).toBeLessThan(0);
  });
});

describe("displayChapterTitle", () => {
  it("uses formatted filename for auto titles", () => {
    expect(
      displayChapterTitle(
        {
          title: "ch15_honest_path",
          source_path: "ch15_honest_path.md",
        },
        "WTFAYTA",
      ),
    ).toBe("Ch 15 — Honest Path");
  });

  it("keeps a custom user title", () => {
    expect(
      displayChapterTitle(
        {
          title: "My Custom Chapter Name",
          source_path: "ch15_honest_path.md",
        },
        "WTFAYTA",
      ),
    ).toBe("My Custom Chapter Name");
  });
});
