import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyUnresolvedWatcherResult,
  isUnknownishReplayValue,
  publicReplayMapLabel,
  resolveReliableReplayWinner,
  resolveReplayWinnerTruth,
} from "../lib/unresolvedWatcherResult.ts";
import {
  cleanPublicGameRows,
  toPublicGameStatsRow,
} from "../lib/publicReplayTruth.ts";
import {
  liveSessionIdentity,
  reconcileLiveGamesSnapshots,
} from "../lib/liveGamesClientReconcile.ts";
import type { LiveGamesSnapshot } from "../lib/liveGames.ts";

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

  assert.equal(publicReplayMapLabel({ name: "Unknown" }), "HD Battlefield");
  assert.equal(publicReplayMapLabel({ name: "Yucatan" }), "Yucatan");
});

test("active games with known roster and map are not mislabeled as parser review", () => {
  const unresolved = classifyUnresolvedWatcherResult({
    winner: "Unknown",
    players: [
      { name: "Jim", winner: false },
      { name: "King Kurt", winner: false },
    ],
    mapName: "Forest Nothing Feitoria",
    state: "live",
    parseReason: "hd_live_parse_match_fallback",
    parseSource: "watcher_live",
  });

  assert.equal(unresolved, null);
});

test("completed replay metadata names the missing winner instead of generic unknown fields", () => {
  const unresolved = classifyUnresolvedWatcherResult({
    winner: "Unknown",
    players: [
      { name: "Jim", winner: false },
      { name: "King Kurt", winner: false },
    ],
    mapName: "Forest Nothing Feitoria",
    state: "completed",
    parseReason: "hd_final_parse_match_fallback",
    parseSource: "watcher_final",
    keyEvents: {
      completed: true,
      postgame_available: false,
      has_scores: false,
      has_achievements: false,
    },
  });

  assert.equal(unresolved?.code, "winner_missing");
  assert.equal(unresolved?.label, "Winner unresolved");
  assert.equal(
    unresolved?.explanation,
    "Replay parsed but winner field missing"
  );
});

test("public replay rows reject unsafe winners and normalize unknown metadata", () => {
  const row = toPublicGameStatsRow({
    id: 10252,
    is_final: true,
    winner: "Tell3z",
    parse_reason: "watcher_inferred_opponent_win_on_incomplete_1v1",
    parse_source: "watcher_final",
    map: { name: "Unknown", size: "Unknown" },
    players: [
      { name: "Emaren", winner: false, civilization_name: "Mayans" },
      { name: "Tell3z", winner: true, civilization_name: "Aztecs" },
    ],
    key_events: tell3zEmarenKeyEvents,
  });

  assert.equal(row.winner, null);
  assert.equal((row.map as { name?: unknown }).name, null);
  assert.equal(row.unresolvedResult?.label, "Winner unresolved");
  assert.deepEqual(
    (row.players as Array<{ winner?: unknown }>).map((player) => player.winner),
    [null, null]
  );
});

test("watcher iterations dedupe and never inflate resolved final counts", () => {
  const liveRows = Array.from({ length: 53 }, (_, index) => ({
    id: index + 1,
    original_filename: "MP Replay active.aoe2record",
    replay_hash: `rolling-${index}`,
    winner: "Unknown",
    players: [{ name: "Jim", winner: null }],
    parse_reason: "watcher_live_iteration",
    parse_source: "watcher_live",
    parse_iteration: index + 1,
    is_final: false,
    timestamp: `2026-07-05T20:${String(index).padStart(2, "0")}:00Z`,
  }));
  const finalRows = [
    {
      id: 100,
      original_filename: "MP Replay unsafe.aoe2record",
      replay_hash: "unsafe-final",
      winner: "Tell3z",
      players: tell3zEmarenPlayers,
      key_events: tell3zEmarenKeyEvents,
      parse_reason: "watcher_inferred_opponent_win_on_incomplete_1v1",
      parse_source: "watcher_final",
      parse_iteration: 88,
      is_final: true,
      timestamp: "2026-07-05T22:00:00Z",
    },
    {
      id: 101,
      original_filename: "MP Replay proven.aoe2record",
      replay_hash: "proven-final",
      winner: "Emaren",
      players: [
        { name: "Emaren", winner: true },
        { name: "Condorito", winner: false },
      ],
      key_events: {
        completed: true,
        completion_source: "resignation",
        resigned_player_names: ["Condorito"],
      },
      parse_reason: "recorded_resignation_final",
      parse_source: "watcher_final",
      parse_iteration: 30,
      is_final: true,
      timestamp: "2026-07-05T23:00:00Z",
    },
  ];

  assert.equal(
    cleanPublicGameRows([...liveRows, ...finalRows], {
      includeReview: true,
      includeLive: false,
    }).length,
    2
  );
  assert.equal(
    cleanPublicGameRows([...liveRows, ...finalRows], {
      includeReview: false,
      includeLive: false,
    }).length,
    1
  );
});

function liveSession(
  overrides: Partial<LiveGamesSnapshot["activeSessions"][number]>
): LiveGamesSnapshot["activeSessions"][number] {
  return {
    id: 1,
    sessionKey: "platform:stable",
    replayFile: "MP Replay stable.aoe2record",
    replayHash: "rolling-hash",
    parseIteration: 1,
    createdAt: "2026-07-05T20:00:00Z",
    updatedAt: "2026-07-05T20:00:05Z",
    completedAt: null,
    playedOn: "2026-07-05T20:00:00Z",
    mapName: "Yucatan",
    durationSeconds: 5,
    originalFilename: "MP Replay stable.aoe2record",
    disconnectDetected: false,
    winner: null,
    parseReason: "watcher_live_iteration",
    parseSource: "watcher_live",
    unresolvedResult: null,
    state: "live",
    players: [
      { name: "Emaren", winner: null },
      { name: "Condorito", winner: null },
    ],
    uploaders: [],
    watcherCount: 1,
    parseRows: 1,
    coverageLevel: "single",
    uploader: null,
    streams: [],
    primaryStream: null,
    ...overrides,
  };
}

function snapshot(
  activeSessions: LiveGamesSnapshot["activeSessions"]
): LiveGamesSnapshot {
  return {
    liveCount: activeSessions.length,
    readyCount: 0,
    onDeckCount: 0,
    updatedAt: "2026-07-05T20:00:10Z",
    tournament: null,
    activeSessions,
    recentlyCompletedSessions: [],
    liveMatches: [],
    readyMatches: [],
    scheduledMatches: [],
    recentMatches: [],
  };
}

test("live client reconciliation keeps simultaneous games through a missed poll", () => {
  const emaren = liveSession({ id: 1, sessionKey: "platform:emaren" });
  const jim = liveSession({
    id: 2,
    sessionKey: "platform:jim",
    players: [
      { name: "Jim", winner: null },
      { name: "King Kurt", winner: null },
    ],
  });
  const seenAt = new Map<string, number>();
  const initial = snapshot([emaren, jim]);
  for (const session of initial.activeSessions) {
    seenAt.set(liveSessionIdentity(session), 1_000);
  }

  const reconciled = reconcileLiveGamesSnapshots(
    initial,
    snapshot([jim]),
    seenAt,
    5_000,
    90_000
  );

  assert.equal(reconciled.activeSessions.length, 2);
  assert.deepEqual(
    new Set(reconciled.activeSessions.map((session) => session.sessionKey)),
    new Set(["platform:emaren", "platform:jim"])
  );
});

test("live metadata reconciliation never lets unknown overwrite known fields", () => {
  const known = liveSession({
    id: 1,
    sessionKey: "platform:jim",
    mapName: "FN 5x5",
    players: [
      { name: "Jim", winner: null },
      { name: "Scavanger_Ab", winner: null },
    ],
    parseIteration: 10,
  });
  const partial = liveSession({
    id: 2,
    sessionKey: "platform:jim",
    mapName: null,
    players: [{ name: "Jim", winner: null }],
    parseIteration: 11,
    updatedAt: "2026-07-05T20:00:20Z",
  });

  const reconciled = reconcileLiveGamesSnapshots(
    snapshot([known]),
    snapshot([partial]),
    new Map([[liveSessionIdentity(known), 1_000]]),
    2_000
  );
  assert.equal(reconciled.activeSessions[0].mapName, "FN 5x5");
  assert.equal(reconciled.activeSessions[0].players.length, 2);
  assert.equal(reconciled.activeSessions[0].parseIteration, 11);
});
