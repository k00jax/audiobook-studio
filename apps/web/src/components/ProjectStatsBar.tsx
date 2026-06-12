"use client";

import { formatTime } from "@/lib/chapter-order";
import type { BookProjectStats } from "@/lib/types";

type ListMode = "dictate" | "compile";

type Props = {
  stats: BookProjectStats;
  listMode: ListMode;
  onListModeChange: (mode: ListMode) => void;
  selectedCount: number;
  compileEligibleCount: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onBatchAction: () => void;
  batchActionLabel: string;
  batchDisabled: boolean;
  compiling?: boolean;
};

export function ProjectStatsBar({
  stats,
  listMode,
  onListModeChange,
  selectedCount,
  compileEligibleCount,
  onSelectAll,
  onClearSelection,
  onBatchAction,
  batchActionLabel,
  batchDisabled,
  compiling = false,
}: Props) {
  return (
    <section className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--surface)]/50 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <dl className="grid grid-cols-3 gap-x-6 gap-y-2 text-sm">
          <div>
            <dt className="text-xs text-[var(--muted)]">Chapters</dt>
            <dd className="font-medium tabular-nums">{stats.chapterCount}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--muted)]">Audio up to date</dt>
            <dd className="font-medium tabular-nums">
              {stats.currentAudioCount}/{stats.chapterCount}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--muted)]">Chapter audio</dt>
            <dd className="font-medium tabular-nums">
              {formatTime(stats.totalAudioSeconds)}
            </dd>
          </div>
        </dl>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border border-[var(--border)] p-0.5 text-xs">
            <button
              type="button"
              onClick={() => onListModeChange("dictate")}
              className={`rounded px-2 py-1 ${
                listMode === "dictate"
                  ? "bg-[var(--accent)] font-medium text-black"
                  : "text-[var(--muted)] hover:text-[var(--text)]"
              }`}
            >
              Dictate
            </button>
            <button
              type="button"
              onClick={() => onListModeChange("compile")}
              className={`rounded px-2 py-1 ${
                listMode === "compile"
                  ? "bg-[var(--accent)] font-medium text-black"
                  : "text-[var(--muted)] hover:text-[var(--text)]"
              }`}
            >
              Compile
            </button>
          </div>
          {(listMode === "dictate" ? stats.chapterCount - stats.currentAudioCount : compileEligibleCount) > 0 && (
            <>
              <button
                type="button"
                onClick={onSelectAll}
                className="text-xs text-[var(--muted)] hover:text-[var(--accent)]"
              >
                Select all
              </button>
              <button
                type="button"
                disabled={selectedCount === 0}
                onClick={onClearSelection}
                className="text-xs text-[var(--muted)] hover:text-[var(--accent)] disabled:opacity-50"
              >
                Clear
              </button>
              <button
                type="button"
                disabled={batchDisabled || compiling}
                onClick={onBatchAction}
                className="rounded bg-[var(--accent)] px-2 py-1 text-xs font-medium text-black disabled:opacity-50"
              >
                {compiling ? "Compiling…" : `${batchActionLabel} (${selectedCount})`}
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
