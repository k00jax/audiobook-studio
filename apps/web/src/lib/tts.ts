import {
  audioUrlForRelativePath,
  buildAudioContext,
  buildAudioRelativePath,
  saveAlignmentFile,
  saveAudioFile,
} from "@/lib/audio-storage";
import { getTtsParallelJobs } from "./config";
import { getDb } from "./db";
import {
  formatTtsError,
  synthesizePartAudio,
} from "./tts-providers";

const QUEUEABLE = new Set(["draft", "failed", "pending"]);

let ttsRunGeneration = 0;

export function getTtsRunGeneration(): number {
  return ttsRunGeneration;
}

/** Cancel queued/processing parts; in-flight synthesis checks generation before saving. */
export function stopActiveTts(): number {
  ttsRunGeneration++;
  getDb()
    .prepare(
      `
      UPDATE parts
      SET status = 'pending', error_message = 'Cancelled'
      WHERE status IN ('queued', 'processing')
    `,
    )
    .run();
  return ttsRunGeneration;
}

export function isTtsPartCancelled(generation: number): boolean {
  return generation !== ttsRunGeneration;
}

type PartRecord = {
  id: string;
  chapter_id: string;
  part_index: number;
  label: string;
  body: string;
};

export async function processPartById(partId: string, generation = getTtsRunGeneration()) {
  const db = getDb();
  const part = db
    .prepare(
      "SELECT id, chapter_id, part_index, label, body, status FROM parts WHERE id = ?",
    )
    .get(partId) as
    | (PartRecord & { status: string })
    | undefined;

  if (!part) throw new Error("Part not found");

  if (part.status === "ready") {
    return { processed: false, partId: part.id, skipped: true as const };
  }

  if (part.status !== "processing") {
    db.prepare(
      "UPDATE parts SET status = 'processing', error_message = NULL WHERE id = ?",
    ).run(part.id);
  }

  try {
    const audio = await synthesizePartAudio(part.body);

    if (isTtsPartCancelled(generation)) {
      db.prepare(
        "UPDATE parts SET status = 'pending', error_message = 'Cancelled' WHERE id = ?",
      ).run(part.id);
      return { processed: false, partId: part.id, cancelled: true as const };
    }

    const chapter = db
      .prepare(
        `
        SELECT c.source_path, c.book_id, b.source_key, b.title
        FROM chapters c
        JOIN books b ON b.id = c.book_id
        WHERE c.id = ?
      `,
      )
      .get(part.chapter_id) as
      | {
          source_path: string | null;
          book_id: string;
          source_key: string | null;
          title: string;
        }
      | undefined;

    if (!chapter) {
      throw new Error("Chapter not found for audio save");
    }

    const bookKey = chapter.source_key ?? chapter.title ?? chapter.book_id;

    const audioCtx = buildAudioContext(
      bookKey,
      chapter.source_path,
      part.chapter_id,
      part.part_index,
      audio.extension,
    );
    const relativePath = buildAudioRelativePath(audioCtx);
    await saveAudioFile(relativePath, audio.buffer);
    if (audio.alignment) {
      await saveAlignmentFile(relativePath, audio.alignment);
    }

    db.prepare(
      `
      UPDATE parts SET
        status = 'ready',
        audio_path = ?,
        audio_url = ?,
        processed_at = ?
      WHERE id = ?
    `,
    ).run(
      relativePath,
      audioUrlForRelativePath(relativePath),
      new Date().toISOString(),
      part.id,
    );

    return { processed: true, partId: part.id, label: part.label };
  } catch (err) {
    const message = formatTtsError(err);
    db.prepare(
      "UPDATE parts SET status = 'failed', error_message = ? WHERE id = ?",
    ).run(message, part.id);
    throw err;
  }
}

function claimNextQueuedPart(scopePartIds?: string[]): string | null {
  const db = getDb();
  const maxConcurrent = getTtsParallelJobs();

  const claim = db.transaction(() => {
    const processing = db
      .prepare("SELECT COUNT(*) AS n FROM parts WHERE status = 'processing'")
      .get() as { n: number };
    if (processing.n >= maxConcurrent) return null;

    let row: { id: string } | undefined;

    if (scopePartIds && scopePartIds.length > 0) {
      const placeholders = scopePartIds.map(() => "?").join(", ");
      row = db
        .prepare(
          `
          SELECT id FROM parts
          WHERE status IN ('queued', 'pending') AND id IN (${placeholders})
          ORDER BY created_at ASC
          LIMIT 1
        `,
        )
        .get(...scopePartIds) as { id: string } | undefined;
    } else {
      row =
        (db
          .prepare(
            `
            SELECT id FROM parts
            WHERE status = 'queued'
            ORDER BY created_at ASC
            LIMIT 1
          `,
          )
          .get() as { id: string } | undefined) ??
        (db
          .prepare(
            `
            SELECT id FROM parts
            WHERE status = 'pending'
            ORDER BY created_at ASC
            LIMIT 1
          `,
          )
          .get() as { id: string } | undefined);
    }

    if (!row) return null;

    const result = db
      .prepare(
        `
        UPDATE parts
        SET status = 'processing', error_message = NULL
        WHERE id = ? AND status IN ('queued', 'pending')
      `,
      )
      .run(row.id);

    return result.changes > 0 ? row.id : null;
  });

  return claim();
}

export async function processQueuedPartsParallel(
  scopePartIds: string[],
  maxWorkers = getTtsParallelJobs(),
): Promise<{ processed: number; errors: number }> {
  if (scopePartIds.length === 0) {
    return { processed: 0, errors: 0 };
  }

  const scope = [...scopePartIds];
  let processed = 0;
  let errors = 0;
  const generation = getTtsRunGeneration();

  async function worker() {
    while (true) {
      if (isTtsPartCancelled(generation)) return;
      const partId = claimNextQueuedPart(scope);
      if (!partId) return;

      try {
        const result = await processPartById(partId, generation);
        if ("processed" in result && result.processed) processed++;
      } catch {
        errors++;
      }
    }
  }

  const workers = Math.min(maxWorkers, scope.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));

  return { processed, errors };
}

export async function processNextPendingPart() {
  const partId = claimNextQueuedPart();
  if (!partId) {
    return { skipped: true, reason: "queue_empty" as const };
  }

  return processPartById(partId);
}

export function markPartsQueued(partIds: string[]): "queued" | "pending" {
  const db = getDb();
  const placeholders = partIds.map(() => "?").join(", ");
  db.prepare(
    `UPDATE parts SET status = 'queued', error_message = NULL WHERE id IN (${placeholders})`,
  ).run(...partIds);
  return "queued";
}

export function resetStuckProcessingParts(chapterId: string): void {
  getDb()
    .prepare(
      "UPDATE parts SET status = 'pending', error_message = NULL WHERE chapter_id = ? AND status = 'processing'",
    )
    .run(chapterId);
}

export function getChapterPartsForQueue(chapterId: string) {
  return getDb()
    .prepare(
      "SELECT id, status, part_index FROM parts WHERE chapter_id = ? ORDER BY part_index ASC",
    )
    .all(chapterId) as Array<{
    id: string;
    status: string;
    part_index: number;
  }>;
}

export function getChapterHashes(chapterId: string) {
  return getDb()
    .prepare(
      "SELECT id, content_hash, dictated_content_hash FROM chapters WHERE id = ?",
    )
    .get(chapterId) as
    | {
        id: string;
        content_hash: string | null;
        dictated_content_hash: string | null;
      }
    | undefined;
}

export function resetReadyPartsForRedictate(partIds: string[]): void {
  if (partIds.length === 0) return;
  const db = getDb();
  const placeholders = partIds.map(() => "?").join(", ");
  db.prepare(
    `
    UPDATE parts SET
      status = 'pending',
      audio_url = NULL,
      audio_path = NULL,
      error_message = NULL
    WHERE id IN (${placeholders})
  `,
  ).run(...partIds);
}

export function resolveQueueablePartIds(
  chapterId: string,
  requestedPartIds?: string[],
  options?: { force?: boolean },
): { queueIds: string[] } | { error: string; status: number } {
  resetStuckProcessingParts(chapterId);

  const chapter = getChapterHashes(chapterId);
  if (!chapter) {
    return { error: "Chapter not found", status: 404 };
  }

  const chapterParts = getChapterPartsForQueue(chapterId);
  if (!chapterParts.length) {
    return {
      error:
        "No parts for this chapter — re-save the file in your watch folder.",
      status: 404,
    };
  }

  const requestedIds = new Set(requestedPartIds?.filter(Boolean) ?? []);
  let parts = chapterParts;

  if (requestedIds.size > 0) {
    const matched = chapterParts.filter((p) => requestedIds.has(p.id));
    if (matched.length > 0) {
      parts = matched;
    }
  }

  let queueable = parts.filter((p) => QUEUEABLE.has(p.status));

  const textStale =
    Boolean(chapter.content_hash) &&
    chapter.content_hash !== chapter.dictated_content_hash;

  if (queueable.length === 0 && textStale) {
    const readyIds = parts.filter((p) => p.status === "ready").map((p) => p.id);
    if (readyIds.length > 0) {
      resetReadyPartsForRedictate(readyIds);
      queueable = parts.filter((p) => readyIds.includes(p.id));
    }
  }

  if (queueable.length === 0 && options?.force) {
    const resetIds = parts
      .filter((p) => p.status === "ready" || p.status === "failed")
      .map((p) => p.id);
    if (resetIds.length > 0) {
      resetReadyPartsForRedictate(resetIds);
      queueable = parts.filter((p) => resetIds.includes(p.id));
    }
  }

  if (queueable.length === 0) {
    return {
      error:
        "Nothing to dictate — parts are already ready, queued, or processing.",
      status: 400,
    };
  }

  return { queueIds: queueable.map((p) => p.id) };
}

export async function queueAndProcessChapter(
  chapterId: string,
  requestedPartIds?: string[],
  options?: { force?: boolean; background?: boolean },
): Promise<{
  queued: number;
  processed: number;
  errors: number;
  error?: string;
}> {
  const resolved = resolveQueueablePartIds(chapterId, requestedPartIds, options);
  if ("error" in resolved) {
    return {
      queued: 0,
      processed: 0,
      errors: 0,
      error: resolved.error,
    };
  }

  const { queueIds } = resolved;
  markPartsQueued(queueIds);

  if (options?.background) {
    void processQueuedPartsParallel(queueIds).catch(() => {});
    return { queued: queueIds.length, processed: 0, errors: 0 };
  }

  try {
    const { processed, errors } = await processQueuedPartsParallel(queueIds);
    return { queued: queueIds.length, processed, errors };
  } catch (err) {
    const message = err instanceof Error ? err.message : "TTS failed";
    return {
      queued: queueIds.length,
      processed: 0,
      errors: 1,
      error: message,
    };
  }
}
