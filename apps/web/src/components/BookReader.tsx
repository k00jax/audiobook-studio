"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChapterDragHandle } from "@/components/ChapterDragHandle";
import { ChapterPlayerPanel } from "@/components/ChapterPlayerPanel";
import { CompiledAudioPanel } from "@/components/CompiledAudioPanel";
import { DictationStatusBar } from "@/components/DictationStatusBar";
import { ProjectStatsBar } from "@/components/ProjectStatsBar";
import { InlineEditable } from "@/components/InlineEditable";
import {
  chapterParentPath,
  reorderBefore,
  siblingsInParent,
  sortOrdersFromIds,
} from "@/lib/chapter-reorder";
import {
  buildChapterTree,
  displayChapterTitle,
  type TreeNode,
} from "@/lib/chapter-tree";

import type { BookProjectStats, ChapterRow, CompiledAudioEntry } from "@/lib/types";
import {
  chapterHasCurrentAudio,
  chapterIsBusy,
  chapterSelectableForCompile,
  chapterSelectableForDictate,
  chapterSourceStatus,
  computeDictationProgress,
} from "@/lib/chapter-status";
import { ChapterRowStatusIndicator } from "@/components/SourceStatusBadge";
import { SyncRefreshButton } from "@/components/SyncRefreshButton";

type Props = {
  bookId: string;
  bookTitle: string;
  chapters: ChapterRow[];
  playback: Record<string, number>;
  stats: BookProjectStats;
  compiled: CompiledAudioEntry[];
  initialPendingChanges?: number;
};

type ListMode = "dictate" | "compile";

function bookHasActiveTts(chapters: ChapterRow[]): boolean {
  return chapters.some((ch) =>
    ch.parts.some((p) => p.status === "queued" || p.status === "processing"),
  );
}

function chaptersInTreeOrder(nodes: TreeNode[]): ChapterRow[] {
  const out: ChapterRow[] = [];
  for (const node of nodes) {
    if (node.type === "folder") {
      out.push(...chaptersInTreeOrder(node.children));
    } else {
      out.push(node.chapter);
    }
  }
  return out;
}

export function BookReader({
  bookId,
  bookTitle: initialBookTitle,
  chapters,
  playback,
  stats: initialStats,
  compiled: initialCompiled,
  initialPendingChanges = 0,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [bookTitle, setBookTitle] = useState(initialBookTitle);
  const [chapterTitles, setChapterTitles] = useState<Record<string, string>>(
    () =>
      Object.fromEntries(
        chapters.map((c) => [
          c.id,
          displayChapterTitle(c, initialBookTitle),
        ]),
      ),
  );
  const [openChapterId, setOpenChapterId] = useState<string | null>(null);
  const [dictationActive, setDictationActive] = useState(() =>
    bookHasActiveTts(chapters),
  );
  const [dictationStartedAt, setDictationStartedAt] = useState<number | null>(
    () => (bookHasActiveTts(chapters) ? Date.now() : null),
  );
  const [dictationScopeIds, setDictationScopeIds] = useState<string[]>(() =>
    bookHasActiveTts(chapters)
      ? chapters.filter(chapterIsBusy).map((c) => c.id)
      : [],
  );
  const [recentlyCompletedIds, setRecentlyCompletedIds] = useState<
    Set<string>
  >(() => new Set());
  const chapterBusySnapshot = useRef<Map<string, boolean>>(new Map());
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [listMode, setListMode] = useState<ListMode>("dictate");
  const [compiled, setCompiled] = useState(initialCompiled);
  const [compiling, setCompiling] = useState(false);
  const [compileNameOpen, setCompileNameOpen] = useState(false);
  const [compileName, setCompileName] = useState("");
  const [localSortOrders, setLocalSortOrders] = useState<Record<string, number>>(
    {},
  );
  const [dragChapterId, setDragChapterId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [selectedChapterIds, setSelectedChapterIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [pendingDiskChanges, setPendingDiskChanges] = useState(
    initialPendingChanges,
  );
  const [autoSyncing, setAutoSyncing] = useState(false);
  const autoSyncInFlight = useRef(false);

  useEffect(() => {
    const fromUrl = searchParams.get("chapter");
    if (fromUrl && chapters.some((c) => c.id === fromUrl)) {
      setOpenChapterId(fromUrl);
    }
  }, [searchParams, chapters]);

  useEffect(() => {
    setPendingDiskChanges(initialPendingChanges);
  }, [initialPendingChanges]);

  useEffect(() => {
    setCompiled(initialCompiled);
  }, [initialCompiled]);

  useEffect(() => {
    const hasActive = bookHasActiveTts(chapters);
    if (hasActive) {
      setDictationActive(true);
      setDictationStartedAt((prev) => prev ?? Date.now());
      setDictationScopeIds((prev) => {
        const busyIds = chapters.filter(chapterIsBusy).map((c) => c.id);
        const merged = new Set([...prev, ...busyIds]);
        return [...merged];
      });
    } else if (dictationActive) {
      setDictationActive(false);
      setDictationStartedAt(null);
      setDictationScopeIds([]);
      setActionMessage((msg) =>
        msg?.includes("Dictating") || msg?.includes("Generating")
          ? "Dictation finished."
          : msg,
      );
    }

    const newlyCompleted: string[] = [];
    for (const ch of chapters) {
      const wasBusy = chapterBusySnapshot.current.get(ch.id);
      const isBusy = chapterIsBusy(ch);
      chapterBusySnapshot.current.set(ch.id, isBusy);
      if (wasBusy && !isBusy && chapterHasCurrentAudio(ch)) {
        newlyCompleted.push(ch.id);
      }
    }
    if (newlyCompleted.length > 0) {
      setRecentlyCompletedIds((prev) => {
        const next = new Set(prev);
        for (const id of newlyCompleted) next.add(id);
        return next;
      });
    }
  }, [chapters, dictationActive]);

  useEffect(() => {
    if (recentlyCompletedIds.size === 0) return;
    const timeout = setTimeout(() => setRecentlyCompletedIds(new Set()), 12_000);
    return () => clearTimeout(timeout);
  }, [recentlyCompletedIds]);

  useEffect(() => {
    if (!dictationActive && !bookHasActiveTts(chapters)) return;
    const interval = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(interval);
  }, [dictationActive, chapters, router]);

  useEffect(() => {
    if (openChapterId) return;

    let cancelled = false;

    async function pollDiskChanges() {
      try {
        const res = await fetch(`/api/books/${bookId}/sync-status`);
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          hasChanges?: boolean;
          changedCount?: number;
          newOnDisk?: number;
        };
        const count = (data.changedCount ?? 0) + (data.newOnDisk ?? 0);
        setPendingDiskChanges(count);

        if (data.hasChanges && !autoSyncInFlight.current) {
          autoSyncInFlight.current = true;
          setAutoSyncing(true);
          try {
            const syncRes = await fetch(`/api/books/${bookId}/sync`, {
              method: "POST",
            });
            if (syncRes.ok && !cancelled) {
              router.refresh();
            }
          } finally {
            autoSyncInFlight.current = false;
            if (!cancelled) setAutoSyncing(false);
          }
        }
      } catch {
        /* ignore polling errors */
      }
    }

    void pollDiskChanges();
    const interval = setInterval(() => void pollDiskChanges(), 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [bookId, openChapterId, router]);

  const chaptersWithSort = useMemo(
    () =>
      chapters.map((c) => ({
        ...c,
        sort_order: localSortOrders[c.id] ?? c.sort_order ?? null,
      })),
    [chapters, localSortOrders],
  );

  const chaptersWithTitles = useMemo(
    () =>
      chaptersWithSort.map((c) => ({
        ...c,
        title: chapterTitles[c.id] ?? c.title,
      })),
    [chaptersWithSort, chapterTitles],
  );

  const tree = useMemo(
    () => buildChapterTree(chaptersWithTitles, {}),
    [chaptersWithTitles],
  );

  const dictatableChapters = useMemo(
    () => chaptersInTreeOrder(tree).filter(chapterSelectableForDictate),
    [tree],
  );

  const compileEligibleChapters = useMemo(
    () => chaptersInTreeOrder(tree).filter(chapterSelectableForCompile),
    [tree],
  );

  const orderedSelection = useMemo(
    () =>
      chaptersInTreeOrder(tree).filter((c) => selectedChapterIds.has(c.id)),
    [tree, selectedChapterIds],
  );

  const openChapter = chaptersWithTitles.find((c) => c.id === openChapterId);

  const saveBookTitle = useCallback(
    async (title: string) => {
      const res = await fetch(`/api/books/${bookId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error("Failed to save book title");
      setBookTitle(title);
      router.refresh();
    },
    [bookId, router],
  );

  const saveChapterTitle = useCallback(
    async (chapterId: string, title: string) => {
      const res = await fetch(`/api/chapters/${chapterId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error("Failed to save chapter title");
      setChapterTitles((prev) => ({ ...prev, [chapterId]: title }));
      router.refresh();
    },
    [router],
  );

  const reorderChapters = useCallback(
    async (parentPath: string, draggedId: string, targetId: string) => {
      const siblings = siblingsInParent(chaptersWithSort, parentPath);
      const ids = siblings.map((s) => s.id);
      const newIds = reorderBefore(ids, draggedId, targetId);
      if (newIds.every((id, i) => id === ids[i])) return;

      const previousOrders = Object.fromEntries(
        siblings.map((s) => [s.id, localSortOrders[s.id] ?? s.sort_order ?? null]),
      );
      setLocalSortOrders((prev) => ({ ...prev, ...sortOrdersFromIds(newIds) }));

      const res = await fetch(`/api/books/${bookId}/chapters/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentPath, chapterIds: newIds }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setActionMessage(data.error ?? "Failed to save chapter order");
        setLocalSortOrders((prev) => {
          const next = { ...prev };
          for (const id of newIds) {
            const saved = previousOrders[id];
            if (saved == null) delete next[id];
            else next[id] = saved;
          }
          return next;
        });
        router.refresh();
        return;
      }

      setLocalSortOrders({});
      router.refresh();
    },
    [bookId, chaptersWithSort, localSortOrders, router],
  );

  function openChapterPanel(chapterId: string) {
    setOpenChapterId(chapterId);
    setActionMessage(null);
    router.replace(`/books/${bookId}?chapter=${chapterId}`, { scroll: false });
  }

  const dictationProgress = useMemo(() => {
    if (dictationScopeIds.length === 0) return null;
    return computeDictationProgress(chaptersWithTitles, dictationScopeIds);
  }, [chaptersWithTitles, dictationScopeIds]);

  async function dictate(
    chapterId: string,
    partIds: string[],
    options?: { force?: boolean },
  ) {
    if (!chapterId) return;
    setDictationActive(true);
    setDictationStartedAt(Date.now());
    setDictationScopeIds((prev) =>
      prev.includes(chapterId) ? prev : [...prev, chapterId],
    );
    setActionMessage(null);
    try {
      const res = await fetch("/api/tts/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapterId,
          partIds,
          force: options?.force ?? false,
          background: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      setActionMessage(
        data.queued === 1
          ? "Started dictation — running in the background."
          : `Started dictation (${data.queued} audio segments) — running in the background.`,
      );
      router.refresh();
    } catch (e) {
      setActionMessage(e instanceof Error ? e.message : "Dictation failed");
      setDictationActive(false);
    }
  }

  async function stopTts() {
    try {
      await fetch("/api/tts/stop", { method: "POST" });
      setActionMessage("Dictation stopped.");
      setDictationActive(false);
      setDictationStartedAt(null);
      setDictationScopeIds([]);
      router.refresh();
    } catch (e) {
      setActionMessage(e instanceof Error ? e.message : "Failed to stop dictation");
    }
  }

  async function batchDictate() {
    const toProcess = orderedSelection;
    if (toProcess.length === 0) return;

    setDictationActive(true);
    setDictationStartedAt(Date.now());
    setDictationScopeIds(toProcess.map((ch) => ch.id));
    setActionMessage(null);

    try {
      const res = await fetch("/api/tts/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapterIds: toProcess.map((ch) => ch.id),
          force: true,
          background: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");

      setActionMessage(
        data.queued === 1
          ? "Started dictation for 1 chapter — running in the background."
          : `Started dictation for ${toProcess.length} chapters — running in the background.`,
      );
      setSelectedChapterIds(new Set());
      router.refresh();
    } catch (e) {
      setActionMessage(e instanceof Error ? e.message : "Batch dictation failed");
      setDictationActive(false);
    }
  }

  function switchListMode(mode: ListMode) {
    setListMode(mode);
    setSelectedChapterIds(new Set());
  }

  function selectAllInMode() {
    const ids =
      listMode === "compile"
        ? compileEligibleChapters.map((c) => c.id)
        : dictatableChapters.map((c) => c.id);
    setSelectedChapterIds(new Set(ids));
  }

  async function runCompile(name: string) {
    const toProcess = orderedSelection;
    if (toProcess.length === 0) return;

    setCompiling(true);
    setActionMessage(`Compiling ${toProcess.length} chapter(s)…`);
    try {
      const res = await fetch(`/api/books/${bookId}/compile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          chapterIds: toProcess.map((ch) => ch.id),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Compile failed");

      setCompiled((prev) => [data.compiled, ...prev]);
      setSelectedChapterIds(new Set());
      setCompileNameOpen(false);
      setCompileName("");
      setActionMessage(`Compiled "${name}" — ready to play below.`);
      router.refresh();
    } catch (e) {
      setActionMessage(e instanceof Error ? e.message : "Compile failed");
    } finally {
      setCompiling(false);
    }
  }

  function openCompilePrompt() {
    const toProcess = orderedSelection;
    if (toProcess.length === 0) return;
    const defaultName =
      toProcess.length === 1
        ? toProcess[0].title
        : `${toProcess[0].title} – ${toProcess[toProcess.length - 1].title}`;
    setCompileName(defaultName);
    setCompileNameOpen(true);
  }

  function clearSelection() {
    setSelectedChapterIds(new Set());
  }

  function renderNode(node: TreeNode): ReactNode {
    if (node.type === "folder") return null;

    const ch = node.chapter;
    const label = chapterTitles[ch.id] ?? ch.title;
    const sourceStatus = chapterSourceStatus(ch);
    const hasCurrentAudio = chapterHasCurrentAudio(ch);
    const isBusy = chapterIsBusy(ch);
    const isRecentlyCompleted = recentlyCompletedIds.has(ch.id);
    const canSelect =
      !isBusy &&
      (listMode === "compile"
        ? chapterSelectableForCompile(ch)
        : chapterSelectableForDictate(ch));
    const isSelected = selectedChapterIds.has(ch.id);
    const isActive = openChapterId === ch.id;
    const parentPath = chapterParentPath(ch.source_path);
    const isDragging = dragChapterId === ch.id;
    const isDropTarget = dropTargetId === ch.id;
    const draggedChapter = dragChapterId
      ? chaptersWithSort.find((c) => c.id === dragChapterId)
      : null;
    const canDrop =
      draggedChapter != null &&
      dragChapterId !== ch.id &&
      chapterParentPath(draggedChapter.source_path) === parentPath;

    return (
      <li
        key={ch.id}
        onDragOver={(e) => {
          if (!canDrop) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setDropTargetId(ch.id);
        }}
        onDragLeave={() => {
          if (dropTargetId === ch.id) setDropTargetId(null);
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (canDrop && dragChapterId) {
            void reorderChapters(parentPath, dragChapterId, ch.id);
          }
          setDragChapterId(null);
          setDropTargetId(null);
        }}
        className={
          isDropTarget
            ? "rounded-md ring-2 ring-[var(--accent)] ring-inset"
            : undefined
        }
      >
        <div
          className={`flex items-center gap-1 rounded py-0.5 pr-2 hover:bg-[var(--surface)] ${
            isDragging ? "opacity-50" : ""
          } ${isActive ? "bg-[var(--accent)]/10 ring-1 ring-[var(--accent)]/30" : ""} ${
            isRecentlyCompleted
              ? "bg-emerald-500/15 ring-1 ring-emerald-500/40 transition-colors duration-500"
              : ""
          } ${isBusy ? "bg-amber-500/5" : ""}`}
          style={{ paddingLeft: "8px" }}
        >
          {canSelect ? (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={(e) => {
                setSelectedChapterIds((prev) => {
                  const next = new Set(prev);
                  if (e.target.checked) next.add(ch.id);
                  else next.delete(ch.id);
                  return next;
                });
              }}
              onClick={(e) => e.stopPropagation()}
              className="shrink-0"
              aria-label={`Select ${label} for dictation`}
            />
          ) : (
            <span className="w-4 shrink-0" aria-hidden />
          )}
          <button
            type="button"
            onClick={() => openChapterPanel(ch.id)}
            title={label}
            className="flex min-w-0 flex-1 cursor-pointer items-start py-2 text-left"
          >
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 truncate text-sm leading-snug text-[var(--text)]">
                  {label}
                </span>
                <ChapterRowStatusIndicator
                  status={sourceStatus}
                  hasCurrentAudio={hasCurrentAudio}
                  needsSync={ch.needs_sync}
                  parts={ch.parts}
                />
              </span>
              {ch.file_modified_label && (
                <span className="mt-0.5 block text-[11px] text-[var(--muted)]">
                  Modified {ch.file_modified_label}
                </span>
              )}
            </span>
          </button>
          <ChapterDragHandle
            onDragStart={() => setDragChapterId(ch.id)}
            onDragEnd={() => {
              setDragChapterId(null);
              setDropTargetId(null);
            }}
          />
        </div>
      </li>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-7xl flex-col px-4 py-6">
      <header className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href="/" className="text-xs text-[var(--muted)] hover:text-[var(--accent)]">
            ← Library
          </Link>
          <InlineEditable
            value={bookTitle}
            onSave={saveBookTitle}
            className="mt-1 block text-2xl font-semibold"
            ariaLabel="Book title"
          />
          <p className="mt-1 text-xs text-[var(--muted)]">
            Click a chapter to play · use Dictate or Compile mode to batch process chapters
          </p>
        </div>
        <div className="shrink-0 text-right">
          <Link href="/settings" className="text-sm text-[var(--muted)]">
            Settings
          </Link>
          <div className="mt-2">
            <SyncRefreshButton scope="book" bookId={bookId} compact />
          </div>
        </div>
      </header>

      {(pendingDiskChanges > 0 || autoSyncing) && (
        <p className="mb-3 rounded-md border border-violet-400/40 bg-violet-400/10 px-3 py-2 text-sm text-violet-100">
          {autoSyncing
            ? "Syncing folder changes…"
            : `${pendingDiskChanges} file(s) changed on disk — syncing automatically.`}
        </p>
      )}

      <DictationStatusBar
        active={dictationActive}
        startedAt={dictationStartedAt}
        progress={dictationProgress}
        actionMessage={dictationActive ? null : actionMessage}
        onStop={() => void stopTts()}
      />

      <ProjectStatsBar
        stats={initialStats}
        listMode={listMode}
        onListModeChange={switchListMode}
        selectedCount={selectedChapterIds.size}
        compileEligibleCount={compileEligibleChapters.length}
        onSelectAll={selectAllInMode}
        onClearSelection={clearSelection}
        onBatchAction={() =>
          listMode === "compile" ? openCompilePrompt() : void batchDictate()
        }
        batchActionLabel={listMode === "compile" ? "Compile selected" : "Dictate selected"}
        batchDisabled={selectedChapterIds.size === 0}
        compiling={compiling}
      />

      <CompiledAudioPanel
        compiled={compiled}
        bookId={bookId}
        onDeleted={() => router.refresh()}
        onReordered={setCompiled}
      />

      {compileNameOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 shadow-xl">
            <h3 className="text-sm font-medium">Name compiled audio</h3>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Combines {orderedSelection.length} chapter(s) with a 2 second pause between each.
            </p>
            <input
              value={compileName}
              onChange={(e) => setCompileName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && compileName.trim()) {
                  void runCompile(compileName.trim());
                }
              }}
              autoFocus
              className="mt-3 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm"
              placeholder="e.g. Part 1 (Ch 1–3)"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={compiling}
                onClick={() => {
                  setCompileNameOpen(false);
                  setCompileName("");
                }}
                className="rounded border border-[var(--border)] px-3 py-1.5 text-sm disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={compiling || !compileName.trim()}
                onClick={() => void runCompile(compileName.trim())}
                className="rounded bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-black disabled:opacity-50"
              >
                {compiling ? "Compiling…" : "Compile"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid flex-1 gap-4 lg:grid-cols-2 lg:items-start">
        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)]/40">
          <div className="border-b border-[var(--border)] px-3 py-2">
            <h2 className="text-xs font-medium uppercase tracking-widest text-[var(--muted)]">
              Contents
              {listMode === "compile" && (
                <span className="ml-2 normal-case tracking-normal text-[var(--accent)]">
                  — select chapters with ✓ audio
                </span>
              )}
            </h2>
          </div>
          <nav className="max-h-[min(75dvh,48rem)] overflow-y-auto p-2">
            {tree.length > 0 ? (
              <ul>{tree.map((node) => renderNode(node))}</ul>
            ) : (
              <p className="p-3 text-sm text-[var(--muted)]">
                No chapters yet. Add files to your watch folder.
              </p>
            )}
          </nav>
        </section>

        <aside className="lg:sticky lg:top-4">
          {openChapter ? (
            <ChapterPlayerPanel
              key={openChapter.id}
              chapter={openChapter}
              title={chapterTitles[openChapter.id] ?? openChapter.title}
              playback={playback}
              onSaveTitle={(t) => saveChapterTitle(openChapter.id, t)}
              onDictate={dictate}
              onStopTts={stopTts}
              dictationActive={dictationActive}
              actionMessage={actionMessage}
            />
          ) : (
            <div className="flex min-h-[min(65dvh,40rem)] items-center justify-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)]/20 p-8 text-center text-sm text-[var(--muted)]">
              Select a chapter from the table to listen, bookmark, or dictate.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
