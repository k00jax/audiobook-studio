"use client";

import { useState } from "react";

type PreviewResult = {
  sectionDelimiter: string;
  partBudgetSeconds: number;
  sections: { index: number; wordCount: number; estimatedSeconds: number; preview: string }[];
  parts: { label: string; sectionIndexes: number[]; estimatedSeconds: number }[];
};

export default function PreviewPage() {
  const [content, setContent] = useState("");
  const [chapterTitle, setChapterTitle] = useState("Chapter 1");
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function onPreview() {
    setLoading(true);
    const res = await fetch("/api/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, chapterTitle }),
    });
    const data = await res.json();
    setLoading(false);
    if (res.ok) setResult(data);
    else setResult(null);
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Split preview</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Put a line with only your delimiter (default{" "}
        <code>---</code>) between sections. Parts group whole sections to your
        time budget — never mid-section.
      </p>

      <label className="mt-6 block">
        <span className="text-sm text-[var(--muted)]">Chapter title</span>
        <input
          value={chapterTitle}
          onChange={(e) => setChapterTitle(e.target.value)}
          className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
        />
      </label>

      <label className="mt-4 block">
        <span className="text-sm text-[var(--muted)]">Chapter text</span>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={12}
          className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-sm"
          placeholder={"First section text…\n---\nSecond section…"}
        />
      </label>

      <button
        type="button"
        onClick={() => void onPreview()}
        disabled={loading || !content.trim()}
        className="mt-4 rounded-md bg-[var(--accent)] px-4 py-2 font-medium text-black"
      >
        {loading ? "Splitting…" : "Preview split"}
      </button>

      {result && (
        <div className="mt-10 space-y-8">
          <section>
            <h2 className="font-medium">
              Sections ({result.sections.length})
            </h2>
            <ul className="mt-2 space-y-2 text-sm">
              {result.sections.map((s) => (
                <li
                  key={s.index}
                  className="rounded border border-[var(--border)] p-3"
                >
                  <span className="text-[var(--muted)]">
                    #{s.index + 1} · ~{s.estimatedSeconds}s
                  </span>
                  <p className="mt-1">{s.preview}</p>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h2 className="font-medium">Parts ({result.parts.length})</h2>
            <ul className="mt-2 space-y-2 text-sm">
              {result.parts.map((p) => (
                <li
                  key={p.label}
                  className="rounded border border-[var(--border)] p-3"
                >
                  <p className="font-medium">{p.label}</p>
                  <p className="text-[var(--muted)]">
                    Sections {p.sectionIndexes.map((i) => i + 1).join(", ")} · ~
                    {Math.ceil(p.estimatedSeconds / 60)} min
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </main>
  );
}
