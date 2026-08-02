import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateWatcherTerminalOwnerLoss,
  WATCHER_TERMINAL_OWNER_LOSS_POLICY_VERSION,
} from "../lib/replayResultAdjudications.ts";

const replayHash = "4".repeat(64);

function baseInput() {
  return {
    id: 20432,
    replayHash,
    parseIteration: 38,
    parseSource: "watcher_final",
    parseReason: "watcher_final_submission",
    isFinal: true,
    winner: null,
    players: [
      {
        name: "Emaren",
        steam_id: "76561198065420384",
        number: 1,
        team_id: 1,
        winner: false,
      },
      {
        name: "Feegaro",
        steam_id: "76561198442007385",
        number: 2,
        team_id: 2,
        winner: false,
      },
    ],
    keyEvents: {
      rated: true,
      restored: false,
      completed: false,
      platform_id: "hd",
      watcher_upload: {
        file_role: "final_recording",
        final_candidate: true,
        checkpoint_final_rejected: false,
        server_sha256: replayHash,
      },
      team_resolution: {
        format: "1v1",
        status: "resolved",
        confidence: "high",
      },
      result_resolution: {
        result_status: "review_required",
        result_trusted: false,
      },
      resigned_player_numbers: [],
      resigned_player_names: [],
      postgame_available: false,
      has_scores: false,
      has_achievements: false,
    },
    eventTypes: [],
    disconnectDetected: true,
    durationSeconds: 2088,
    uploaderSteamId: "76561198065420384",
    uploaderUid: "u_emaren",
    hasAdjudicationHistory: false,
    currentDesyncOccurred: null,
  };
}

test("exact silent watcher-owned rated HD 1v1 resolves to the opponent", () => {
  const evaluation = evaluateWatcherTerminalOwnerLoss(baseInput());

  assert.equal(evaluation.eligible, true);
  if (!evaluation.eligible) return;

  assert.equal(
    evaluation.opponent.stablePlayerKey,
    "steam:76561198442007385"
  );
  assert.equal(
    evaluation.winningTeamKey,
    "steam:76561198442007385"
  );
  assert.equal(
    (evaluation.evidence as { policyVersion?: unknown }).policyVersion,
    WATCHER_TERMINAL_OWNER_LOSS_POLICY_VERSION
  );
});

test("serialized resignation evidence blocks terminal inference", () => {
  const input = baseInput();
  input.eventTypes = ["resign"];

  assert.deepEqual(
    evaluateWatcherTerminalOwnerLoss(input),
    {
      eligible: false,
      reason: "serialized_result_exists",
    }
  );
});

test("confirmed desync blocks terminal inference", () => {
  const input = baseInput();
  input.currentDesyncOccurred = true;

  assert.deepEqual(
    evaluateWatcherTerminalOwnerLoss(input),
    {
      eligible: false,
      reason: "confirmed_desync",
    }
  );
});

test("an uploader mismatch cannot award the opponent", () => {
  const input = baseInput();
  input.uploaderSteamId = "76561199999999999";

  assert.deepEqual(
    evaluateWatcherTerminalOwnerLoss(input),
    {
      eligible: false,
      reason: "uploader_player_not_exact",
    }
  );
});

test("short or non-final recordings remain unresolved", () => {
  const short = baseInput();
  short.durationSeconds = 59;
  assert.equal(
    evaluateWatcherTerminalOwnerLoss(short).eligible,
    false
  );

  const live = baseInput();
  live.isFinal = false;
  assert.equal(
    evaluateWatcherTerminalOwnerLoss(live).eligible,
    false
  );
});
