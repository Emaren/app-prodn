import { promises as fs } from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";

import { mediaFallbackUrl, resolveManagedMediaUrl } from "@/lib/managedMediaAssets";
import { getPrisma } from "@/lib/prisma";

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

const PUBLIC_DIRECT_PREFIXES = [
  "/brand/",
  "/champions/",
  "/icons/",
  "/legacy/",
  "/lobby/",
  "/watcher/",
];

function uploadRoot() {
  return process.env.MANAGED_MEDIA_UPLOAD_DIR || DEFAULT_UPLOAD_ROOT;
}

function publicRoot() {
  return path.resolve(process.cwd(), "public");
}

function contentTypeFor(filePath: string) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

function safeSegment(value: string) {
  const cleaned = String(value || "").trim();

  if (!cleaned || cleaned.includes("/") || cleaned.includes("\\") || cleaned.includes("..")) {
    return "";
  }

  return cleaned;
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

function redirectToInternalAsset(url: string) {
  return new NextResponse(null, {
    status: 307,
    headers: {
      Location: url.startsWith("/") && !url.startsWith("//") ? url : "/",
      "Cache-Control": "public, max-age=300",
    },
  });
}

function managedUploadParts(url: string) {
  if (!url.startsWith("/uploads/managed-assets/")) {
    return null;
  }

  const parts = url.split("/").filter(Boolean);

  if (parts.length !== 4 || parts[0] !== "uploads" || parts[1] !== "managed-assets") {
    return null;
  }

  const kind = safeSegment(parts[2]);
  const file = safeSegment(parts[3]);

  if (!kind || !file) {
    return null;
  }

  return { kind, file };
}

function publicAssetRelativePath(url: string) {
  const cleanUrl = String(url || "").split("?")[0];

  if (!cleanUrl.startsWith("/") || cleanUrl.startsWith("//")) {
    return null;
  }

  if (!PUBLIC_DIRECT_PREFIXES.some((prefix) => cleanUrl.startsWith(prefix))) {
    return null;
  }

  let decoded = "";

  try {
    decoded = decodeURIComponent(cleanUrl);
  } catch {
    return null;
  }

  if (decoded.includes("\0") || decoded.includes("\\") || decoded.includes("..")) {
    return null;
  }

  return decoded.replace(/^\/+/, "");
}

async function serveManagedUploadDirect(request: NextRequest, url: string) {
  const parts = managedUploadParts(url);

  if (!parts) {
    return null;
  }

  const accept = request.headers.get("accept") || "";
  const wantsWebp = accept.includes("image/webp");
  const thumbSidecar = wantsAvatarThumb(request) ? thumbnailSidecarName(parts.file) : "";
  const cardSidecar = wantsAvatarCard(request) ? cardSidecarName(parts.file) : "";
  const sidecar = wantsWebp ? webpSidecarName(parts.file) : "";
  const root = uploadRoot();

  const relativeOriginals = [
    path.join(parts.kind, parts.file),
    path.join("uploads", "managed-assets", parts.kind, parts.file),
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
        "X-AoE2WAR-Media-Proxy": "direct-managed",
      },
    });
  }

  return null;
}

async function servePublicAssetDirect(request: NextRequest, url: string) {
  const relative = publicAssetRelativePath(url);

  if (!relative) {
    return null;
  }

  const accept = request.headers.get("accept") || "";
  const wantsWebp = accept.includes("image/webp");
  const root = publicRoot();
  const original = path.resolve(root, relative);

  if (!original.startsWith(`${root}${path.sep}`)) {
    return null;
  }

  const ext = path.extname(original);
  const thumbSidecar = wantsAvatarThumb(request) && ext && ext.toLowerCase() !== ".svg"
    ? `${original.slice(0, -ext.length)}.thumb.webp`
    : "";
  const cardSidecar = wantsAvatarCard(request) && ext && ext.toLowerCase() !== ".svg"
    ? `${original.slice(0, -ext.length)}.card.webp`
    : "";
  const sidecar = wantsWebp && ext && ext.toLowerCase() !== ".webp"
    ? `${original.slice(0, -ext.length)}.webp`
    : "";

  const candidates: Array<{ filePath: string; variant: "public-card-sidecar" | "public-thumb-sidecar" | "public-webp-sidecar" | "public-original" }> = [];

  if (cardSidecar) {
    candidates.push({ filePath: cardSidecar, variant: "public-card-sidecar" });
  }

  if (thumbSidecar) {
    candidates.push({ filePath: thumbSidecar, variant: "public-thumb-sidecar" });
  }

  if (sidecar) {
    candidates.push({ filePath: sidecar, variant: "public-webp-sidecar" });
  }

  candidates.push({ filePath: original, variant: "public-original" });

  for (const candidate of candidates) {
    const hit = await readIfExists(candidate.filePath);

    if (!hit) {
      continue;
    }

    return new NextResponse(hit.data, {
      headers: {
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        "Content-Length": String(hit.data.length),
        "Content-Type": contentTypeFor(candidate.filePath),
        "Last-Modified": hit.stat.mtime.toUTCString(),
        "Vary": "Accept",
        "X-AoE2WAR-Image-Variant": candidate.variant,
        "X-AoE2WAR-Media-Proxy": "direct-public",
      },
    });
  }

  return null;
}

async function serveDirectAsset(request: NextRequest, url: string) {
  const managed = await serveManagedUploadDirect(request, url);

  if (managed) {
    return managed;
  }

  return servePublicAssetDirect(request, url);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ kind: string; target: string }> }
) {
  const { kind, target } = await params;
  const fallback = request.nextUrl.searchParams.get("fallback");

  try {
    const url = await resolveManagedMediaUrl(getPrisma(), kind, target, fallback);
    const direct = await serveDirectAsset(request, url);

    if (direct) {
      return direct;
    }

    return redirectToInternalAsset(url);
  } catch (error) {
    console.warn("Managed media route failed:", error);
    const url = mediaFallbackUrl(kind, target, fallback) || "/";
    const direct = await serveDirectAsset(request, url);

    if (direct) {
      return direct;
    }

    return redirectToInternalAsset(url);
  }
}
