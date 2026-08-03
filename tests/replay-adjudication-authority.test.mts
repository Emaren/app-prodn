import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveReplayWinnerTruth,
  resolveReliableReplayWinner,
} from "../lib/unresolvedWatcherResult.ts";

function adjudicationEvidence(
  winningPlayerKeys: string[],
  overrides: Record<string, unknown> = {}
) {
  return {
    adjudication_id: 77,
    idempotency_key:
      "manual:test-adjudication:v1",
    winning_team_key:
      "winning-side",
    winning_player_keys:
      winningPlayerKeys,
    decision_status:
      "accepted",
    affects_stats:
      true,
    affects_bets:
      false,
    ...overrides,
  };
}

test(
  "accepted team adjudication authorizes the complete winning side for statistics only",
  () => {
    const truth =
      resolveReplayWinnerTruth({
        winner:
          "CAPT BLACKADDER",

        players: [
          { name: "Jim", winner: true },
          { name: "Dil_Pascana", winner: true },
          { name: "CAPT BLACKADDER", winner: true },
          { name: "Albannach55", winner: false },
          { name: "anyix3", winner: false },
          { name: "top", winner: false },
        ],

        parseReason:
          "manual_result_adjudication",

        parseSource:
          "replay_result_review",

        keyEvents: {
          replay_result_adjudication:
            adjudicationEvidence([
              "steam:jim",
              "steam:dil",
              "steam:blackadder",
            ]),
        },
      });

    assert.equal(
      truth.winner,
      "Jim / Dil_Pascana / CAPT BLACKADDER"
    );
    assert.equal(truth.statsEligible, true);
    assert.equal(truth.bettingEligible, false);
    assert.deepEqual(
      truth.truthReasons,
      ["accepted_result_adjudication"]
    );
  }
);

test(
  "accepted stats-only adjudication can correct a raw disconnect result without changing betting authority",
  () => {
    const input = {
      winner:
        "Julio Alvarez",

      players: [
        { name: "Emaren", winner: false },
        { name: "Julio Alvarez", winner: true },
      ],

      parseReason:
        "manual_result_adjudication",

      parseSource:
        "replay_result_review",

      disconnectDetected:
        true,

      keyEvents: {
        replay_result_adjudication:
          adjudicationEvidence([
            "steam:76561198190973517",
          ]),
      },
    };

    const truth =
      resolveReplayWinnerTruth(input);

    assert.equal(
      truth.winner,
      "Julio Alvarez"
    );
    assert.equal(truth.statsEligible, true);
    assert.equal(truth.bettingEligible, false);
    assert.equal(
      resolveReliableReplayWinner(input),
      "Julio Alvarez"
    );
  }
);

test(
  "nonaccepted or nonstatistics adjudication markers fail closed",
  () => {
    for (
      const overrides
      of [
        {
          decision_status:
            "pending_admin_approval",
        },
        {
          affects_stats:
            false,
        },
      ]
    ) {
      const truth =
        resolveReplayWinnerTruth({
          winner:
            "Julio Alvarez",

          players: [
            { name: "Emaren", winner: false },
            { name: "Julio Alvarez", winner: true },
          ],

          parseReason:
            "manual_result_adjudication",

          parseSource:
            "replay_result_review",

          disconnectDetected:
            true,

          keyEvents: {
            replay_result_adjudication:
              adjudicationEvidence(
                [
                  "steam:76561198190973517",
                ],
                overrides
              ),
          },
        });

      assert.equal(truth.winner, null);
      assert.equal(truth.statsEligible, false);
    }
  }
);

test(
  "accepted adjudication requires a complete explicit true-false roster",
  () => {
    const truth =
      resolveReplayWinnerTruth({
        winner:
          "Julio Alvarez",

        players: [
          { name: "Emaren", winner: null },
          { name: "Julio Alvarez", winner: true },
        ],

        parseReason:
          "manual_result_adjudication",

        parseSource:
          "replay_result_review",

        keyEvents: {
          replay_result_adjudication:
            adjudicationEvidence([
              "steam:76561198190973517",
            ]),
        },
      });

    assert.equal(truth.winner, null);
    assert.equal(truth.statsEligible, false);
  }
);
