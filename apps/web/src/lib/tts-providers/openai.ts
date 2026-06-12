import OpenAI from "openai";
import { splitTextForTts } from "../tts-chunks";
import type { SynthesizedAudio } from "./piper";

function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");
  return new OpenAI({ apiKey });
}

export function formatOpenAIError(err: unknown): string {
  if (err instanceof OpenAI.APIError) {
    return err.message;
  }
  return err instanceof Error ? err.message : "TTS failed";
}

export async function synthesizeWithOpenAI(text: string): Promise<SynthesizedAudio> {
  const openai = getOpenAI();
  const voice =
    (process.env.TTS_VOICE as "alloy" | "nova" | "shimmer") ?? "nova";
  const model = process.env.TTS_MODEL?.trim() || "tts-1-hd";
  const chunks = splitTextForTts(text);
  const buffers: Buffer[] = [];

  for (const chunk of chunks) {
    const speech = await openai.audio.speech.create({
      model,
      voice,
      input: chunk,
      response_format: "mp3",
    });
    buffers.push(Buffer.from(await speech.arrayBuffer()));
  }

  return {
    buffer: Buffer.concat(buffers),
    contentType: "audio/mpeg",
    extension: "mp3",
  };
}
