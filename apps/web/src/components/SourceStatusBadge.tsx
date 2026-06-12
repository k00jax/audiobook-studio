import type { ChapterSourceStatus } from "@/lib/chapter-status";
import {
  chapterStatusLabel,
  chapterTtsRowStatus,
} from "@/lib/chapter-status";
import type { PartRow } from "@/lib/types";
import { DiskChangeBadge } from "@/components/DiskChangeBadge";

export function SourceStatusBadge({ status }: { status: ChapterSourceStatus }) {
  if (status === "current") return null;

  const className =
    status === "updated"
      ? "border-amber-500/50 bg-amber-500/15 text-amber-200"
      : "border-sky-400/50 bg-sky-400/15 text-sky-200";

  return (
    <span
      className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${className}`}
    >
      {chapterStatusLabel(status)}
    </span>
  );
}

function TtsRowStatusBadge({ ttsStatus }: { ttsStatus: "generating" | "queued" }) {
  const label = ttsStatus === "generating" ? "Generating Speech" : "Queued";
  return (
    <span
      className="shrink-0 rounded border border-amber-500/50 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200"
      title={label}
    >
      {label}
    </span>
  );
}

export function ChapterRowStatusIndicator({
  status,
  hasCurrentAudio,
  needsSync,
  parts = [],
}: {
  status: ChapterSourceStatus;
  hasCurrentAudio: boolean;
  needsSync?: boolean;
  parts?: PartRow[];
}) {
  const ttsStatus = chapterTtsRowStatus({ parts });

  const audioBadge = ttsStatus ? (
    <TtsRowStatusBadge ttsStatus={ttsStatus} />
  ) : status !== "current" ? (
    <SourceStatusBadge status={status} />
  ) : hasCurrentAudio ? (
    <span
      className="shrink-0 rounded border border-emerald-500/50 bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-emerald-300"
      title="Audio up to date"
      aria-label="Audio up to date"
    >
      ✓
    </span>
  ) : null;

  if (!needsSync && !audioBadge) return null;

  return (
    <span className="flex shrink-0 items-center gap-2">
      <DiskChangeBadge needsSync={needsSync} />
      {audioBadge}
    </span>
  );
}

export function SourceStatusBanner({ status }: { status: ChapterSourceStatus }) {
  if (status === "current") return null;

  const text =
    status === "updated"
      ? "The source file changed since this was last dictated. Regenerate audio to match."
      : "New chapter — not dictated yet.";

  const className =
    status === "updated"
      ? "border-amber-500/40 bg-amber-500/10 text-amber-100"
      : "border-sky-400/40 bg-sky-400/10 text-sky-100";

  return (
    <p className={`mt-3 rounded-md border px-3 py-2 text-sm ${className}`}>
      {text}
    </p>
  );
}
