import { readFile, stat } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";

import { heroStageTakeoverImageFilePath } from "@/lib/heroStageTakeover";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIME_BY_EXT: Record<string, string> = {
  ".gif": "image/gif",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ file: string }> }
) {
  const { file } = await params;

  const filePath = heroStageTakeoverImageFilePath(file);
  if (!filePath) {
    return NextResponse.json({ detail: "Invalid hero image." }, { status: 404 });
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) {
      return NextResponse.json({ detail: "Hero image not found." }, { status: 404 });
    }

    const body = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_BY_EXT[ext] || "application/octet-stream";

    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "Content-Length": String(body.length),
        "Content-Type": contentType,
      },
    });
  } catch {
    return NextResponse.json({ detail: "Hero image not found." }, { status: 404 });
  }
}
