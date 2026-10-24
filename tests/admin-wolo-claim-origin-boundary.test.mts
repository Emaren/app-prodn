import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "../lib/generated/prisma/index.js";
import { retryPendingClaimSettlement } from "../lib/adminWoloClaims.ts";

type Origin = { id: number; bookPhase: string };
type FixtureOptions = {
  direct?: Origin | null;
  founder?: { id: number; marketId: number; market: Origin | null } | null;
  sourceMarketId?: number | null;
  sourceFounderBonusId?: number | null;
  claimKind?: string;
  attempted?: boolean;
};

async function retryFixture(options: FixtureOptions) {
  const reads: string[] = [];
  let writes = 0, networkCalls = 0;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    networkCalls++;
    throw Error("Origin refusal must precede every chain or signer request");
  }) as typeof fetch;
  const claim = {
    id: 889001, normalizedPlayerName: "isolated-origin-owner",
    displayPlayerName: "Isolated Origin Owner", amountWolo: 300,
    claimKind: options.claimKind ?? "founders_bonus", claimGroupKey: "isolated-origin",
    targetScope: "both_participants", status: "pending", errorState: null,
    sourceMarketId: options.sourceMarketId ?? null,
    sourceFounderBonusId: options.sourceFounderBonusId ?? null,
    payoutAttemptedAt: options.attempted ? new Date("2026-07-04T12:00:00Z") : null,
    payoutTxHash: null,
    // An invalid origin must be refused even before historical cleanup writes.
    createdAt: new Date("2026-01-01T00:00:00Z"),
  };
  const db = {
    pendingWoloClaim: {
      findUnique: async () => claim,
      update: async () => { writes++; throw Error("Unexpected claim mutation"); },
    },
    betMarket: { findUnique: async () => { reads.push("direct"); return options.direct ?? null; } },
    betMarketFounderBonus: { findUnique: async () => { reads.push("founder"); return options.founder ?? null; } },
  } as unknown as PrismaClient;
  try {
    const result = await retryPendingClaimSettlement(db, claim.id);
    assert.equal(result.outcome, "skipped");
    assert.equal(writes, 0, "Origin review must not alter historical claims");
    assert.equal(networkCalls, 0, "Origin review must not reach a signer or chain lookup");
    return { result, reads };
  } finally { globalThis.fetch = previousFetch; }
}

const legacy = { id: 11, bookPhase: "legacy" };
const preview = { id: 22, bookPhase: "preview_only" };
const founder = (market: Origin) => ({ id: 33, marketId: market.id, market });

for (const claimKind of ["bet_payout", "bet_refund", "bet_corrective_refund", "founders_bonus", "winner_bounty", "legacy_award"]) {
  test(`a ${claimKind} direct legacy origin cannot hide a preview Founder Bonus origin`, async () => {
    const { result, reads } = await retryFixture({
      sourceMarketId: legacy.id, sourceFounderBonusId: 33,
      direct: legacy, founder: founder(preview), claimKind,
    });
    assert.equal(result.outcome === "skipped" ? result.reason : null, "preview_only_market");
    assert.deepEqual(reads.sort(), ["direct", "founder"]);
  });
}

test("a preview direct origin cannot be hidden by a funded Founder Bonus origin", async () => {
  const { result } = await retryFixture({ sourceMarketId: preview.id, sourceFounderBonusId: 33,
    direct: preview, founder: founder(legacy) });
  assert.equal(result.outcome === "skipped" ? result.reason : null, "preview_only_market");
});

test("different legacy market parents fail closed before pre-mainnet claim cleanup", async () => {
  const { result } = await retryFixture({ sourceMarketId: legacy.id, sourceFounderBonusId: 33,
    direct: legacy, founder: founder({ id: 44, bookPhase: "legacy" }) });
  assert.equal(result.outcome === "skipped" ? result.reason : null, "ambiguous_claim_origin");
});

for (const options of [
  { sourceMarketId: 11, direct: null },
  { sourceFounderBonusId: 33, founder: null },
  { sourceFounderBonusId: 33, founder: { id: 33, marketId: 11, market: null } },
  { sourceMarketId: 11, sourceFounderBonusId: 33, direct: legacy, founder: null },
]) {
  test(`missing authoritative claim origin is refused: ${JSON.stringify(options)}`, async () => {
    const { result } = await retryFixture(options);
    assert.equal(result.outcome === "skipped" ? result.reason : null, "ambiguous_claim_origin");
  });
}

for (const options of [
  { sourceMarketId: legacy.id, direct: legacy },
  { sourceFounderBonusId: 33, founder: founder(legacy) },
  { sourceMarketId: legacy.id, sourceFounderBonusId: 33, direct: legacy, founder: founder(legacy) },
  {},
]) {
  test(`consistent legacy origin preserves the existing uncertain-payment hold: ${JSON.stringify(options)}`, async () => {
    const { result } = await retryFixture({ ...options, attempted: true });
    assert.equal(result.outcome === "skipped" ? result.reason : null, "ambiguous_prior_attempt");
  });
}
