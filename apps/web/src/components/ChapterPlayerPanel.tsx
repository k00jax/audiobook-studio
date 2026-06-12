"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AudioPanel } from "@/components/AudioPanel";
import { LoadingBlock, Spinner } from "@/components/Spinner";
import type { ChapterRow, PartRow } from "@/lib/types";
import { isDictatableStatus } from "@/lib/chapter-status";
import { chapterSourceStatus } from "@/lib/chapter-status";
import { SourceStatusBanner } from "@/components/SourceStatusBadge";
import { formatTime } from "@/lib/chapter-order";

type Bookmark = {
  id: string;
  number: number;
  filename: string;
  position_sec: number;
  part_id: string | null;
  note: string | null;
  created_at: string;
};

type Props = {
  chapter: ChapterRow;
  title: string;
  playback: Record<string, number>;
  onSaveTitle: (title: string) => Promise<void>;
  onDictate: (
    chapterId: string,
    partIds: string[],
    options?: { force?: boolean },
  ) => Promise<void>;
  onStopTts: () => Promise<void>;
  dictationActive: boolean;
  actionMessage: string | null;
};

function readyParts(parts: PartRow[]) {
  return parts
    .filter((p) => p.status === "ready" && p.audio_url)
    .sort((a, b) => a.part_index - b.part_index);
}

function statusLabel(status: string): string {
  switch (status) {
    case "draft":
    case "pending":
      return "Not dictated";
    case "queued":
      return "Queued";
    case "processing":
      return "Generating Speech";
    case "ready":
      return "Ready";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}

export function ChapterPlayerPanel({
  chapter,
  title,
  playback,
  onSaveTitle,
  onDictate,
  onStopTts,
  dictationActive,
  actionMessage,
}: Props) {
  const [draftTitle, setDraftTitle] = useState(title);
  const [savingTitle, setSavingTitle] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activePartId, setActivePartId] = useState<string | null>(null);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [sourceText, setSourceText] = useState<string | null>(null);
  const [sourcePath, setSourcePath] = useState<string | null>(null);
  const [followAlongText, setFollowAlongText] = useState<string | undefined>();
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [bookmarksLoading, setBookmarksLoading] = useState(false);
  const [bookmarkSaving, setBookmarkSaving] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [bookmarkError, setBookmarkError] = useState<string | null>(null);
  const [displayPlaybackSec, setDisplayPlaybackSec] = useState(0);
  const [pendingSeekSec, setPendingSeekSec] = useState<number | null>(null);
  const playbackSecRef = useRef(0);

  const sortedParts = [...chapter.parts].sort(
    (a, b) => a.part_index - b.part_index,
  );
  const playable = readyParts(chapter.parts);
  const selectable = sortedParts.filter((p) => isDictatableStatus(p.status));
  const sourceStatus = chapterSourceStatus(chapter);
  const hasBusyParts = sortedParts.some(
    (p) => p.status === "queued" || p.status === "processing",
  );
  const isChapterBusy = dictationActive || hasBusyParts;
  const canForceRedictate = sortedParts.some(
    (p) => p.status === "ready" || p.status === "failed",
  );
  const canDictate =
    selectable.length > 0 || sourceStatus === "updated" || canForceRedictate;
  const dictateLabel =
    sourceStatus === "updated"
      ? "Regenerate audio"
      : canForceRedictate && selectable.length === 0
        ? "Re-dictate"
        : "Dictate";
  const activePart =
    playable.find((p) => p.id === activePartId) ?? playable[0] ?? null;

  const loadBookmarks = useCallback(async () => {
    setBookmarksLoading(true);
    try {
      const res = await fetch(`/api/chapters/${chapter.id}/bookmarks`);
      const data = await res.json();
      if (res.ok) setBookmarks(data.bookmarks ?? []);
    } catch {
      /* ignore */
    } finally {
      setBookmarksLoading(false);
    }
  }, [chapter.id]);

  useEffect(() => {
    setDraftTitle(title);
    setSelected(new Set());
    setSourceOpen(false);
    setSourceText(null);
    setSourcePath(null);
    setSourceError(null);
    setShowNoteForm(false);
    setNoteDraft("");
    const first = readyParts(chapter.parts)[0];
    setActivePartId(first?.id ?? null);
    void loadBookmarks();
  }, [chapter.id, title, loadBookmarks]);

  useEffect(() => {
    setActivePartId((current) => {
      const ready = readyParts(chapter.parts);
      if (ready.length === 0) return null;
      if (current && ready.some((p) => p.id === current)) return current;
      return ready[0].id;
    });
  }, [chapter.parts]);

  useEffect(() => {
    const fromPart = activePart?.body?.trim();
    if (fromPart) {
      setFollowAlongText(fromPart);
      return;
    }

    let cancelled = false;
    void fetch(`/api/chapters/${chapter.id}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data.raw_text) {
          setFollowAlongText(data.raw_text as string);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [chapter.id, activePart?.id, activePart?.body]);

  async function saveTitle() {
    const trimmed = draftTitle.trim();
    if (!trimmed || trimmed === title) return;
    setSavingTitle(true);
    try {
      await onSaveTitle(trimmed);
    } finally {
      setSavingTitle(false);
    }
  }

  function playNextPart() {
    if (!activePart || playable.length === 0) return;
    const idx = playable.findIndex((p) => p.id === activePart.id);
    const next = playable[idx + 1];
    if (next) setActivePartId(next.id);
  }

  async function toggleSource() {
    if (sourceOpen) {
      setSourceOpen(false);
      return;
    }

    if (sourceText === null) {
      setSourceLoading(true);
      setSourceError(null);
      try {
        const res = await fetch(`/api/chapters/${chapter.id}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load source");
        setSourceText(data.raw_text ?? "");
        setSourcePath(data.source_path ?? null);
      } catch (e) {
        setSourceError(e instanceof Error ? e.message : "Failed to load source");
        return;
      } finally {
        setSourceLoading(false);
      }
    }

    setSourceOpen(true);
  }

  async function addBookmark(withNote: boolean) {
    setBookmarkError(null);
    setBookmarkSaving(true);
    try {
      const res = await fetch(`/api/chapters/${chapter.id}/bookmarks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          positionSec: playbackSecRef.current,
          partId: activePart?.id ?? null,
          note: withNote ? noteDraft : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save bookmark");
      setBookmarks((prev) =>
        [...prev, data.bookmark as Bookmark].sort((a, b) => a.number - b.number),
      );
      setShowNoteForm(false);
      setNoteDraft("");
    } catch (e) {
      setBookmarkError(e instanceof Error ? e.message : "Bookmark failed");
    } finally {
      setBookmarkSaving(false);
    }
  }

  function seekToBookmark(sec: number) {
    playbackSecRef.current = sec;
    setDisplayPlaybackSec(sec);
    setPendingSeekSec(sec);
  }

  return (
    <div className="flex h-full min-h-[min(65dvh,40rem)] flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]/40">
      <div className="border-b border-[var(--border)] px-4 py-3">
        <label
          htmlFor="chapter-player-name"
          className="block text-xs font-medium uppercase tracking-wide text-[var(--muted)]"
        >
          Chapter
        </label>
        <input
          id="chapter-player-name"
          value={draftTitle}
          disabled={savingTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          onBlur={() => void saveTitle()}
          onKeyDown={(e) => {
            if (e.key === "Enter") void saveTitle();
          }}
          className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-base text-[var(--text)] outline-none focus:border-[var(--accent)]"
        />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <SourceStatusBanner status={sourceStatus} />

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!canDictate}
            onClick={() =>
              void onDictate(
                chapter.id,
                selected.size > 0
                  ? [...selected]
                  : selectable.length > 0
                    ? selectable.map((p) => p.id)
                    : sortedParts.map((p) => p.id),
                {
                  force:
                    selectable.length === 0 &&
                    (sourceStatus === "current" || canForceRedictate),
                },
              )
            }
            className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-medium text-black disabled:opacity-50"
          >
            {dictateLabel}
            {selectable.length > 0
              ? ` (${selected.size > 0 ? selected.size : selectable.length})`
              : ""}
          </button>
          {isChapterBusy && (
            <button
              type="button"
              onClick={() => void onStopTts()}
              className="rounded-md border border-red-400/60 px-3 py-2 text-sm text-red-300 hover:bg-red-400/10"
            >
              Stop dictation
            </button>
          )}
          <button
            type="button"
            onClick={() => void toggleSource()}
            className="rounded-md border border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)] hover:text-[var(--text)]"
          >
            {sourceOpen ? "Hide source" : "View source"}
          </button>
        </div>

        {sourceOpen && (
          <div className="mt-3 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--bg)]">
            {sourcePath && (
              <p className="border-b border-[var(--border)] px-3 py-1.5 font-mono text-xs text-[var(--muted)]">
                {sourcePath}
              </p>
            )}
            {sourceLoading ? (
              <LoadingBlock title="Loading source document" />
            ) : sourceError ? (
              <p className="p-3 text-sm text-red-400">{sourceError}</p>
            ) : (
              <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words p-3 font-mono text-xs leading-relaxed">
                {sourceText}
              </pre>
            )}
          </div>
        )}

        <div className="mt-4">
          {activePart?.audio_url ? (
            <>
              {playable.length > 1 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {playable.map((part) => (
                    <button
                      key={part.id}
                      type="button"
                      onClick={() => setActivePartId(part.id)}
                      className={`rounded-full px-3 py-1 text-xs ${
                        part.id === activePart?.id
                          ? "bg-[var(--accent)] text-black"
                          : "border border-[var(--border)]"
                      }`}
                    >
                      Part {part.part_index + 1}
                    </button>
                  ))}
                </div>
              )}
              <AudioPanel
                key={activePart.id}
                partId={activePart.id}
                audioUrl={activePart.audio_url}
                bodyText={followAlongText}
                fallbackDuration={activePart.estimated_seconds}
                initialPositionMs={playback[activePart.id] ?? 0}
                onEnded={playable.length > 1 ? playNextPart : undefined}
                compact
                onTimeUpdate={(sec) => {
                  playbackSecRef.current = sec;
                  setDisplayPlaybackSec(sec);
                }}
                seekToSec={pendingSeekSec}
                onSeekApplied={() => setPendingSeekSec(null)}
              />
            </>
          ) : hasBusyParts ? (
            <LoadingBlock
              title="Generating speech"
              detail="Dictation runs in the background — you can browse other chapters."
            />
          ) : (
            <p className="rounded-md border border-dashed border-[var(--border)] py-6 text-center text-sm text-[var(--muted)]">
              {sortedParts.length === 0
                ? "No parts for this chapter yet."
                : "Tap Dictate to generate audio."}
            </p>
          )}
        </div>

        {activePart?.audio_url && (
          <div className="mt-4 border-t border-[var(--border)] pt-4">
            <h3 className="text-sm font-medium">Bookmarks</h3>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Saved to your project Notes folder until this chapter file changes.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={bookmarkSaving}
                onClick={() => void addBookmark(false)}
                className="rounded border border-[var(--border)] px-2 py-1 text-xs hover:border-[var(--accent-dim)] disabled:opacity-50"
              >
                Bookmark here ({formatTime(displayPlaybackSec)})
              </button>
              <button
                type="button"
                disabled={bookmarkSaving}
                onClick={() => setShowNoteForm((v) => !v)}
                className="rounded border border-[var(--border)] px-2 py-1 text-xs hover:border-[var(--accent-dim)] disabled:opacity-50"
              >
                Bookmark + note
              </button>
            </div>
            {showNoteForm && (
              <div className="mt-2 space-y-2">
                <textarea
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  rows={3}
                  placeholder="Your note…"
                  className="w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm"
                />
                <button
                  type="button"
                  disabled={bookmarkSaving}
                  onClick={() => void addBookmark(true)}
                  className="rounded bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-black disabled:opacity-50"
                >
                  Save bookmark with note
                </button>
              </div>
            )}
            {bookmarkError && (
              <p className="mt-2 text-xs text-red-400">{bookmarkError}</p>
            )}
            {bookmarksLoading ? (
              <p className="mt-3 text-xs text-[var(--muted)]">Loading bookmarks…</p>
            ) : bookmarks.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {bookmarks.map((bm) => (
                  <li
                    key={bm.id}
                    className="rounded border border-[var(--border)] bg-[var(--bg)]/50 px-3 py-2 text-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium text-[var(--accent)]">
                        #{bm.number} · {formatTime(bm.position_sec)}
                      </span>
                      <span className="shrink-0 text-[10px] text-[var(--muted)]">
                        {bm.filename}
                      </span>
                    </div>
                    {bm.note && (
                      <p className="mt-1 whitespace-pre-wrap text-xs text-[var(--text)]">
                        {bm.note}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => seekToBookmark(bm.position_sec)}
                      className="mt-1 text-xs text-[var(--accent)] hover:underline"
                    >
                      Jump to position
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-xs text-[var(--muted)]">
                No bookmarks for this version of the chapter yet.
              </p>
            )}
          </div>
        )}

        {sortedParts.length > 1 && (
          <div className="mt-4 border-t border-[var(--border)] pt-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Parts</h3>
              {selectable.length > 1 && (
                <button
                  type="button"
                  className="text-xs text-[var(--accent)]"
                  onClick={() =>
                    setSelected(
                      selected.size === selectable.length
                        ? new Set()
                        : new Set(selectable.map((p) => p.id)),
                    )
                  }
                >
                  {selected.size === selectable.length ? "Clear" : "Select all"}
                </button>
              )}
            </div>
            <ul className="mt-2 space-y-2">
              {sortedParts.map((part) => (
                <li
                  key={part.id}
                  className="flex items-center gap-2 text-sm"
                >
                  {isDictatableStatus(part.status) ? (
                    <input
                      type="checkbox"
                      checked={selected.has(part.id)}
                      onChange={() =>
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(part.id)) next.delete(part.id);
                          else next.add(part.id);
                          return next;
                        })
                      }
                      className="accent-[var(--accent)]"
                    />
                  ) : part.status === "queued" || part.status === "processing" ? (
                    <Spinner size="sm" />
                  ) : (
                    <span className="inline-block w-4" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1 truncate">{part.label}</span>
                  <span
                    className={`shrink-0 text-xs ${
                      part.status === "ready"
                        ? "text-[var(--accent)]"
                        : part.status === "failed"
                          ? "text-red-400"
                          : "text-[var(--muted)]"
                    }`}
                  >
                    {statusLabel(part.status)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {actionMessage && (
          <p
            className={`mt-3 text-sm ${
              actionMessage.toLowerCase().includes("fail") ||
              actionMessage.toLowerCase().includes("error")
                ? "text-red-400"
                : "text-[var(--accent)]"
            }`}
          >
            {actionMessage}
          </p>
        )}
      </div>
    </div>
  );
}
