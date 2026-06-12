import "server-only";
import {
  chapterParentPath,
  chapterPathSortKey,
} from "./chapter-reorder";
import { getDb } from "./db";

/** Assign stepped sort_order within each folder for chapters that never received one. */
export function backfillChapterSortOrders(bookId: string): void {
  const db = getDb();
  const chapters = db
    .prepare(
      "SELECT id, source_path, sort_order FROM chapters WHERE book_id = ?",
    )
    .all(bookId) as Array<{
    id: string;
    source_path: string | null;
    sort_order: number | null;
  }>;

  const byParent = new Map<string, typeof chapters>();
  for (const chapter of chapters) {
    const parent = chapterParentPath(chapter.source_path);
    const list = byParent.get(parent) ?? [];
    list.push(chapter);
    byParent.set(parent, list);
  }

  const update = db.prepare(
    "UPDATE chapters SET sort_order = ?, updated_at = ? WHERE id = ?",
  );
  const now = new Date().toISOString();

  function pathOrder(
    a: { source_path: string | null },
    b: { source_path: string | null },
  ) {
    return chapterPathSortKey(a.source_path, "").localeCompare(
      chapterPathSortKey(b.source_path, ""),
      undefined,
      { numeric: true, sensitivity: "base" },
    );
  }

  for (const siblings of byParent.values()) {
    const withoutOrder = siblings.filter((ch) => ch.sort_order == null);
    if (withoutOrder.length === 0) continue;

    const tx = db.transaction(() => {
      if (siblings.every((ch) => ch.sort_order == null)) {
        const sorted = [...siblings].sort(pathOrder);
        sorted.forEach((ch, index) => {
          update.run(index * 1000, now, ch.id);
        });
        return;
      }

      let maxOrder = Math.max(
        ...siblings
          .map((ch) => ch.sort_order)
          .filter((value): value is number => value != null),
      );
      const sortedNew = [...withoutOrder].sort(pathOrder);
      for (const chapter of sortedNew) {
        maxOrder += 1000;
        update.run(maxOrder, now, chapter.id);
      }
    });
    tx();
  }
}

export function persistSiblingChapterOrder(
  bookId: string,
  _parentPath: string,
  chapterIds: string[],
): void {
  const db = getDb();
  const now = new Date().toISOString();
  const update = db.prepare(
    "UPDATE chapters SET sort_order = ?, updated_at = ? WHERE id = ? AND book_id = ?",
  );

  const tx = db.transaction(() => {
    chapterIds.forEach((id, index) => {
      update.run(index * 1000, now, id, bookId);
    });
  });
  tx();
}
