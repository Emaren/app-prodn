import assert from "node:assert/strict";
import test from "node:test";

import {
  warChestClaimCountsAsTake,
  warChestWagerTakeWolo,
} from "../lib/warChestWoloAccounting.ts";

test(
  "winning Take excludes returned principal",
  () => {
    assert.equal(
      warChestWagerTakeWolo({
        status: "won",
        amountWolo: 100,
        payoutWolo: 240,
      }),
      140,
    );

    assert.equal(
      warChestWagerTakeWolo({
        status: "won",
        amountWolo: 100,
        payoutWolo: 100,
      }),
      0,
    );
  },
);

test(
  "void/loss/refund rails produce no Take",
  () => {
    for (const status of [
      "void",
      "lost",
      "open",
    ]) {
      assert.equal(
        warChestWagerTakeWolo({
          status,
          amountWolo: 100,
          payoutWolo: 100,
        }),
        0,
      );
    }

    for (const kind of [
      "bet_payout",
      "bet_refund",
      "bet_corrective_refund",
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
