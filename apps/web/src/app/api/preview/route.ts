import { NextResponse } from "next/server";
import { splitChapter } from "@book-reader/core";
import { getConfig } from "@/lib/config";

export async function POST(request: Request) {
  let body: { content: string; chapterTitle?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.content) {
    return NextResponse.json({ error: "content required" }, { status: 400 });
  }

  const config = getConfig();
  const { sections, parts } = splitChapter(body.content, {
    sectionDelimiter: config.sectionDelimiter,
    partBudgetSeconds: config.partBudgetSeconds,
    wordsPerMinute: config.wordsPerMinute,
    chapterLabel: body.chapterTitle ?? "Preview",
  });

  return NextResponse.json({
    sectionDelimiter: config.sectionDelimiter,
    partBudgetSeconds: config.partBudgetSeconds,
    sections: sections.map((s) => ({
      index: s.index,
      wordCount: s.wordCount,
      estimatedSeconds: s.estimatedSeconds,
      preview: s.body.slice(0, 120) + (s.body.length > 120 ? "…" : ""),
    })),
    parts: parts.map((p) => ({
      label: p.label,
      sectionIndexes: p.sectionIndexes,
      estimatedSeconds: p.estimatedSeconds,
      wordCount: p.wordCount,
    })),
  });
}
