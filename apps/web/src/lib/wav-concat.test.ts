import { describe, expect, it } from "vitest";
import { concatWav, readWavPcm, writeWavPcm } from "./wav-concat";

describe("wav-concat", () => {
  it("round-trips a minimal PCM WAV", () => {
    const pcm = Buffer.from([0, 0, 1, 0, 2, 0, 3, 0]);
    const wav = writeWavPcm({
      pcm,
      sampleRate: 22050,
      numChannels: 1,
      bitsPerSample: 16,
    });
    const parsed = readWavPcm(wav);
    expect(parsed.sampleRate).toBe(22050);
    expect(parsed.pcm.equals(pcm)).toBe(true);
  });

  it("concatenates two WAV files", () => {
    const a = writeWavPcm({
      pcm: Buffer.from([0, 0, 1, 0]),
      sampleRate: 22050,
      numChannels: 1,
      bitsPerSample: 16,
    });
    const b = writeWavPcm({
      pcm: Buffer.from([2, 0, 3, 0]),
      sampleRate: 22050,
      numChannels: 1,
      bitsPerSample: 16,
    });
    const merged = concatWav([a, b]);
    const parsed = readWavPcm(merged);
    expect(parsed.pcm.length).toBe(8);
    expect(parsed.pcm[0]).toBe(0);
    expect(parsed.pcm[4]).toBe(2);
  });
});
