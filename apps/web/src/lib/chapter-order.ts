/** Sort chapters by filename/path (ch01, ch02, …) rather than plain alphabetical title. */
export function compareChapters(
  a: { source_path?: string | null; title: string },
  b: { source_path?: string | null; title: string },
): number {
  const keyA = a.source_path ?? a.title;
  const keyB = b.source_path ?? b.title;
  return keyA.localeCompare(keyB, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}
