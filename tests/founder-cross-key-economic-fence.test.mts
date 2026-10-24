import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  buildFounderEconomicLockKey,
  buildFounderPayoutIdentity,
} from "../lib/founderPayoutIdentity.ts";

const BONUS = 72227;
const PLAYER = "historical-participant";
const ORIGINAL = `founder:${BONUS}:left`;
const JULY = `founder:${BONUS}:left:historical-participant`;

test("June and July claim keys have distinct signer request identities", () => {
  const old = buildFounderPayoutIdentity({
    founderBonusId: BONUS, claimGroupKey: ORIGINAL, claimKind: "founders_bonus",
  });
  const july = buildFounderPayoutIdentity({
    founderBonusId: BONUS, claimGroupKey: JULY, claimKind: "founders_bonus",
  });
  assert.notEqual(old.requestId, july.requestId);
  assert.notEqual(old.lockKey, july.lockKey);
  assert.notEqual(old.memo, july.memo);
});

test("different historical group keys for same bonus recipient share economic lock", () => {
  const fromJune = buildFounderEconomicLockKey({
    founderBonusId: BONUS, normalizedPlayerName: PLAYER,
  });
  const fromJuly = buildFounderEconomicLockKey({
    founderBonusId: BONUS, normalizedPlayerName: PLAYER,
  });
  assert.equal(fromJune, fromJuly);
});

test("two real independently funded parents remain separate", () => {
  assert.notEqual(
    buildFounderEconomicLockKey({ founderBonusId: 43481, normalizedPlayerName: PLAYER }),
    buildFounderEconomicLockKey({ founderBonusId: 43634, normalizedPlayerName: PLAYER }),
  );
});

test("two actual recipients of one parent remain separate", () => {
  assert.notEqual(
    buildFounderEconomicLockKey({ founderBonusId: BONUS, normalizedPlayerName: "left-player" }),
    buildFounderEconomicLockKey({ founderBonusId: BONUS, normalizedPlayerName: "right-player" }),
  );
});

test("empty, overlong, non-canonical player keys fail closed", () => {
  for (const invalid of ["", " ", "SOME-PERSON", "a".repeat(65)]) {
    assert.throws(() => buildFounderEconomicLockKey({
      founderBonusId: BONUS, normalizedPlayerName: invalid,
    }));
  }
});

test("invalid parent ids fail closed", () => {
  for (const invalid of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1.2]) {
    assert.throws(() => buildFounderEconomicLockKey({
      founderBonusId: invalid, normalizedPlayerName: PLAYER,
    }));
  }
});

test("the shared advisory lock is taken before per-key signer lock", () => {
  const source = readFileSync(new URL("../lib/betFounderBonuses.ts", import.meta.url), "utf8");
  const section = source.slice(source.indexOf("export async function withFounderPayoutTargetLock"), source.indexOf("type WalletLinkedFounderUser"));
  assert.ok(section.indexOf("identity.economicLockKey") >= 0);
  assert.ok(section.indexOf("hashtextextended(${identity.economicLockKey}, 0)") <
      section.indexOf("hashtextextended(${identity.lockKey}, 0)"));
});

test("automatic settlement and admin retry both check historical prior attempts", () => {
  const founder = readFileSync(new URL("../lib/betFounderBonuses.ts", import.meta.url), "utf8");
  const admin = readFileSync(new URL("../lib/adminWoloClaims.ts", import.meta.url), "utf8");
  for (const source of [founder, admin]) {
    assert.match(source, /conflictingEconomicClaim = await tx\.pendingWoloClaim\.findFirst/);
    assert.match(source, /sourceFounderBonusId:/);
    assert.match(source, /claimGroupKey: \{ not:/);
    const guardStart = source.indexOf("const conflictingEconomicClaim = await tx.pendingWoloClaim.findFirst({");
    const guardEnd = source.indexOf("if (conflictingEconomicClaim)", guardStart);
    assert.ok(guardStart >= 0 && guardEnd > guardStart);
    assert.doesNotMatch(source.slice(guardStart, guardEnd), /OR:|status:|payoutAttemptedAt:/);
    assert.match(source, /economicLockKey: buildFounderEconomicLockKey/);
  }
});
