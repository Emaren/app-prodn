import assert from "node:assert/strict";
import test from "node:test";

import {
  filterPublicBattleArchiveRows,
} from "../lib/publicBattleArchiveEligibility.ts";
import {
  cleanPublicGameRows,
} from "../lib/publicReplayTruth.ts";

const battlePlayers = [
  {
    name: "Alpha",
    winner: true,
  },
  {
    name: "Bravo",
    winner: false,
  },
];

test("public record and logical battle grains remain distinct", () => {
  const replayHash = "a".repeat(64);
  const rows = [
    {
      id: 1,
      is_final: true,
      replayHash,
      original_filename:
        "battle-one.aoe2record",
      parse_source: "upload",
      players: battlePlayers,
      winner: "Alpha",
    },
    {
      id: 2,
      is_final: true,
      replayHash,
      original_filename:
        "battle-one-rehost.aoe2record",
      parse_source: "upload",
      players: battlePlayers,
      winner: "Alpha",
    },
    {
      id: 3,
      is_final: true,
      replayHash: "b".repeat(64),
      original_filename:
        "checkpoint.aoe2mpgame",
      parse_source: "upload",
      players: battlePlayers,
      winner: null,
    },
    {
      id: 4,
      is_final: true,
      replayHash: "c".repeat(64),
      original_filename:
        "empty-shell.aoe2record",
      parse_source: "watcher_final",
      parse_reason:
        "watcher_final_unparsed",
      players: [],
      winner: null,
    },
  ];

  const publicRecords =
    filterPublicBattleArchiveRows(
      rows
    );
  const logicalBattles =
    cleanPublicGameRows(
      publicRecords,
      {
        includeReview: true,
        includeLive: false,
      }
    );

  assert.equal(rows.length, 4);
  assert.equal(
    publicRecords.length,
    2
  );
  assert.equal(
    logicalBattles.length,
    1
  );
});

test("unknown results remain public battles without entering resolved-only math", () => {
  const row = {
    id: 5,
    is_final: true,
    replayHash: "d".repeat(64),
    original_filename:
      "reviewable-battle.aoe2record",
    parse_source: "upload",
    players: battlePlayers.map(
      (player) => ({
        ...player,
        winner: null,
      })
    ),
    winner: null,
  };

  assert.equal(
    filterPublicBattleArchiveRows(
      [row]
    ).length,
    1
  );
  assert.equal(
    cleanPublicGameRows(
      [row],
      {
        includeReview: true,
        includeLive: false,
      }
    ).length,
    1
  );
  assert.equal(
    cleanPublicGameRows(
      [row],
      {
        includeReview: false,
        includeLive: false,
      }
    ).length,
    0
  );
});

test("a watcher final remains in logical-battle deduplication", () => {
  const watcherFinal = {
    id: 6,
    is_final: true,
    replayHash: "e".repeat(64),
    original_filename:
      "watcher-final.aoe2record",
    parse_source: "watcher_final",
    players: battlePlayers,
    winner: "Alpha",
  };

  assert.equal(
    cleanPublicGameRows(
      [watcherFinal],
      {
        includeReview: true,
        includeLive: false,
      }
    ).length,
    1
  );
});

test("sequential generic watcher finals use stable artifact identity, not process identity", () => {
  const watcherUpload = {
    watcher_session_id: "one-long-running-process",
  };
  const rows = [
    {
      id: 7,
      is_final: true,
      replayHash: "f".repeat(64),
      original_filename: "MP Replay.aoe2record",
      parse_source: "watcher_final",
      key_events: { watcher_upload: watcherUpload },
      players: battlePlayers,
      winner: "Alpha",
    },
    {
      id: 8,
      is_final: true,
      replayHash: "9".repeat(64),
      original_filename: "MP Replay.aoe2record",
      parse_source: "watcher_final",
      key_events: { watcher_upload: watcherUpload },
      players: battlePlayers,
      winner: "Alpha",
    },
  ];

  assert.equal(
    cleanPublicGameRows(rows, {
      includeReview: true,
      includeLive: false,
    }).length,
    2
  );
});
