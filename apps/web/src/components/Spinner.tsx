type Props = {
  className?: string;
  size?: "sm" | "md" | "lg";
};

const sizes = {
  sm: "h-4 w-4 border-2",
  md: "h-6 w-6 border-2",
  lg: "h-10 w-10 border-[3px]",
};

export function Spinner({ className = "", size = "md" }: Props) {
  return (
    <span
      className={`inline-block shrink-0 animate-spin rounded-full border-[var(--accent)] border-t-transparent ${sizes[size]} ${className}`}
      role="status"
      aria-hidden="true"
    />
  );
}

export function LoadingBlock({
  title,
  detail,
}: {
  title: string;
  detail?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-8 text-center">
      <Spinner size="lg" />
      <div>
        <p className="text-sm font-medium text-[var(--text)]">{title}</p>
        {detail && (
          <p className="mt-1 text-xs text-[var(--muted)]">{detail}</p>
        )}
      </div>
    </div>
  );
}
