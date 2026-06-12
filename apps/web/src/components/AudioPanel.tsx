"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TeleprompterDisplay } from "@/components/TeleprompterDisplay";
import { formatTime } from "@/lib/chapter-order";
import { prepareTextForTts } from "@/lib/tts-text";

type Props = {
  partId: string;
  label?: string;
  audioUrl: string;
  bodyText?: string;
  fallbackDuration?: number;
  initialPositionMs: number;
  onEnded?: () => void;
  compact?: boolean;
  onTimeUpdate?: (sec: number) => void;
  seekToSec?: number | null;
  onSeekApplied?: () => void;
};

export function AudioPanel({
  partId,
  label,
  audioUrl,
  bodyText,
  fallbackDuration,
  initialPositionMs,
  onEnded,
  compact = false,
  onTimeUpdate,
  seekToSec,
  onSeekApplied,
}: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const lastSaved = useRef(0);
  const loadedSourceRef = useRef<string | null>(null);
  const resumeMsRef = useRef(0);
  const initialPositionRef = useRef(initialPositionMs);
  const seekValueRef = useRef(0);
  const [seekDragValue, setSeekDragValue] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seeking, setSeeking] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  const spokenText = bodyText ? prepareTextForTts(bodyText) : undefined;

  initialPositionRef.current = initialPositionMs;

  const savePosition = useCallback(
    async (positionMs: number) => {
      const now = Date.now();
      if (now - lastSaved.current < 2000) return;
      lastSaved.current = now;

      await fetch("/api/playback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partId,
          positionMs: Math.floor(positionMs),
        }),
      });
    },
    [partId],
  );

  const commitSeek = useCallback(
    (valueSec: number, save = true) => {
      const el = audioRef.current;
      if (!el) return;
      const max =
        el.duration && Number.isFinite(el.duration) ? el.duration : valueSec;
      const clamped = Math.max(0, Math.min(valueSec, max));
      const wasPlaying = !el.paused && !el.ended;

      el.currentTime = clamped;
      setCurrentTime(clamped);
      seekValueRef.current = clamped;

      if (wasPlaying && el.paused) {
        void el.play().catch(() => {});
      }

      if (save) void savePosition(clamped * 1000);
    },
    [savePosition],
  );

  const seekAndPlay = useCallback(
    async (valueSec: number) => {
      commitSeek(valueSec, true);
      const el = audioRef.current;
      if (!el) return;
      setPlaybackError(null);
      if (el.paused) {
        try {
          await el.play();
          setPlaying(true);
        } catch (err) {
          setPlaybackError(
            err instanceof Error ? err.message : "Playback failed to start",
          );
        }
      }
    },
    [commitSeek],
  );

  useEffect(() => {
    const sourceKey = `${partId}:${audioUrl}`;
    if (loadedSourceRef.current === sourceKey) return;

    loadedSourceRef.current = sourceKey;
    resumeMsRef.current = initialPositionRef.current;

    const el = audioRef.current;
    if (!el) return;

    setPlaybackError(null);
    setDuration(0);

    const syncDuration = () => {
      const d = el.duration;
      if (d && Number.isFinite(d) && !Number.isNaN(d)) {
        setDuration(d);
      }
    };

    const onMeta = () => {
      syncDuration();
      const d = el.duration || 0;
      const resumeSec = resumeMsRef.current / 1000;
      if (resumeSec > 0 && d > 0) {
        const clamped = Math.min(resumeSec, d);
        el.currentTime = clamped;
        setCurrentTime(clamped);
        seekValueRef.current = clamped;
      } else {
        setCurrentTime(el.currentTime);
        seekValueRef.current = el.currentTime;
      }
      resumeMsRef.current = 0;
    };

    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("durationchange", syncDuration);

    if (el.readyState >= HTMLMediaElement.HAVE_METADATA) {
      onMeta();
    }

    return () => {
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("durationchange", syncDuration);
    };
  }, [audioUrl, partId]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    let lastDur = 0;
    let frame = 0;
    const tick = () => {
      if (!seeking) {
        const t = el.currentTime;
        setCurrentTime(t);
        seekValueRef.current = t;
        onTimeUpdate?.(t);
        const d = el.duration;
        if (d && Number.isFinite(d) && Math.abs(d - lastDur) > 0.01) {
          lastDur = d;
          setDuration(d);
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [seeking, audioUrl, partId, onTimeUpdate]);

  useEffect(() => {
    if (seekToSec == null || !Number.isFinite(seekToSec)) return;
    commitSeek(seekToSec, false);
    onSeekApplied?.();
  }, [seekToSec, commitSeek, onSeekApplied]);

  useEffect(() => {
    if (!playing) return;
    const interval = setInterval(() => {
      const el = audioRef.current;
      if (el && !el.paused) {
        void savePosition(el.currentTime * 1000);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [playing, savePosition]);

  const togglePlay = async () => {
    const el = audioRef.current;
    if (!el) return;
    setPlaybackError(null);
    if (el.paused) {
      try {
        await el.play();
        setPlaying(true);
      } catch (err) {
        setPlaybackError(
          err instanceof Error ? err.message : "Playback failed to start",
        );
      }
    } else {
      el.pause();
      setPlaying(false);
      void savePosition(el.currentTime * 1000);
    }
  };

  const skip = (delta: number) => {
    const el = audioRef.current;
    if (!el) return;
    const next = Math.min(
      Math.max(0, el.currentTime + delta),
      el.duration || Infinity,
    );
    commitSeek(next);
  };

  const onSliderInput = (value: number) => {
    const el = audioRef.current;
    if (!el) return;
    seekValueRef.current = value;
    setSeekDragValue(value);
    el.currentTime = value;
    setCurrentTime(value);
  };

  const onSliderCommit = (value: number) => {
    setSeeking(false);
    setSeekDragValue(null);
    commitSeek(value);
  };

  const sliderValue =
    seeking && seekDragValue != null
      ? seekDragValue
      : Math.min(currentTime, duration || 0);

  return (
    <div className="flex h-full flex-col">
      <audio
        ref={audioRef}
        src={audioUrl}
        preload="auto"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          void savePosition(duration * 1000);
          onEnded?.();
        }}
        onError={() => {
          setPlaying(false);
          setPlaybackError("Audio failed to load or stopped unexpectedly.");
        }}
        onStalled={() => {
          const el = audioRef.current;
          if (el && !el.paused && el.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA) {
            setPlaybackError("Buffering… if this persists, try Regenerate audio.");
          }
        }}
      />

      {label ? (
        <p className="text-sm font-medium text-[var(--accent)]">{label}</p>
      ) : null}

      {spokenText && !compact ? (
        <TeleprompterDisplay
          text={spokenText}
          currentTime={currentTime}
          duration={duration}
          fallbackDuration={fallbackDuration}
          playing={playing}
          onSeek={(timeSec) => void seekAndPlay(timeSec)}
        />
      ) : null}

      {playbackError ? (
        <p className="mt-2 text-xs text-red-400" role="alert">
          {playbackError}
        </p>
      ) : null}

      <div className="mt-4 flex shrink-0 items-center justify-between text-xs tabular-nums text-[var(--muted)]">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>

      <input
        type="range"
        min={0}
        max={duration || 0}
        step={0.05}
        value={sliderValue}
        onInput={(e) => onSliderInput(Number(e.currentTarget.value))}
        onChange={(e) => onSliderInput(Number(e.currentTarget.value))}
        onPointerDown={() => setSeeking(true)}
        onPointerUp={(e) => onSliderCommit(Number(e.currentTarget.value))}
        onKeyUp={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            onSliderCommit(Number(e.currentTarget.value));
          }
        }}
        className="mt-2 h-2 w-full cursor-pointer appearance-none rounded-full bg-[var(--border)] accent-[var(--accent)]"
        aria-label="Playback position"
      />

      <div className="mt-6 flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={() => skip(-30)}
          className="rounded-full border border-[var(--border)] px-4 py-2 text-sm hover:border-[var(--accent-dim)]"
          aria-label="Back 30 seconds"
        >
          −30s
        </button>
        <button
          type="button"
          onClick={() => void togglePlay()}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent)] text-lg font-semibold text-black"
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <button
          type="button"
          onClick={() => skip(30)}
          className="rounded-full border border-[var(--border)] px-4 py-2 text-sm hover:border-[var(--accent-dim)]"
          aria-label="Forward 30 seconds"
        >
          +30s
        </button>
      </div>
    </div>
  );
}
