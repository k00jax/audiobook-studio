"use client";

import { useEffect, useState } from "react";
import { AudioPanel } from "@/components/AudioPanel";
import { ChapterDragHandle } from "@/components/ChapterDragHandle";
import { formatTime } from "@/lib/chapter-order";
import { reorderBefore } from "@/lib/chapter-reorder";
import type { CompiledAudioEntry } from "@/lib/types";

type Props = {
  compiled: CompiledAudioEntry[];
  bookId: string;
  onDeleted: () => void;
  onReordered?: (entries: CompiledAudioEntry[]) => void;
};

export function CompiledAudioPanel({
  compiled,
  bookId,
  onDeleted,
  onReordered,
}: Props) {
  const [ordered, setOrdered] = useState(compiled);
  const [activeId, setActiveId] = useState<string | null>(
    compiled[0]?.id ?? null,
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(true);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  useEffect(() => {
    setOrdered(compiled);
  }, [compiled]);

  if (ordered.length === 0) return null;

  const active = ordered.find((c) => c.id === activeId) ?? ordered[0];

  async function remove(id: string) {
    if (!confirm("Delete this compiled audio file?")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/books/${bookId}/compiled/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Delete failed");
      }
      onDeleted();
      if (activeId === id) {
        setActiveId(ordered.find((c) => c.id !== id)?.id ?? null);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  async function reorderCompiled(draggedId: string, targetId: string) {
    const ids = ordered.map((entry) => entry.id);
    const newIds = reorderBefore(ids, draggedId, targetId);
    if (newIds.every((id, index) => id === ids[index])) return;

    const previous = ordered;
    const next = newIds
      .map((id) => ordered.find((entry) => entry.id === id))
      .filter((entry): entry is CompiledAudioEntry => Boolean(entry));
    setOrdered(next);

    const res = await fetch(`/api/books/${bookId}/compiled/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ compiledIds: newIds }),
    });

    if (!res.ok) {
      setOrdered(previous);
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "Failed to save order");
      return;
    }

    const data = (await res.json()) as { compiled?: CompiledAudioEntry[] };
    if (data.compiled) {
      setOrdered(data.compiled);
      onReordered?.(data.compiled);
    }
  }

  return (
    <section className="mb-4 rounded-lg border border-sky-400/30 bg-sky-400/5">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="flex w-full items-center gap-2 border-b border-sky-400/20 px-3 py-2 text-left hover:bg-sky-400/10"
        aria-expanded={isOpen}
      >
        <span className="w-4 shrink-0 text-xs text-sky-200/70">
          {isOpen ? "▾" : "▸"}
        </span>
        <h2 className="text-xs font-medium uppercase tracking-widest text-sky-200/90">
          Compiled audio
        </h2>
        <span className="ml-auto text-xs text-[var(--muted)]">
          {ordered.length} file{ordered.length === 1 ? "" : "s"}
        </span>
      </button>
      {isOpen && (
        <div className="p-3">
          <ul className="space-y-2">
            {ordered.map((entry) => {
              const isDragging = dragId === entry.id;
              const isDropTarget = dropTargetId === entry.id;
              const canDrop = dragId != null && dragId !== entry.id;

              return (
                <li
                  key={entry.id}
                  onDragOver={(e) => {
                    if (!canDrop) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setDropTargetId(entry.id);
                  }}
                  onDragLeave={() => {
                    if (dropTargetId === entry.id) setDropTargetId(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (canDrop && dragId) {
                      void reorderCompiled(dragId, entry.id);
                    }
                    setDragId(null);
                    setDropTargetId(null);
                  }}
                  className={`rounded-md border ${
                    isDropTarget
                      ? "ring-2 ring-sky-400 ring-inset"
                      : entry.id === active.id
                        ? "border-sky-400/50 bg-sky-400/10"
                        : "border-[var(--border)] bg-[var(--bg)]/40"
                  } ${isDragging ? "opacity-50" : ""}`}
                >
                  <div className="flex items-center gap-2 px-3 py-2 text-sm">
                    <button
                      type="button"
                      onClick={() => setActiveId(entry.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="block font-medium text-[var(--text)]">
                        {entry.name}
                      </span>
                      <span className="mt-0.5 block text-xs text-[var(--muted)]">
                        {entry.chapterTitles.length} chapter(s) ·{" "}
                        {formatTime(entry.durationSec)}
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={deletingId === entry.id}
                      onClick={() => void remove(entry.id)}
                      className="shrink-0 text-xs text-red-300 hover:underline disabled:opacity-50"
                    >
                      Delete
                    </button>
                    <ChapterDragHandle
                      onDragStart={() => setDragId(entry.id)}
                      onDragEnd={() => {
                        setDragId(null);
                        setDropTargetId(null);
                      }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>

          {active && (
            <div className="mt-4 rounded-md border border-[var(--border)] bg-[var(--surface)]/60 p-4">
              <p className="mb-3 text-sm font-medium text-[var(--text)]">
                {active.name}
              </p>
              <p className="mb-3 text-xs text-[var(--muted)]">
                {active.chapterTitles.join(" · ")}
              </p>
              <AudioPanel
                key={active.id}
                partId={`compiled-${active.id}`}
                audioUrl={active.audioUrl}
                initialPositionMs={0}
                compact
              />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
