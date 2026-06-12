#!/usr/bin/env python3
"""Synthesize speech with edge-tts and optional paragraph alignment metadata."""
import argparse
import asyncio
import json
import re
import sys
from pathlib import Path

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

import edge_tts  # noqa: E402

TICKS_PER_SECOND = 10_000_000


def split_paragraphs(text: str) -> list[str]:
    return re.split(r"\n\n+", text)


def paragraph_spans(text: str) -> list[tuple[int, int]]:
    """Character [start, end) span for each paragraph in the source text."""
    spans: list[tuple[int, int]] = []
    pos = 0
    for block in split_paragraphs(text):
        if not block and pos >= len(text):
            spans.append((pos, pos))
            continue
        start = text.find(block, pos)
        if start < 0:
            start = pos
        end = start + len(block)
        spans.append((start, end))
        pos = end
        while pos < len(text) and text[pos] in "\n\r":
            pos += 1
    return spans


def para_index_for_char(spans: list[tuple[int, int]], char_pos: int) -> int:
    for i, (start, end) in enumerate(spans):
        if char_pos < end or i == len(spans) - 1:
            return i
    return max(0, len(spans) - 1)


def locate_spoken_sentence(text: str, cursor: int, spoken: str) -> tuple[int, int]:
    """Return [start, end) character span for the spoken sentence in text."""
    if not spoken:
        return cursor, cursor

    exact = text.find(spoken, cursor)
    if exact >= 0:
        return exact, exact + len(spoken)

    trimmed = spoken.strip()
    exact = text.find(trimmed, cursor)
    if exact >= 0:
        return exact, exact + len(trimmed)

    # Normalized whitespace match
    pattern = re.escape(trimmed)
    pattern = re.sub(r"\\ ", r"\\s+", pattern)
    match = re.search(pattern, text[cursor:], flags=re.IGNORECASE)
    if match:
        start = cursor + match.start()
        return start, start + len(match.group(0))

    approx_end = min(len(text), cursor + max(len(trimmed), 1))
    return cursor, approx_end


def build_alignment_by_text_position(
    text: str,
    boundaries: list[tuple[float, float, str]],
) -> list[dict]:
    """Map each spoken sentence to a paragraph via its position in the source text."""
    spans = paragraph_spans(text)
    if not spans:
        return []

    para_starts: dict[int, float] = {}
    para_ends: dict[int, float] = {}
    char_cursor = 0

    for offset_sec, duration_sec, raw in boundaries:
        spoken = raw.strip()
        if not spoken:
            continue

        start_char, end_char = locate_spoken_sentence(text, char_cursor, spoken)
        char_cursor = max(char_cursor, end_char)

        para = para_index_for_char(spans, start_char)
        if para not in para_starts:
            para_starts[para] = offset_sec
        para_ends[para] = offset_sec + duration_sec

    paragraphs: list[dict] = []
    for i in range(len(spans)):
        if i in para_starts:
            paragraphs.append(
                {
                    "index": i,
                    "startSec": para_starts[i],
                    "endSec": para_ends[i],
                }
            )
        else:
            anchor = paragraphs[-1]["endSec"] if paragraphs else 0.0
            paragraphs.append(
                {"index": i, "startSec": anchor, "endSec": anchor}
            )

    return paragraphs


def build_alignment(
    text: str,
    sentence_boundaries: list[tuple[float, float, str]],
    word_boundaries: list[tuple[float, float, str]],
) -> dict:
    if sentence_boundaries:
        paragraphs = build_alignment_by_text_position(text, sentence_boundaries)
    elif word_boundaries:
        paragraphs = build_alignment_by_text_position(
            text,
            [(o, d, w) for o, d, w in word_boundaries],
        )
    else:
        paragraphs = []

    duration_sec = paragraphs[-1]["endSec"] if paragraphs else 0.0
    return {
        "version": 1,
        "durationSec": duration_sec,
        "paragraphs": paragraphs,
    }


async def synthesize(
    voice: str,
    input_path: str,
    output_path: str,
    alignment_path: str | None,
) -> None:
    text = Path(input_path).read_text(encoding="utf-8")
    communicate = edge_tts.Communicate(text, voice)

    audio_data = bytearray()
    sentence_boundaries: list[tuple[float, float, str]] = []
    word_boundaries: list[tuple[float, float, str]] = []

    async for chunk in communicate.stream():
        chunk_type = chunk.get("type")
        if chunk_type == "audio":
            audio_data.extend(chunk["data"])
        elif chunk_type == "SentenceBoundary":
            offset = float(chunk["offset"]) / TICKS_PER_SECOND
            duration = float(chunk["duration"]) / TICKS_PER_SECOND
            sentence_boundaries.append((offset, duration, chunk.get("text", "")))
        elif chunk_type == "WordBoundary":
            offset = float(chunk["offset"]) / TICKS_PER_SECOND
            duration = float(chunk["duration"]) / TICKS_PER_SECOND
            word_boundaries.append((offset, duration, chunk.get("text", "")))

    Path(output_path).write_bytes(audio_data)

    if alignment_path:
        alignment = build_alignment(text, sentence_boundaries, word_boundaries)
        Path(alignment_path).write_text(
            json.dumps(alignment, indent=2),
            encoding="utf-8",
        )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--voice", required=True)
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--alignment", default="")
    args = parser.parse_args()
    alignment_path = args.alignment.strip() or None
    asyncio.run(
        synthesize(args.voice, args.input, args.output, alignment_path),
    )


if __name__ == "__main__":
    main()
