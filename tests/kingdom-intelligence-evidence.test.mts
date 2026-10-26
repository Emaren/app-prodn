import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { inspectIntelligenceHealthEvidence } from "../lib/kingdomIntelligenceEvidence.ts";

const now = Date.parse("2026-10-25T12:40:00.000Z");
const at = (ms: number) => new Date(ms).toISOString();
const SHA = "a".repeat(40);
const OTHER_SHA = "b".repeat(40);

function sample(overrides: Record<string, unknown> = {}) {
  return {
    source: {
      exact: true,
      production: { source_sha: SHA, build_id: "xqX6Oi-zV5gSKH1kIC4zC" },
      certification: { status: "CERTIFIED" },
    },
    health: { estate: "ATTENTION", doctor_status: "ATTENTION", p0: 0, p1: 0 },
    invariants: [],
    capturedAt: at(now - 10_000),
    receivedAt: at(now - 5_000),
    nowMs: now,
    ...overrides,
  };
}
const inspect = (input = sample()) => inspectIntelligenceHealthEvidence(input);

test("measured zero remains zero but is explicitly source-reported, never independently certified", () => {
  const { observation, counts } = inspect();
  assert.equal(observation.status, "SOURCE_REPORTED");
  assert.equal(counts.p0, 0);
  assert.equal(counts.p1, 0);
  assert.equal(observation.sourceGitSha, SHA);
  assert.equal(observation.buildId, "xqX6Oi-zV5gSKH1kIC4zC");
  assert.equal(observation.collectorAuthority, "aoe2war-operator-bridge");
  assert.equal(observation.evidenceUri, null);
  assert.equal(observation.ttlSeconds, 900);
  assert.match(observation.limitations.join(" "), /not independently certified/);
});

test("missing, null, undefined and invalid P0 or P1 never mean no findings", () => {
  const bad = [
    {}, { p0: 0 }, { p1: 0 }, { p0: null, p1: 0 },
    { p0: 0, p1: undefined }, { p0: -1, p1: 0 },
    { p0: 0.1, p1: 0 }, { p0: Number.POSITIVE_INFINITY, p1: 0 },
    { p0: "unknown", p1: 0 }, { p0: 0, p1: 9007199254740992 },
  ];
  for (const health of bad) {
    const v = inspect(sample({ health }));
    assert.equal(v.observation.status, "UNKNOWN", JSON.stringify(health));
    assert.deepEqual(v.counts, { p0: null, p1: null }, JSON.stringify(health));
    assert.ok(v.observation.unknownReasons.includes("p0-p1-missing-or-invalid"));
  }
});

test("valid decimal count strings and nonzero counts are preserved as source-reported", () => {
  const v = inspect(sample({ health: { estate: "ATTENTION", p0: "2", p1: "7" } }));
  assert.deepEqual(v.counts, { p0: 2, p1: 7 });
  assert.equal(v.observation.status, "SOURCE_REPORTED");
});

test("older underlying capture remains stale even if the receiving envelope is fresh", () => {
  const v = inspect(sample({ capturedAt: at(now - 901_000), receivedAt: at(now) }));
  assert.equal(v.observation.status, "STALE");
  assert.deepEqual(v.counts, { p0: null, p1: null });
  assert.ok(v.observation.unknownReasons.includes("source-observation-expired"));
});

test("an old receiving envelope cannot be redeemed by a new capture date", () => {
  const v = inspect(sample({ receivedAt: at(now - 901_000) }));
  assert.equal(v.observation.status, "STALE");
  assert.deepEqual(v.counts, { p0: null, p1: null });
});

test("future timestamps beyond 30 seconds are unknown, at the boundary stay source-reported", () => {
  assert.equal(inspect(sample({ capturedAt: at(now + 30_001) })).observation.status, "UNKNOWN");
  assert.equal(inspect(sample({ receivedAt: at(now + 30_001) })).observation.status, "UNKNOWN");
  assert.equal(inspect(sample({ capturedAt: at(now + 30_000) })).observation.status, "SOURCE_REPORTED");
});

test("invalid, missing and impossible Gregorian dates cannot be fresh", () => {
  for (const capturedAt of [null, "", "2026-02-30T12:39:55.000Z", "2026-10-25", "2099-01-01T00:00:00.000Z"]) {
    const v = inspect(sample({ capturedAt }));
    assert.equal(v.observation.status, "UNKNOWN");
    assert.deepEqual(v.counts, { p0: null, p1: null });
  }
});

test("a source-exact flag with a missing or truncated SHA is still unverified", () => {
  for (const source of [
    { exact: true, production: { source_sha: "a".repeat(12) } },
    { exact: false, production: { source_sha: SHA } },
    { production: { source_sha: SHA } },
  ]) {
    assert.equal(inspect(sample({ source })).observation.status, "UNKNOWN");
  }
});

test("contradictory source claims fail closed instead of advertising no P0", () => {
  const cases = [
    sample({ source: { exact: true, production: { source_sha: SHA }, certification: { source_sha: OTHER_SHA } } }),
    sample({ health: { estate: "HEALTHY", p0: 2, p1: 0 } }),
    sample({ health: { doctor_status: "HEALTHY", p0: 2, p1: 0 } }),
    sample({ health: { estate: "ATTENTION", p0: 1, p1: 0 }, invariants: [{ key: "estate-p0-zero", status: "PASS" }] }),
    sample({ independentCertifiedSha: OTHER_SHA }),
  ];
  for (const input of cases) {
    const v = inspect(input);
    assert.equal(v.observation.status, "CONTRADICTORY");
    assert.deepEqual(v.counts, { p0: null, p1: null });
  }
});

test("independently certified SHA input cannot be forged by bridge self-attestation", () => {
  const v = inspect(sample({
    source: { exact: true, production: { source_sha: SHA }, certification: { status: "CERTIFIED", source_sha: SHA } },
    independentCertifiedSha: "not-a-40-hex-sha",
  }));
  assert.equal(v.observation.status, "UNKNOWN");
  assert.deepEqual(v.counts, { p0: null, p1: null });
});

test("bridge JSON never leaks local paths or raw evidence URLs through the observation contract", () => {
  const v = inspect(sample({
    source: { exact: true, production: { source_sha: SHA, build_id: "../../private" }, privatePath: "/home/secret" },
    health: { p0: 0, p1: 0, secret_receipt_path: "/mnt/private" },
  }));
  assert.equal(v.observation.buildId, null);
  assert.equal(v.observation.evidenceUri, null);
  assert.doesNotMatch(JSON.stringify(v), /private|secret/i);
});

test("public adapter uses actual evidence counts, not nullish-to-zero fallback", () => {
  const source = readFileSync(new URL("../lib/kingdomIntelligencePublic.ts", import.meta.url), "utf8");
  assert.match(source, /inspectIntelligenceHealthEvidence/);
  assert.match(source, /p0: healthEvidence\.counts\.p0/);
  assert.match(source, /p1: healthEvidence\.counts\.p1/);
  assert.doesNotMatch(source, /p0:\s*numberValue\(health\.p0\)\s*\?\?\s*0/);
  assert.doesNotMatch(source, /p1:\s*numberValue\(health\.p1\)\s*\?\?\s*0/);
});
