import { promises as fs } from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

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

const IMAGE_RESPONSE_CACHE_CONTROL = "public, max-age=86400, stale-while-revalidate=604800";
const generatedVariantPromises = new Map<string, Promise<void>>();

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

type ManagedVariant = "card-sidecar" | "thumb-sidecar" | "webp-sidecar" | "original";

function imageResponse(
  hit: NonNullable<Awaited<ReturnType<typeof readIfExists>>>,
  filePath: string,
  variant: ManagedVariant
) {
  return new NextResponse(hit.data, {
    headers: {
      "Cache-Control": IMAGE_RESPONSE_CACHE_CONTROL,
      "Content-Length": String(hit.data.length),
      "Content-Type": contentTypeFor(filePath),
      "Last-Modified": hit.stat.mtime.toUTCString(),
      "Vary": "Accept",
      "X-AoE2WAR-Image-Variant": variant,
      "X-AoE2WAR-Media-Proxy": "direct-managed",
    },
  });
}

function canGenerateWebpVariant(filePath: string) {
  return ![".avif", ".gif", ".svg"].includes(path.extname(filePath).toLowerCase());
}

async function generateWebpVariant(
  originalPath: string,
  targetPath: string,
  variant: Exclude<ManagedVariant, "original">
) {
  if (!canGenerateWebpVariant(originalPath)) return;

  const existing = await readIfExists(targetPath);
  if (existing) return;

  const cached = generatedVariantPromises.get(targetPath);
  if (cached) {
    await cached;
    return;
  }

  const promise = (async () => {
    const temporaryPath = `${targetPath}.${process.pid}.${Date.now()}.tmp.webp`;

    try {
      await fs.mkdir(path.dirname(targetPath), { recursive: true });

      let pipeline = sharp(originalPath, { failOn: "none" }).rotate();

      if (variant === "thumb-sidecar") {
        pipeline = pipeline.resize({ width: 256, withoutEnlargement: true });
      } else if (variant === "card-sidecar") {
        pipeline = pipeline.resize({ width: 640, withoutEnlargement: true });
      }

      const quality =
        variant === "thumb-sidecar" ? 92 : variant === "card-sidecar" ? 95 : 94;

      await pipeline.webp({ quality, effort: 5 }).toFile(temporaryPath);
      await fs.rename(temporaryPath, targetPath);
    } catch (error) {
      await fs.unlink(temporaryPath).catch(() => undefined);
      console.warn(`Managed media ${variant} generation failed for ${originalPath}:`, error);
    }
  })().finally(() => {
    generatedVariantPromises.delete(targetPath);
  });

  generatedVariantPromises.set(targetPath, promise);
  await promise;
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
      "Cache-Control": IMAGE_RESPONSE_CACHE_CONTROL,
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

  const originalCandidates = relativeOriginals.map((relative) => path.join(root, relative));
  let originalPath = "";
  let originalHit: Awaited<ReturnType<typeof readIfExists>> = null;

  for (const candidate of originalCandidates) {
    const hit = await readIfExists(candidate);
    if (!hit) continue;
    originalPath = candidate;
    originalHit = hit;
    break;
  }

  if (!originalPath || !originalHit) return null;

  const requestedVariant: Exclude<ManagedVariant, "original"> | null = cardSidecar
    ? "card-sidecar"
    : thumbSidecar
      ? "thumb-sidecar"
      : sidecar
        ? "webp-sidecar"
        : null;
  const requestedFileName = cardSidecar || thumbSidecar || sidecar;

  if (requestedVariant && requestedFileName) {
    const variantPath = path.join(path.dirname(originalPath), requestedFileName);
    let variantHit = await readIfExists(variantPath);

    if (!variantHit) {
      await generateWebpVariant(originalPath, variantPath, requestedVariant);
      variantHit = await readIfExists(variantPath);
    }

    if (variantHit) {
      return imageResponse(variantHit, variantPath, requestedVariant);
    }
  }

  return imageResponse(originalHit, originalPath, "original");
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
        "Cache-Control": IMAGE_RESPONSE_CACHE_CONTROL,
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
