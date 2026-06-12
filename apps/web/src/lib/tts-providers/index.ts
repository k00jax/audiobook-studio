import { ensureRootEnv } from "../env";
import { prepareTextForTtsWithPauses } from "../tts-text";
import { synthesizeWithEdge } from "./edge";
import { formatOpenAIError, synthesizeWithOpenAI } from "./openai";
import { synthesizeWithPiper } from "./piper";
import type { SynthesizedAudio } from "./piper";

export type TtsProvider = "openai" | "piper" | "edge";

export function getTtsProvider(): TtsProvider {
  ensureRootEnv();
  const raw = process.env.TTS_PROVIDER?.trim().toLowerCase();
  if (raw === "piper") return "piper";
  if (raw === "edge") return "edge";
  return "openai";
}

export async function synthesizePartAudio(text: string): Promise<SynthesizedAudio> {
  if (!text.trim()) {
    throw new Error("Cannot synthesize empty text");
  }

  switch (getTtsProvider()) {
    case "piper":
      return synthesizeWithPiper(prepareTextForTtsWithPauses(text));
    case "edge":
      return synthesizeWithEdge(text);
    default:
      return synthesizeWithOpenAI(prepareTextForTtsWithPauses(text));
  }
}

export function formatTtsError(err: unknown): string {
  if (getTtsProvider() === "openai") {
    return formatOpenAIError(err);
  }
  return err instanceof Error ? err.message : "TTS failed";
}

export { assertEdgeReady, getEdgeConfig } from "./edge";
export { assertPiperReady, getPiperConfig } from "./piper";
