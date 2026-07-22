import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { scheduledMatchSettlementRequiresWinnerDesyncGuard } from "../lib/scheduledMatchSettlements.ts";

test("scheduled-match desync guard applies only to competitive winner settlement", () => {
  assert.equal(scheduledMatchSettlementRequiresWinnerDesyncGuard("completed"), true);
  assert.equal(scheduledMatchSettlementRequiresWinnerDesyncGuard("COMPLETED"), true);

  for (const refundStatus of [
    "cancelled",
    "canceled",
    "expired",
    "funding_expired",
    "double_no_show",
    "no_show_left",
    "no_show_right",
  ]) {
    assert.equal(
      scheduledMatchSettlementRequiresWinnerDesyncGuard(refundStatus),
      false,
      `${refundStatus} must remain on the existing refund/forfeit rail`
    );
  }
});

test("every winner-value and title mutation rail invokes the shared desync policy", async () => {
  const [challenges, scheduledSettlements, trophies, bets] = await Promise.all([
    readFile(new URL("../lib/challenges.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/scheduledMatchSettlements.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/trophies/actions.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/bets.ts", import.meta.url), "utf8"),
  ]);

  assert.match(challenges, /assertWinnerSettlementAllowed\(\{/);
  assert.match(challenges, /assertTitleTransferAllowed\(\{/);
  assert.match(scheduledSettlements, /assertLockedWinnerSettlementAllowed\(tx, matchId\)/);
  assert.match(trophies, /assertTrophyChallengeDesyncAllowsTitleMutation\(tx, challenge\)/);
  assert.match(bets, /assertOrdinaryBetMarketWinnerPayoutAllowedFromDb\(\{/);
  assert.match(bets, /data: planBetMarketDesyncReview\(\)/);
});
