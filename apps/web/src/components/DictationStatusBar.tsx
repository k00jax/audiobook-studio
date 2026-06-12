"use client";

import { useEffect, useState } from "react";
import { Spinner } from "@/components/Spinner";
import type { DictationProgress } from "@/lib/chapter-status";

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type Props = {
  active: boolean;
  startedAt: number | null;
  progress: DictationProgress | null;
  actionMessage: string | null;
  onStop: () => void;
};

export function DictationStatusBar({
  active,
  startedAt,
  progress,
  actionMessage,
  onStop,
}: Props) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!active || startedAt == null) {
      setElapsed(0);
      return;
    }
    setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [active, startedAt]);

  if (!active && !actionMessage) return null;

  const showProgress = active && progress && progress.totalChapters > 0;

  return (
    <div
      className={`mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm ${
        active
          ? "dictation-status-glow border-[var(--accent)]/50 bg-[var(--accent)]/10"
          : "border-[var(--border)] bg-[var(--surface)]/60"
      }`}
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
        {active && <Spinner size="sm" />}
        <span className={active ? "font-medium text-[var(--text)]" : "text-[var(--muted)]"}>
          {active ? "Dictation in progress" : actionMessage}
        </span>
        {active && startedAt != null && (
          <span className="tabular-nums text-[var(--accent)]" title="Elapsed time">
            {formatElapsed(elapsed)}
          </span>
        )}
        {showProgress && progress && (
          <>
            <span className="text-[var(--muted)]">·</span>
            <span className="tabular-nums text-[var(--text)]">
              {progress.remainingChapters}/{progress.totalChapters} chapter
              {progress.totalChapters === 1 ? "" : "s"} remaining
            </span>
            {progress.totalParts > 0 && (
              <>
                <span className="text-[var(--muted)]">·</span>
                <span className="tabular-nums text-[var(--muted)]">
                  {progress.completedParts}/{progress.totalParts} segments done
                </span>
              </>
            )}
            {progress.processingChapterTitle && (
              <>
                <span className="text-[var(--muted)]">·</span>
                <span className="truncate text-[var(--muted)]">
                  Generating speech for{" "}
                  <span className="text-[var(--text)]">
                    {progress.processingChapterTitle}
                  </span>
                  {progress.processingPartLabel
                    ? ` — ${progress.processingPartLabel}`
                    : ""}
                </span>
              </>
            )}
            {!progress.processingChapterTitle && progress.queuedParts > 0 && (
              <>
                <span className="text-[var(--muted)]">·</span>
                <span className="text-[var(--muted)]">
                  {progress.queuedParts} segment
                  {progress.queuedParts === 1 ? "" : "s"} queued
                </span>
              </>
            )}
          </>
        )}
        {active && actionMessage && (
          <span className="text-xs text-[var(--muted)]">{actionMessage}</span>
        )}
      </div>
      {active && (
        <button
          type="button"
          onClick={onStop}
          className="shrink-0 rounded border border-red-400/60 px-2 py-1 text-xs text-red-300 hover:bg-red-400/10"
        >
          Stop dictation
        </button>
      )}
    </div>
  );
}
