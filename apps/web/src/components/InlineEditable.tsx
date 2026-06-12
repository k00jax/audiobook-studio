"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  value: string;
  onSave: (value: string) => Promise<void>;
  className?: string;
  ariaLabel: string;
};

export function InlineEditable({ value, onSave, className = "", ariaLabel }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  async function commit() {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === value) {
      setEditing(false);
      setDraft(value);
      return;
    }
    setSaving(true);
    try {
      await onSave(trimmed);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        disabled={saving}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") void commit();
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        className={`min-w-0 rounded border border-[var(--accent-dim)] bg-[var(--bg)] px-1.5 py-0.5 text-inherit outline-none ${className}`}
        aria-label={ariaLabel}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={`truncate text-left hover:text-[var(--accent)] ${className}`}
      title="Click to rename"
      aria-label={`${ariaLabel}: ${value}`}
    >
      {value}
    </button>
  );
}
