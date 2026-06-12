import { open, stat } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import {
  contentTypeForExtension,
  resolveAudioFilePath,
} from "@/lib/audio-storage";

function parseRange(
  rangeHeader: string,
  fileSize: number,
): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
  if (!match) return null;

  const start = match[1] ? Number.parseInt(match[1], 10) : 0;
  let end = match[2] ? Number.parseInt(match[2], 10) : fileSize - 1;

  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  if (start >= fileSize) return null;

  end = Math.min(end, fileSize - 1);
  if (start > end) return null;

  return { start, end };
}

async function readFileRange(
  absolute: string,
  start: number,
  end: number,
): Promise<Buffer> {
  const length = end - start + 1;
  const handle = await open(absolute, "r");
  try {
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, start);
    return buffer;
  } finally {
    await handle.close();
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params;
  const relativePath = segments.map(decodeURIComponent).join("/");
  const absolute = resolveAudioFilePath(relativePath);
  if (!absolute) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let fileSize: number;
  try {
    fileSize = (await stat(absolute)).size;
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const ext = path.extname(absolute);
  const contentType = contentTypeForExtension(ext);
  const baseHeaders = {
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
  };

  const rangeHeader = request.headers.get("range");
  if (rangeHeader) {
    const range = parseRange(rangeHeader, fileSize);
    if (!range) {
      return new NextResponse(null, {
        status: 416,
        headers: {
          ...baseHeaders,
          "Content-Range": `bytes */${fileSize}`,
        },
      });
    }

    try {
      const buffer = await readFileRange(absolute, range.start, range.end);
      return new NextResponse(new Uint8Array(buffer), {
        status: 206,
        headers: {
          ...baseHeaders,
          "Content-Type": contentType,
          "Content-Length": String(buffer.length),
          "Content-Range": `bytes ${range.start}-${range.end}/${fileSize}`,
        },
      });
    } catch {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  try {
    const buffer = await readFileRange(absolute, 0, fileSize - 1);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        ...baseHeaders,
        "Content-Type": contentType,
        "Content-Length": String(fileSize),
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
