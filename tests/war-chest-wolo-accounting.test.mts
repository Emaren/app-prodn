import assert from "node:assert/strict";
import test from "node:test";

import {
  warChestClaimCountsAsTake,
  warChestWagerEarnedWolo,
  warChestWagerTakeWolo,
} from "../lib/warChestWoloAccounting.ts";

test(
  "winning Take is gross payout while Earned excludes returned principal",
  () => {
    const winning = {
      status: "won",
      amountWolo: 100,
      payoutWolo: 240,
    };

    assert.equal(
      warChestWagerTakeWolo(winning),
      240,
    );
    assert.equal(
      warChestWagerEarnedWolo(winning),
      140,
    );

    const principalOnlyWin = {
      status: "won",
      amountWolo: 100,
      payoutWolo: 100,
    };

    assert.equal(
      warChestWagerTakeWolo(principalOnlyWin),
      100,
    );
    assert.equal(
      warChestWagerEarnedWolo(principalOnlyWin),
      0,
    );
  },
);

test(
  "void/loss/refund rails produce neither Take nor Earned",
  () => {
    for (const status of [
      "void",
      "lost",
      "open",
    ]) {
      const wager = {
        status,
        amountWolo: 100,
        payoutWolo: 100,
      };

      assert.equal(
        warChestWagerTakeWolo(wager),
        0,
      );
      assert.equal(
        warChestWagerEarnedWolo(wager),
        0,
      );
    }

    for (const kind of [
      "bet_payout",
      "bet_refund",
      "bet_corrective_refund",
      "bet_unmatched_refund",
    ]) {
      assert.equal(
        warChestClaimCountsAsTake(
          kind,
        ),
        false,
        kind,
      );
    }
  },
);
