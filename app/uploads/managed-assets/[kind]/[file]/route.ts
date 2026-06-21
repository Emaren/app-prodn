import { promises as fs } from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_UPLOAD_ROOT = "/mnt/HC_Volume_105319120/aoe2-managed-assets";

const MIME_TYPES: Record<string, string> = {
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function uploadRoot() {
  return process.env.MANAGED_MEDIA_UPLOAD_DIR || DEFAULT_UPLOAD_ROOT;
}

function safeSegment(value: string) {
  const cleaned = String(value || "").trim();

  if (!cleaned || cleaned.includes("/") || cleaned.includes("\\") || cleaned.includes("..")) {
    return "";
  }

  return cleaned;
}

function contentTypeFor(filePath: string) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

async function readIfExists(filePath: string) {
  try {
    const stat = await fs.stat(filePath);

    if (!stat.isFile()) {
      return null;
    }

    const data = await fs.readFile(filePath);

    return { data, stat };
  } catch {
    return null;
  }
}

function webpSidecarName(fileName: string) {
  const ext = path.extname(fileName);

  if (!ext || ext.toLowerCase() === ".webp") {
    return "";
  }

  return `${fileName.slice(0, -ext.length)}.webp`;
}

function thumbnailSidecarName(fileName: string) {
  const ext = path.extname(fileName);

  if (!ext || ext.toLowerCase() === ".svg") {
    return "";
  }

  return `${fileName.slice(0, -ext.length)}.thumb.webp`;
}

function cardSidecarName(fileName: string) {
  const ext = path.extname(fileName);

  if (!ext || ext.toLowerCase() === ".svg") {
    return "";
  }

  return `${fileName.slice(0, -ext.length)}.card.webp`;
}

function requestedAvatarVariant(request: NextRequest) {
  const size = request.nextUrl.searchParams.get("size") || request.nextUrl.searchParams.get("variant");

  if (size === "thumb" || size === "thumbnail" || size === "avatar") {
    return "thumb";
  }

  if (size === "card" || size === "portrait") {
    return "card";
  }

  return "";
}

function wantsAvatarThumb(request: NextRequest) {
  return requestedAvatarVariant(request) === "thumb";
}

function wantsAvatarCard(request: NextRequest) {
  return requestedAvatarVariant(request) === "card";
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ kind: string; file: string }> }
) {
  const { kind: rawKind, file: rawFile } = await context.params;

  const kind = safeSegment(rawKind);
  const file = safeSegment(rawFile);

  if (!kind || !file) {
    return new NextResponse("Not found", { status: 404 });
  }

  const root = uploadRoot();
  const accept = request.headers.get("accept") || "";
  const wantsWebp = accept.includes("image/webp");
  const thumbSidecar = wantsAvatarThumb(request) ? thumbnailSidecarName(file) : "";
  const cardSidecar = wantsAvatarCard(request) ? cardSidecarName(file) : "";
  const sidecar = wantsWebp ? webpSidecarName(file) : "";

  const relativeOriginals = [
    path.join(kind, file),
    path.join("uploads", "managed-assets", kind, file),
  ];

  const candidates: Array<{ filePath: string; variant: "card-sidecar" | "thumb-sidecar" | "webp-sidecar" | "original" }> = [];

  if (cardSidecar) {
    for (const relative of relativeOriginals) {
      candidates.push({
        filePath: path.join(root, path.dirname(relative), cardSidecar),
        variant: "card-sidecar",
      });
    }
  }

  if (thumbSidecar) {
    for (const relative of relativeOriginals) {
      candidates.push({
        filePath: path.join(root, path.dirname(relative), thumbSidecar),
        variant: "thumb-sidecar",
      });
    }
  }

  if (sidecar) {
    for (const relative of relativeOriginals) {
      candidates.push({
        filePath: path.join(root, path.dirname(relative), sidecar),
        variant: "webp-sidecar",
      });
    }
  }

  for (const relative of relativeOriginals) {
    candidates.push({
      filePath: path.join(root, relative),
      variant: "original",
    });
  }

  for (const candidate of candidates) {
    const hit = await readIfExists(candidate.filePath);

    if (!hit) {
      continue;
    }

    return new NextResponse(hit.data, {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Length": String(hit.data.length),
        "Content-Type": contentTypeFor(candidate.filePath),
        "Last-Modified": hit.stat.mtime.toUTCString(),
        "Vary": "Accept",
        "X-AoE2WAR-Image-Variant": candidate.variant,
      },
    });
  }

  return new NextResponse("Not found", { status: 404 });
}
