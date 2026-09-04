import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateWatcherTerminalParserStability,
  WATCHER_TERMINAL_PARSER_STABILITY_POLICY_VERSION,
} from "../lib/watcherTerminalParserStability.ts";

const replayHash =
  "a".repeat(64);

function pass8() {
  return {
    id: 1,
    artifactSha256:
      replayHash,
    parserName:
      "aoe2war.mgz_hd",
    parserVersion:
      "1.8.51",
    passName:
      "hd_deterministic_evidence",
    passVersion:
      "8",
    status:
      "completed",
    candidateOnly:
      true,
    affectsPublicAggregates:
      false,
    activityObservationId:
      99,
    activityObservationFieldPath:
      "actions.raw_activity_by_player",
  };
}

test(
  "legacy parse iteration remains accepted",
  () => {
    const result =
      evaluateWatcherTerminalParserStability({
        parseIteration: 2,
        replayHash,
      });

    assert.equal(
      result.stable,
      true
    );

    if (!result.stable) return;

    assert.equal(
      result.evidence.source,
      "legacy_game_stats_parse_iteration"
    );
  },
);

test(
  "exact deterministic pass 8 is accepted",
  () => {
    const result =
      evaluateWatcherTerminalParserStability({
        parseIteration: 1,
        replayHash,
        parseRun:
          pass8(),
      });

    assert.equal(
      result.stable,
      true
    );

    if (!result.stable) return;

    assert.equal(
      result.evidence.source,
      "deterministic_replay_parse_run"
    );

    assert.equal(
      (
        result.evidence as {
          policyVersion?: unknown;
        }
      ).policyVersion,
      WATCHER_TERMINAL_PARSER_STABILITY_POLICY_VERSION
    );
  },
);

test(
  "replay hash mismatch fails closed",
  () => {
    const parseRun =
      pass8();

    parseRun.artifactSha256 =
      "b".repeat(64);

    assert.equal(
      evaluateWatcherTerminalParserStability({
        parseIteration: 1,
        replayHash,
        parseRun,
      }).stable,
      false
    );
  },
);

test(
  "pass 6 fails closed",
  () => {
    const parseRun =
      pass8();

    parseRun.passVersion =
      "6";

    assert.equal(
      evaluateWatcherTerminalParserStability({
        parseIteration: 1,
        replayHash,
        parseRun,
      }).stable,
      false
    );
  },
);

test(
  "public-affecting parse run fails closed",
  () => {
    const parseRun =
      pass8();

    parseRun.affectsPublicAggregates =
      true;

    assert.equal(
      evaluateWatcherTerminalParserStability({
        parseIteration: 1,
        replayHash,
        parseRun,
      }).stable,
      false
    );
  },
);
