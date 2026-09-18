import assert from "node:assert/strict";
import test from "node:test";

import { projectLobbyMatchRow } from "../lib/lobbyMatchProjection.ts";

test("lobby match projection preserves presentation truth and strips parser bulk", () => {
  const source = {
    id: 16218,
    winner: "Alice",
    map: { name: "Arabia", size: "Tiny" },
    players: [
      {
        name: "Alice",
        winner: true,
        team_id: 1,
        civilization: "Britons",
        giantMetrics: "x".repeat(4000),
      },
      {
        name: "Bob",
        winner: false,
        team_id: 2,
        civilization: "Franks",
        giantMetrics: "y".repeat(4000),
      },
    ],
    played_on: "2026-09-17T18:00:00Z",
    timestamp: "2026-09-17T18:00:00Z",
    parse_reason: "manual_result_adjudication",
    winnerProof: "replay_result_adjudication",
    reviewNeeded: false,
    humanSuppliedEvidence: true,
    humanSuppliedEvidenceCount: 1,
    humanConfirmedDesync: false,
    original_filename: "Alice-vs-Bob.aoe2mpgame",
    replay_file: "Alice-vs-Bob.aoe2mpgame",
    key_events: {
      team_resolution: {
        format: "1v1",
        teams: [
          { team_key: "1", players: [{ name: "Alice" }] },
          { team_key: "2", players: [{ name: "Bob" }] },
        ],
      },
      replay_result_adjudication: {
        adjudicated_by: "commissioner",
      },
      commissioner_adjudication: {
        adjudicated_by: "commissioner",
      },
      disconnect_detected: false,
      giantParserTrace: "z".repeat(12000),
      economy: { giant: "q".repeat(5000) },
    },
    event_types: ["tribute", "resign", "chat"],
    parse_iteration: 17,
    watcher_file_mtime: "2026-09-17T18:00:00Z",
  };

  const before = JSON.stringify(source).length;
  const projected = projectLobbyMatchRow(source);
  const after = JSON.stringify(projected).length;

  assert.equal(projected.id, 16218);
  assert.equal(projected.winner, "Alice");
  assert.deepEqual(projected.players, [
    { name: "Alice", winner: true, team_id: 1 },
    { name: "Bob", winner: false, team_id: 2 },
  ]);

  const keyEvents = (projected as { key_events?: Record<string, unknown> }).key_events;
  assert.ok(keyEvents);
  assert.ok(keyEvents.team_resolution);
  assert.ok(keyEvents.replay_result_adjudication);
  assert.ok(keyEvents.commissioner_adjudication);
  assert.equal(keyEvents.disconnect_detected, false);
  assert.equal("giantParserTrace" in keyEvents, false);
  assert.equal("economy" in keyEvents, false);

  assert.equal("event_types" in projected, false);
  assert.equal("parse_iteration" in projected, false);
  assert.ok(after < before * 0.2, "expected at least 80% reduction: " + before + " -> " + after);
});

test("lobby match projection does not mutate its source row", () => {
  const source = {
    id: 1,
    winner: null,
    map: { name: "Arena" },
    players: [{ name: "One", winner: null, teamId: "A", extra: "keep-source" }],
    played_on: null,
    timestamp: null,
    key_events: { team_resolution: { teams: [] }, extra: "keep-source" },
  };

  const snapshot = JSON.stringify(source);
  projectLobbyMatchRow(source);
  assert.equal(JSON.stringify(source), snapshot);
});


test("lobby recent-match API compacts only explicit presentation requests", async () => {
  const { readFile } = await import("node:fs/promises");
  const route = await readFile(new URL("../app/api/lobby/recent-matches/route.ts", import.meta.url), "utf8");
  const panel = await readFile(new URL("../components/lobby/RecentMatchesPanel.tsx", import.meta.url), "utf8");

  assert.match(route, /searchParams\.get\("presentation"\) === "compact"/);
  assert.match(route, /rawMatches\.map\(projectLobbyMatchRow\)/);
  assert.match(route, /:\s*rawMatches;/);
  assert.match(panel, /presentation=compact&refresh=/);
  assert.match(panel, /limit=\$\{MATCH_FEED_PAGE_SIZE\}&presentation=compact/);
});
