import { mkdir, readFile, stat, writeFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

import { heroStageTakeoverImageFilePath } from "@/lib/heroStageTakeover";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ file: string }>;
};

const MIME_BY_EXT: Record<string, string> = {
  ".gif": "image/gif",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

function contentTypeFor(filename: string) {
  return MIME_BY_EXT[path.extname(filename).toLowerCase()] || "application/octet-stream";
}

function clampNumber(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function wantsOptimized(request: NextRequest) {
  const widthParam = request.nextUrl.searchParams.get("w");
  const format = request.nextUrl.searchParams.get("fmt") || "webp";
  return Boolean(widthParam) && format === "webp";
}

function cacheDir() {
  return path.join(process.cwd(), "storage", "hero-stage", "optimized-cache");
}

function optimizedCachePath(filename: string, width: number, quality: number) {
  const clean = filename.replace(/[^a-zA-Z0-9._-]+/g, "_");
  return path.join(cacheDir(), `${clean}.w${width}.q${quality}.webp`);
}

async function sendFile(filePath: string, contentType: string) {
  const body = await readFile(filePath);
  const info = await stat(filePath);

  return new NextResponse(body, {
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Type": contentType,
      "Content-Length": String(info.size),
      "X-AoE2WAR-Hero-Image": "1",
    },
  });
}

export async function GET(request: NextRequest, context: RouteContext) {
  const params = await context.params;
  const filename = decodeURIComponent(params.file || "");
  const sourcePath = heroStageTakeoverImageFilePath(filename);

  if (!sourcePath) {
    return NextResponse.json({ detail: "Hero image not found." }, { status: 404 });
  }

  const sourceType = contentTypeFor(filename);

  if (!wantsOptimized(request) || sourceType === "image/gif") {
    return sendFile(sourcePath, sourceType);
  }

  const width = clampNumber(request.nextUrl.searchParams.get("w"), 1840, 320, 3680);
  const quality = clampNumber(request.nextUrl.searchParams.get("q"), 94, 80, 100);
  const targetPath = optimizedCachePath(filename, width, quality);

  try {
    return await sendFile(targetPath, "image/webp");
  } catch {
    // Cache miss. Build it below.
  }

  await mkdir(path.dirname(targetPath), { recursive: true });

  const source = await readFile(sourcePath);
  const optimized = await sharp(source, { animated: false })
    .rotate()
    .resize({
      width,
      withoutEnlargement: true,
      fit: "inside",
    })
    .webp({
      quality,
      effort: 5,
      smartSubsample: false,
    })
    .toBuffer();

  await writeFile(targetPath, optimized);
  return sendFile(targetPath, "image/webp");
}
