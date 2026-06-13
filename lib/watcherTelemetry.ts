import crypto from "node:crypto";
import path from "node:path";

import type { NextRequest } from "next/server";

import type { Prisma, PrismaClient } from "@/lib/generated/prisma";
import { readWatcherDownloadIpAddress, readWatcherDownloadUserAgent } from "@/lib/watcherDownloads";

export const WATCHER_CLIENT_EVENT_TYPES = [
  "app_open",
  "watcher_started",
  "watcher_stopped",
  "watcher_version_seen",
  "watcher_update_check_started",
  "watcher_update_available",
  "watcher_update_not_available",
  "watcher_update_downloaded",
  "watcher_update_error",
  "watcher_update_install_requested",
  "watcher_update_install_started",
  "auth_started",
  "auth_success",
  "auth_failed",
  "watch_folder_selected",
  "watching_started",
  "watching_stopped",
  "watcher_ready",
  "watcher_error",
  "monitor_start",
  "monitor_stop",
  "monitor_skip_final",
  "replay_detected",
  "replay_detected_ignored",
  "skip_unknown",
  "skip_upload_in_progress",
  "skip_file_missing",
  "skip_file_too_small",
  "skip_already_finalized",
  "file_size_progress",
  "waiting_for_minimum_size",
  "upload_attempted",
  "upload_retry",
  "upload_succeeded",
  "upload_failed",
  "parse_succeeded",
  "parse_pending",
  "parse_failed",
  "parse_result_unknown_fields",
  "final_candidate_ready",
  "final_candidate_accepted",
  "final_candidate_deferred",
  "final_candidate_reopened",
  "batch_upload_started",
  "batch_upload_scanned",
  "batch_upload_file_started",
  "batch_upload_file_stable",
  "batch_upload_file_skipped",
  "batch_upload_file_succeeded",
  "batch_upload_file_failed",
  "batch_upload_finished",
  "batch_upload_failed",
  "stream_handoff_opened",
  "stream_sources_listed",
  "stream_capture_requested",
  "stream_preview_started",
  "stream_source_ready",
  "stream_started",
  "stream_chunk_uploaded",
  "stream_chunk_dropped",
  "stream_heartbeat",
  "stream_stopped",
  "stream_track_ended",
  "stream_recorder_error",
  "stream_chunk_failed",
  "stream_heartbeat_failed",
  "stream_error",
  "heartbeat",
] as const;

export type WatcherClientEventType = (typeof WATCHER_CLIENT_EVENT_TYPES)[number];

export type WatcherClientEventInput = {
  eventType: WatcherClientEventType;
  appVersion?: string | null;
  platform?: string | null;
  artifact?: string | null;
  watcherId?: string | null;
  sessionId?: string | null;
  replayHash?: string | null;
  replayFile?: string | null;
  parseSource?: string | null;
  parseReason?: string | null;
  metadata?: Prisma.InputJsonValue | null;
};

type WatcherIdentity = {
  userId: number | null;
  userUid: string | null;
  resolved: boolean;
};

type WatcherIdentityOptions = {
  touchLastUsedAt?: boolean;
};

const WATCHER_KEY_RE = /^wolo_([a-f0-9]{12})_(.+)$/i;
const SECRET_METADATA_KEY_RE = /(token|secret|password|api[-_]?key|auth|authorization|header|cookie|mnemonic|private[-_]?key)/i;
const MAX_STRING_LENGTH = 500;
const MAX_METADATA_DEPTH = 3;
const MAX_METADATA_ARRAY_LENGTH = 20;
const MAX_METADATA_KEYS = 40;

export function isWatcherClientEventType(value: unknown): value is WatcherClientEventType {
  return (
    typeof value === "string" &&
    WATCHER_CLIENT_EVENT_TYPES.includes(value as WatcherClientEventType)
  );
}

export function normalizeWatcherString(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

export function normalizeReplayFileName(value: unknown) {
  const normalized = normalizeWatcherString(value, 500);
  if (!normalized) return null;
  return path.basename(normalized).slice(0, 255);
}

function sha256Hex(input: string) {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

function base64UrlDecode(input: string) {
  const padded = input + "=".repeat((4 - (input.length % 4)) % 4);
  return Buffer.from(padded, "base64url");
}

function verifyPbkdf2(secret: string, stored: string) {
  try {
    const [algo, iterationsRaw, saltRaw, expectedRaw] = stored.split("$", 4);
    if (algo !== "pbkdf2_sha256") return false;
    const iterations = Number.parseInt(iterationsRaw || "", 10);
    if (!Number.isFinite(iterations) || iterations <= 0) return false;
    const expected = base64UrlDecode(expectedRaw || "");
    const derived = crypto.pbkdf2Sync(
      secret,
      base64UrlDecode(saltRaw || ""),
      iterations,
      expected.length,
      "sha256"
    );
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

function verifyWatcherKeyHash(apiKey: string, storedHash: string) {
  if (!storedHash) return false;

  if (storedHash.startsWith("pbkdf2_sha256$")) {
    const match = apiKey.match(WATCHER_KEY_RE);
    return Boolean(
      (match?.[2] && verifyPbkdf2(match[2], storedHash)) ||
        verifyPbkdf2(apiKey, storedHash)
    );
  }

  if (/^[a-f0-9]{64}$/i.test(storedHash)) {
    return crypto.timingSafeEqual(
      Buffer.from(sha256Hex(apiKey), "hex"),
      Buffer.from(storedHash.toLowerCase(), "hex")
    );
  }

  return false;
}

export async function resolveWatcherTelemetryIdentity(
  prisma: PrismaClient,
  apiKey: string | null | undefined,
  options: WatcherIdentityOptions = {}
): Promise<WatcherIdentity> {
  const normalized = apiKey?.trim() || "";
  const match = normalized.match(WATCHER_KEY_RE);
  if (!match) {
    return { userId: null, userUid: null, resolved: false };
  }

  const apiKeyRow = await prisma.apiKey.findFirst({
    where: {
      keyPrefix: match[1].toLowerCase(),
      revokedAt: null,
      kind: "watcher",
    },
    select: {
      id: true,
      keyHash: true,
      user: {
        select: {
          id: true,
          uid: true,
        },
      },
    },
  });

  if (!apiKeyRow || !verifyWatcherKeyHash(normalized, apiKeyRow.keyHash)) {
    return { userId: null, userUid: null, resolved: false };
  }

  if (options.touchLastUsedAt !== false) {
    await prisma.apiKey.update({
      where: { id: apiKeyRow.id },
      data: { lastUsedAt: new Date() },
    });
  }

  return {
    userId: apiKeyRow.user.id,
    userUid: apiKeyRow.user.uid,
    resolved: true,
  };
}

function sanitizeMetadataValue(value: unknown, depth: number): Prisma.InputJsonValue | undefined {
  if (value == null) return undefined;
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === "string") {
    return value.slice(0, MAX_STRING_LENGTH);
  }
  if (depth >= MAX_METADATA_DEPTH) {
    return "[truncated]";
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_METADATA_ARRAY_LENGTH)
      .map((entry) => sanitizeMetadataValue(entry, depth + 1))
      .filter((entry): entry is Prisma.InputJsonValue => entry !== undefined);
  }
  if (typeof value === "object") {
    const output: Record<string, Prisma.InputJsonValue> = {};
    for (const [key, entry] of Object.entries(value).slice(0, MAX_METADATA_KEYS)) {
      if (SECRET_METADATA_KEY_RE.test(key)) continue;
      const sanitized = sanitizeMetadataValue(entry, depth + 1);
      if (sanitized !== undefined) {
        output[key.slice(0, 80)] = sanitized;
      }
    }
    return output;
  }
  return undefined;
}

export function sanitizeWatcherMetadata(value: unknown) {
  const sanitized = sanitizeMetadataValue(value, 0);
  return sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)
    ? sanitized
    : {};
}

export function readWatcherTelemetryApiKey(request: NextRequest) {
  return request.headers.get("x-api-key")?.trim() || null;
}

export async function recordWatcherClientEvent(
  prisma: PrismaClient,
  request: NextRequest,
  input: WatcherClientEventInput,
  identity: WatcherIdentity
) {
  const metadata = sanitizeWatcherMetadata(input.metadata);

  return prisma.watcherClientEvent.create({
    data: {
      userId: identity.userId,
      userUid: identity.userUid || normalizeWatcherString((metadata as Record<string, unknown>).userUid, 100),
      eventType: input.eventType,
      appVersion: normalizeWatcherString(input.appVersion, 32),
      platform: normalizeWatcherString(input.platform, 24),
      artifact: normalizeWatcherString(input.artifact, 40),
      watcherId: normalizeWatcherString(input.watcherId, 80),
      sessionId: normalizeWatcherString(input.sessionId, 80),
      replayHash: normalizeWatcherString(input.replayHash, 64),
      replayFile: normalizeReplayFileName(input.replayFile),
      parseSource: normalizeWatcherString(input.parseSource, 40),
      parseReason: normalizeWatcherString(input.parseReason, 80),
      ipAddress: readWatcherDownloadIpAddress(request),
      userAgent: readWatcherDownloadUserAgent(request),
      metadata: {
        ...metadata,
        authResolved: identity.resolved,
      },
    },
  });
}
