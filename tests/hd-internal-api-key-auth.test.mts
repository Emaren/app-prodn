import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { internalApiKeyMatches } from "../lib/internalApiKeyAuth.ts";

function request(value?: string): Request {
  return new Request("http://hd-fixture.invalid/", {
    headers: value === undefined ? {} : { "x-api-key": value },
  });
}

test("internal HD API credentials fail closed on unconfigured, absent or empty tokens", () => {
  for (const expected of [undefined, null, "", "  ", "\t\n"]) {
    assert.equal(internalApiKeyMatches(request("secret"), expected), false);
  }
  for (const supplied of [undefined, "", "   "]) {
    assert.equal(internalApiKeyMatches(request(supplied), "secret"), false);
  }
});

test("internal HD API credentials reject mismatched bytes, lengths and prefixes", () => {
  const expected = "aoe2-internal-123456789";
  for (const supplied of [
    "aoe2-internal-12345678",
    "aoe2-internal-1234567890",
    "aoe2-internal-123456788",
    "AOE2-internal-123456789",
    "aoe2-internal-123456789-suffix",
    "aoe2-internal-123456789.extra",
    "completely-different-key",
  ]) {
    assert.equal(internalApiKeyMatches(request(supplied), expected), false, supplied);
  }
});

test("internal HD API credential admission retains the exact existing trim contract", () => {
  assert.equal(internalApiKeyMatches(request(" secret "), "secret"), true);
  assert.equal(internalApiKeyMatches(request("secret"), "  secret  "), true);
  assert.equal(internalApiKeyMatches(request("secret"), "secret"), true);
  assert.equal(internalApiKeyMatches(request("secretx"), "secret"), false);
  assert.equal(internalApiKeyMatches(request("secret"), "SECRET"), false);
});

test("internal HD API credential admission is byte-exact for Unicode and long values", () => {
  const suffix = "🔐-HD-äΩ";
  const token = "a".repeat(4096) + suffix;
  assert.equal(internalApiKeyMatches(request(token), token), true);
  assert.equal(internalApiKeyMatches(request(token + "z"), token), false);
  assert.equal(internalApiKeyMatches(request("é"), "e\u0301"), false);
  assert.equal(internalApiKeyMatches(request("é"), "é"), true);
});

test("three protected HD replay endpoints call shared guard before effectful work", () => {
  const paths = [
    "app/api/admin/replay-auto-recovery/route.ts",
    "app/api/admin/replay-roster-recovery/route.ts",
    "app/api/replay/post-ingest/route.ts",
  ];
  for (const path of paths) {
    const route = readFileSync(new URL("../" + path, import.meta.url), "utf8");
    assert.match(route, /import \{ internalApiKeyMatches \} from "@\/lib\/internalApiKeyAuth"/);
    assert.match(route, /function authorized\(request: NextRequest\) \{\s*return internalApiKeyMatches\(request, process\.env\.INTERNAL_API_KEY\);\s*\}/);
    assert.match(route, /!\s*authorized\s*\(\s*request\s*\)/);
    const authGate = route.search(/!\s*authorized\s*\(\s*request\s*\)/);
    const sideEffects = [
      route.indexOf("getPrisma()", authGate),
      route.indexOf("queueBetMarketEnsure(", authGate),
      route.indexOf("applyTargetedReplayRosterRecovery(", authGate),
    ].filter((i) => i >= 0);
    assert.ok(authGate >= 0, path);
    assert.ok(sideEffects.every((i) => i > authGate), path);
    assert.doesNotMatch(route, /expected\s*===\s*supplied/);
  }
});
