"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildTeleprompterLines,
  effectiveTeleprompterDuration,
  timeAtLineStart,
} from "@/lib/teleprompter-sync";

const AUTO_SCROLL_KEY = "book-reader-teleprompter-auto-scroll";

type Props = {
  text: string;
  currentTime: number;
  duration: number;
  fallbackDuration?: number;
  playing?: boolean;
  onSeek: (timeSec: number) => void;
};

export function TeleprompterDisplay({
  text,
  currentTime,
  duration,
  fallbackDuration,
  playing = false,
  onSeek,
}: Props) {
  const scrollRoot = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [guideInset, setGuideInset] = useState(0);
  const lastScrollWrite = useRef(0);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(AUTO_SCROLL_KEY);
      if (stored === "0") setAutoScroll(false);
    } catch {
      // ignore
    }
  }, []);

  const setAutoScrollPersisted = useCallback((value: boolean) => {
    setAutoScroll(value);
    try {
      sessionStorage.setItem(AUTO_SCROLL_KEY, value ? "1" : "0");
    } catch {
      // ignore
    }
  }, []);

  const paragraphs = useMemo(() => buildTeleprompterLines(text), [text]);
  const trackDuration = useMemo(
    () => effectiveTeleprompterDuration(duration, paragraphs, fallbackDuration),
    [duration, paragraphs, fallbackDuration],
  );

  useEffect(() => {
    const el = scrollRoot.current;
    if (!el) return;

    const update = () => setGuideInset(el.clientHeight / 2);
    update();

    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!autoScroll) return;

    const container = scrollRoot.current;
    const content = contentRef.current;
    if (!container || !content || trackDuration <= 0) return;

    const progress = Math.min(1, Math.max(0, currentTime / trackDuration));
    const maxScroll = Math.max(0, content.scrollHeight - container.clientHeight);
    const target = progress * maxScroll;

    if (Math.abs(container.scrollTop - target) < 1) return;

    lastScrollWrite.current = Date.now();
    container.scrollTo({
      top: target,
      behavior: playing ? "auto" : "auto",
    });
  }, [autoScroll, currentTime, trackDuration, playing, guideInset]);

  const seekToParagraph = useCallback(
    (paragraphId: number) => {
      const paragraph = paragraphs.find((p) => p.id === paragraphId);
      if (!paragraph) return;
      onSeek(timeAtLineStart(paragraph, trackDuration));
    },
    [paragraphs, trackDuration, onSeek],
  );

  if (paragraphs.length === 0) return null;

  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
          Follow-along
        </span>
        <button
          type="button"
          onClick={() => setAutoScrollPersisted(!autoScroll)}
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
            autoScroll
              ? "bg-[var(--accent)] text-black"
              : "border border-[var(--border)] text-[var(--muted)]"
          }`}
          aria-pressed={autoScroll}
        >
          Auto-scroll {autoScroll ? "on" : "off"}
        </button>
      </div>

      <div
        ref={scrollRoot}
        data-teleprompter-scroll
        className="max-h-[min(42vh,28rem)] overflow-y-auto overscroll-contain rounded-md border border-[var(--border)] bg-[var(--bg)]/80 font-serif text-[1.05rem] leading-relaxed touch-pan-y"
        aria-label="Follow-along text"
        onScroll={() => {
          if (Date.now() - lastScrollWrite.current < 150) return;
          if (autoScroll) setAutoScrollPersisted(false);
        }}
      >
          <div
            ref={contentRef}
            style={{
              paddingTop: guideInset,
              paddingBottom: guideInset,
            }}
            className="px-3"
          >
            {paragraphs.map((paragraph) => (
              <div
                key={paragraph.id}
                role="button"
                tabIndex={0}
                onClick={() => seekToParagraph(paragraph.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    seekToParagraph(paragraph.id);
                  }
                }}
                className="mb-4 cursor-pointer rounded px-1 py-1 text-[var(--text)] last:mb-0 hover:bg-[var(--accent)]/10"
              >
                <span className="whitespace-pre-wrap">
                  {paragraph.text.length > 0 ? paragraph.text : "\u00a0"}
                </span>
              </div>
            ))}
          </div>
      </div>
    </div>
  );
}
