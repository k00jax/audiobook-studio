import "server-only";
import type { ChapterRow } from "@/lib/types";
import { chapterHasCurrentAudio } from "@/lib/chapter-status";
import { resolveAudioFilePath } from "@/lib/audio-storage";
import { probeAudioDurationSec } from "@/lib/ffmpeg-audio";

export type BookProjectStats = {
  chapterCount: number;
  currentAudioCount: number;
  totalAudioSeconds: number;
};

function isCompiledAudioPath(audioPath: string | null | undefined): boolean {
  if (!audioPath) return false;
  return audioPath.replace(/\\/g, "/").includes("/compiled/");
}

export async function computeBookProjectStats(
  chapters: ChapterRow[],
): Promise<BookProjectStats> {
  let currentAudioCount = 0;
  let totalAudioSeconds = 0;

  for (const chapter of chapters) {
    if (chapterHasCurrentAudio(chapter)) currentAudioCount++;

    for (const part of chapter.parts) {
      if (part.status !== "ready") continue;
      if (isCompiledAudioPath(part.audio_path)) continue;

      if (part.audio_path) {
        const absolute = resolveAudioFilePath(part.audio_path);
        if (absolute && isCompiledAudioPath(absolute)) continue;
        if (absolute) {
          const probed = await probeAudioDurationSec(absolute);
          if (probed > 0) {
            totalAudioSeconds += probed;
            continue;
          }
        }
      }
      totalAudioSeconds += part.estimated_seconds ?? 0;
    }
  }

  return {
    chapterCount: chapters.length,
    currentAudioCount,
    totalAudioSeconds,
  };
}
