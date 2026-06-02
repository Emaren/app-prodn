import assert from "node:assert/strict";
import test from "node:test";

import { derivePendingSettlementActivityGroups } from "../lib/mainnetSettlementActivity.ts";

test("pending settlement activity groups no-tx market claims without pretending they are chain txs", () => {
  const rows = derivePendingSettlementActivityGroups(
    [
      {
        id: 338,
        sourceMarketId: 38246,
        marketTitle: "Emaren vs Coco de Hae",
        eventLabel: "Watcher Final · Yucatan",
        winnerName: "Coco de Hae",
        displayPlayerName: "Coco de Hae",
        amountWolo: 300,
        claimKind: "founders_win",
        status: "pending",
        errorState:
          "Awaiting verified wallet-linked account for winner target \"Coco de Hae\".",
        payoutTxHash: null,
        payoutAttemptedAt: null,
        createdAt: "2026-06-01T01:09:51.504Z",
        updatedAt: "2026-06-01T01:09:51.504Z",
      },
      {
        id: 337,
        sourceMarketId: 38246,
        marketTitle: "Emaren vs Coco de Hae",
        eventLabel: "Watcher Final · Yucatan",
        winnerName: "Coco de Hae",
        displayPlayerName: "Coco de Hae",
        amountWolo: 100,
        claimKind: "founders_bonus",
        status: "pending",
        errorState:
          "Awaiting verified wallet-linked account for right-side target \"Coco de Hae\".",
        payoutTxHash: null,
        payoutAttemptedAt: null,
        createdAt: "2026-06-01T01:09:51.502Z",
        updatedAt: "2026-06-01T01:09:51.502Z",
      },
      {
        id: 336,
        sourceMarketId: 38246,
        marketTitle: "Emaren vs Coco de Hae",
        eventLabel: "Watcher Final · Yucatan",
        winnerName: "Coco de Hae",
        displayPlayerName: "Emaren",
        amountWolo: 100,
        claimKind: "founders_bonus",
        status: "pending",
        errorState: "Settlement execution is not configured in this environment.",
        payoutTxHash: null,
        payoutAttemptedAt: "2026-06-01T01:09:51.014Z",
        createdAt: "2026-06-01T01:09:51.496Z",
        updatedAt: "2026-06-01T01:09:51.496Z",
      },
      {
        id: 333,
        sourceMarketId: 38106,
        marketTitle: "Emaren vs drhayatiozer",
        eventLabel: "Watcher Final · Yucatan",
        winnerName: "drhayatiozer",
        displayPlayerName: "Emaren",
        amountWolo: 100,
        claimKind: "founders_bonus",
        status: "claimed",
        errorState: null,
        payoutTxHash: "5EC941E589E912C624FAD918977B52FF44BD431C25CDEB5044022148D2857BD3",
        payoutAttemptedAt: "2026-05-07T22:54:27.529Z",
        createdAt: "2026-05-07T22:54:30.149Z",
        updatedAt: "2026-05-07T22:54:30.149Z",
      },
    ],
    { limit: 4 }
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].key, "settlement-queue-market-38246");
  assert.equal(rows[0].marketTitle, "Emaren vs Coco de Hae");
  assert.equal(rows[0].amountWolo, 500);
  assert.equal(rows[0].claimCount, 3);
  assert.equal(rows[0].awaitingWalletCount, 2);
  assert.equal(rows[0].failureCount, 1);
  assert.deepEqual(rows[0].targetNames, ["Coco de Hae", "Emaren"]);
  assert.deepEqual(rows[0].awaitingWalletTargetNames, ["Coco de Hae"]);
});
