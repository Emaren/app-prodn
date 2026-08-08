import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveScreenshotAutoVerdictEvidence,
} from "../lib/screenshotAutoVerdictPolicy.ts";

const EMAREN =
  "steam:76561198065420384";

const TACHI =
  "steam:76561199171957853";

const CONDORITO =
  "steam:76561198860807055";

function observation(
  value: unknown,
  confidenceBps: number
) {
  return {
    value,
    confidenceBps,
  };
}

test(
  "canonical two-player duel accepts explicit winner when screenshot team symbols are unclear",
  () => {
    const result =
      resolveScreenshotAutoVerdictEvidence({
        teamAssessment:
          observation(
            {
              status:
                "unclear",
              confidence:
                55,
              teams: [],
            },
            5500
          ),
        winnerAssessment:
          observation(
            {
              status:
                "confirmed",
              confidence:
                99,
              winningPlayerNames: [
                "TACHI",
              ],
              losingPlayerNames: [
                "Emaren",
              ],
            },
            9900
          ),
        winningKeysObservation:
          observation(
            [TACHI],
            9900
          ),
        teamsObservation:
          undefined,
        canonicalRoster: [
          {
            stablePlayerKey:
              EMAREN,
            normalizedName:
              "emaren",
          },
          {
            stablePlayerKey:
              TACHI,
            normalizedName:
              "tachi",
          },
        ],
      });

    assert.equal(
      result.outcome,
      "eligible"
    );

    if (
      result.outcome !==
      "eligible"
    ) {
      return;
    }

    assert.equal(
      result.teamResolutionMode,
      "canonical_duel_singletons"
    );

    assert.deepEqual(
      result.evidenceTeams,
      [
        [EMAREN],
        [TACHI],
      ]
    );

    assert.equal(
      result.winningTeamIndex,
      1
    );
  }
);

test(
  "normal high-confidence screenshot teams remain eligible",
  () => {
    const result =
      resolveScreenshotAutoVerdictEvidence({
        teamAssessment:
          observation(
            {
              status:
                "observed",
              confidence:
                90,
            },
            9000
          ),
        winnerAssessment:
          observation(
            {
              status:
                "confirmed",
              confidence:
                94,
              winningPlayerNames: [
                "Condorito",
              ],
              losingPlayerNames: [
                "Emaren",
              ],
            },
            9400
          ),
        winningKeysObservation:
          observation(
            [CONDORITO],
            9400
          ),
        teamsObservation:
          observation(
            {
              teams: [
                {
                  player_keys: [
                    EMAREN,
                  ],
                },
                {
                  player_keys: [
                    CONDORITO,
                  ],
                },
              ],
            },
            9000
          ),
        canonicalRoster: [
          {
            stablePlayerKey:
              EMAREN,
            normalizedName:
              "emaren",
          },
          {
            stablePlayerKey:
              CONDORITO,
            normalizedName:
              "condorito",
          },
        ],
      });

    assert.equal(
      result.outcome,
      "eligible"
    );

    if (
      result.outcome !==
      "eligible"
    ) {
      return;
    }

    assert.equal(
      result.teamResolutionMode,
      "screenshot_teams"
    );

    assert.equal(
      result.winningTeamIndex,
      1
    );
  }
);

test(
  "duel fallback rejects merely observed winner evidence",
  () => {
    const result =
      resolveScreenshotAutoVerdictEvidence({
        teamAssessment:
          observation(
            {
              status:
                "unclear",
            },
            5500
          ),
        winnerAssessment:
          observation(
            {
              status:
                "observed",
              winningPlayerNames: [
                "TACHI",
              ],
              losingPlayerNames: [
                "Emaren",
              ],
            },
            9900
          ),
        winningKeysObservation:
          observation(
            [TACHI],
            9900
          ),
        teamsObservation:
          undefined,
        canonicalRoster: [
          {
            stablePlayerKey:
              EMAREN,
            normalizedName:
              "emaren",
          },
          {
            stablePlayerKey:
              TACHI,
            normalizedName:
              "tachi",
          },
        ],
      });

    assert.deepEqual(
      result,
      {
        outcome:
          "review_required",
        reason:
          "team_not_confirmed_and_duel_fallback_not_eligible",
      }
    );
  }
);

test(
  "duel fallback never expands to team games",
  () => {
    const result =
      resolveScreenshotAutoVerdictEvidence({
        teamAssessment:
          observation(
            {
              status:
                "unclear",
            },
            5500
          ),
        winnerAssessment:
          observation(
            {
              status:
                "confirmed",
              winningPlayerNames: [
                "TACHI",
              ],
              losingPlayerNames: [
                "Emaren",
              ],
            },
            9900
          ),
        winningKeysObservation:
          observation(
            [TACHI],
            9900
          ),
        teamsObservation:
          undefined,
        canonicalRoster: [
          {
            stablePlayerKey:
              EMAREN,
            normalizedName:
              "emaren",
          },
          {
            stablePlayerKey:
              TACHI,
            normalizedName:
              "tachi",
          },
          {
            stablePlayerKey:
              "steam:3",
            normalizedName:
              "three",
          },
          {
            stablePlayerKey:
              "steam:4",
            normalizedName:
              "four",
          },
        ],
      });

    assert.equal(
      result.outcome,
      "review_required"
    );
  }
);
