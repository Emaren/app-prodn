import { open, readFile, stat } from "fs/promises";
import path from "path";

import { NextResponse } from "next/server";

import { getPreviewDataOrigin } from "@/lib/previewDataSource";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAFE_KIND_PATTERN = /^[a-z0-9_-]{1,32}$/i;
const SAFE_FILE_PATTERN = /^[a-z0-9][a-z0-9._-]{0,220}$/i;

function contentTypeFor(filename: string) {
  const extension = path.extname(filename).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  if (extension === ".gif") return "image/gif";
  if (extension === ".mp4") return "video/mp4";
  if (extension === ".webm") return "video/webm";
  return "application/octet-stream";
}

function uploadRoots() {
  const configured = String(process.env.MANAGED_MEDIA_UPLOAD_DIR || "").trim();

  return [
    configured || null,
    path.join(process.cwd(), "public", "uploads", "managed-assets"),
  ].filter(Boolean) as string[];
}

function safeFilePath(baseDir: string, kind: string, file: string) {
  const filePath = path.join(baseDir, kind, file);
  const relativePath = path.relative(baseDir, filePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return null;
  }

  return filePath;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ kind: string; file: string }> }
) {
  const { kind, file } = await params;

  if (!SAFE_KIND_PATTERN.test(kind) || !SAFE_FILE_PATTERN.test(file)) {
    return new NextResponse("Not found", { status: 404 });
  }

  for (const baseDir of uploadRoots()) {
    const filePath = safeFilePath(baseDir, kind, file);
    if (!filePath) continue;

    try {
      const fileStat = await stat(filePath);
      const range = request.headers.get("range");
      const commonHeaders = {
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Type": contentTypeFor(file),
      };
      const rangeMatch = range?.match(/^bytes=(\d*)-(\d*)$/i);

      if (range && !rangeMatch) {
        return new NextResponse(null, {
          status: 416,
          headers: {
            ...commonHeaders,
            "Content-Range": `bytes */${fileStat.size}`,
          },
        });
      }

      if (rangeMatch) {
        const isSuffixRange = !rangeMatch[1] && Boolean(rangeMatch[2]);
        const requestedStart = isSuffixRange
          ? Math.max(0, fileStat.size - Number(rangeMatch[2] || 0))
          : Number(rangeMatch[1] || 0);
        const requestedEnd = isSuffixRange
          ? fileStat.size - 1
          : rangeMatch[2]
            ? Number(rangeMatch[2])
            : fileStat.size - 1;
        const start = Math.max(0, requestedStart);
        const end = Math.min(fileStat.size - 1, requestedEnd);
        if (
          !Number.isInteger(start) ||
          !Number.isInteger(end) ||
          start > end ||
          start >= fileStat.size
        ) {
          return new NextResponse(null, {
            status: 416,
            headers: {
              ...commonHeaders,
              "Content-Range": `bytes */${fileStat.size}`,
            },
          });
        }
        const length = end - start + 1;
        const handle = await open(filePath, "r");
        try {
          const buffer = Buffer.allocUnsafe(length);
          await handle.read(buffer, 0, length, start);
          return new NextResponse(new Uint8Array(buffer), {
            status: 206,
            headers: {
              ...commonHeaders,
              "Content-Length": String(length),
              "Content-Range": `bytes ${start}-${end}/${fileStat.size}`,
            },
          });
        } finally {
          await handle.close();
        }
      }

      const buffer = await readFile(filePath);
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          ...commonHeaders,
          "Content-Length": String(fileStat.size),
        },
      });
    } catch {
      // Try next root.
    }
  }

  const previewOrigin = getPreviewDataOrigin();

  if (previewOrigin) {
    const upstream = new URL(
      `/uploads/managed-assets/${encodeURIComponent(kind)}/${encodeURIComponent(file)}`,
      previewOrigin,
    );
    const headers = new Headers();
    const range = request.headers.get("range");

    if (range) {
      headers.set("Range", range);
    }

    const response = await fetch(upstream, {
      method: "GET",
      headers,
      cache: "no-store",
      redirect: "manual",
    });

    if (response.ok || response.status === 206) {
      const responseHeaders = new Headers();

      for (const name of [
        "accept-ranges",
        "cache-control",
        "content-length",
        "content-range",
        "content-type",
        "etag",
        "last-modified",
      ]) {
        const value = response.headers.get(name);
        if (value) responseHeaders.set(name, value);
      }

      responseHeaders.set(
        "X-AoE2WAR-Preview-Data",
        "production-managed-media",
      );

      return new NextResponse(response.body, {
        status: response.status,
        headers: responseHeaders,
      });
    }
  }

  return new NextResponse("Not found", { status: 404 });
}
