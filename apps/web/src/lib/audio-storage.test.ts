import { describe, expect, it } from "vitest";
import {
  buildAudioRelativePath,
  resolveAudioFilePath,
  sanitizePathSegment,
} from "./audio-storage";

describe("audio-storage", () => {
  it("builds readable folder paths", () => {
    expect(
      buildAudioRelativePath({
        bookKey: "WTFAYTA",
        chapterKey: "ch15_honest_path",
        partIndex: 0,
        extension: "mp3",
      }),
    ).toBe("WTFAYTA/ch15_honest_path.mp3");
  });

  it("sanitizes unsafe path segments", () => {
    expect(sanitizePathSegment('bad<>name')).toBe("bad__name");
  });

  it("rejects path traversal", () => {
    expect(resolveAudioFilePath("../.env")).toBeNull();
  });
});
