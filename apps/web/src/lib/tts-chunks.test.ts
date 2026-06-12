import { describe, expect, it } from "vitest";
import { OPENAI_TTS_MAX_CHARS, splitTextForTts } from "./tts-chunks";

describe("splitTextForTts", () => {
  it("returns single chunk when under limit", () => {
    expect(splitTextForTts("Hello world.")).toEqual(["Hello world."]);
  });

  it("splits long text into chunks at most maxLength", () => {
    const sentence = "Word ".repeat(200).trim() + ". ";
    const text = sentence.repeat(30);
    const chunks = splitTextForTts(text, OPENAI_TTS_MAX_CHARS);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(OPENAI_TTS_MAX_CHARS);
    }
    expect(chunks.join(" ")).toContain("Word");
  });
});
