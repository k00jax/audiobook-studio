import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BookReader } from "@/components/BookReader";
import {
  displayChapterTitle,
  shouldBackfillChapterTitle,
} from "@/lib/chapter-tree";
import { enrichChaptersWithFileMeta } from "@/lib/chapter-file-meta";
import { backfillChapterSortOrders } from "@/lib/chapter-reorder-server";
import { isChapterAtBookRoot } from "@/lib/chapter-reorder";
import { getBookById } from "@/lib/books";
import {
  fetchBookChapters,
  getPlaybackForParts,
  updateChapterTitle,
} from "@/lib/fetch-book-chapters";
import { computeBookProjectStats } from "@/lib/book-stats";
import { listCompiledAudio } from "@/lib/compiled-audio";
import { syncProjectFromDisk } from "@/lib/sync-from-disk";

export const dynamic = "force-dynamic";

export default async function BookPage({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const { bookId } = await params;
  const book = getBookById(bookId);
  if (!book) notFound();

  const projectKey = book.source_key ?? book.title;

  backfillChapterSortOrders(bookId);

  let chaptersRaw = fetchBookChapters(bookId);
  if (chaptersRaw.length === 0) {
    await syncProjectFromDisk(projectKey);
    chaptersRaw = fetchBookChapters(bookId);
    backfillChapterSortOrders(bookId);
  }

  const chapters = enrichChaptersWithFileMeta(projectKey, chaptersRaw)
    .filter((ch) => !ch.missing_on_disk)
    .filter((ch) => isChapterAtBookRoot(ch.source_path))
    .map((ch) => {
      const title = displayChapterTitle(ch, book.title);

      if (shouldBackfillChapterTitle(ch.title, book.title, ch.source_path)) {
        updateChapterTitle(ch.id, title);
      }

      return {
        ...ch,
        title,
        parts: [...ch.parts].sort((a, b) => a.part_index - b.part_index),
      };
    });

  const partIds = chapters.flatMap((ch) => ch.parts.map((p) => p.id));
  const playbackMap = getPlaybackForParts(partIds);

  const pendingDiskChanges = chapters.filter((ch) => ch.needs_sync).length;
  const stats = await computeBookProjectStats(chapters);
  const compiled = listCompiledAudio(projectKey);

  return (
    <Suspense fallback={<div className="p-8 text-[var(--muted)]">Loading…</div>}>
      <BookReader
        bookId={bookId}
        bookTitle={book.title}
        chapters={chapters}
        playback={playbackMap}
        stats={stats}
        compiled={compiled}
        initialPendingChanges={pendingDiskChanges}
      />
    </Suspense>
  );
}
