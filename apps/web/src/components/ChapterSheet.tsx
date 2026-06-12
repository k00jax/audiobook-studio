"use client";

import { useEffect, useRef, useState } from "react";
import { AudioPanel } from "@/components/AudioPanel";
import { LoadingBlock, Spinner } from "@/components/Spinner";
import type { ChapterRow, PartRow } from "@/lib/types";
import { isDictatableStatus } from "@/lib/chapter-status";
import { chapterSourceStatus } from "@/lib/chapter-status";
import { SourceStatusBanner } from "@/components/SourceStatusBadge";

type Props = {
  chapter: ChapterRow;
  title: string;
  playback: Record<string, number>;
  onClose: () => void;
  onSaveTitle: (title: string) => Promise<void>;
  onDictate: (chapterId: string, partIds: string[]) => Promise<void>;
  ttsLoading: boolean;
  actionMessage: string | null;
};

function readyParts(parts: PartRow[]) {
  return parts
    .filter((p) => p.status === "ready" && p.audio_url)
    .sort((a, b) => a.part_index - b.part_index);
}

function statusLabel(status: string, loading: boolean): string {
  if (loading && (status === "pending" || status === "draft" || status === "processing")) {
    return "Dictating…";
  }
  switch (status) {
    case "draft":
    case "pending":
      return "Not dictated";
    case "queued":
      return "Queued";
    case "processing":
      return "Dictating…";
    case "ready":
      return "Ready";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}:${s.toString().padStart(2, "0")}` : `${s}s`;
}

export function ChapterSheet({
  chapter,
  title,
  playback,
  onClose,
  onSaveTitle,
  onDictate,
  ttsLoading,
  actionMessage,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [draftTitle, setDraftTitle] = useState(title);
  const [savingTitle, setSavingTitle] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activePartId, setActivePartId] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [sourceText, setSourceText] = useState<string | null>(null);
  const [sourcePath, setSourcePath] = useState<string | null>(null);
  const [followAlongText, setFollowAlongText] = useState<string | undefined>();

  const isBusy = ttsLoading;

  const sortedParts = [...chapter.parts].sort(
    (a, b) => a.part_index - b.part_index,
  );
  const playable = readyParts(chapter.parts);
  const selectable = sortedParts.filter((p) => isDictatableStatus(p.status));
  const sourceStatus = chapterSourceStatus(chapter);
  const canDictate = selectable.length > 0 || sourceStatus === "updated";
  const dictateLabel =
    sourceStatus === "updated"
      ? "Regenerate audio"
      : sourceStatus === "new"
        ? "Dictate"
        : selectable.length > 0
          ? "Dictate"
          : "Dictate";
  const activePart =
    playable.find((p) => p.id === activePartId) ?? playable[0] ?? null;

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

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    setDraftTitle(title);
    setSelected(new Set());
    setSourceOpen(false);
    setSourceText(null);
    setSourcePath(null);
    setSourceError(null);
    const first = readyParts(chapter.parts)[0];
    setActivePartId(first?.id ?? null);
  }, [chapter.id, title]);

  useEffect(() => {
    setActivePartId((current) => {
      const ready = readyParts(chapter.parts);
      if (ready.length === 0) return null;
      if (current && ready.some((p) => p.id === current)) return current;
      return ready[0].id;
    });
  }, [chapter.parts]);

  useEffect(() => {
    if (!isBusy) {
      setElapsed(0);
      return;
    }
    const start = Date.now();
    const tick = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(tick);
  }, [isBusy]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !isBusy) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, isBusy]);

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

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current && !isBusy) onClose();
      }}
      className="fixed inset-0 z-50 m-0 h-dvh max-h-dvh w-full max-w-none border-0 bg-black/70 p-0 text-[var(--text)] backdrop:bg-black/70"
      aria-labelledby="chapter-sheet-title"
    >
      <div
        className="mx-auto flex h-full max-w-2xl flex-col justify-end sm:justify-center sm:p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex max-h-[92dvh] flex-col overflow-hidden rounded-t-xl border border-[var(--border)] bg-[var(--surface)] sm:rounded-xl">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
            <h2
              id="chapter-sheet-title"
              className="text-sm font-medium text-[var(--text)]"
            >
              Chapter
            </h2>
            <button
              type="button"
              onClick={onClose}
              disabled={isBusy}
              className="rounded px-2 py-1 text-lg leading-none text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-40"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          <div className="overflow-y-auto px-4 py-4">
            <label
              htmlFor="chapter-name"
              className="block text-xs font-medium uppercase tracking-wide text-[var(--muted)]"
            >
              Name
            </label>
            <input
              id="chapter-name"
              value={draftTitle}
              disabled={savingTitle || isBusy}
              onChange={(e) => setDraftTitle(e.target.value)}
              onBlur={() => void saveTitle()}
              onKeyDown={(e) => {
                if (e.key === "Enter") void saveTitle();
              }}
              className="mt-1.5 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-base text-[var(--text)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)]"
            />

            <SourceStatusBanner status={sourceStatus} />

            <div className="mt-3">
              <button
                type="button"
                onClick={() => void toggleSource()}
                className="text-sm text-[var(--accent)] hover:underline"
              >
                {sourceOpen ? "Hide source document" : "View source document"}
              </button>
              {sourceOpen && (
                <div className="mt-2 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--bg)]">
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
                    <pre className="max-h-[40dvh] overflow-y-auto whitespace-pre-wrap break-words p-3 font-mono text-sm leading-relaxed text-[var(--text)]">
                      {sourceText}
                    </pre>
                  )}
                </div>
              )}
            </div>

            <div className="mt-4">
              <button
                type="button"
                disabled={isBusy || !canDictate}
                onClick={() =>
                  void onDictate(
                    chapter.id,
                    selected.size > 0
                      ? [...selected]
                      : selectable.map((p) => p.id),
                  )
                }
                className="flex w-full items-center justify-center gap-2 rounded-md bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-black disabled:opacity-70"
              >
                {ttsLoading && (
                  <Spinner size="sm" className="border-black/30 border-t-black" />
                )}
                {ttsLoading
                  ? `Dictating… ${formatElapsed(elapsed)}`
                  : `${dictateLabel}${!ttsLoading && selectable.length > 0 ? ` (${selected.size > 0 ? selected.size : selectable.length})` : ""}`}
              </button>
            </div>

            <div className="mt-4">
              {ttsLoading ? (
                <LoadingBlock
                  title="Generating speech"
                  detail={`Long chapters can take several minutes. Elapsed: ${formatElapsed(elapsed)}`}
                />
              ) : activePart?.audio_url ? (
                <>
                  {playable.length > 1 && (
                    <div className="mb-4 flex flex-wrap gap-2">
                      {playable.map((part) => (
                        <button
                          key={part.id}
                          type="button"
                          onClick={() => setActivePartId(part.id)}
                          className={`rounded-full px-3 py-1 text-xs ${
                            part.id === activePart?.id
                              ? "bg-[var(--accent)] text-black"
                              : "border border-[var(--border)] text-[var(--text)]"
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
                  />
                </>
              ) : (
                <p className="rounded-md border border-dashed border-[var(--border)] bg-[var(--bg)]/50 py-6 text-center text-sm text-[var(--text)]">
                  {sortedParts.length === 0
                    ? "No parts for this chapter yet."
                    : "Tap Dictate to generate audio."}
                </p>
              )}
            </div>

            {sortedParts.length > 1 && (
              <div className="mt-4 border-t border-[var(--border)] pt-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-[var(--text)]">Parts</h3>
                  {selectable.length > 1 && !isBusy && (
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
                      {selected.size === selectable.length
                        ? "Clear"
                        : "Select all"}
                    </button>
                  )}
                </div>
                <ul className="mt-2 space-y-2">
                  {sortedParts.map((part) => {
                    const isProcessing =
                      ttsLoading &&
                      (selected.size === 0 || selected.has(part.id)) &&
                      isDictatableStatus(part.status);

                    return (
                      <li
                        key={part.id}
                        className="flex items-center gap-2 text-sm text-[var(--text)]"
                      >
                        {isDictatableStatus(part.status) && !isBusy ? (
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
                        ) : isProcessing ? (
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
                          {statusLabel(part.status, isProcessing)}
                        </span>
                      </li>
                    );
                  })}
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
      </div>
    </dialog>
  );
}
