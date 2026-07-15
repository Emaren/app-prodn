import assert from "node:assert/strict";
import test from "node:test";

import { resolveReplayResultForPlayer } from "../lib/replayPlayerResult.ts";
import { buildRosterHash, normalizeReplayPlayers } from "../lib/teamResolution.ts";

type TestPlayer = {
  name: string;
  team_id?: number;
  number: number;
  winner?: boolean | null;
};

function playersFor(size: number): TestPlayer[] {
  return Array.from({ length: size * 2 }, (_, index) => ({
    name: `P${index + 1}`,
    team_id: index % 2,
    number: index + 1,
    // Legacy HD rows often named one representative winner and left every
    // teammate false. The scalar winner still represents the explicit side.
    winner: index === 0,
  }));
}

function scalarTeamGame(size: number, players = playersFor(size)) {
  return {
    winner: "P1",
    players,
    parse_reason: "recorded_resignation_final",
    parse_source: "watcher_final",
    event_types: ["resign"],
  };
}

function result(game: Record<string, unknown>, playerName: string) {
  return resolveReplayResultForPlayer(
    game,
    (player) => player.name.toLowerCase() === playerName.toLowerCase()
  );
}

for (const size of [2, 3, 4]) {
  test(`${size}v${size} projects one scalar winner across the complete winning side`, () => {
    const game = scalarTeamGame(size);

    assert.equal(result(game, "P1"), "win");
    assert.equal(result(game, "P3"), "win");
    assert.equal(result(game, "P2"), "loss");
    assert.equal(result(game, `P${size * 2}`), "loss");
  });
}

test("numeric team id zero and reordered rosters preserve every teammate outcome", () => {
  const players = playersFor(4);
  const reordered = [players[5], players[0], players[7], players[2], players[1], players[6], players[3], players[4]];
  const game = scalarTeamGame(4, reordered);

  assert.equal(result(game, "P7"), "win");
  assert.equal(result(game, "P4"), "loss");
});

test("a complete explicit winner set resolves a team without a scalar representative", () => {
  const players = playersFor(3).map((player) => ({ ...player, winner: null }));
  const game = {
    winner: null,
    winnerPlayers: ["P1", "P3", "P5"],
    players,
    parse_reason: "recorded_resignation_final",
    parse_source: "watcher_final",
  };

  assert.equal(result(game, "P5"), "win");
  assert.equal(result(game, "P6"), "loss");
});

test("partial team assignments and partial winner sets stay outside resolved W/L", () => {
  const partialTeams = playersFor(4);
  delete partialTeams[0].team_id;
  assert.equal(result(scalarTeamGame(4, partialTeams), "P3"), "unknown");
  assert.equal(result(scalarTeamGame(4, partialTeams), "P2"), "unknown");

  const partialWinnerSet = playersFor(3).map((player) => ({ ...player, winner: null }));
  assert.equal(
    result(
      {
        winner: null,
        winnerPlayers: ["P1"],
        players: partialWinnerSet,
        parse_reason: "recorded_resignation_final",
      },
      "P2"
    ),
    "unknown"
  );
});

test("one isolated team winner flag cannot turn every other player into a loss", () => {
  const players = playersFor(2).map((player, index) => ({
    ...player,
    winner: index === 0 ? true : null,
  }));
  const game = {
    winner: null,
    players,
    parse_reason: "recorded_resignation_final",
    event_types: ["resign"],
  };

  assert.equal(result(game, "P1"), "unknown");
  assert.equal(result(game, "P2"), "unknown");
});

test("conflicting scalar and player winner evidence stays outside resolved W/L", () => {
  const players = playersFor(2).map((player, index) => ({
    ...player,
    winner: index === 0 || index === 1,
  }));
  const game = scalarTeamGame(2, players);

  assert.equal(result(game, "P1"), "unknown");
  assert.equal(result(game, "P4"), "unknown");
});

test("an accepted adjudication overrides parser drift for the full reviewed side", () => {
  const replayHash = "a".repeat(64);
  const players = playersFor(2);
  const sourceRosterHash = buildRosterHash(normalizeReplayPlayers(players)) as string;
  const teamAssignments = [
    {
      teamKey: "allies",
      players: [
        { stablePlayerKey: "name:p1", name: "P1" },
        { stablePlayerKey: "name:p3", name: "P3" },
      ],
    },
    {
      teamKey: "enemies",
      players: [
        { stablePlayerKey: "name:p2", name: "P2" },
        { stablePlayerKey: "name:p4", name: "P4" },
      ],
    },
  ];
  const game = {
    replayHash,
    winner: "P2",
    players,
    parse_reason: "recorded_resignation_final",
    parse_source: "watcher_final",
    replayResultAdjudications: [
      {
        id: 9,
        decisionStatus: "accepted",
        actorDisplayNameSnapshot: "Emaren",
        actorRole: "site_admin",
        teamAssignments,
        winningTeamKey: "allies",
        winningPlayerKeys: ["name:p1", "name:p3"],
        reason: "Verified from the final statistics screen.",
        sourceReplayHash: replayHash,
        sourceParseIteration: 3,
        sourceRosterHash,
        sourcePropositionHash: "b".repeat(64),
        createdAt: new Date("2026-07-14T17:00:00.000Z"),
      },
    ],
  };

  assert.equal(result(game, "P1"), "win");
  assert.equal(result(game, "P3"), "win");
  assert.equal(result(game, "P2"), "loss");
  assert.equal(result(game, "P4"), "loss");
});

test("1v1 keeps a reliable scalar winner and loser", () => {
  const game = {
    winner: "Alpha",
    players: [
      { name: "Bravo", winner: false },
      { name: "Alpha", winner: true },
    ],
    parse_reason: "recorded_resignation_final",
  };

  assert.equal(result(game, "Alpha"), "win");
  assert.equal(result(game, "Bravo"), "loss");
});
