import { NextResponse } from "next/server";
import { markChapterDictatedIfComplete } from "@/lib/chapter-status-server";
import { getTtsProvider } from "@/lib/tts-providers";
import {
  markPartsQueued,
  processQueuedPartsParallel,
  resolveQueueablePartIds,
} from "@/lib/tts";

export const maxDuration = 300;

type QueueBody = {
  partIds?: string[];
  chapterId?: string;
  chapterIds?: string[];
  force?: boolean;
  background?: boolean;
};

export async function POST(request: Request) {
  if (getTtsProvider() === "openai" && !process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY not configured" },
      { status: 500 },
    );
  }

  let body: QueueBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const chapterIds = [
    ...(body.chapterIds?.filter(Boolean) ?? []),
    ...(body.chapterId ? [body.chapterId] : []),
  ];

  if (chapterIds.length === 0) {
    return NextResponse.json(
      { error: "chapterId or chapterIds required" },
      { status: 400 },
    );
  }

  const options = {
    force: Boolean(body.force),
    background: Boolean(body.background),
  };

  if (chapterIds.length === 1) {
    const chapterId = chapterIds[0];
    const resolved = resolveQueueablePartIds(chapterId, body.partIds, options);
    if ("error" in resolved) {
      return NextResponse.json(
        { error: resolved.error },
        { status: resolved.status },
      );
    }

    const { queueIds } = resolved;
    markPartsQueued(queueIds);

    if (options.background) {
      void processQueuedPartsParallel(queueIds)
        .then(() => markChapterDictatedIfComplete(chapterId))
        .catch(() => {});

      return NextResponse.json({
        ok: true,
        queued: queueIds.length,
        processed: 0,
        errors: 0,
        background: true,
      });
    }

    try {
      const { processed, errors } = await processQueuedPartsParallel(queueIds);
      markChapterDictatedIfComplete(chapterId);
      return NextResponse.json({
        ok: true,
        queued: queueIds.length,
        processed,
        errors,
      });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "TTS failed" },
        { status: 500 },
      );
    }
  }

  const allQueueIds: string[] = [];
  const errors: string[] = [];

  for (const chapterId of chapterIds) {
    const resolved = resolveQueueablePartIds(chapterId, undefined, options);
    if ("error" in resolved) {
      errors.push(resolved.error);
      continue;
    }
    allQueueIds.push(...resolved.queueIds);
  }

  if (allQueueIds.length === 0) {
    return NextResponse.json(
      {
        error:
          errors[0] ??
          "Nothing to dictate — selected chapters are already ready or busy.",
      },
      { status: 400 },
    );
  }

  markPartsQueued(allQueueIds);

  if (options.background) {
    void processQueuedPartsParallel(allQueueIds)
      .then(() => {
        for (const chapterId of chapterIds) {
          markChapterDictatedIfComplete(chapterId);
        }
      })
      .catch(() => {});

    return NextResponse.json({
      ok: true,
      chapters: chapterIds.length,
      queued: allQueueIds.length,
      processed: 0,
      background: true,
      errors: errors.length,
      ...(errors.length > 0 ? { chapterErrors: errors } : {}),
    });
  }

  let processed = 0;
  let failed = 0;
  let runError: string | undefined;

  try {
    const result = await processQueuedPartsParallel(allQueueIds);
    processed = result.processed;
    failed = result.errors;
  } catch (err) {
    runError = err instanceof Error ? err.message : "TTS failed";
  }

  for (const chapterId of chapterIds) {
    markChapterDictatedIfComplete(chapterId);
  }

  return NextResponse.json({
    ok: true,
    chapters: chapterIds.length,
    queued: allQueueIds.length,
    processed,
    errors: failed + errors.length,
    ...(runError ? { error: runError } : {}),
    ...(errors.length > 0 ? { chapterErrors: errors } : {}),
  });
}
