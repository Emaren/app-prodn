import { randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

export type HeroStageTakeoverState = {
  active: boolean;
  imageUrl: string | null;
  imageAlt: string | null;
  title: string | null;
  linkUrl: string | null;
  startsAt: string | null;
  expiresAt: string | null;
  uploadedByUid: string | null;
  originalName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string | null;
  updatedAt: string | null;
};

const MAX_UPLOAD_BYTES = 14 * 1024 * 1024;

const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
}

function defaultHeroStageTakeoverState(): HeroStageTakeoverState {
  return {
    active: false,
    imageUrl: null,
    imageAlt: null,
    title: null,
    linkUrl: null,
    startsAt: null,
    expiresAt: null,
    uploadedByUid: null,
    originalName: null,
    mimeType: null,
    sizeBytes: null,
    createdAt: null,
    updatedAt: null,
  };
}

function storageRoot() {
  return path.resolve(process.env.HERO_STAGE_STORAGE_DIR || path.join(process.cwd(), "storage", "hero-stage"));
}

function uploadRoot() {
  return path.resolve(process.env.HERO_STAGE_UPLOAD_DIR || path.join(process.cwd(), "public", "uploads", "hero-stage"));
}

function statePath() {
  return path.join(storageRoot(), "takeover.json");
}

function cleanPublicBasePath(value: string | null | undefined) {
  const cleaned = String(value || "").trim();
  if (!cleaned || !cleaned.startsWith("/") || cleaned.startsWith("//")) {
    return "/uploads/hero-stage";
  }
  return cleaned.replace(/\/+$/, "") || "/uploads/hero-stage";
}

function publicUploadUrl(filename: string) {
  return `${cleanPublicBasePath(process.env.HERO_STAGE_PUBLIC_BASE_PATH)}/${filename}`;
}

function extensionForUpload(mimeType: string | null, originalName: string | null) {
  if (mimeType && IMAGE_EXTENSIONS[mimeType]) return IMAGE_EXTENSIONS[mimeType];

  const ext = (originalName ? path.extname(originalName).replace(".", "").toLowerCase() : "")
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 8);

  if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) {
    return ext === "jpeg" ? "jpg" : ext;
  }

  return null;
}

function normalizeIsoDate(value: unknown) {
  const raw = cleanText(value, 80);
  if (!raw) return null;

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString();
}

function sanitizeHeroLinkUrl(value: unknown) {
  const raw = cleanText(value, 260);
  if (!raw) return null;

  if (raw.startsWith("/") && !raw.startsWith("//")) {
    return raw;
  }

  try {
    const parsed = new URL(raw);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
  } catch {
    return null;
  }

  return null;
}

export async function readHeroStageTakeoverState(): Promise<HeroStageTakeoverState> {
  try {
    const raw = await readFile(statePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<HeroStageTakeoverState>;

    return {
      ...defaultHeroStageTakeoverState(),
      ...parsed,
      active: Boolean(parsed.active),
      imageUrl: typeof parsed.imageUrl === "string" ? parsed.imageUrl : null,
    };
  } catch {
    return defaultHeroStageTakeoverState();
  }
}

async function writeHeroStageTakeoverState(state: HeroStageTakeoverState) {
  await mkdir(storageRoot(), { recursive: true });
  await writeFile(statePath(), `${JSON.stringify(state, null, 2)}\n`, "utf8");
  return state;
}

export function isHeroStageTakeoverLive(state: HeroStageTakeoverState, now = new Date()) {
  if (!state.active || !state.imageUrl) return false;

  const startsAt = state.startsAt ? new Date(state.startsAt) : null;
  const expiresAt = state.expiresAt ? new Date(state.expiresAt) : null;

  if (startsAt && !Number.isNaN(startsAt.getTime()) && startsAt.getTime() > now.getTime()) {
    return false;
  }

  if (expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= now.getTime()) {
    return false;
  }

  return true;
}

export function publicHeroStageTakeoverState(state: HeroStageTakeoverState) {
  const active = isHeroStageTakeoverLive(state);

  return {
    ...state,
    active,
    imageUrl: active ? state.imageUrl : null,
  };
}

export async function saveHeroStageTakeoverUpload({
  file,
  title,
  imageAlt,
  linkUrl,
  startsAt,
  expiresAt,
  uploadedByUid,
}: {
  file: File;
  title?: unknown;
  imageAlt?: unknown;
  linkUrl?: unknown;
  startsAt?: unknown;
  expiresAt?: unknown;
  uploadedByUid?: string | null;
}) {
  const originalName = cleanText(file.name, 255) || null;
  const mimeType = cleanText(file.type, 100) || null;

  if (file.size <= 0) {
    throw new Error("Choose Jim's celebration image first.");
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("Image is too large. Keep the hero takeover under 14 MB.");
  }

  const extension = extensionForUpload(mimeType, originalName);
  if (!extension) {
    throw new Error("Use PNG, JPG, WEBP, or GIF for the hero takeover.");
  }

  const safeBase =
    cleanText(title, 80)
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "hero-takeover";

  const filename = `${safeBase}-${Date.now()}-${randomUUID().slice(0, 8)}.${extension}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  await mkdir(uploadRoot(), { recursive: true });
  await writeFile(path.join(uploadRoot(), filename), buffer);

  const now = new Date().toISOString();

  const state: HeroStageTakeoverState = {
    active: true,
    imageUrl: publicUploadUrl(filename),
    imageAlt: cleanText(imageAlt, 180) || cleanText(title, 140) || "AOE2WAR hero image takeover",
    title: cleanText(title, 140) || "Hero image takeover",
    linkUrl: sanitizeHeroLinkUrl(linkUrl),
    startsAt: normalizeIsoDate(startsAt),
    expiresAt: normalizeIsoDate(expiresAt),
    uploadedByUid: uploadedByUid ?? null,
    originalName,
    mimeType,
    sizeBytes: file.size,
    createdAt: now,
    updatedAt: now,
  };

  return writeHeroStageTakeoverState(state);
}

export async function clearHeroStageTakeover() {
  const previous = await readHeroStageTakeoverState();
  return writeHeroStageTakeoverState({
    ...previous,
    active: false,
    updatedAt: new Date().toISOString(),
  });
}
