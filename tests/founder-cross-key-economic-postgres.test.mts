/** Disposable PostgreSQL Founder Bonus economic fence: NO mainnet, signer or finance authorization. */
import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as sleep } from "node:timers/promises";

import {
  withFounderPayoutTargetLock,
} from "../lib/betFounderBonuses.ts";
import {
  buildFounderPayoutIdentity,
  buildFounderEconomicLockKey,
} from "../lib/founderPayoutIdentity.ts";
import { retryPendingClaimSettlement } from "../lib/adminWoloClaims.ts";
import { startLiveWatcherDatabase } from "./fixtures/live-watcher-db.mts";

test("historical Founder Bonus claim keys fail closed in disposable PostgreSQL", {
  skip: process.env.RUN_LIVE_MARKET_PG_TESTS !== "1",
  timeout: 120000,
}, async t => {
  const db = await startLiveWatcherDatabase();
  const previousFetch = globalThis.fetch;
  let networkCalls = 0;
  globalThis.fetch = (async () => {
    networkCalls++;
    throw new Error("test rejects any network/signer attempt");
  }) as typeof fetch;
  try {
    const user = await db.prisma.user.create({
      data: {
        uid: "founder-economic-test-user",
        inGameName: "FoundersLeft",
        steamId: "76561198000004567",
        verified: true,
        verificationLevel: 2,
        walletAddress: `wolo1${"a".repeat(38)}`,
      },
    });
    const market = await db.prisma.betMarket.create({
      data: {
        slug: "founder-economic-test-book",
        title: "Isolated Economic Fence",
        eventLabel: "Isolated regression",
        leftLabel: "FoundersLeft",
        rightLabel: "FoundersRight",
        status: "settled",
        winnerSide: "left",
        bookPhase: "legacy",
      },
    });
    const bonus = await db.prisma.betMarketFounderBonus.create({
      data: {
        marketId: market.id,
        bonusType: "participants",
        totalAmountWolo: 2000,
        status: "partial",
      },
    });
    const juneKey = `founder:${bonus.id}:left`;
    const julyKey = `founder:${bonus.id}:left:FoundersLeft`;
    const lock = buildFounderEconomicLockKey({
      founderBonusId: bonus.id,
      normalizedPlayerName: "foundersleft",
    });

    await t.test("two distinct group keys serialize against the same actual PostgreSQL advisory lock", async () => {
      let active = 0;
      let peak = 0;
      const enter = async (claimGroupKey: string) => {
        const identity = buildFounderPayoutIdentity({
          founderBonusId: bonus.id,
          claimGroupKey,
          claimKind: "founders_bonus",
        });
        return withFounderPayoutTargetLock(db.prisma, {
          ...identity, economicLockKey: lock,
        }, async () => {
          active++;
          peak = Math.max(active, peak);
          await sleep(60);
          active--;
          return claimGroupKey;
        });
      };
      const completed = await Promise.all([enter(juneKey), enter(julyKey)]);
      assert.deepEqual(completed, [juneKey, julyKey]);
      assert.equal(peak, 1, "independent June/July groups cannot enter the protected section together");
    });

    await t.test("a prior claimed June bonus blocks a July admin retry without wallet/network effects", async () => {
      const original = await db.prisma.pendingWoloClaim.create({
        data: {
          normalizedPlayerName: "foundersleft",
          displayPlayerName: "FoundersLeft",
          amountWolo: 1000,
          claimKind: "founders_bonus",
          claimGroupKey: juneKey,
          targetScope: "both_participants",
          sourceMarketId: market.id,
          sourceFounderBonusId: bonus.id,
          status: "claimed",
          claimedByUserId: user.id,
          payoutAttemptedAt: new Date("2026-06-20T12:00:00Z"),
          payoutTxHash: "a".repeat(64),
        },
      });
      const july = await db.prisma.pendingWoloClaim.create({
        data: {
          normalizedPlayerName: "foundersleft",
          displayPlayerName: "FoundersLeft",
          amountWolo: 1000,
          claimKind: "founders_bonus",
          claimGroupKey: julyKey,
          targetScope: "both_participants",
          sourceMarketId: market.id,
          sourceFounderBonusId: bonus.id,
          status: "pending",
        },
      });
      const response = await retryPendingClaimSettlement(db.prisma, july.id);
      assert.equal(response.outcome, "skipped");
      assert.equal(response.outcome === "skipped" ? response.reason : null, "ambiguous_prior_attempt");
      assert.equal(networkCalls, 0, "neither signer nor chain lookup may be reached");
      const afterOriginal = await db.prisma.pendingWoloClaim.findUniqueOrThrow({ where: { id: original.id } });
      const afterJuly = await db.prisma.pendingWoloClaim.findUniqueOrThrow({ where: { id: july.id } });
      assert.equal(afterOriginal.status, "claimed");
      assert.equal(afterJuly.status, "pending");
      assert.equal(afterJuly.payoutAttemptedAt, null);
      assert.equal(afterJuly.payoutTxHash, null);
    });
    await t.test("two entirely pending key generations both refuse signing", async () => {
      const secondBonus = await db.prisma.betMarketFounderBonus.create({
        data: {
          marketId: market.id,
          bonusType: "participants",
          totalAmountWolo: 2000,
          status: "partial",
        },
      });
      const makeClaim = (key: string) => db.prisma.pendingWoloClaim.create({
        data: {
          normalizedPlayerName: "foundersleft",
          displayPlayerName: "FoundersLeft",
          amountWolo: 1000,
          claimKind: "founders_bonus",
          claimGroupKey: key,
          targetScope: "both_participants",
          sourceMarketId: market.id,
          sourceFounderBonusId: secondBonus.id,
          status: "pending",
        },
      });
      const june = await makeClaim(`founder:${secondBonus.id}:left`);
      const july = await makeClaim(`founder:${secondBonus.id}:left:FoundersLeft`);
      const outcomes = await Promise.all([
        retryPendingClaimSettlement(db.prisma, june.id),
        retryPendingClaimSettlement(db.prisma, july.id),
      ]);
      assert.ok(outcomes.every(x => x.outcome === "skipped" && x.reason === "ambiguous_prior_attempt"));
      assert.equal(networkCalls, 0, "even concurrent pending generations have zero signer attempts");
      const current = await db.prisma.pendingWoloClaim.findMany({
        where: { sourceFounderBonusId: secondBonus.id },
      });
      assert.equal(current.length, 2);
      assert.ok(current.every(row => row.status === "pending" && row.payoutAttemptedAt === null &&
        row.payoutTxHash === null));
    });
    await t.test("orphaned Founder Bonus FK cannot bypass historical group-key provenance", async () => {
      const orphanCaseBonus = await db.prisma.betMarketFounderBonus.create({
        data: {
          marketId: market.id,
          bonusType: "participants",
          totalAmountWolo: 2000,
          status: "partial",
        },
      });
      const legacyGroupKey = `founder:${orphanCaseBonus.id}:left`;
      const julyGroupKey = `founder:${orphanCaseBonus.id}:left:FoundersLeft`;
      const historical = await db.prisma.pendingWoloClaim.create({
        data: {
          normalizedPlayerName: "foundersleft",
          displayPlayerName: "FoundersLeft",
          amountWolo: 1000,
          claimKind: "founders_bonus",
          claimGroupKey: legacyGroupKey,
          targetScope: "both_participants",
          // Models a historical attribution record with SetNull FK.
          sourceFounderBonusId: null,
          sourceMarketId: null,
          status: "claimed",
          claimedByUserId: user.id,
          payoutAttemptedAt: new Date("2026-06-20T12:00:00Z"),
          payoutTxHash: "b".repeat(64),
        },
      });
      const newClaim = (key: string) => db.prisma.pendingWoloClaim.create({
        data: {
          normalizedPlayerName: "foundersleft",
          displayPlayerName: "FoundersLeft",
          amountWolo: 1000,
          claimKind: "founders_bonus",
          claimGroupKey: key,
          targetScope: "both_participants",
          sourceMarketId: market.id,
          sourceFounderBonusId: orphanCaseBonus.id,
          status: "pending",
        },
      });
      // Even equal keys require refusal: sourceMarketId NULL allows an old
      // historical row and a linked replacement to coexist in this schema.
      const equalKeyReplacement = await newClaim(legacyGroupKey);
      const julyReplacement = await newClaim(julyGroupKey);
      const outcomes = await Promise.all([
        retryPendingClaimSettlement(db.prisma, equalKeyReplacement.id),
        retryPendingClaimSettlement(db.prisma, julyReplacement.id),
      ]);
      assert.ok(outcomes.every(x =>
        x.outcome === "skipped" && x.reason === "ambiguous_prior_attempt"
      ));
      assert.equal(networkCalls, 0, "orphaned historical FK cannot issue a replacement signer call");
      const latest = await db.prisma.pendingWoloClaim.findMany({
        where: { id: { in: [historical.id, equalKeyReplacement.id, julyReplacement.id] } },
        orderBy: { id: "asc" },
      });
      assert.equal(latest.length, 3);
      assert.equal(latest.find(x => x.id === historical.id)?.status, "claimed");
      assert.ok(latest.filter(x => x.id !== historical.id).every(x =>
        x.status === "pending" && x.payoutAttemptedAt === null && x.payoutTxHash === null
      ));
    });
  } finally {
    globalThis.fetch = previousFetch;
    await db.cleanup();
  }
});
