import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { reconcileKingdomReleaseEvidence } from "../lib/kingdomReleaseEvidence.ts";

const sha = "a".repeat(40);
test("certified full SHA and canonical public 12-character identity agree", () => {
  assert.equal(reconcileKingdomReleaseEvidence(sha, sha.slice(0, 12)), "aligned");
  assert.equal(reconcileKingdomReleaseEvidence(sha.toUpperCase(), sha.slice(0, 12)), "aligned");
});
test("different release identities fail closed even when both feeds claim healthy", () => {
  assert.equal(reconcileKingdomReleaseEvidence(sha, "b".repeat(12)), "mismatch");
});
test("missing, partial, malformed or untrusted release evidence is never aligned", () => {
  for (const [inspection, intelligence] of [
    [null, sha.slice(0, 12)],
    [sha, null],
    [sha.slice(0, 12), sha.slice(0, 12)],
    [sha, sha.slice(0, 10)],
    [sha + "0", sha.slice(0, 12)],
    [sha, "not-a-sha"],
    [sha, sha],
  ] as const) {
    assert.equal(reconcileKingdomReleaseEvidence(inspection, intelligence), "unknown");
  }
});
test("Agent and public API preserve explicit unknown/mismatch rather than inferred clearance", () => {
  const agents = readFileSync(new URL("../lib/kingdomAgentsPublic.ts", import.meta.url), "utf8");
  const client = readFileSync(new URL("../app/kingdom-agents/KingdomAgentsClient.tsx", import.meta.url), "utf8");
  const api = readFileSync(new URL("../app/api/kingdom-agents/route.ts", import.meta.url), "utf8");
  assert.match(agents, /reconcileKingdomReleaseEvidence\(/);
  assert.match(agents, /intelligenceCurrent = Boolean\(intelligence\?\.available && !intelligence\.stale && releaseAlignment === "aligned"\)/);
  assert.match(agents, /releaseSha: releaseAlignment === "aligned"/);
  assert.match(agents, /releaseAlignment,/);
  assert.match(client, /SOURCE DRIFT/);
  assert.match(api, /releaseAlignment: "unknown"/);
});
