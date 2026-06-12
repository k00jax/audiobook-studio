"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

type SyncResult = {
  ingested?: number;
  unchanged?: number;
  updated?: number;
  errors?: number;
  error?: string;
};

function describeSyncResult(data: SyncResult): string {
  const parts: string[] = [];
  if (data.ingested) parts.push(`${data.ingested} chapter(s) synced`);
  if (data.updated) parts.push(`${data.updated} timestamp(s) updated`);
  if (data.errors) parts.push(`${data.errors} error(s)`);
  if (parts.length === 0) return "Already up to date";
  return parts.join(" · ");
}

type Props = {
  scope: "library" | "book";
  bookId?: string;
  compact?: boolean;
  className?: string;
};

export function SyncRefreshButton({
  scope,
  bookId,
  compact = false,
  className = "",
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const sync = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const url =
        scope === "library" ? "/api/sync" : `/api/books/${bookId}/sync`;
      const res = await fetch(url, { method: "POST" });
      const data = (await res.json()) as SyncResult;
      if (!res.ok) throw new Error(data.error ?? "Sync failed");
      setMessage(describeSyncResult(data));
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setLoading(false);
    }
  }, [bookId, router, scope]);

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={() => void sync()}
        disabled={loading || (scope === "book" && !bookId)}
        className="rounded border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-sm text-[var(--text)] hover:border-[var(--accent-dim)] disabled:opacity-50"
        title="Resync chapters from the watch folder on disk"
      >
        {loading ? "Syncing…" : compact ? "↻ Sync" : "↻ Refresh from folder"}
      </button>
      {message && (
        <span className="text-xs text-[var(--muted)]" role="status">
          {message}
        </span>
      )}
    </div>
  );
}
