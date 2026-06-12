"use client";

type Props = {
  onDragStart: () => void;
  onDragEnd: () => void;
  disabled?: boolean;
};

export function ChapterDragHandle({ onDragStart, onDragEnd, disabled }: Props) {
  return (
    <span
      draggable={!disabled}
      onDragStart={(e) => {
        if (disabled) {
          e.preventDefault();
          return;
        }
        e.stopPropagation();
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", "chapter");
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onClick={(e) => e.stopPropagation()}
      className={`flex shrink-0 flex-col items-center justify-center gap-[3px] rounded px-1 py-2 text-[var(--muted)] ${
        disabled
          ? "cursor-not-allowed opacity-40"
          : "cursor-grab active:cursor-grabbing hover:bg-[var(--border)]/40 hover:text-[var(--text)]"
      }`}
      aria-label="Drag to reorder"
      title="Drag to reorder"
    >
      <span className="flex gap-[3px]">
        <span className="h-1 w-1 rounded-full bg-current" />
        <span className="h-1 w-1 rounded-full bg-current" />
      </span>
      <span className="flex gap-[3px]">
        <span className="h-1 w-1 rounded-full bg-current" />
        <span className="h-1 w-1 rounded-full bg-current" />
      </span>
      <span className="flex gap-[3px]">
        <span className="h-1 w-1 rounded-full bg-current" />
        <span className="h-1 w-1 rounded-full bg-current" />
      </span>
    </span>
  );
}
