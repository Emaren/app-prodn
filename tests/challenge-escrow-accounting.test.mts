import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import test from "node:test";

import {
  challengeSettlementSourceAllocationsForAction,
  reconcileChallengeSettlementSourceAccounting,
  sumChallengeSourceAllocations,
} from "../lib/challengeEscrowAccounting.ts";

const TERMS = {
  wagerAmountWolo: 1000,
  guaranteeAmountWolo: 10,
  leftFunded: true,
  rightFunded: true,
};

function allocations(
  action: string,
  amountWolo: number,
) {
  return challengeSettlementSourceAllocationsForAction({
    ...TERMS,
    action,
    amountWolo,
  });
}

test(
  "every current Challenge settlement action declares its funded source principal",
  () => {
    const cases = [
      ["left_full_refund", 1010],
      ["right_full_refund", 1010],

      ["left_wager_refund", 1000],
      ["right_wager_refund", 1000],

      ["left_guarantee_return", 10],
      ["right_guarantee_return", 10],

      ["left_own_guarantee_return", 10],
      ["right_own_guarantee_return", 10],

      [
        "left_guarantee_awarded_to_right",
        10,
      ],

      [
        "right_guarantee_awarded_to_left",
        10,
      ],

      [
        "left_guarantee_to_treasury",
        10,
      ],

      [
        "right_guarantee_to_treasury",
        10,
      ],

      [
        "guarantees_to_treasury",
        20,
      ],

      [
        "left_winner_wager_award",
        2000,
      ],

      [
        "right_winner_wager_award",
        2000,
      ],
    ] as const;

    for (
      const [
        action,
        amountWolo,
      ]
      of cases
    ) {
      assert.equal(
        sumChallengeSourceAllocations(
          allocations(
            action,
            amountWolo,
          ),
        ),
        amountWolo,
        action,
      );
    }
  },
);

test(
  "legacy combined settlement can satisfy a later split planner without another spend",
  () => {
    const result =
      reconcileChallengeSettlementSourceAccounting({
        ...TERMS,

        settlements: [
          {
            id: 8,
            status: "executed",
            action:
              "right_wager_guarantee_refund",
            recipientAddress:
              "wolo-right",
            amountWolo: 1010,
            txHash: "CHAIN_PROOF",
          },
        ],

        transfers: [
          {
            label:
              "right wager refund",

            recipientAddress:
              "wolo-right",

            amountWolo: 1000,

            sourceAllocations:
              allocations(
                "right_wager_refund",
                1000,
              ),
          },

          {
            label:
              "right own match guarantee return",

            recipientAddress:
              "wolo-right",

            amountWolo: 10,

            sourceAllocations:
              allocations(
                "right_own_guarantee_return",
                10,
              ),
          },
        ],
      });

    assert.equal(
      result.ok,
      true,
    );

    assert.deepEqual(
      result.transferAccounting.map(
        (row) =>
          row.satisfiedByHistory,
      ),
      [
        true,
        true,
      ],
    );

    assert.deepEqual(
      result.transferAccounting[0]
        ?.satisfiedBySettlementIds,
      [8],
    );

    assert.deepEqual(
      result.transferAccounting[1]
        ?.satisfiedBySettlementIds,
      [8],
    );
  },
);

test(
  "same source bucket cannot be redirected after it was already consumed",
  () => {
    const result =
      reconcileChallengeSettlementSourceAccounting({
        ...TERMS,

        settlements: [
          {
            id: 7,
            status: "executed",

            action:
              "left_guarantee_to_treasury",

            recipientAddress:
              "wolo-treasury",

            amountWolo: 10,

            txHash:
              "CHAIN_PROOF",
          },
        ],

        transfers: [
          {
            label:
              "left missed-side match guarantee to right",

            recipientAddress:
              "wolo-right",

            amountWolo:
              10,

            sourceAllocations:
              allocations(
                "left_guarantee_awarded_to_right",
                10,
              ),
          },
        ],
      });

    assert.equal(
      result.ok,
      false,
    );

    assert.match(
      result.blockers.join(
        "\n",
      ),
      /ESCROW SOURCE CONFLICT/,
    );
  },
);

test(
  "Challenge #12 historical shape breaches individual source buckets",
  () => {
    const result =
      reconcileChallengeSettlementSourceAccounting({
        ...TERMS,

        settlements: [
          {
            id: 6,
            status: "executed",
            action:
              "left_wager_refund",
            recipientAddress:
              "left",
            amountWolo: 1000,
            txHash: "A",
          },

          {
            id: 7,
            status: "executed",
            action:
              "left_guarantee_to_treasury",
            recipientAddress:
              "treasury",
            amountWolo: 10,
            txHash: "B",
          },

          {
            id: 8,
            status: "executed",
            action:
              "right_wager_guarantee_refund",
            recipientAddress:
              "right",
            amountWolo: 1010,
            txHash: "C",
          },

          {
            id: 18,
            status: "executed",
            action:
              "right_wager_refund",
            recipientAddress:
              "right",
            amountWolo: 1000,
            txHash: "D",
          },

          {
            id: 19,
            status: "executed",
            action:
              "right_own_guarantee_return",
            recipientAddress:
              "right",
            amountWolo: 10,
            txHash: "E",
          },

          {
            id: 20,
            status: "executed",
            action:
              "left_guarantee_awarded_to_right",
            recipientAddress:
              "right",
            amountWolo: 10,
            txHash: "F",
          },
        ],

        transfers: [],
      });

    assert.equal(
      result.ok,
      false,
    );

    assert.equal(
      result.executedSourceWolo,
      3040,
    );

    assert.equal(
      result
        .sourceConsumptionWolo[
          "left:wager"
        ],
      1000,
    );

    assert.equal(
      result
        .sourceConsumptionWolo[
          "left:guarantee"
        ],
      20,
    );

    assert.equal(
      result
        .sourceConsumptionWolo[
          "right:wager"
        ],
      2000,
    );

    assert.equal(
      result
        .sourceConsumptionWolo[
          "right:guarantee"
        ],
      20,
    );

    assert.match(
      result.blockers.join(
        "\n",
      ),
      /left:guarantee records 20 WOLO consumed against 10 WOLO funded/,
    );

    assert.match(
      result.blockers.join(
        "\n",
      ),
      /right:wager records 2,000 WOLO consumed against 1,000 WOLO funded/,
    );

    assert.match(
      result.blockers.join(
        "\n",
      ),
      /right:guarantee records 20 WOLO consumed against 10 WOLO funded/,
    );
  },
);

test(
  "unknown future settlement actions fail closed until source semantics are defined",
  () => {
    const unknown =
      challengeSettlementSourceAllocationsForAction({
        ...TERMS,

        action:
          "future_magic_bonus",

        amountWolo:
          250,
      });

    assert.deepEqual(
      unknown,
      [],
    );

    const result =
      reconcileChallengeSettlementSourceAccounting({
        ...TERMS,

        settlements: [
          {
            id: 999,
            status:
              "executed",

            action:
              "future_magic_bonus",

            recipientAddress:
              "somebody",

            amountWolo:
              250,

            txHash:
              "CHAIN_PROOF",
          },
        ],

        transfers: [],
      });

    assert.equal(
      result.ok,
      false,
    );

    assert.equal(
      result
        .unclassifiedExecutedWolo,
      250,
    );

    assert.match(
      result.blockers[0] || "",
      /cannot be mapped exactly/,
    );
  },
);

test(
  "an executed row without tx proof consumes principal but blocks settlement",
  () => {
    const result =
      reconcileChallengeSettlementSourceAccounting({
        ...TERMS,

        settlements: [
          {
            id: 1000,

            status:
              "executed",

            action:
              "left_wager_refund",

            recipientAddress:
              "left",

            amountWolo:
              1000,

            txHash:
              null,
          },
        ],

        transfers: [],
      });

    assert.equal(
      result.ok,
      false,
    );

    assert.equal(
      result
        .unprovenExecutedWolo,
      1000,
    );

    assert.match(
      result.blockers[0] || "",
      /has no transaction hash/,
    );
  },
);

test(
  "combined transfer cannot replay an already consumed component",
  () => {
    const result =
      reconcileChallengeSettlementSourceAccounting({
        ...TERMS,

        settlements: [
          {
            id: 1,
            status:
              "executed",

            action:
              "right_wager_refund",

            recipientAddress:
              "right",

            amountWolo:
              1000,

            txHash:
              "CHAIN_PROOF",
          },
        ],

        transfers: [
          {
            label:
              "right combined refund",

            recipientAddress:
              "right",

            amountWolo:
              1010,

            sourceAllocations:
              allocations(
                "right_full_refund",
                1010,
              ),
          },
        ],
      });

    assert.equal(
      result.ok,
      false,
    );

    assert.match(
      result.blockers.join(
        "\n",
      ),
      /ESCROW SOURCE PARTIAL/,
    );
  },
);

test(
  "scheduled settlement execution uses source accounting before any grouped Wolo run",
  () => {
    const source =
      readFileSync(
        "lib/scheduledMatchSettlements.ts",
        "utf8",
      );

    assert.match(
      source,
      /reconcileChallengeSettlementSourceAccounting/,
    );

    assert.match(
      source,
      /sourceAllocations/,
    );

    assert.match(
      source,
      /satisfiedByHistory/,
    );

    assert.match(
      source,
      /sourceAccounting\.blockers/,
    );

    assert.match(
      source,
      /sumChallengeSourceAllocations/,
    );

    /*
     * Economic historical satisfaction must participate in
     * the same execution predicate used to construct the
     * grouped Wolo run.
     */
    assert.match(
      source,
      /sourceAccounting[\s\S]*satisfiedByHistory/,
    );

    assert.match(
      source,
      /plan\.transfers\.filter\(\(transfer\) => !isTransferExecuted\(transfer\)\)/,
    );
  },
);
