import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import test from "node:test";

import {
  challengeSourceAllocationsEqual,
  reconcileChallengeSettlementSourceAccounting,
} from "../lib/challengeEscrowAccounting.ts";

const schema =
  readFileSync(
    "prisma/schema.prisma",
    "utf8",
  );

const migration =
  readFileSync(
    "prisma/migrations/20260823202000_challenge_settlement_allocations_v3/migration.sql",
    "utf8",
  );

const runtime =
  readFileSync(
    "lib/scheduledMatchSettlements.ts",
    "utf8",
  );


test(
  "Prisma models immutable settlement source allocations",
  () => {
    assert.match(
      schema,
      /model ScheduledMatchSettlementAllocation/,
    );

    assert.match(
      schema,
      /sourceSide/,
    );

    assert.match(
      schema,
      /sourceBucket/,
    );

    assert.match(
      schema,
      /amountWolo/,
    );

    assert.match(
      schema,
      /allocationVersion/,
    );

    assert.match(
      schema,
      /allocations\s+ScheduledMatchSettlementAllocation\[\]/,
    );
  },
);


test(
  "migration requires exact historical decomposition",
  () => {
    assert.match(
      migration,
      /Challenge V3 allocation backfill failed/,
    );

    assert.match(
      migration,
      /creator_timeout_refund/,
    );

    assert.match(
      migration,
      /right_wager_guarantee_refund/,
    );

    assert.match(
      migration,
      /guarantees_to_treasury/,
    );
  },
);


test(
  "persisted allocation rows cannot be updated",
  () => {
    assert.match(
      migration,
      /BEFORE UPDATE/,
    );

    assert.match(
      migration,
      /scheduled_match_settlement_allocations are immutable/,
    );
  },
);


test(
  "allocation equality ignores row ordering but not economic meaning",
  () => {
    const left = [
      {
        side:
          "left" as const,

        bucket:
          "wager" as const,

        amountWolo:
          25,
      },

      {
        side:
          "left" as const,

        bucket:
          "guarantee" as const,

        amountWolo:
          10,
      },
    ];

    const reversed = [
      left[1],
      left[0],
    ];

    assert.equal(
      challengeSourceAllocationsEqual(
        left,
        reversed,
      ),
      true,
    );

    assert.equal(
      challengeSourceAllocationsEqual(
        left,
        [
          {
            side:
              "right",

            bucket:
              "wager",

            amountWolo:
              25,
          },

          {
            side:
              "left",

            bucket:
              "guarantee",

            amountWolo:
              10,
          },
        ],
      ),
      false,
    );
  },
);


test(
  "persisted economic identity overrides future action wording",
  () => {
    const result =
      reconcileChallengeSettlementSourceAccounting({
        wagerAmountWolo:
          25,

        guaranteeAmountWolo:
          10,

        leftFunded:
          true,

        rightFunded:
          false,

        settlements: [
          {
            id:
              77,

            status:
              "executed",

            /*
             * Deliberately meaningless future wording.
             */
            action:
              "completely_renamed_action",

            recipientAddress:
              "left",

            amountWolo:
              35,

            txHash:
              "CHAIN_PROOF",

            sourceAllocations: [
              {
                side:
                  "left",

                bucket:
                  "wager",

                amountWolo:
                  25,
              },

              {
                side:
                  "left",

                bucket:
                  "guarantee",

                amountWolo:
                  10,
              },
            ],
          },
        ],

        transfers:
          [],
      });

    assert.equal(
      result.ok,
      true,
    );

    assert.equal(
      result.executedSourceWolo,
      35,
    );

    assert.equal(
      result
        .sourceConsumptionWolo[
          "left:wager"
        ],
      25,
    );

    assert.equal(
      result
        .sourceConsumptionWolo[
          "left:guarantee"
        ],
      10,
    );
  },
);


test(
  "explicitly missing persisted allocation fails closed",
  () => {
    const result =
      reconcileChallengeSettlementSourceAccounting({
        wagerAmountWolo:
          25,

        guaranteeAmountWolo:
          10,

        leftFunded:
          true,

        rightFunded:
          false,

        settlements: [
          {
            id:
              88,

            status:
              "executed",

            action:
              "left_full_refund",

            recipientAddress:
              "left",

            amountWolo:
              35,

            txHash:
              "CHAIN_PROOF",

            /*
             * Loaded V3 history with no persisted identity
             * may not silently fall back to action inference.
             */
            sourceAllocations:
              [],
          },
        ],

        transfers:
          [],
      });

    assert.equal(
      result.ok,
      false,
    );

    assert.equal(
      result.unclassifiedExecutedWolo,
      35,
    );
  },
);


test(
  "runtime loads persisted allocations from Prisma",
  () => {
    assert.match(
      runtime,
      /allocations:\s*\{[\s\S]*sourceSide:[\s\S]*sourceBucket:[\s\S]*amountWolo:/,
    );
  },
);


test(
  "runtime refuses missing or mismatched persisted obligation identity",
  () => {
    assert.match(
      runtime,
      /PERSISTED ESCROW ALLOCATION MISSING/,
    );

    assert.match(
      runtime,
      /PERSISTED ESCROW ALLOCATION MISMATCH/,
    );

    assert.match(
      runtime,
      /challengeSourceAllocationsEqual/,
    );
  },
);


test(
  "new settlement and allocations are created atomically",
  () => {
    assert.match(
      runtime,
      /scheduledMatchSettlement\.upsert/,
    );

    assert.match(
      runtime,
      /allocations:\s*\{\s*create:/,
    );

    assert.match(
      runtime,
      /allocationVersion:\s*1/,
    );
  },
);
