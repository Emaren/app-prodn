import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveReplayTeamPresentation,
} from "../lib/replayTeamDisplay.ts";

const roster = [
  { name: "The_DreaM", team_id: 1 },
  { name: "c0LoRz", team_id: 2 },
  { name: "mYsTikaL JiReN", team_id: 1 },
  { name: "MouldyBoars39381", team_id: 2 },
];

test("canonical team_resolution controls live replay matchup instead of array order", () => {
  const result = resolveReplayTeamPresentation({
    players: roster,
    keyEvents: {
      team_resolution: {
        format: "2v2",
        status: "resolved",
        confidence: "high",
        teams: [
          {
            team_key: "1",
            players: [
              { name: "The_DreaM" },
              { name: "mYsTikaL JiReN" },
            ],
          },
          {
            team_key: "2",
            players: [
              { name: "c0LoRz" },
              { name: "MouldyBoars39381" },
            ],
          },
        ],
      },
    },
  });

  assert.equal(result.status, "resolved");
  assert.equal(result.format, "2v2");
  assert.deepEqual(
    result.teams.map((team) => team.names),
    [
      ["The_DreaM", "mYsTikaL JiReN"],
      ["c0LoRz", "MouldyBoars39381"],
    ]
  );
  assert.equal(
    result.matchupLabel,
    "The_DreaM / mYsTikaL JiReN vs c0LoRz / MouldyBoars39381"
  );
});

test("explicit team IDs recover team presentation when team_resolution is absent", () => {
  const result = resolveReplayTeamPresentation({
    players: roster,
  });

  assert.equal(result.status, "resolved");
  assert.equal(result.format, "2v2");
  assert.deepEqual(
    result.teams.map((team) => team.names),
    [
      ["The_DreaM", "mYsTikaL JiReN"],
      ["c0LoRz", "MouldyBoars39381"],
    ]
  );
});

test("a complete two-player roster remains an inherent 1v1", () => {
  const result = resolveReplayTeamPresentation({
    players: [
      { name: "Emaren" },
      { name: "Jim" },
    ],
  });

  assert.equal(result.status, "resolved");
  assert.equal(result.format, "1v1");
  assert.equal(result.matchupLabel, "Emaren vs Jim");
});

test("incomplete team truth never invents versus sides from roster order", () => {
  const result = resolveReplayTeamPresentation({
    players: roster.map(({ name }) => ({ name })),
  });

  assert.equal(result.status, "unresolved");
  assert.equal(result.teams.length, 0);
  assert.equal(
    result.matchupLabel,
    "The_DreaM · c0LoRz · mYsTikaL JiReN · MouldyBoars39381"
  );
  assert.doesNotMatch(result.matchupLabel, / vs /);
});
