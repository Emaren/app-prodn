import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  autoBetPreviewSlipBlockerLabel,
  planAutoBetPreviewSlip,
} from "../lib/betAutoPreviewSlip.ts";

function base(overrides: Record<string, unknown> = {}) {
  return {
    marketId: 101,
    bettingOpen: true,
    viewerWager: null,
    desyncMarket: null,
    preview: {
      selectedSide: "right",
      winnerStakeWolo: 25,
      desyncSide: "none",
      desyncStakeWolo: 0,
      desyncMarketId: null,
      financiallyCommitted: false,
    },
    maxStakeWolo: 50_000,
    ...overrides,
  };
}

test("winner-only shadow preview becomes an exact manual slip selection", () => {
  assert.deepEqual(planAutoBetPreviewSlip(base()), {
    ok: true,
    selection: {
      marketId: 101,
      side: "right",
      stake: 25,
      desync: null,
    },
    totalStakeWolo: 25,
  });
});

test("Desync YES maps to the current right-side YES book without changing amounts", () => {
  assert.deepEqual(
    planAutoBetPreviewSlip(
      base({
        desyncMarket: {
          id: 202,
          bettingOpen: true,
          viewerWager: null,
        },
        preview: {
          selectedSide: "left",
          winnerStakeWolo: 40,
          desyncSide: "yes",
          desyncStakeWolo: 10,
          desyncMarketId: 202,
          financiallyCommitted: false,
        },
      }),
    ),
    {
      ok: true,
      selection: {
        marketId: 101,
        side: "left",
        stake: 40,
        desync: {
          marketId: 202,
          side: "right",
          stake: 10,
        },
      },
      totalStakeWolo: 50,
    },
  );
});

test("Desync NO maps to the current left-side NO book", () => {
  const result = planAutoBetPreviewSlip(
    base({
      desyncMarket: {
        id: 202,
        bettingOpen: true,
        viewerWager: null,
      },
      preview: {
        selectedSide: "right",
        winnerStakeWolo: 30,
        desyncSide: "no",
        desyncStakeWolo: 7,
        desyncMarketId: 202,
        financiallyCommitted: false,
      },
    }),
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.selection.desync?.side, "left");
  assert.equal(result.totalStakeWolo, 37);
});

test("preview loading fails closed when current market truth no longer matches", () => {
  assert.deepEqual(
    planAutoBetPreviewSlip(base({ bettingOpen: false })),
    { ok: false, blocker: "winner_market_closed" },
  );

  assert.deepEqual(
    planAutoBetPreviewSlip(
      base({
        viewerWager: { side: "right" },
      }),
    ),
    { ok: false, blocker: "winner_wager_already_exists" },
  );

  assert.deepEqual(
    planAutoBetPreviewSlip(
      base({
        desyncMarket: {
          id: 999,
          bettingOpen: true,
          viewerWager: null,
        },
        preview: {
          selectedSide: "right",
          winnerStakeWolo: 25,
          desyncSide: "yes",
          desyncStakeWolo: 10,
          desyncMarketId: 202,
          financiallyCommitted: false,
        },
      }),
    ),
    { ok: false, blocker: "desync_market_changed" },
  );
});

test("preview loading never clamps a stale amount; it rejects current cap violations", () => {
  assert.deepEqual(
    planAutoBetPreviewSlip(
      base({
        preview: {
          selectedSide: "right",
          winnerStakeWolo: 51,
          desyncSide: "none",
          desyncStakeWolo: 0,
          desyncMarketId: null,
          financiallyCommitted: false,
        },
        maxStakeWolo: 50,
      }),
    ),
    { ok: false, blocker: "winner_stake_exceeds_current_limit" },
  );

  assert.deepEqual(
    planAutoBetPreviewSlip(
      base({
        desyncMarket: {
          id: 202,
          bettingOpen: true,
          viewerWager: null,
        },
        preview: {
          selectedSide: "left",
          winnerStakeWolo: 45,
          desyncSide: "no",
          desyncStakeWolo: 10,
          desyncMarketId: 202,
          financiallyCommitted: false,
        },
        maxStakeWolo: 50,
      }),
    ),
    { ok: false, blocker: "combined_stake_exceeds_current_limit" },
  );
});

test("only pristine shadow evidence can be loaded", () => {
  assert.deepEqual(
    planAutoBetPreviewSlip(
      base({
        preview: {
          selectedSide: "left",
          winnerStakeWolo: 25,
          desyncSide: "none",
          desyncStakeWolo: 0,
          desyncMarketId: null,
          financiallyCommitted: true,
        },
      }),
    ),
    { ok: false, blocker: "preview_not_shadow_only" },
  );
});

test("blocker labels remain explicit enough for a disabled manual-load button", () => {
  assert.match(
    autoBetPreviewSlipBlockerLabel("desync_market_changed"),
    /not the one recorded by Auto Bet/i,
  );
  assert.match(
    autoBetPreviewSlipBlockerLabel("combined_stake_exceeds_current_limit"),
    /Winner \+ Desync total/i,
  );
});

test("Betting Hall load action is local Bet Slip state only", () => {
  const page = readFileSync(
    new URL("../app/bets/page.tsx", import.meta.url),
    "utf8",
  );

  const start = page.indexOf("function ViewerAutoBetPreviewRail({");
  const end = page.indexOf("function DesyncTicketLeg({", start);
  assert.ok(start >= 0);
  assert.ok(end > start);

  const rail = page.slice(start, end);

  assert.match(rail, /planAutoBetPreviewSlip/);
  assert.match(rail, /Load Preview into Bet Slip/);
  assert.match(rail, /onLoadSelection\(loadPlan\.selection\)/);
  assert.match(rail, /Copies the frozen preview only\. Nothing is signed or submitted\./);
  assert.match(rail, /financially committed: no/);

  assert.doesNotMatch(rail, /fetch\(/);
  assert.doesNotMatch(rail, /prepareStakeTicket/);
  assert.doesNotMatch(rail, /createStakeIntent/);
  assert.doesNotMatch(rail, /connectKeplr/);
  assert.doesNotMatch(rail, /sendTokens/);
  assert.doesNotMatch(rail, /handleLock/);
});

test("all Betting Hall presentation modes thread one page-owned preview loader", () => {
  const page = readFileSync(
    new URL("../app/bets/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(page, /onLoadAutoBetPreview: \(selection: SelectionState\) => void/);
  assert.ok((page.match(/onLoadAutoBetPreview=/g) || []).length >= 8);
  assert.ok((page.match(/<ViewerAutoBetPreviewRail/g) || []).length >= 4);
});
