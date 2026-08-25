import assert from "node:assert/strict";
import test from "node:test";

import {
  WARGRAPH_IDEMPOTENCY_KEY_MAX_LENGTH,
  WARGRAPH_MAX_JSON_BODY_BYTES,
  WarGraphTokenBucketRateLimiter,
  consumeWarGraphMutationRateLimit,
  consumeWarGraphPresenceRateLimit,
  isWarGraphSameOrigin,
  matchWarGraphIdempotencyKey,
  readWarGraphJsonBody,
  requireMatchingWarGraphIdempotencyKey,
  validateWarGraphIdempotencyKey,
  warGraphClientAddress,
  warGraphMutationIpRateLimiter,
  warGraphMutationUidRateLimiter,
  warGraphPresenceIpRateLimiter,
  warGraphPresenceUidRateLimiter,
} from "../lib/wargraph/requestSecurity.ts";

function requestWithHeaders(headers: HeadersInit, url = "http://127.0.0.1:3030/api/wargraph") {
  return new Request(url, { headers });
}

function bodyRequest(
  body: BodyInit | null,
  headers: HeadersInit = { "content-type": "application/json" },
) {
  return new Request("https://aoe2war.com/api/wargraph/action", {
    method: "POST",
    headers,
    body,
  });
}

function resetGlobalLimiters() {
  warGraphMutationUidRateLimiter.reset();
  warGraphMutationIpRateLimiter.reset();
  warGraphPresenceUidRateLimiter.reset();
  warGraphPresenceIpRateLimiter.reset();
}

function failureStatus(
  result: Awaited<ReturnType<typeof readWarGraphJsonBody>>,
) {
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("expected a rejected JSON body");
  return result.status;
}

test("same-origin accepts the trusted public origin behind Nginx", () => {
  const request = requestWithHeaders({
    host: "aoe2war.com",
    origin: "https://aoe2war.com",
    "x-forwarded-host": "attacker.invalid",
    "x-forwarded-proto": "https",
  });

  assert.equal(isWarGraphSameOrigin(request), true);
});

test("same-origin fails closed on untrusted, ambiguous, or malformed authority", () => {
  const headers = {
    host: "aoe2war.com",
    origin: "https://attacker.invalid",
    "x-forwarded-host": "attacker.invalid",
    "x-forwarded-proto": "https",
  };

  assert.equal(isWarGraphSameOrigin(requestWithHeaders(headers)), false);
  assert.equal(
    isWarGraphSameOrigin(
      requestWithHeaders({ ...headers, origin: "https://aoe2war.com", host: "" }),
    ),
    false,
  );
  assert.equal(
    isWarGraphSameOrigin(
      requestWithHeaders({ ...headers, origin: "", host: "aoe2war.com" }),
    ),
    false,
  );
  assert.equal(
    isWarGraphSameOrigin(
      requestWithHeaders({
        ...headers,
        origin: "https://aoe2war.com",
        "x-forwarded-proto": "https,http",
      }),
    ),
    false,
  );
  assert.equal(
    isWarGraphSameOrigin(
      requestWithHeaders({
        ...headers,
        origin: "https://aoe2war.com/path",
      }),
    ),
    false,
  );
  assert.equal(
    isWarGraphSameOrigin(
      requestWithHeaders({
        ...headers,
        origin: "https://aoe2war.com",
        host: "aoe2war.com@attacker.invalid",
      }),
    ),
    false,
  );
});

test("same-origin falls back to the request protocol only without forwarded proto", () => {
  assert.equal(
    isWarGraphSameOrigin(
      requestWithHeaders(
        { host: "aoe2war.com", origin: "https://aoe2war.com" },
        "https://aoe2war.com/api/wargraph",
      ),
    ),
    true,
  );
  assert.equal(
    isWarGraphSameOrigin(
      requestWithHeaders(
        { host: "aoe2war.com", origin: "https://aoe2war.com" },
        "http://aoe2war.com/api/wargraph",
      ),
    ),
    false,
  );
});

test("client address trusts x-real-ip, then only the right-most forwarded hop", () => {
  assert.equal(
    warGraphClientAddress(
      requestWithHeaders({
        "x-real-ip": "203.0.113.9",
        "x-forwarded-for": "198.51.100.1, 192.0.2.3",
      }),
    ),
    "203.0.113.9",
  );
  assert.equal(
    warGraphClientAddress(
      requestWithHeaders({
        "x-forwarded-for": "198.51.100.1, 2001:db8::7",
      }),
    ),
    "2001:db8::7",
  );
  assert.equal(
    warGraphClientAddress(
      requestWithHeaders({
        "x-real-ip": "not-an-ip",
        "x-forwarded-for": "client-preseeded, 192.0.2.44",
      }),
    ),
    "192.0.2.44",
  );
  assert.equal(
    warGraphClientAddress(
      requestWithHeaders({ "x-forwarded-for": "192.0.2.44, not-an-ip" }),
    ),
    "unknown",
  );
  assert.equal(warGraphClientAddress(requestWithHeaders({})), "unknown");
});

test("bounded JSON reader accepts only identity-encoded UTF-8 application/json", async () => {
  const encoded = new TextEncoder().encode('{"move":"inward"}');
  const valid = await readWarGraphJsonBody(
    bodyRequest(encoded, {
      "content-type": "application/json; charset=\"utf-8\"",
      "content-length": String(encoded.byteLength),
      "content-encoding": "identity",
    }),
  );

  assert.deepEqual(valid, {
    ok: true,
    value: { move: "inward" },
    bytes: encoded.byteLength,
  });
  assert.deepEqual(
    await readWarGraphJsonBody(bodyRequest("{}", { "content-type": "text/plain" })),
    {
      ok: false,
      status: 415,
      error: "Content-Type must be application/json",
    },
  );
  assert.equal(
    failureStatus(
      await readWarGraphJsonBody(
        bodyRequest("{}", {
          "content-type": "application/json",
          "content-encoding": "gzip",
        }),
      ),
    ),
    415,
  );
  assert.equal(
    failureStatus(
      await readWarGraphJsonBody(
        bodyRequest("{}", { "content-type": "application/json; charset=latin1" }),
      ),
    ),
    415,
  );
});

test("bounded JSON reader enforces declared and actual byte limits", async () => {
  assert.equal(WARGRAPH_MAX_JSON_BODY_BYTES, 4_096);
  assert.equal(
    failureStatus(
      await readWarGraphJsonBody(
        bodyRequest("{}", {
          "content-type": "application/json",
          "content-length": String(WARGRAPH_MAX_JSON_BODY_BYTES + 1),
        }),
      ),
    ),
    413,
  );
  assert.equal(
    failureStatus(
      await readWarGraphJsonBody(
        bodyRequest("{}", {
          "content-type": "application/json",
          "content-length": "01",
        }),
      ),
    ),
    400,
  );
  assert.equal(
    failureStatus(
      await readWarGraphJsonBody(
        bodyRequest("{}", {
          "content-type": "application/json",
          "content-length": "1",
        }),
      ),
    ),
    400,
  );

  const multibyte = new TextEncoder().encode('"💥"');
  assert.equal(multibyte.byteLength, 6);
  assert.equal(
    failureStatus(await readWarGraphJsonBody(bodyRequest(multibyte), 5)),
    413,
  );
  await assert.rejects(
    () => readWarGraphJsonBody(bodyRequest("{}"), WARGRAPH_MAX_JSON_BODY_BYTES + 1),
    RangeError,
  );
});

test("bounded JSON reader rejects malformed JSON and malformed UTF-8", async () => {
  assert.equal(
    failureStatus(await readWarGraphJsonBody(bodyRequest("{"))),
    400,
  );
  assert.equal(
    failureStatus(
      await readWarGraphJsonBody(
        bodyRequest(new Uint8Array([0x7b, 0xff, 0x7d])),
      ),
    ),
    400,
  );
  assert.equal(
    failureStatus(
      await readWarGraphJsonBody(
        new Request("https://aoe2war.com/api/wargraph/action", {
          method: "POST",
          headers: { "content-type": "application/json" },
        }),
      ),
    ),
    400,
  );
});

test("token bucket caps burst, refills deterministically, and resists clock rollback", () => {
  const limiter = new WarGraphTokenBucketRateLimiter({
    ratePerSecond: 1,
    burst: 2,
    maxKeys: 3,
    idleTtlMs: 60_000,
  });

  assert.deepEqual(limiter.consume("uid_1", 10_000), {
    allowed: true,
    remaining: 1,
  });
  assert.deepEqual(limiter.consume("uid_1", 10_000), {
    allowed: true,
    remaining: 0,
  });
  assert.deepEqual(limiter.consume("uid_1", 10_000), {
    allowed: false,
    reason: "RATE_LIMITED",
    retryAfterMs: 1_000,
  });
  assert.equal(limiter.consume("uid_1", 10_999).allowed, false);
  assert.equal(limiter.consume("uid_1", 11_000).allowed, true);
  assert.equal(limiter.consume("uid_1", 1).allowed, false);
});

test("token bucket rejects unsafe keys/options and keeps bounded state", () => {
  assert.throws(
    () =>
      new WarGraphTokenBucketRateLimiter({
        ratePerSecond: 1,
        burst: 1,
        maxKeys: 10_001,
        idleTtlMs: 1_000,
      }),
    RangeError,
  );

  const limiter = new WarGraphTokenBucketRateLimiter({
    ratePerSecond: 1,
    burst: 1,
    maxKeys: 2,
    idleTtlMs: 60_000,
  });
  assert.equal(limiter.consume(" uid", 0).allowed, false);
  assert.equal(limiter.consume("uid\n2", 0).allowed, false);
  assert.equal(limiter.consume("alpha", 0).allowed, true);
  assert.equal(limiter.consume("bravo", 1).allowed, true);
  assert.equal(limiter.consume("charlie", 2).allowed, true);
  assert.equal(limiter.size(), 2);
});

test("global mutation and presence limiters isolate UID and IP scopes", () => {
  resetGlobalLimiters();
  try {
    for (let index = 0; index < 5; index += 1) {
      assert.equal(
        consumeWarGraphMutationRateLimit({
          uid: "user_one",
          ip: "203.0.113.1",
          nowMs: 0,
        }).allowed,
        true,
      );
    }
    assert.deepEqual(
      consumeWarGraphMutationRateLimit({
        uid: "user_one",
        ip: "203.0.113.1",
        nowMs: 0,
      }),
      {
        allowed: false,
        scope: "UID",
        reason: "RATE_LIMITED",
        retryAfterMs: 4_000,
      },
    );

    assert.equal(
      consumeWarGraphMutationRateLimit({
        uid: "bad uid",
        ip: "203.0.113.2",
        nowMs: 0,
      }).allowed,
      false,
    );
    assert.equal(
      consumeWarGraphPresenceRateLimit({
        ip: "unknown",
        nowMs: 0,
      }).allowed,
      true,
    );
    assert.deepEqual(
      consumeWarGraphPresenceRateLimit({
        uid: "bad uid",
        ip: "203.0.113.3",
        nowMs: 0,
      }),
      {
        allowed: false,
        scope: "UID",
        reason: "INVALID_KEY",
        retryAfterMs: 1_000,
      },
    );
  } finally {
    resetGlobalLimiters();
  }
});

test("idempotency keys are bounded URL-safe tokens and match case-sensitively", () => {
  assert.deepEqual(validateWarGraphIdempotencyKey("action:1"), {
    ok: true,
    key: "action:1",
  });
  assert.equal(validateWarGraphIdempotencyKey("short").ok, false);
  assert.equal(validateWarGraphIdempotencyKey(" action:1").ok, false);
  assert.equal(validateWarGraphIdempotencyKey("action/1").ok, false);
  assert.equal(
    validateWarGraphIdempotencyKey(`a${"b".repeat(WARGRAPH_IDEMPOTENCY_KEY_MAX_LENGTH - 1)}`).ok,
    true,
  );
  assert.equal(
    validateWarGraphIdempotencyKey(`a${"b".repeat(WARGRAPH_IDEMPOTENCY_KEY_MAX_LENGTH)}`).ok,
    false,
  );
  assert.deepEqual(matchWarGraphIdempotencyKey("action:1", "action:2"), {
    ok: false,
    status: 400,
    code: "IDEMPOTENCY_KEY_MISMATCH",
    error: "Header and body idempotency keys must match exactly",
  });
  assert.equal(matchWarGraphIdempotencyKey("Action:1", "action:1").ok, false);
});

test("request idempotency helper requires the header and optional exact body match", () => {
  const request = requestWithHeaders({ "idempotency-key": "action:1" });
  assert.deepEqual(requireMatchingWarGraphIdempotencyKey(request), {
    ok: true,
    key: "action:1",
  });
  assert.deepEqual(requireMatchingWarGraphIdempotencyKey(request, "action:1"), {
    ok: true,
    key: "action:1",
  });
  assert.equal(
    requireMatchingWarGraphIdempotencyKey(requestWithHeaders({})).ok,
    false,
  );
  assert.equal(
    requireMatchingWarGraphIdempotencyKey(request, undefined).ok,
    false,
  );
});
