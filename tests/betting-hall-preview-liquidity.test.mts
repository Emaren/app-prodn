import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  attachBetPreviewLiquidity,
  buildBetPreviewLiquidityMap,
  type BetPreviewLiquidityRow,
} from "../lib/bets.ts";

function shadowAction(
  overrides: Record<string, unknown> = {}
) {
  return {
    id: 1,
    marketId: 77,
    botSlugSnapshot: "tony",
    eventType: "shadow_proposal",
    effectiveModeSnapshot: "shadow",
    counterSide: "right",
    proposedCounterstakeWolo: 10,
    committedCounterstakeWolo: null,
    availableBalanceWolo: null,
    custodyVerified: false,
    custodyVerificationId: null,
    custodyReservationId: null,
    stakeTxHash: null,
    createdAt: new Date("2026-09-29T19:00:00.000Z"),
    ...overrides,
  };
}

test("Preview Liquidity admits only zero-custody shadow proposals", () => {
  const projected = buildBetPreviewLiquidityMap([
    shadowAction(),
    shadowAction({
      id: 2,
      botSlugSnapshot: "paulie",
      committedCounterstakeWolo: 10,
    }),
    shadowAction({
      id: 3,
      botSlugSnapshot: "paulie",
      availableBalanceWolo: 100,
    }),
    shadowAction({
      id: 4,
      custodyVerified: true,
      custodyVerificationId: "custody-proof",
    }),
    shadowAction({
      id: 5,
      custodyReservationId: "reservation",
    }),
    shadowAction({
      id: 6,
      stakeTxHash: "ABC123",
    }),
    shadowAction({
      id: 7,
      eventType: "live_commit",
    }),
    shadowAction({
      id: 8,
      effectiveModeSnapshot: "live",
    }),
  ] as never);

  assert.deepEqual(projected.get(77), [
    {
      id: 1,
      botLabel: "Tony",
      side: "right",
      amountWolo: 10,
      recordedAt: "2026-09-29T19:00:00.000Z",
      financiallyCommitted: false,
    },
  ]);
});

test("attaching Preview Liquidity cannot change real market economics", () => {
  const market = {
    id: 77,
    previewLiquidity: [] as BetPreviewLiquidityRow[],
    totalPotWolo: 150,
    left: {
      poolWolo: 100,
      crowdPercent: 67,
      slips: 2,
    },
    right: {
      poolWolo: 50,
      crowdPercent: 33,
      slips: 1,
    },
    viewerWager: {
      side: "left",
      amountWolo: 25,
      slipCount: 1,
    },
  };

  const previewByMarket = buildBetPreviewLiquidityMap([
    shadowAction(),
    shadowAction({
      id: 9,
      botSlugSnapshot: "paulie",
      counterSide: "left",
      proposedCounterstakeWolo: 10,
      createdAt: new Date("2026-09-29T19:01:00.000Z"),
    }),
  ] as never);

  const projected = attachBetPreviewLiquidity(market, previewByMarket);
  const { previewLiquidity: beforePreview, ...beforeMoney } = market;
  const { previewLiquidity: afterPreview, ...afterMoney } = projected;

  assert.deepEqual(beforePreview, []);
  assert.equal(afterPreview.length, 2);
  assert.equal(
    afterPreview.reduce((sum, row) => sum + row.amountWolo, 0),
    20
  );
  assert.deepEqual(afterMoney, beforeMoney);
  assert.equal(projected.totalPotWolo, 150);
  assert.equal(projected.left.poolWolo, 100);
  assert.equal(projected.right.poolWolo, 50);
  assert.equal(projected.left.crowdPercent, 67);
  assert.equal(projected.right.crowdPercent, 33);
});

test("Betting Hall labels Preview Liquidity as non-financial", () => {
  const bets = readFileSync(
    new URL("../lib/bets.ts", import.meta.url),
    "utf8"
  );
  const page = readFileSync(
    new URL("../app/bets/page.tsx", import.meta.url),
    "utf8"
  );
  const mechanics = readFileSync(
    new URL("../app/betting-mechanics/page.tsx", import.meta.url),
    "utf8"
  );

  assert.match(bets, /betCounterAction\.findMany/);
  assert.match(bets, /eventType: "shadow_proposal"/);
  assert.match(bets, /committedCounterstakeWolo: null/);
  assert.match(bets, /availableBalanceWolo: null/);
  assert.match(bets, /custodyVerified: false/);
  assert.match(bets, /stakeTxHash: null/);

  assert.match(page, /Preview Liquidity/);
  assert.match(page, /Shadow only · not in pot or odds/);
  assert.match(page, /would counter/);
  assert.match(page, /PreviewLiquidityRail market=\{market\} compact/);

  assert.match(mechanics, /Tony \+ Paulie preview counters/);
  assert.match(mechanics, /Preview is not the book/);
  assert.doesNotMatch(mechanics, /random 1 WOLO AI liquidity bet/);
});
