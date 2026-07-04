import { existsSync } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

export type HeroStageTransitionStyle = "fade" | "slide" | "cut";

export type HeroStageTakeoverSlide = {
  id: string;
  imageUrl: string;
  imageAlt: string | null;
  title: string | null;
  linkUrl: string | null;
  filename: string | null;
  createdAt: string;
};

export type HeroStageTakeoverState = {
  active: boolean;
  imageUrl: string | null;
  imageAlt: string | null;
  title: string | null;
  linkUrl: string | null;
  startsAt: string | null;
  expiresAt: string | null;
  updatedAt: string | null;
  intervalMs: number;
  transitionMs: number;
  transitionStyle: HeroStageTransitionStyle;
  slides: HeroStageTakeoverSlide[];
};

const DEFAULT_INTERVAL_MS = 8000;
const DEFAULT_TRANSITION_MS = 900;
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

const MIME_TO_EXT: Record<string, string> = {
  "image/gif": ".gif",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

function statePath() {
  return path.join(process.cwd(), "storage", "hero-stage", "takeover.json");
}

function uploadRoot() {
  return path.join(process.cwd(), "storage", "hero-stage", "uploads");
}

function legacyUploadRoots() {
  return [
    uploadRoot(),
    path.join(process.cwd(), "storage", "hero-stage"),
    path.join(process.cwd(), "public", "uploads", "hero-stage"),
  ];
}

function nowIso() {
  return new Date().toISOString();
}

function cleanString(value: unknown, max = 500) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function normalizeBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  const raw = cleanString(value).toLowerCase();
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
}

export function normalizeHeroStageTakeoverNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number
) {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(raw)));
}

export function normalizeHeroStageTransitionStyle(value: unknown): HeroStageTransitionStyle {
  const raw = cleanString(value).toLowerCase();
  if (raw === "slide" || raw === "cut" || raw === "fade") return raw;
  return "fade";
}

function publicUploadUrl(filename: string) {
  return `/api/hero-stage-takeover/image/${encodeURIComponent(filename)}`;
}

function basenameFromImageUrl(value: unknown) {
  const raw = cleanString(value);
  if (!raw) return null;
  const finalPart = raw.split("?")[0]?.split("/").pop() || "";
  const decoded = decodeURIComponent(finalPart);
  if (!decoded || decoded !== path.basename(decoded) || !/^[a-zA-Z0-9._-]+$/.test(decoded)) {
    return null;
  }
  return decoded;
}

function normalizeSlide(value: unknown, fallbackLink: string | null): HeroStageTakeoverSlide | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const imageUrl = cleanString(raw.imageUrl, 1200);
  if (!imageUrl) return null;

  const filename = basenameFromImageUrl(raw.filename || imageUrl);
  const id = cleanString(raw.id, 120) || filename || `slide-${Date.now()}`;

  return {
    id,
    imageUrl,
    imageAlt: cleanString(raw.imageAlt, 240) || null,
    title: cleanString(raw.title, 180) || null,
    linkUrl: cleanString(raw.linkUrl, 1200) || fallbackLink,
    filename,
    createdAt: cleanString(raw.createdAt, 80) || nowIso(),
  };
}

export function normalizeHeroStageTakeoverState(value: unknown): HeroStageTakeoverState {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  const fallbackLink = cleanString(raw.linkUrl, 1200) || "/forum";
  const slidesSource = Array.isArray(raw.slides) ? raw.slides : [];
  const slides = slidesSource
    .map((slide) => normalizeSlide(slide, fallbackLink))
    .filter((slide): slide is HeroStageTakeoverSlide => Boolean(slide));

  const legacyImageUrl = cleanString(raw.imageUrl, 1200);
  if (!slides.length && legacyImageUrl) {
    const filename = basenameFromImageUrl(legacyImageUrl);
    slides.push({
      id: filename || "legacy-hero-slide",
      imageUrl: legacyImageUrl,
      imageAlt: cleanString(raw.imageAlt, 240) || null,
      title: cleanString(raw.title, 180) || null,
      linkUrl: fallbackLink,
      filename,
      createdAt: cleanString(raw.updatedAt, 80) || nowIso(),
    });
  }

  const firstSlide = slides[0] || null;

  return {
    active: normalizeBoolean(raw.active, false),
    imageUrl: firstSlide?.imageUrl || legacyImageUrl || null,
    imageAlt: firstSlide?.imageAlt || cleanString(raw.imageAlt, 240) || null,
    title: firstSlide?.title || cleanString(raw.title, 180) || null,
    linkUrl: firstSlide?.linkUrl || fallbackLink,
    startsAt: cleanString(raw.startsAt, 80) || null,
    expiresAt: cleanString(raw.expiresAt, 80) || null,
    updatedAt: cleanString(raw.updatedAt, 80) || null,
    intervalMs: normalizeHeroStageTakeoverNumber(
      raw.intervalMs,
      DEFAULT_INTERVAL_MS,
      2500,
      60000
    ),
    transitionMs: normalizeHeroStageTakeoverNumber(
      raw.transitionMs,
      DEFAULT_TRANSITION_MS,
      0,
      5000
    ),
    transitionStyle: normalizeHeroStageTransitionStyle(raw.transitionStyle),
    slides,
  };
}

export function isHeroStageTakeoverLive(state: HeroStageTakeoverState, at = new Date()) {
  if (!state.active || state.slides.length < 1) return false;

  if (state.startsAt) {
    const starts = new Date(state.startsAt);
    if (!Number.isNaN(starts.getTime()) && starts > at) return false;
  }

  if (state.expiresAt) {
    const expires = new Date(state.expiresAt);
    if (!Number.isNaN(expires.getTime()) && expires <= at) return false;
  }

  return true;
}

export async function readHeroStageTakeoverState(): Promise<HeroStageTakeoverState> {
  try {
    const raw = await readFile(statePath(), "utf8");
    return normalizeHeroStageTakeoverState(JSON.parse(raw));
  } catch {
    return normalizeHeroStageTakeoverState({});
  }
}

export async function writeHeroStageTakeoverState(
  input: Partial<HeroStageTakeoverState> & Record<string, unknown>
) {
  const current = await readHeroStageTakeoverState();
  const state = normalizeHeroStageTakeoverState({
    ...current,
    ...input,
    updatedAt: nowIso(),
  });

  await mkdir(path.dirname(statePath()), { recursive: true });
  await writeFile(statePath(), JSON.stringify(state, null, 2) + "\n", "utf8");
  return state;
}

export function heroStageTakeoverImageFilePath(filename: string) {
  const cleanName = path.basename(String(filename || "").trim());

  if (!cleanName || cleanName !== filename || !/^[a-zA-Z0-9._-]+$/.test(cleanName)) {
    return null;
  }

  for (const root of legacyUploadRoots()) {
    const candidate = path.join(root, cleanName);
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return path.join(uploadRoot(), cleanName);
}

function safeFilenamePart(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export async function saveHeroStageTakeoverUpload(file: File) {
  const ext = MIME_TO_EXT[file.type];
  if (!ext) {
    throw new Error("Use a PNG, JPG, WEBP, or GIF image.");
  }

  if (file.size < 1) {
    throw new Error("The uploaded image is empty.");
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("Hero images must be under 12 MB.");
  }

  const sourceName = safeFilenamePart(file.name.replace(/\.[^.]+$/, "")) || "hero";
  const filename = `${sourceName}-${Date.now()}-${Math.random()
    .toString(16)
    .slice(2, 10)}${ext}`;

  await mkdir(uploadRoot(), { recursive: true });

  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(uploadRoot(), filename), bytes);

  return {
    filename,
    imageUrl: publicUploadUrl(filename),
  };
}
