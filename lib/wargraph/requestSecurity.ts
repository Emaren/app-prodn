import { isIP } from "node:net";

export const WARGRAPH_MAX_JSON_BODY_BYTES = 4 * 1_024;
export const WARGRAPH_IDEMPOTENCY_KEY_MIN_LENGTH = 8;
export const WARGRAPH_IDEMPOTENCY_KEY_MAX_LENGTH = 128;

const WARGRAPH_RATE_LIMIT_KEY_MAX_LENGTH = 160;
const WARGRAPH_RATE_LIMITER_HARD_MAX_KEYS = 10_000;
const WARGRAPH_FORWARDED_FOR_MAX_LENGTH = 1_024;
const TOKEN_EPSILON = 1e-9;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const RATE_LIMIT_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,159}$/;

type TokenBucket = {
  tokens: number;
  updatedAtMs: number;
  touchedAtMs: number;
};

export type WarGraphRateLimiterOptions = {
  ratePerSecond: number;
  burst: number;
  maxKeys: number;
  idleTtlMs: number;
};

export type WarGraphRateLimitResult =
  | { allowed: true; remaining: number }
  | {
      allowed: false;
      reason: "INVALID_KEY" | "INVALID_TIME" | "RATE_LIMITED";
      retryAfterMs: number;
    };

export class WarGraphTokenBucketRateLimiter {
  private readonly buckets = new Map<string, TokenBucket>();
  private readonly options: WarGraphRateLimiterOptions;

  constructor(options: WarGraphRateLimiterOptions) {
    assertRateLimiterOptions(options);
    this.options = { ...options };
  }

  consume(rawKey: unknown, nowMs = Date.now()): WarGraphRateLimitResult {
    const key = validRateLimitKey(rawKey);
    if (key === null) {
      return { allowed: false, reason: "INVALID_KEY", retryAfterMs: 1_000 };
    }
    if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
      return { allowed: false, reason: "INVALID_TIME", retryAfterMs: 1_000 };
    }

    this.prune(nowMs);
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

    // A wall-clock correction must never mint tokens or move the bucket's
    // monotonic accounting time backwards.
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
      return {
        allowed: true,
        remaining: Math.max(0, Math.floor(bucket.tokens + TOKEN_EPSILON)),
      };
    }

    return {
      allowed: false,
      reason: "RATE_LIMITED",
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
        (bucket.touchedAtMs === oldestAt &&
          (oldestKey === null || key < oldestKey))
      ) {
        oldestKey = key;
        oldestAt = bucket.touchedAtMs;
      }
    }

    if (oldestKey !== null) this.buckets.delete(oldestKey);
  }
}

function assertRateLimiterOptions(options: WarGraphRateLimiterOptions) {
  if (
    !Number.isFinite(options.ratePerSecond) ||
    options.ratePerSecond <= 0 ||
    options.ratePerSecond > 10_000
  ) {
    throw new RangeError("ratePerSecond must be greater than 0 and at most 10000");
  }
  if (
    !Number.isSafeInteger(options.burst) ||
    options.burst < 1 ||
    options.burst > 10_000
  ) {
    throw new RangeError("burst must be an integer between 1 and 10000");
  }
  if (
    !Number.isSafeInteger(options.maxKeys) ||
    options.maxKeys < 1 ||
    options.maxKeys > WARGRAPH_RATE_LIMITER_HARD_MAX_KEYS
  ) {
    throw new RangeError(
      `maxKeys must be an integer between 1 and ${WARGRAPH_RATE_LIMITER_HARD_MAX_KEYS}`,
    );
  }
  if (
    !Number.isSafeInteger(options.idleTtlMs) ||
    options.idleTtlMs < 1 ||
    options.idleTtlMs > 24 * 60 * 60_000
  ) {
    throw new RangeError("idleTtlMs must be an integer between 1 and 86400000");
  }
}

function validRateLimitKey(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > WARGRAPH_RATE_LIMIT_KEY_MAX_LENGTH ||
    !RATE_LIMIT_KEY_PATTERN.test(value)
  ) {
    return null;
  }
  return value;
}

/**
 * Resolve the client address from headers written by the trusted production
 * reverse proxy. The nearest (right-most) forwarded hop is the only fallback;
 * client-preseeded values on the left are intentionally ignored.
 */
export function warGraphClientAddress(request: Request): string {
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp && isIP(realIp) !== 0) return realIp;

  const forwardedFor = request.headers.get("x-forwarded-for");
  if (!forwardedFor || forwardedFor.length > WARGRAPH_FORWARDED_FOR_MAX_LENGTH) {
    return "unknown";
  }

  const rightMostHop = forwardedFor.split(",").at(-1)?.trim();
  return rightMostHop && isIP(rightMostHop) !== 0 ? rightMostHop : "unknown";
}

/**
 * Same-origin guard for cookie-authenticated mutations. Host and
 * X-Forwarded-Proto are trusted only because production Nginx overwrites them;
 * X-Forwarded-Host is never consulted.
 */
export function isWarGraphSameOrigin(request: Request): boolean {
  const rawOrigin = request.headers.get("origin");
  const rawHost = request.headers.get("host");
  if (!rawOrigin || !rawHost) return false;

  try {
    const origin = new URL(rawOrigin);
    if (
      (origin.protocol !== "http:" && origin.protocol !== "https:") ||
      origin.username ||
      origin.password ||
      origin.pathname !== "/" ||
      origin.search ||
      origin.hash
    ) {
      return false;
    }

    const host = rawHost.trim();
    if (
      !host ||
      host !== rawHost ||
      /[\s\u0000-\u001f\u007f,@/\\?#]/u.test(host)
    ) {
      return false;
    }

    const forwardedProto = request.headers.get("x-forwarded-proto");
    let protocol: "http" | "https";
    if (forwardedProto !== null) {
      const candidate = forwardedProto.trim().toLowerCase();
      if (candidate !== "http" && candidate !== "https") return false;
      protocol = candidate;
    } else {
      const candidate = new URL(request.url).protocol;
      if (candidate !== "http:" && candidate !== "https:") return false;
      protocol = candidate.slice(0, -1) as "http" | "https";
    }

    const expected = new URL(`${protocol}://${host}`);
    return origin.origin === expected.origin;
  } catch {
    return false;
  }
}

export type WarGraphJsonBodyResult =
  | { ok: true; value: unknown; bytes: number }
  | { ok: false; status: 400 | 413 | 415; error: string };

/**
 * Read an identity-encoded JSON request through a hard byte ceiling. maxBytes
 * may tighten the 4 KiB limit for a route but can never loosen it.
 */
export async function readWarGraphJsonBody(
  request: Request,
  maxBytes = WARGRAPH_MAX_JSON_BODY_BYTES,
): Promise<WarGraphJsonBodyResult> {
  if (
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 1 ||
    maxBytes > WARGRAPH_MAX_JSON_BODY_BYTES
  ) {
    throw new RangeError(
      `maxBytes must be an integer between 1 and ${WARGRAPH_MAX_JSON_BODY_BYTES}`,
    );
  }

  if (!isStrictUtf8JsonContentType(request.headers.get("content-type"))) {
    return { ok: false, status: 415, error: "Content-Type must be application/json" };
  }

  const contentEncoding = request.headers.get("content-encoding");
  if (contentEncoding && contentEncoding.trim().toLowerCase() !== "identity") {
    return { ok: false, status: 415, error: "Encoded request bodies are not supported" };
  }

  const rawContentLength = request.headers.get("content-length");
  let declaredLength: number | null = null;
  if (rawContentLength !== null) {
    if (!/^(0|[1-9]\d*)$/u.test(rawContentLength)) {
      return { ok: false, status: 400, error: "Invalid content length" };
    }
    declaredLength = Number(rawContentLength);
    if (!Number.isSafeInteger(declaredLength)) {
      return { ok: false, status: 400, error: "Invalid content length" };
    }
    if (declaredLength > maxBytes) {
      return { ok: false, status: 413, error: "Body too large" };
    }
  }

  if (!request.body) {
    return { ok: false, status: 400, error: "Body is required" };
  }

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

  if (declaredLength !== null && declaredLength !== length) {
    return { ok: false, status: 400, error: "Content length does not match body" };
  }

  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { ok: true, value: JSON.parse(text) as unknown, bytes: length };
  } catch {
    return { ok: false, status: 400, error: "Body must be valid UTF-8 JSON" };
  }
}

function isStrictUtf8JsonContentType(rawContentType: string | null): boolean {
  if (!rawContentType) return false;
  const parts = rawContentType.split(";").map((part) => part.trim());
  if (parts.shift()?.toLowerCase() !== "application/json") return false;
  if (parts.length === 0) return true;
  if (parts.length !== 1) return false;
  return /^charset\s*=\s*(?:utf-8|"utf-8")$/iu.test(parts[0]);
}

export type WarGraphIdempotencyKeyResult =
  | { ok: true; key: string }
  | {
      ok: false;
      status: 400;
      code:
        | "IDEMPOTENCY_KEY_REQUIRED"
        | "INVALID_IDEMPOTENCY_KEY"
        | "IDEMPOTENCY_KEY_MISMATCH";
      error: string;
    };

export function validateWarGraphIdempotencyKey(
  value: unknown,
): WarGraphIdempotencyKeyResult {
  if (value === null || value === undefined || value === "") {
    return {
      ok: false,
      status: 400,
      code: "IDEMPOTENCY_KEY_REQUIRED",
      error: "Idempotency-Key is required",
    };
  }
  if (typeof value !== "string" || !IDEMPOTENCY_KEY_PATTERN.test(value)) {
    return {
      ok: false,
      status: 400,
      code: "INVALID_IDEMPOTENCY_KEY",
      error: `Idempotency-Key must be ${WARGRAPH_IDEMPOTENCY_KEY_MIN_LENGTH}-${WARGRAPH_IDEMPOTENCY_KEY_MAX_LENGTH} URL-safe characters`,
    };
  }
  return { ok: true, key: value };
}

export function matchWarGraphIdempotencyKey(
  headerValue: unknown,
  bodyValue: unknown,
): WarGraphIdempotencyKeyResult {
  const header = validateWarGraphIdempotencyKey(headerValue);
  if (!header.ok) return header;

  const body = validateWarGraphIdempotencyKey(bodyValue);
  if (!body.ok) return body;
  if (header.key !== body.key) {
    return {
      ok: false,
      status: 400,
      code: "IDEMPOTENCY_KEY_MISMATCH",
      error: "Header and body idempotency keys must match exactly",
    };
  }
  return header;
}

export function requireMatchingWarGraphIdempotencyKey(
  request: Request,
  bodyValue?: unknown,
): WarGraphIdempotencyKeyResult {
  const headerValue = request.headers.get("idempotency-key");
  return arguments.length >= 2
    ? matchWarGraphIdempotencyKey(headerValue, bodyValue)
    : validateWarGraphIdempotencyKey(headerValue);
}

type GlobalWithWarGraphRateLimiters = typeof globalThis & {
  __warGraphMutationUidRateLimiter?: WarGraphTokenBucketRateLimiter;
  __warGraphMutationIpRateLimiter?: WarGraphTokenBucketRateLimiter;
  __warGraphPresenceUidRateLimiter?: WarGraphTokenBucketRateLimiter;
  __warGraphPresenceIpRateLimiter?: WarGraphTokenBucketRateLimiter;
};

const rateLimitGlobal = globalThis as GlobalWithWarGraphRateLimiters;

export const warGraphMutationUidRateLimiter =
  rateLimitGlobal.__warGraphMutationUidRateLimiter ??
  new WarGraphTokenBucketRateLimiter({
    ratePerSecond: 0.25,
    burst: 5,
    maxKeys: 4_000,
    idleTtlMs: 10 * 60_000,
  });

export const warGraphMutationIpRateLimiter =
  rateLimitGlobal.__warGraphMutationIpRateLimiter ??
  new WarGraphTokenBucketRateLimiter({
    ratePerSecond: 2,
    burst: 30,
    maxKeys: 4_000,
    idleTtlMs: 10 * 60_000,
  });

export const warGraphPresenceUidRateLimiter =
  rateLimitGlobal.__warGraphPresenceUidRateLimiter ??
  new WarGraphTokenBucketRateLimiter({
    ratePerSecond: 1,
    burst: 10,
    maxKeys: 4_000,
    idleTtlMs: 2 * 60_000,
  });

export const warGraphPresenceIpRateLimiter =
  rateLimitGlobal.__warGraphPresenceIpRateLimiter ??
  new WarGraphTokenBucketRateLimiter({
    ratePerSecond: 20,
    burst: 100,
    maxKeys: 4_000,
    idleTtlMs: 2 * 60_000,
  });

rateLimitGlobal.__warGraphMutationUidRateLimiter =
  warGraphMutationUidRateLimiter;
rateLimitGlobal.__warGraphMutationIpRateLimiter = warGraphMutationIpRateLimiter;
rateLimitGlobal.__warGraphPresenceUidRateLimiter =
  warGraphPresenceUidRateLimiter;
rateLimitGlobal.__warGraphPresenceIpRateLimiter = warGraphPresenceIpRateLimiter;

export type WarGraphScopedRateLimitResult =
  | { allowed: true }
  | {
      allowed: false;
      scope: "UID" | "IP";
      reason: "INVALID_KEY" | "INVALID_TIME" | "RATE_LIMITED";
      retryAfterMs: number;
    };

export function consumeWarGraphMutationRateLimit(input: {
  uid: string;
  ip: string;
  nowMs?: number;
}): WarGraphScopedRateLimitResult {
  return consumeRateLimitPair({
    ...input,
    uidLimiter: warGraphMutationUidRateLimiter,
    ipLimiter: warGraphMutationIpRateLimiter,
  });
}

export function consumeWarGraphPresenceRateLimit(input: {
  uid?: string | null;
  ip: string;
  nowMs?: number;
}): WarGraphScopedRateLimitResult {
  return consumeRateLimitPair({
    ...input,
    uidLimiter: warGraphPresenceUidRateLimiter,
    ipLimiter: warGraphPresenceIpRateLimiter,
  });
}

function consumeRateLimitPair(input: {
  uid?: string | null;
  ip: string;
  nowMs?: number;
  uidLimiter: WarGraphTokenBucketRateLimiter;
  ipLimiter: WarGraphTokenBucketRateLimiter;
}): WarGraphScopedRateLimitResult {
  const nowMs = input.nowMs ?? Date.now();
  const ipResult = input.ipLimiter.consume(input.ip, nowMs);
  if (!ipResult.allowed) return { ...ipResult, scope: "IP" };

  if (input.uid !== null && input.uid !== undefined) {
    const uidResult = input.uidLimiter.consume(input.uid, nowMs);
    if (!uidResult.allowed) return { ...uidResult, scope: "UID" };
  }

  return { allowed: true };
}
