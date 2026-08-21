import { LIVING_KINGDOM_MAX_BODY_BYTES } from "./protocol.ts";

type Bucket = {
  tokens: number;
  updatedAtMs: number;
  touchedAtMs: number;
};

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterMs: number };

export class LivingKingdomRateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly options: {
    ratePerSecond: number;
    burst: number;
    maxKeys: number;
    idleTtlMs: number;
  };

  constructor(options: {
    ratePerSecond: number;
    burst: number;
    maxKeys: number;
    idleTtlMs: number;
  }) {
    this.options = options;
  }

  consume(rawKey: string, nowMs = Date.now()): RateLimitResult {
    this.prune(nowMs);
    const key = rawKey.slice(0, 220);
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

    const elapsedSeconds = Math.max(0, nowMs - bucket.updatedAtMs) / 1_000;
    bucket.tokens = Math.min(
      this.options.burst,
      bucket.tokens + elapsedSeconds * this.options.ratePerSecond,
    );
    bucket.updatedAtMs = nowMs;
    bucket.touchedAtMs = nowMs;

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return { allowed: true };
    }

    return {
      allowed: false,
      retryAfterMs: Math.max(
        1,
        Math.ceil(((1 - bucket.tokens) / this.options.ratePerSecond) * 1_000),
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
      if (nowMs - bucket.touchedAtMs > this.options.idleTtlMs) this.buckets.delete(key);
    }
  }

  private evictOldest() {
    let oldestKey: string | null = null;
    let oldestAt = Number.POSITIVE_INFINITY;
    for (const [key, bucket] of this.buckets) {
      if (bucket.touchedAtMs < oldestAt) {
        oldestKey = key;
        oldestAt = bucket.touchedAtMs;
      }
    }
    if (oldestKey) this.buckets.delete(oldestKey);
  }
}

export class LivingKingdomActiveStreamRegistry {
  private readonly ipCounts = new Map<string, number>();
  private readonly uidCounts = new Map<string, number>();
  private readonly limits: { perIp: number; perUid: number; maxKeys: number };

  constructor(limits = { perIp: 20, perUid: 4, maxKeys: 2_000 }) {
    this.limits = limits;
  }

  acquire(input: { ip: string; uid?: string | null }):
    | { allowed: true; release: () => void }
    | { allowed: false; reason: "ip" | "uid" | "capacity" } {
    const ip = input.ip.slice(0, 64);
    const uid = input.uid?.slice(0, 100) || null;
    if ((this.ipCounts.get(ip) ?? 0) >= this.limits.perIp) {
      return { allowed: false, reason: "ip" };
    }
    if (uid && (this.uidCounts.get(uid) ?? 0) >= this.limits.perUid) {
      return { allowed: false, reason: "uid" };
    }
    const keyCount = this.ipCounts.size + this.uidCounts.size;
    const newKeyCount = (this.ipCounts.has(ip) ? 0 : 1) + (uid && !this.uidCounts.has(uid) ? 1 : 0);
    if (keyCount + newKeyCount > this.limits.maxKeys) {
      return { allowed: false, reason: "capacity" };
    }

    this.ipCounts.set(ip, (this.ipCounts.get(ip) ?? 0) + 1);
    if (uid) this.uidCounts.set(uid, (this.uidCounts.get(uid) ?? 0) + 1);
    let active = true;
    return {
      allowed: true,
      release: () => {
        if (!active) return;
        active = false;
        this.decrement(this.ipCounts, ip);
        if (uid) this.decrement(this.uidCounts, uid);
      },
    };
  }

  activeStreams() {
    let total = 0;
    for (const count of this.ipCounts.values()) total += count;
    return total;
  }

  resetForTests() {
    this.ipCounts.clear();
    this.uidCounts.clear();
  }

  private decrement(counts: Map<string, number>, key: string) {
    const next = (counts.get(key) ?? 1) - 1;
    if (next <= 0) counts.delete(key);
    else counts.set(key, next);
  }
}

type GlobalWithLivingKingdomLimits = typeof globalThis & {
  __livingKingdomActorRateLimiter?: LivingKingdomRateLimiter;
  __livingKingdomIpRateLimiter?: LivingKingdomRateLimiter;
  __livingKingdomPreferenceUidRateLimiter?: LivingKingdomRateLimiter;
  __livingKingdomPreferenceIpRateLimiter?: LivingKingdomRateLimiter;
  __livingKingdomStreamRegistry?: LivingKingdomActiveStreamRegistry;
};

const rateLimitGlobal = globalThis as GlobalWithLivingKingdomLimits;

export const livingKingdomActorRateLimiter =
  rateLimitGlobal.__livingKingdomActorRateLimiter ??
  new LivingKingdomRateLimiter({
    ratePerSecond: 2,
    burst: 4,
    maxKeys: 2_000,
    idleTtlMs: 90_000,
  });

export const livingKingdomIpRateLimiter =
  rateLimitGlobal.__livingKingdomIpRateLimiter ??
  new LivingKingdomRateLimiter({
    ratePerSecond: 20,
    burst: 40,
    maxKeys: 2_000,
    idleTtlMs: 90_000,
  });

rateLimitGlobal.__livingKingdomActorRateLimiter = livingKingdomActorRateLimiter;
rateLimitGlobal.__livingKingdomIpRateLimiter = livingKingdomIpRateLimiter;

export const livingKingdomPreferenceUidRateLimiter =
  rateLimitGlobal.__livingKingdomPreferenceUidRateLimiter ??
  new LivingKingdomRateLimiter({
    ratePerSecond: 0.1,
    burst: 3,
    maxKeys: 2_000,
    idleTtlMs: 10 * 60_000,
  });

export const livingKingdomPreferenceIpRateLimiter =
  rateLimitGlobal.__livingKingdomPreferenceIpRateLimiter ??
  new LivingKingdomRateLimiter({
    ratePerSecond: 0.1,
    burst: 3,
    maxKeys: 2_000,
    idleTtlMs: 10 * 60_000,
  });

rateLimitGlobal.__livingKingdomPreferenceUidRateLimiter =
  livingKingdomPreferenceUidRateLimiter;
rateLimitGlobal.__livingKingdomPreferenceIpRateLimiter =
  livingKingdomPreferenceIpRateLimiter;

export const livingKingdomStreamRegistry =
  rateLimitGlobal.__livingKingdomStreamRegistry ??
  new LivingKingdomActiveStreamRegistry({
    perIp: (() => {
      const raw = process.env.LIVING_KINGDOM_MAX_SUBSCRIBERS_PER_IP;
      if (!raw || !/^\d+$/.test(raw.trim())) return 20;
      return Math.max(1, Math.min(250, Number(raw)));
    })(),
    perUid: 4,
    maxKeys: 2_000,
  });
rateLimitGlobal.__livingKingdomStreamRegistry = livingKingdomStreamRegistry;

export function livingKingdomClientAddress(request: Request) {
  // Production Nginx overwrites X-Real-IP with the connecting address. Prefer
  // that trusted hop over the left edge of X-Forwarded-For, which a client can
  // pre-seed. Without X-Real-IP, use the nearest (right-most) forwarded hop.
  const realIp = request.headers.get("x-real-ip")?.trim();
  const forwarded = request.headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .pop();
  return (realIp || forwarded || "unknown").slice(0, 64);
}

export function isLivingKingdomSameOrigin(request: Request) {
  const rawOrigin = request.headers.get("origin");
  if (!rawOrigin) return false;

  try {
    const origin = new URL(rawOrigin);
    if (origin.protocol !== "http:" && origin.protocol !== "https:") return false;

    // Nginx overwrites Host with $host. X-Forwarded-Host is not part of this
    // trust boundary and can otherwise be client-authored.
    const host = request.headers.get("host")?.trim();
    if (!host) return false;

    const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",", 1)[0]?.trim();
    const requestProtocol = new URL(request.url).protocol.replace(":", "");
    const protocol = forwardedProto || requestProtocol;
    if (protocol !== "http" && protocol !== "https") return false;

    return origin.origin === `${protocol}://${host}`;
  } catch {
    return false;
  }
}

export type BoundedJsonResult =
  | { ok: true; value: unknown }
  | { ok: false; status: 400 | 413; error: string };

export async function readLivingKingdomJsonBody(
  request: Request,
  maxBytes = LIVING_KINGDOM_MAX_BODY_BYTES,
): Promise<BoundedJsonResult> {
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
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, status: 400, error: "Body must be valid JSON" };
  }
}
