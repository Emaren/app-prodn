import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyUnresolvedWatcherResult,
  isUnknownishReplayValue,
  publicReplayMapLabel,
  resolveReliableReplayWinner,
  resolveReplayWinnerTruth,
} from "../lib/unresolvedWatcherResult.ts";

const tell3zEmarenPlayers = [
  {
    name: "Emaren",
    number: 1,
    civilization_name: "Mayans",
    winner: false,
    score: null,
    eapm: 6,
  },
  {
    name: "Tell3z",
    number: 2,
    civilization_name: "Aztecs",
    winner: true,
    score: null,
    eapm: 10,
  },
];

const tell3zEmarenKeyEvents = {
  rated: true,
  completed: false,
  postgame_available: false,
  has_scores: false,
  has_achievements: false,
  player_score_count: 0,
  achievement_player_count: 0,
  resigned_player_names: [],
  resigned_player_numbers: [],
  winner_inference: {
    type: "uploader_incomplete_1v1_opponent",
    uploader_player: "Emaren",
    inferred_winner: "Tell3z",
  },
};

test("Tell3z is not reliable winner truth from uploader/opponent inference alone", () => {
  const truth = resolveReplayWinnerTruth({
    winner: "Tell3z",
    players: tell3zEmarenPlayers,
    parseReason: "watcher_inferred_opponent_win_on_incomplete_1v1",
    parseSource: "watcher_final",
    keyEvents: tell3zEmarenKeyEvents,
    eventTypes: ["build", "move", "order"],
  });

  assert.equal(truth.winner, null);
  assert.equal(truth.candidateWinner, "Tell3z");
  assert.equal(truth.confidence, "inferred_low_confidence");
  assert.equal(truth.statsEligible, false);
  assert.equal(truth.bettingEligible, false);
  assert.equal(truth.publicLabel, "Winner unresolved");
  assert.ok(
    truth.truthReasons.includes("uploader_opponent_inference_rejected")
  );
  assert.ok(truth.truthReasons.includes("no_postgame_block"));
  assert.ok(truth.truthReasons.includes("no_resignation_event"));
  assert.equal(
    resolveReliableReplayWinner({
      winner: "Tell3z",
      players: tell3zEmarenPlayers,
      parseReason: "watcher_inferred_opponent_win_on_incomplete_1v1",
      keyEvents: tell3zEmarenKeyEvents,
    }),
    null
  );
});

test("the rejected Tell3z inference becomes a reviewable unresolved result", () => {
  const unresolved = classifyUnresolvedWatcherResult({
    winner: "Tell3z",
    players: tell3zEmarenPlayers,
    state: "completed",
    parseReason: "watcher_inferred_opponent_win_on_incomplete_1v1",
    parseSource: "watcher_final",
    keyEvents: tell3zEmarenKeyEvents,
    finalAccepted: true,
  });

  assert.equal(unresolved?.code, "impossible_from_available_replay_data");
  assert.equal(unresolved?.label, "Winner unresolved");
  assert.match(unresolved?.explanation ?? "", /rejected replay inference/i);
});

test("a decisive resignation signal remains stats and betting eligible", () => {
  const players = [
    { name: "Emaren", winner: true },
    { name: "Tell3z", winner: false },
  ];
  const truth = resolveReplayWinnerTruth({
    winner: "Emaren",
    players,
    parseReason: "recorded_resignation_final",
    parseSource: "watcher_final",
    keyEvents: {
      completed: true,
      completion_source: "resignation",
      resigned_player_names: ["Tell3z"],
      resigned_player_numbers: [2],
    },
    eventTypes: ["order", "resign"],
  });

  assert.equal(truth.winner, "Emaren");
  assert.equal(truth.confidence, "proven");
  assert.equal(truth.statsEligible, true);
  assert.equal(truth.bettingEligible, true);
  assert.ok(truth.truthReasons.includes("recorded_resignation"));
});

test("a winner can be recovered from one decisive player flag", () => {
  const truth = resolveReplayWinnerTruth({
    winner: "Unknown",
    players: [
      { name: "Emaren", winner: true },
      { name: "Tell3z", winner: false },
    ],
    parseReason: "watcher_final_submission",
    parseSource: "watcher_final",
    keyEvents: {
      completed: true,
      postgame_available: true,
      has_scores: true,
      player_score_count: 2,
    },
  });

  assert.equal(truth.winner, "Emaren");
  assert.equal(truth.confidence, "recovered");
  assert.equal(truth.statsEligible, true);
});

test("unknown-like placeholders are never promoted to replay metadata", () => {
  for (const value of [
    null,
    undefined,
    "",
    "Unknown",
    "UNKNOWN",
    "N/A",
    "na",
    "Parsing",
    "Players parsing",
    "TBD",
    "Game in progress",
  ]) {
    assert.equal(isUnknownishReplayValue(value), true, String(value));
  }

  assert.equal(publicReplayMapLabel({ name: "Unknown" }), "Map unresolved");
  assert.equal(publicReplayMapLabel({ name: "Yucatan" }), "Yucatan");
});
