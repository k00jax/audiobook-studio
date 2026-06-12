import Link from "next/link";
import { getConfig } from "@/lib/config";
import { getWatchFolder } from "@/lib/watch-library";

export default function SettingsPage() {
  const config = getConfig();
  let watchFolder = "(not configured)";
  try {
    watchFolder = getWatchFolder();
  } catch {
    /* ignore */
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Link href="/" className="text-sm text-[var(--muted)]">
        ← Home
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">Settings</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Configure via environment variables on the server.
      </p>
      <dl className="mt-8 space-y-4 text-sm">
        <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">
          <dt className="text-[var(--muted)]">Library root</dt>
          <dd className="mt-1 break-all font-mono text-xs">{watchFolder}</dd>
          <dd className="mt-2 text-[var(--muted)]">
            Each subfolder is a project. Audio is saved in{" "}
            <span className="font-mono">{"{project}/AUDIO/"}</span>.
          </dd>
        </div>
        <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">
          <dt className="text-[var(--muted)]">Section delimiter</dt>
          <dd className="mt-1 font-mono">{config.sectionDelimiter}</dd>
          <dd className="mt-2 text-[var(--muted)]">
            A line containing only this text starts a new section. No automatic
            heading detection.
          </dd>
        </div>
        <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">
          <dt className="text-[var(--muted)]">Part time budget</dt>
          <dd className="mt-1">{config.partBudgetSeconds} seconds (~
            {Math.round(config.partBudgetSeconds / 60)} min)
          </dd>
        </div>
        <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">
          <dt className="text-[var(--muted)]">Parallel dictation</dt>
          <dd className="mt-1">{config.ttsParallelJobs} job(s) at once</dd>
          <dd className="mt-2 text-[var(--muted)]">
            Set <span className="font-mono">TTS_PARALLEL_JOBS</span> in{" "}
            <span className="font-mono">.env</span> (1–8).
          </dd>
        </div>
        <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">
          <dt className="text-[var(--muted)]">Speech estimate</dt>
          <dd className="mt-1">{config.wordsPerMinute} words per minute</dd>
        </div>
      </dl>
    </main>
  );
}
