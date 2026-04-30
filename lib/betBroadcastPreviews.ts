import { randomUUID } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export const BET_BROADCAST_PREVIEW_SLOTS = ["left", "god", "right"] as const;
export type BetBroadcastPreviewSlot = (typeof BET_BROADCAST_PREVIEW_SLOTS)[number];

export type BetBroadcastPreviewUrls = Record<BetBroadcastPreviewSlot, string | null>;

export type BetBroadcastPreviewEntry = {
  id: string;
  sessionKey: string;
  slot: BetBroadcastPreviewSlot;
  title: string | null;
  eventLabel: string | null;
  playedAt: string | null;
  originalName: string | null;
  fileName: string;
  url: string;
  sizeBytes: number;
  mimeType: string | null;
  uploadedAt: string;
  uploadedByUid: string | null;
};

type BetBroadcastPreviewRegistry = {
  items?: BetBroadcastPreviewEntry[];
};

export const EMPTY_BET_BROADCAST_PREVIEW_URLS: BetBroadcastPreviewUrls = {
  left: null,
  god: null,
  right: null,
};

const PUBLIC_ROUTE = "/bets/broadcast-previews";
const PUBLIC_DIR = path.join(process.cwd(), "public/bets/broadcast-previews");
const REGISTRY_PATH =
  process.env.BETS_BROADCAST_PREVIEW_REGISTRY_PATH ||
  path.join(PUBLIC_DIR, "registry.json");
const MAX_PREVIEW_BYTES = 250 * 1024 * 1024;

export function isBetBroadcastPreviewSlot(value: unknown): value is BetBroadcastPreviewSlot {
  return BET_BROADCAST_PREVIEW_SLOTS.includes(value as BetBroadcastPreviewSlot);
}

function cleanText(value: string | null | undefined, maxLength: number) {
  const cleaned = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function cleanSessionKey(value: string | null | undefined) {
  return String(value ?? "").trim().slice(0, 255);
}

function fileSlug(value: string | null | undefined) {
  const base = String(value ?? "")
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 88);
  return base || "broadcast-loop";
}

function isMp4Upload(input: { originalName?: string | null; mimeType?: string | null }) {
  const name = String(input.originalName ?? "").toLowerCase();
  const mime = String(input.mimeType ?? "").toLowerCase();
  return name.endsWith(".mp4") || mime === "video/mp4" || mime === "application/mp4";
}

export function betBroadcastPreviewKey(sessionKey: string, slot: BetBroadcastPreviewSlot) {
  return `${sessionKey}::${slot}`;
}

function safePreviewFileName(value: string) {
  const fileName = path.basename(value);
  if (fileName !== value || !/^[a-z0-9][a-z0-9._-]*\.mp4$/i.test(fileName)) {
    return null;
  }
  return fileName;
}

export async function readBetBroadcastPreviewFile(fileNameValue: string) {
  const fileName = safePreviewFileName(fileNameValue);
  if (!fileName) {
    return null;
  }

  const filePath = path.join(PUBLIC_DIR, fileName);

  try {
    const fileStats = await stat(filePath);
    if (!fileStats.isFile()) {
      return null;
    }

    return {
      buffer: await readFile(filePath),
      fileName,
      size: fileStats.size,
    };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function readBetBroadcastPreviewRegistry(): Promise<BetBroadcastPreviewEntry[]> {
  try {
    const raw = await readFile(REGISTRY_PATH, "utf8");
    const parsed = JSON.parse(raw) as BetBroadcastPreviewRegistry;
    return Array.isArray(parsed.items)
      ? parsed.items.filter(
          (item) =>
            typeof item?.sessionKey === "string" &&
            isBetBroadcastPreviewSlot(item.slot) &&
            typeof item.url === "string"
        )
      : [];
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function writeBetBroadcastPreviewRegistry(items: BetBroadcastPreviewEntry[]) {
  await mkdir(PUBLIC_DIR, { recursive: true });
  await writeFile(
    REGISTRY_PATH,
    `${JSON.stringify({ items }, null, 2)}\n`,
    "utf8"
  );
}

export async function loadBetBroadcastPreviewMap() {
  const items = await readBetBroadcastPreviewRegistry();
  const byKey = new Map<string, BetBroadcastPreviewEntry>();

  for (const item of items) {
    byKey.set(betBroadcastPreviewKey(item.sessionKey, item.slot), item);
  }

  return byKey;
}

export function buildBetBroadcastPreviewUrls(
  sessionKey: string | null | undefined,
  previewsByKey: Map<string, BetBroadcastPreviewEntry>
): BetBroadcastPreviewUrls {
  const normalizedSessionKey = cleanSessionKey(sessionKey);
  if (!normalizedSessionKey) {
    return { ...EMPTY_BET_BROADCAST_PREVIEW_URLS };
  }

  return {
    left: previewsByKey.get(betBroadcastPreviewKey(normalizedSessionKey, "left"))?.url ?? null,
    god: previewsByKey.get(betBroadcastPreviewKey(normalizedSessionKey, "god"))?.url ?? null,
    right: previewsByKey.get(betBroadcastPreviewKey(normalizedSessionKey, "right"))?.url ?? null,
  };
}

export async function saveBetBroadcastPreviewUpload(input: {
  sessionKey: string;
  slot: BetBroadcastPreviewSlot;
  buffer: Buffer;
  originalName: string | null;
  mimeType: string | null;
  title?: string | null;
  eventLabel?: string | null;
  playedAt?: string | null;
  uploadedByUid?: string | null;
}) {
  const sessionKey = cleanSessionKey(input.sessionKey);
  if (!sessionKey) {
    throw new Error("Broadcast target is missing a session key.");
  }

  if (!isBetBroadcastPreviewSlot(input.slot)) {
    throw new Error("Choose a valid Broadcast slot.");
  }

  if (!input.buffer.length) {
    throw new Error("Choose an MP4 file first.");
  }

  if (input.buffer.length > MAX_PREVIEW_BYTES) {
    throw new Error("Broadcast preview loops must be 250MB or smaller.");
  }

  if (!isMp4Upload({ originalName: input.originalName, mimeType: input.mimeType })) {
    throw new Error("Broadcast preview loops must be MP4 files.");
  }

  const uploadedAt = new Date().toISOString();
  const version = Date.now();
  const fileName = `${version}-${input.slot}-${fileSlug(input.originalName)}.mp4`;
  const url = `${PUBLIC_ROUTE}/${fileName}?v=${version}`;
  const entry: BetBroadcastPreviewEntry = {
    id: randomUUID(),
    sessionKey,
    slot: input.slot,
    title: cleanText(input.title, 140),
    eventLabel: cleanText(input.eventLabel, 140),
    playedAt: cleanText(input.playedAt, 80),
    originalName: cleanText(input.originalName, 180),
    fileName,
    url,
    sizeBytes: input.buffer.length,
    mimeType: cleanText(input.mimeType, 80),
    uploadedAt,
    uploadedByUid: cleanText(input.uploadedByUid, 120),
  };

  await mkdir(PUBLIC_DIR, { recursive: true });
  await writeFile(path.join(PUBLIC_DIR, fileName), input.buffer);

  const current = await readBetBroadcastPreviewRegistry();
  const next = [
    entry,
    ...current.filter(
      (item) => !(item.sessionKey === sessionKey && item.slot === input.slot)
    ),
  ];
  await writeBetBroadcastPreviewRegistry(next);

  return entry;
}
