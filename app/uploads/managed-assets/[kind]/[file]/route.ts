import { readFile } from "fs/promises";
import path from "path";

import { NextResponse } from "next/server";

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
  _request: Request,
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
      const buffer = await readFile(filePath);
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Cache-Control": "public, max-age=31536000, immutable",
          "Content-Type": contentTypeFor(file),
        },
      });
    } catch {
      // Try next root.
    }
  }

  return new NextResponse("Not found", { status: 404 });
}
