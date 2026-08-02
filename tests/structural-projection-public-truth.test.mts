import assert from "node:assert/strict";
import test from "node:test";

import { toPublicGameStatsRow } from "../lib/publicReplayTruth.ts";

const recoveredPlayers = [
  { name: "Jim", steam_id: "1", team_id: 0, winner: null },
  { name: "JakeTheSnake", steam_id: "2", team_id: 0, winner: null },
  { name: "Scavanger_Ab", steam_id: "3", team_id: 1, winner: null },
  { name: "Ozz", steam_id: "4", team_id: 1, winner: null },
];

function recoveredRow(filename: string) {
  return {
    id: 16218,
    replay_hash: "a".repeat(64),
    original_filename: filename,
    replay_file: filename,
    is_final: true,
    parse_source: "watcher_final",
    parse_reason: "engine_room_structural_projection",
    map: { name: "Forest Nothing Feitoria", size: "4 player" },
    winner: null,
    players: recoveredPlayers,
    key_events: {
      team_resolution: {
        status: "resolved",
        teams: [
          { team_id: 0, players: ["Jim", "JakeTheSnake"] },
          { team_id: 1, players: ["Scavanger_Ab", "Ozz"] },
        ],
      },
      engine_room_structural_projection: {
        result_authority: false,
        affects_results: false,
        affects_bets: false,
        settlement_authority: false,
      },
    },
  };
}

test("structural replay projection exposes map and roster without inventing a winner", () => {
  const row = toPublicGameStatsRow(
    recoveredRow("MP Replay v5.8 @2026.08.02 004514.aoe2record")
  ) as Record<string, unknown>;

  assert.deepEqual(row.map, {
    name: "Forest Nothing Feitoria",
    size: "4 player",
  });
  assert.equal((row.players as unknown[]).length, 4);
  assert.equal(row.winner, null);
  assert.equal((row.unresolvedResult as { label: string }).label, "Result unproven");
  assert.equal((row.unresolvedResult as { reviewNeeded: boolean }).reviewNeeded, false);
});

test("saved-game structural projection is clearly labeled as a checkpoint", () => {
  const row = toPublicGameStatsRow(
    recoveredRow("MP Replay v5.8 @2026.08.02 004514.aoe2mpgame")
  ) as Record<string, unknown>;

  assert.equal(row.winner, null);
  assert.equal((row.unresolvedResult as { label: string }).label, "Saved checkpoint");
});
