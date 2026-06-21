import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

import type { PrismaClient } from "@/lib/generated/prisma";
import { allChampionTitles } from "@/lib/champions/titles";

export const MANAGED_MEDIA_KINDS = ["avatar", "belt", "artifact", "logo", "background", "other"] as const;

export type ManagedMediaKind = (typeof MANAGED_MEDIA_KINDS)[number];

const MANAGED_MEDIA_KIND_SET = new Set<string>(MANAGED_MEDIA_KINDS);
const MAX_UPLOAD_BYTES = 7 * 1024 * 1024;

const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

const STATIC_FALLBACKS: Record<string, string> = {
  "logo:footer-wolo": "/legacy/wolo-logo-transparent.webp",
  "avatar:emaren": "/champions/players/emaren.webp",
  "avatar:jim": "/champions/players/jim.webp",
  "avatar:julio": "/champions/players/julio.webp",
  "avatar:julio-alvarez": "/champions/players/julio.webp",
  "avatar:sniper": "/champions/players/sniper.webp",
  "avatar:silhouette": "/champions/players/silhouette.webp",
  "avatar:female-silhouette": "/champions/players/female_silhouette.webp",
};

for (const title of allChampionTitles) {
  const kind = title.type === "designation" ? "artifact" : "belt";
  STATIC_FALLBACKS[`${kind}:${title.id}`] = title.assetUrl;
  STATIC_FALLBACKS[`${kind}:${title.slug}`] = title.assetUrl;
}

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
}

export function slugifyManagedMediaTarget(value: string | null | undefined) {
  return cleanText(value, 160)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
}

export function normalizeManagedMediaKind(value: unknown): ManagedMediaKind {
  const normalized = cleanText(value, 32).toLowerCase();
  return MANAGED_MEDIA_KIND_SET.has(normalized) ? (normalized as ManagedMediaKind) : "other";
}

export function normalizeManagedMediaTarget(value: unknown) {
  const normalized = slugifyManagedMediaTarget(cleanText(value, 160));
  return normalized || null;
}

export function normalizeManagedMediaLabel(value: unknown, fallback: string) {
  return cleanText(value, 160) || fallback;
}

export function mediaFallbackUrl(kind: string, target: string | null | undefined, fallback?: string | null) {
  const normalizedKind = normalizeManagedMediaKind(kind);
  const normalizedTarget = normalizeManagedMediaTarget(target);
  const safeFallback =
    typeof fallback === "string" && fallback.startsWith("/") && !fallback.startsWith("//")
      ? fallback
      : null;
  return (
    (normalizedTarget ? STATIC_FALLBACKS[`${normalizedKind}:${normalizedTarget}`] : null) ||
    safeFallback ||
    (normalizedKind === "avatar" ? STATIC_FALLBACKS["avatar:silhouette"] : null)
  );
}

export function managedMediaPublicUrl(kind: string, target: string, fallback?: string | null) {
  const normalizedKind = normalizeManagedMediaKind(kind);
  const normalizedTarget = normalizeManagedMediaTarget(target) || "default";
  const params = fallback ? `?fallback=${encodeURIComponent(fallback)}` : "";
  return `/api/media-assets/${encodeURIComponent(normalizedKind)}/${encodeURIComponent(normalizedTarget)}${params}`;
}

export async function resolveManagedMediaUrl(
  prisma: PrismaClient,
  kind: string,
  target: string | null | undefined,
  fallback?: string | null
) {
  const normalizedKind = normalizeManagedMediaKind(kind);
  const normalizedTarget = normalizeManagedMediaTarget(target);

  if (normalizedTarget) {
    const asset = await prisma.managedMediaAsset.findFirst({
      where: {
        kind: normalizedKind,
        target: normalizedTarget,
        active: true,
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    });

    if (asset?.url) {
      return asset.url;
    }
  }

  return mediaFallbackUrl(normalizedKind, normalizedTarget, fallback) || "/";
}

function extensionForUpload(mimeType: string | null, originalName: string | null) {
  if (mimeType && IMAGE_EXTENSIONS[mimeType]) {
    return IMAGE_EXTENSIONS[mimeType];
  }

  const ext = (originalName ? path.extname(originalName).replace(".", "").toLowerCase() : "")
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 8);
  return ext && ["png", "jpg", "jpeg", "webp", "gif"].includes(ext) ? (ext === "jpeg" ? "jpg" : ext) : null;
}

function cleanBasePath(value: string | null | undefined) {
  const cleaned = String(value || "").trim();

  if (!cleaned || !cleaned.startsWith("/") || cleaned.startsWith("//")) {
    return "/uploads/managed-assets";
  }

  return cleaned.replace(/\/+$/, "") || "/uploads/managed-assets";
}

function managedMediaUploadRoot() {
  const configured = String(process.env.MANAGED_MEDIA_UPLOAD_DIR || "").trim();

  if (configured) {
    return path.resolve(configured);
  }

  return path.join(process.cwd(), "public", "uploads", "managed-assets");
}

function managedMediaUploadDir(kind: ManagedMediaKind) {
  return path.join(managedMediaUploadRoot(), kind);
}

function publicUploadUrl(kind: ManagedMediaKind, filename: string) {
  const basePath = cleanBasePath(process.env.MANAGED_MEDIA_PUBLIC_BASE_PATH);
  return `${basePath}/${kind}/${filename}`;
}

export async function saveManagedMediaUpload({
  prisma,
  file,
  kind,
  target,
  label,
  alt,
  uploadedByUid,
}: {
  prisma: PrismaClient;
  file: File;
  kind: unknown;
  target: unknown;
  label: unknown;
  alt?: unknown;
  uploadedByUid?: string | null;
}) {
  const normalizedKind = normalizeManagedMediaKind(kind);
  const normalizedTarget = normalizeManagedMediaTarget(target);
  const normalizedLabel = normalizeManagedMediaLabel(label, normalizedTarget || "Uploaded asset");
  const normalizedAlt = cleanText(alt, 180) || null;
  const originalName = cleanText(file.name, 255) || null;
  const mimeType = cleanText(file.type, 100) || null;

  if (file.size <= 0) {
    throw new Error("Choose an image file first.");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("Image is too large. Keep managed assets under 7 MB.");
  }

  const extension = extensionForUpload(mimeType, originalName);
  if (!extension) {
    throw new Error("Use PNG, JPG, WEBP, or GIF for managed assets.");
  }

  const targetPart = normalizedTarget || slugifyManagedMediaTarget(normalizedLabel) || "asset";
  const filename = `${targetPart}-${Date.now()}-${randomUUID().slice(0, 8)}.${extension}`;
  const uploadDir = managedMediaUploadDir(normalizedKind);
  const buffer = Buffer.from(await file.arrayBuffer());

  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, filename), buffer);

  if (normalizedTarget) {
    await prisma.managedMediaAsset.updateMany({
      where: {
        kind: normalizedKind,
        target: normalizedTarget,
        active: true,
      },
      data: {
        active: false,
      },
    });
  }

  return prisma.managedMediaAsset.create({
    data: {
      key: `${normalizedKind}:${targetPart}:${Date.now()}:${randomUUID().slice(0, 8)}`,
      kind: normalizedKind,
      target: normalizedTarget,
      label: normalizedLabel,
      url: publicUploadUrl(normalizedKind, filename),
      alt: normalizedAlt,
      mimeType,
      originalName,
      sizeBytes: file.size,
      active: true,
      uploadedByUid: uploadedByUid ?? null,
    },
  });
}

export async function saveManagedMediaReference({
  prisma,
  kind,
  target,
  url,
  label,
  alt,
  uploadedByUid,
}: {
  prisma: PrismaClient;
  kind: unknown;
  target: unknown;
  url: unknown;
  label: unknown;
  alt?: unknown;
  uploadedByUid?: string | null;
}) {
  const normalizedKind = normalizeManagedMediaKind(kind);
  const normalizedTarget = normalizeManagedMediaTarget(target);
  const normalizedUrl = cleanText(url, 500);
  const normalizedLabel = normalizeManagedMediaLabel(label, normalizedTarget || "Managed asset");
  const normalizedAlt = cleanText(alt, 180) || null;

  if (!normalizedTarget) {
    throw new Error("Choose a target for this asset.");
  }
  if (!normalizedUrl.startsWith("/") || normalizedUrl.startsWith("//")) {
    throw new Error("Managed asset references must use an internal URL.");
  }

  await prisma.managedMediaAsset.updateMany({
    where: {
      kind: normalizedKind,
      target: normalizedTarget,
      active: true,
    },
    data: {
      active: false,
    },
  });

  return prisma.managedMediaAsset.create({
    data: {
      key: `${normalizedKind}:${normalizedTarget}:ref:${Date.now()}:${randomUUID().slice(0, 8)}`,
      kind: normalizedKind,
      target: normalizedTarget,
      label: normalizedLabel,
      url: normalizedUrl,
      alt: normalizedAlt,
      mimeType: null,
      originalName: null,
      sizeBytes: 0,
      active: true,
      uploadedByUid: uploadedByUid ?? null,
    },
  });
}

export async function activateManagedMediaAsset(prisma: PrismaClient, id: number, active: boolean) {
  const existing = await prisma.managedMediaAsset.findUnique({ where: { id } });
  if (!existing) {
    throw new Error("Managed media asset not found.");
  }

  if (active && existing.target) {
    await prisma.managedMediaAsset.updateMany({
      where: {
        id: { not: id },
        kind: existing.kind,
        target: existing.target,
        active: true,
      },
      data: {
        active: false,
      },
    });
  }

  return prisma.managedMediaAsset.update({
    where: { id },
    data: { active },
  });
}
