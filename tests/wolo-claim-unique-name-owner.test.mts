import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  uniquelyMatchedWoloClaimCandidate,
  WOLO_CLAIM_MATCH_CENSUS_LIMIT,
} from "../lib/woloClaimUniqueNameOwner.ts";

const normalize = (v: string | null | undefined) =>
  (v || "").trim().toLowerCase();
const member = (id: number, inGameName: string | null, steamPersonaName: string | null = null) =>
  ({ id, inGameName, steamPersonaName, walletAddress: "wolo1" + "x".repeat(38) });
const candidate = member(7, "Emaren", "Legend");

test("one matching owner is selected; dual matching names on same account do not create ambiguity", () => {
  const users = [member(1, "Someone"), candidate, member(12, "Unrelated")];
  assert.deepEqual(uniquelyMatchedWoloClaimCandidate(["emaren"], users, normalize), candidate);
  assert.deepEqual(uniquelyMatchedWoloClaimCandidate(["emaren", "legend"], users, normalize), candidate);
  assert.deepEqual(uniquelyMatchedWoloClaimCandidate(["legend"], users, normalize), candidate);
});

test("ambiguous names across different user IDs must not choose the first wallet", () => {
  for (const users of [
    [candidate, member(8, "EMAREN")],
    [member(8, "eMaReN"), candidate],
    [candidate, member(8, "Other", "emaren")],
    [member(8, "Other", "emaren"), candidate],
  ]) {
    assert.equal(uniquelyMatchedWoloClaimCandidate(["emaren"], users, normalize), null);
  }
  // Two accounts sharing the exact wallet still have different identities.
  assert.equal(uniquelyMatchedWoloClaimCandidate(["emaren"], [
    candidate, { ...member(9, "Emaren"), walletAddress: candidate.walletAddress },
  ], normalize), null);
});

test("nonmatching, empty and repeated database IDs fail closed", () => {
  assert.equal(uniquelyMatchedWoloClaimCandidate([""], [candidate], normalize), null);
  assert.equal(uniquelyMatchedWoloClaimCandidate([], [candidate], normalize), null);
  assert.equal(uniquelyMatchedWoloClaimCandidate(["emaren"], [member(22, "Different")], normalize), null);
  assert.equal(uniquelyMatchedWoloClaimCandidate(["emaren"], [candidate, { ...candidate }], normalize), null);
  assert.equal(uniquelyMatchedWoloClaimCandidate(["emaren"], [member(0, "Emaren")], normalize), null);
});

test("LIMIT+1 account cohort blocks a visible unique candidate when unseen accounts could include a duplicate", () => {
  const full = Array.from({ length: WOLO_CLAIM_MATCH_CENSUS_LIMIT },
    (_, i) => member(i + 100, "Player" + i));
  full[0] = candidate;
  assert.deepEqual(uniquelyMatchedWoloClaimCandidate(["emaren"], full, normalize), candidate);
  assert.equal(uniquelyMatchedWoloClaimCandidate(["emaren"],
    [...full, member(500, "Unrelated")], normalize), null);
  assert.equal(WOLO_CLAIM_MATCH_CENSUS_LIMIT, 250);
});

test("admin claim discovery uses LIMIT+1 and never a name-matched first() payout", () => {
  const source = readFileSync(new URL("../lib/adminWoloClaims.ts", import.meta.url), "utf8");
  const from = source.indexOf("export async function findMatchedClaimUser(");
  const to = source.indexOf("export async function retryPendingClaimSettlement(", from);
  assert.ok(from !== -1 && to > from);
  const fn = source.slice(from, to);
  assert.match(fn, /take: WOLO_CLAIM_MATCH_CENSUS_LIMIT \+ 1/);
  assert.match(fn, /uniquelyMatchedWoloClaimCandidate\(claimKeys, users, normalizeClaimKey\)/);
  assert.doesNotMatch(fn, /users\.find\(/);
  assert.doesNotMatch(fn, /take: 250/);
});
