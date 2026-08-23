import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import test from "node:test";

import {
  deriveChallengeFinancialConservation,
  effectiveChallengeSettlementRows,
  historicalChallengeSettlementExecutedWolo,
} from "../lib/challengeFinancialConservation.ts";

test(
  "Challenge #12 ledger shape can never settle again",
  () => {
    const conservation =
      deriveChallengeFinancialConservation({
        fundingEachWolo: 1010,
        leftFunded: true,
        rightFunded: true,

        settlements: [
          {
            status: "executed",
            amountWolo: 1000,
          },
          {
            status: "executed",
            amountWolo: 10,
          },
          {
            status: "executed",
            amountWolo: 1010,
          },
          {
            status: "executed",
            amountWolo: 1000,
          },
          {
            status: "executed",
            amountWolo: 10,
          },
          {
            status: "executed",
            amountWolo: 10,
          },
        ],

        pendingPlanWolo: 0,
      });

    assert.equal(
      conservation.fundedLiabilityWolo,
      2020,
    );

    assert.equal(
      conservation.historicalExecutedWolo,
      3040,
    );

    assert.equal(
      conservation.overSettledWolo,
      1020,
    );

    assert.equal(
      conservation.ok,
      false,
    );

    assert.match(
      conservation.blockers[0],
      /FINANCIAL CONSERVATION BREACH/,
    );
  },
);

test(
  "a renamed planner cannot consume already-executed principal",
  () => {
    const conservation =
      deriveChallengeFinancialConservation({
        fundingEachWolo: 1010,
        leftFunded: true,
        rightFunded: true,

        settlements: [
          {
            status: "executed",
            amountWolo: 1000,
          },
          {
            status: "executed",
            amountWolo: 10,
          },
          {
            status: "executed",
            amountWolo: 1010,
          },
        ],

        /*
         * A later planner invents different action labels
         * totaling another 1,020 WOLO.
         */
        pendingPlanWolo: 1020,
      });

    assert.equal(
      conservation.historicalExecutedWolo,
      2020,
    );

    assert.equal(
      conservation.projectedSettlementWolo,
      3040,
    );

    assert.equal(
      conservation.projectedOverageWolo,
      1020,
    );

    assert.equal(
      conservation.ok,
      false,
    );

    assert.match(
      conservation.blockers[0],
      /FINANCIAL CONSERVATION BLOCK/,
    );
  },
);

test(
  "Challenge #22 superseded plan is historical only",
  () => {
    const rows = [
      {
        status: "superseded",
        amountWolo: 35,
      },
      {
        status: "executed",
        amountWolo: 35,
        txHash: "CHAIN_PROOF",
      },
    ];

    assert.deepEqual(
      effectiveChallengeSettlementRows(
        rows,
      ),
      [
        {
          status: "executed",
          amountWolo: 35,
          txHash: "CHAIN_PROOF",
        },
      ],
    );

    const conservation =
      deriveChallengeFinancialConservation({
        fundingEachWolo: 35,
        leftFunded: true,
        rightFunded: false,
        settlements: rows,
        pendingPlanWolo: 0,
      });

    assert.equal(
      conservation.ok,
      true,
    );

    assert.equal(
      conservation.remainingLiabilityWolo,
      0,
    );
  },
);

test(
  "Challenge #23 is a valid outstanding 35 WOLO liability",
  () => {
    const conservation =
      deriveChallengeFinancialConservation({
        fundingEachWolo: 35,
        leftFunded: true,
        rightFunded: false,
        settlements: [],
        pendingPlanWolo: 35,
      });

    assert.equal(
      conservation.fundedLiabilityWolo,
      35,
    );

    assert.equal(
      conservation.historicalExecutedWolo,
      0,
    );

    assert.equal(
      conservation.projectedSettlementWolo,
      35,
    );

    assert.equal(
      conservation.ok,
      true,
    );
  },
);

test(
  "ledger execution consumes liability even when external tx proof disappears",
  () => {
    assert.equal(
      historicalChallengeSettlementExecutedWolo(
        [
          {
            status: "executed",
            amountWolo: 500,
            txHash: null,
          },
        ],
      ),
      500,
    );
  },
);

test(
  "settlement execution is fenced by historical conservation under the existing lock",
  () => {
    const source =
      readFileSync(
        "lib/scheduledMatchSettlements.ts",
        "utf8",
      );

    assert.match(
      source,
      /deriveChallengeFinancialConservation/,
    );

    assert.match(
      source,
      /historicalExecutedWolo/,
    );

    assert.match(
      source,
      /pendingPlanWolo/,
    );

    assert.match(
      source,
      /blockers\.unshift/,
    );

    /*
     * The plan is rebuilt inside the existing
     * per-Challenge advisory-lock transaction before
     * execution starts.
     */
    assert.match(
      source,
      /pg_advisory_xact_lock/,
    );

    assert.match(
      source,
      /const plan = await loadSingleSettlementPlan\(tx, matchId\)/,
    );

    assert.match(
      source,
      /assertExecutablePlan\(plan\)/,
    );
  },
);

test(
  "public money state excludes superseded plans and fails closed on conservation anomalies",
  () => {
    const source =
      readFileSync(
        "lib/challenges.ts",
        "utf8",
      );

    assert.match(
      source,
      /effectiveChallengeSettlementRows/,
    );

    assert.match(
      source,
      /if \(!conservation\.ok\)/,
    );

    assert.match(
      source,
      /state =\s*"settlement_failed"/,
    );
  },
);
