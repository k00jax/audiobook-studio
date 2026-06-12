import { describe, expect, it } from "vitest";
import {
  chapterParentPath,
  compareChapterOrder,
  reorderBefore,
  sortOrdersFromIds,
} from "./chapter-reorder";
import type { ChapterRow } from "@/lib/types";

function ch(
  id: string,
  source_path: string | null,
  sort_order: number | null = null,
): ChapterRow {
  return {
    id,
    title: id,
    source_path,
    part_count: 0,
    parts: [],
    sort_order,
  };
}

describe("chapterParentPath", () => {
  it("returns folder path without filename", () => {
    expect(chapterParentPath("PLATO/preface_01.md")).toBe("PLATO");
    expect(chapterParentPath("preface_01.md")).toBe("");
  });
});

describe("compareChapterOrder", () => {
  it("prefers sort_order over path", () => {
    expect(compareChapterOrder(ch("a", "b.md", 2000), ch("b", "a.md", 1000))).toBe(
      1000,
    );
  });
});

describe("reorderBefore", () => {
  it("moves dragged id before target", () => {
    expect(reorderBefore(["a", "b", "c"], "c", "a")).toEqual(["c", "a", "b"]);
  });
});

describe("sortOrdersFromIds", () => {
  it("assigns stepped order values", () => {
    expect(sortOrdersFromIds(["x", "y"])).toEqual({ x: 0, y: 1000 });
  });
});
