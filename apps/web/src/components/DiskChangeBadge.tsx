export function DiskChangeBadge({ needsSync }: { needsSync?: boolean }) {
  if (!needsSync) return null;

  return (
    <span className="shrink-0 rounded border border-violet-400/50 bg-violet-400/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-200">
      Edited on disk
    </span>
  );
}
