import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyReplayIdentityRoster,
} from "../lib/replayIdentityProjection.ts";

test("identity projection accepts distinct canonical Steam identities", () => {
  const roster = classifyReplayIdentityRoster([
    {
      name: "Same Display",
      steam_id: "76561198000000001",
      number: 1,
    },
    {
      name: "Same Display",
      steam_id: "76561198000000002",
      number: 2,
    },
  ]);

  assert.equal(roster.blocker, null);
  assert.equal(roster.players.length, 2);
  assert.notEqual(
    roster.players[0].stablePlayerKey,
    roster.players[1].stablePlayerKey
  );
});

test("identity projection skips duplicate canonical keys without aborting a batch", () => {
  const roster = classifyReplayIdentityRoster([
    {
      name: "Duplicate",
      number: 1,
    },
    {
      name: "Duplicate",
      number: 2,
    },
  ]);

  assert.equal(
    roster.blocker,
    "canonical_roster_ambiguous"
  );
  assert.equal(roster.players.length, 2);
});

test("identity projection skips incomplete canonical rosters", () => {
  const roster = classifyReplayIdentityRoster([
    {
      name: "Only Player",
      number: 1,
    },
  ]);

  assert.equal(
    roster.blocker,
    "canonical_roster_incomplete"
  );
});
