import {
  USER_ONLINE_HEARTBEAT_BURST,
  USER_ONLINE_HEARTBEAT_RATE_PER_SECOND,
  USER_ONLINE_LAST_SEEN_WRITE_INTERVAL_MS,
  USER_ONLINE_MAX_REQUEST_BYTES,
} from "@/lib/userOnlinePresenceConfig";

const USER_ONLINE_GUARD_MAX_KEYS = 2_000;
const USER_ONLINE_GUARD_IDLE_TTL_MS = 5 * 60_000;
const USER_ONLINE_GUARD_KEY_MAX_LENGTH = 100;
const TOKEN_EPSILON = 1e-9;

type TokenBucket = {
  tokens: number;
  updatedAtMs: number;
  touchedAtMs: number;
};

export type UserOnlineRateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterMs: number };

type HeartbeatLimiterOptions = {
  ratePerSecond: number;
  burst: number;
  maxKeys: number;
  idleTtlMs: number;
};

export class UserOnlineHeartbeatLimiter {
  private readonly buckets = new Map<string, TokenBucket>();
  private readonly options: HeartbeatLimiterOptions;

  constructor(
    options: HeartbeatLimiterOptions = {
      ratePerSecond: USER_ONLINE_HEARTBEAT_RATE_PER_SECOND,
      burst: USER_ONLINE_HEARTBEAT_BURST,
      maxKeys: USER_ONLINE_GUARD_MAX_KEYS,
      idleTtlMs: USER_ONLINE_GUARD_IDLE_TTL_MS,
    },
  ) {
    this.options = options;
  }

  consume(rawKey: string, nowMs = Date.now()): UserOnlineRateLimitResult {
    this.prune(nowMs);
    const key = rawKey.trim().slice(0, USER_ONLINE_GUARD_KEY_MAX_LENGTH);
    if (!key) return { allowed: false, retryAfterMs: 1_000 };

    let bucket = this.buckets.get(key);
    if (!bucket) {
      if (this.buckets.size >= this.options.maxKeys) this.evictOldest();
      bucket = {
        tokens: this.options.burst,
        updatedAtMs: nowMs,
        touchedAtMs: nowMs,
      };
      this.buckets.set(key, bucket);
    }

    const effectiveNowMs = Math.max(nowMs, bucket.updatedAtMs);
    const elapsedSeconds = (effectiveNowMs - bucket.updatedAtMs) / 1_000;
    bucket.tokens = Math.min(
      this.options.burst,
      bucket.tokens + elapsedSeconds * this.options.ratePerSecond,
    );
    bucket.updatedAtMs = effectiveNowMs;
    bucket.touchedAtMs = Math.max(bucket.touchedAtMs, effectiveNowMs);

    if (bucket.tokens >= 1 - TOKEN_EPSILON) {
      bucket.tokens = Math.max(0, bucket.tokens - 1);
      return { allowed: true };
    }

    return {
      allowed: false,
      retryAfterMs: Math.max(
        1,
        Math.ceil(
          ((1 - bucket.tokens) / this.options.ratePerSecond) * 1_000 -
            TOKEN_EPSILON,
        ),
      ),
    };
  }

  size() {
    return this.buckets.size;
  }

  reset() {
    this.buckets.clear();
  }

  private prune(nowMs: number) {
    for (const [key, bucket] of this.buckets) {
      if (nowMs - bucket.touchedAtMs > this.options.idleTtlMs) {
        this.buckets.delete(key);
      }
    }
  }

  private evictOldest() {
    let oldestKey: string | null = null;
    let oldestAt = Number.POSITIVE_INFINITY;

    for (const [key, bucket] of this.buckets) {
      if (
        bucket.touchedAtMs < oldestAt ||
        (bucket.touchedAtMs === oldestAt && (oldestKey === null || key < oldestKey))
      ) {
        oldestKey = key;
        oldestAt = bucket.touchedAtMs;
      }
    }

    if (oldestKey !== null) this.buckets.delete(oldestKey);
  }
}

type LastSeenWriteEntry = {
  lastPersistedAtMs: number;
  touchedAtMs: number;
  inFlight: Promise<number> | null;
};

export type UserOnlineLastSeenResult = {
  persisted: boolean;
  /** Null means this secondary write was recently covered or capacity-coalesced. */
  count: number | null;
};

type LastSeenPersisterOptions = {
  intervalMs: number;
  maxKeys: number;
  idleTtlMs: number;
};

export class UserOnlineLastSeenPersister {
  private readonly entries = new Map<string, LastSeenWriteEntry>();
  private readonly options: LastSeenPersisterOptions;

  constructor(
    options: LastSeenPersisterOptions = {
      intervalMs: USER_ONLINE_LAST_SEEN_WRITE_INTERVAL_MS,
      maxKeys: USER_ONLINE_GUARD_MAX_KEYS,
      idleTtlMs: USER_ONLINE_GUARD_IDLE_TTL_MS,
    },
  ) {
    this.options = options;
  }

  async persist(
    rawKey: string,
    nowMs: number,
    write: () => Promise<number>,
  ): Promise<UserOnlineLastSeenResult> {
    this.prune(nowMs);
    const key = rawKey.trim().slice(0, USER_ONLINE_GUARD_KEY_MAX_LENGTH);
    if (!key) return { persisted: false, count: 0 };

    let entry = this.entries.get(key);
    if (entry?.inFlight) {
      entry.touchedAtMs = nowMs;
      return { persisted: false, count: await entry.inFlight };
    }
    if (entry && nowMs - entry.lastPersistedAtMs < this.options.intervalMs) {
      entry.touchedAtMs = nowMs;
      return { persisted: false, count: null };
    }

    if (!entry) {
      if (this.entries.size >= this.options.maxKeys && !this.evictOldest()) {
        // Live process-local leases remain authoritative during capacity
        // pressure; omit this secondary durable sample instead of growing an
        // unbounded map or duplicating an in-flight write.
        return { persisted: false, count: null };
      }
      entry = {
        lastPersistedAtMs: Number.NEGATIVE_INFINITY,
        touchedAtMs: nowMs,
        inFlight: null,
      };
      this.entries.set(key, entry);
    }

    entry.touchedAtMs = nowMs;
    const operation = Promise.resolve().then(write);
    entry.inFlight = operation;

    try {
      const count = await operation;
      if (this.entries.get(key) === entry) {
        entry.inFlight = null;
        if (count > 0) {
          entry.lastPersistedAtMs = nowMs;
        } else {
          this.entries.delete(key);
        }
      }
      return { persisted: true, count };
    } catch (error) {
      if (this.entries.get(key) === entry) {
        entry.inFlight = null;
        // Coalesce failed attempts too. During a database outage, heartbeat
        // traffic must not turn into one failing write per request.
        entry.lastPersistedAtMs = nowMs;
      }
      throw error;
    }
  }

  size() {
    return this.entries.size;
  }

  reset() {
    this.entries.clear();
  }

  private prune(nowMs: number) {
    for (const [key, entry] of this.entries) {
      if (!entry.inFlight && nowMs - entry.touchedAtMs > this.options.idleTtlMs) {
        this.entries.delete(key);
      }
    }
  }

  private evictOldest() {
    let oldestKey: string | null = null;
    let oldestAt = Number.POSITIVE_INFINITY;

    for (const [key, entry] of this.entries) {
      if (entry.inFlight) continue;
      if (
        entry.touchedAtMs < oldestAt ||
        (entry.touchedAtMs === oldestAt && (oldestKey === null || key < oldestKey))
      ) {
        oldestKey = key;
        oldestAt = entry.touchedAtMs;
      }
    }

    if (oldestKey === null) return false;
    this.entries.delete(oldestKey);
    return true;
  }
}

export type UserOnlineJsonResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; status: 400 | 413; error: string };

export function isUserOnlineSameOrigin(request: Request) {
  const rawOrigin = request.headers.get("origin");
  if (!rawOrigin) return false;

  try {
    const origin = new URL(rawOrigin);
    if (origin.protocol !== "http:" && origin.protocol !== "https:") return false;

    // Production Nginx owns Host and the nearest forwarded protocol. Never
    // authorize from client-authored UID or forwarded-host headers.
    const host = request.headers.get("host")?.trim();
    if (!host) return false;
    const forwardedProto = request.headers
      .get("x-forwarded-proto")
      ?.split(",", 1)[0]
      ?.trim();
    const requestProtocol = new URL(request.url).protocol.replace(":", "");
    const protocol = forwardedProto || requestProtocol;
    if (protocol !== "http" && protocol !== "https") return false;

    return origin.origin === `${protocol}://${host}`;
  } catch {
    return false;
  }
}

export async function readUserOnlineJsonBody(
  request: Request,
  maxBytes = USER_ONLINE_MAX_REQUEST_BYTES,
): Promise<UserOnlineJsonResult> {
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const parsedLength = Number(contentLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0) {
      return { ok: false, status: 400, error: "Invalid content length" };
    }
    if (parsedLength > maxBytes) {
      return { ok: false, status: 413, error: "Body too large" };
    }
  }

  if (!request.body) return { ok: false, status: 400, error: "Body is required" };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        await reader.cancel("Body too large").catch(() => undefined);
        return { ok: false, status: 413, error: "Body too large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, status: 400, error: "Unable to read body" };
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const value = JSON.parse(text) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { ok: false, status: 400, error: "Body must be a JSON object" };
    }
    return { ok: true, value: value as Record<string, unknown> };
  } catch {
    return { ok: false, status: 400, error: "Body must be valid JSON" };
  }
}

type GlobalWithUserOnlineGuards = typeof globalThis & {
  __aoe2UserOnlineHeartbeatLimiter?: UserOnlineHeartbeatLimiter;
  __aoe2UserOnlineLastSeenPersister?: UserOnlineLastSeenPersister;
};

const guardGlobal = globalThis as GlobalWithUserOnlineGuards;

export const userOnlineHeartbeatLimiter =
  guardGlobal.__aoe2UserOnlineHeartbeatLimiter ??
  new UserOnlineHeartbeatLimiter();
export const userOnlineLastSeenPersister =
  guardGlobal.__aoe2UserOnlineLastSeenPersister ??
  new UserOnlineLastSeenPersister();

guardGlobal.__aoe2UserOnlineHeartbeatLimiter = userOnlineHeartbeatLimiter;
guardGlobal.__aoe2UserOnlineLastSeenPersister = userOnlineLastSeenPersister;
