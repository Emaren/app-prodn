import assert from "node:assert/strict";
import test from "node:test";

import {
  summarizeKingdomPairEvidence,
} from "../lib/kingdomKnowledgePairEvidence.ts";

test("pair evidence recognizes Zodiac and somniosator winning together", () => {
  const result = summarizeKingdomPairEvidence(
    [
      {
        id: 24322,
        winner: "Zodiac / Brian_de_Bois / somniosator / Fer",
        winnerProof: "replay_winner_truth",
        map: { name: "Arabia Green DM EX" },
        playedAt: "2026-08-15T14:19:41.541Z",
        players: [
          { name: "Zodiac", winner: true },
          { name: "Jamal_", winner: false },
          { name: "somniosator", winner: true },
          { name: "JAbill", winner: false },
          { name: "BigDipper", winner: false },
          { name: "Fer", winner: true },
          { name: "Brian_de_Bois", winner: true },
          { name: "LeGenD_", winner: false },
        ],
      },
    ],
    ["zodiac", "somniosator"],
  );

  assert.ok(result);
  assert.equal(result.meetingsFound, 1);
  assert.equal(result.teammates, 1);
  assert.equal(result.opponents, 0);
  assert.equal(result.meetings[0]?.id, 24322);
  assert.equal(result.meetings[0]?.relationship, "teammates");
  assert.equal(result.meetings[0]?.result, "won_together");
  assert.match(result.note, /Do not claim there is no public record/);
});

test("pair evidence recognizes opponents from opposing winner flags", () => {
  const result = summarizeKingdomPairEvidence(
    [
      {
        id: 99,
        winner: "Alpha",
        players: [
          { name: "Alpha", winner: true },
          { name: "Beta", winner: false },
        ],
      },
    ],
    ["alpha", "beta"],
  );

  assert.ok(result);
  assert.equal(result.meetingsFound, 1);
  assert.equal(result.opponents, 1);
  assert.equal(result.meetings[0]?.relationship, "opponents");
  assert.equal(result.meetings[0]?.result, "first_won");
});

test("bounded absence never becomes a historical no-record claim", () => {
  const result = summarizeKingdomPairEvidence(
    [],
    ["alpha", "beta"],
  );

  assert.ok(result);
  assert.equal(result.meetingsFound, 0);
  assert.match(
    result.note,
    /does not prove there is no historical public record/,
  );
});

test("pair evidence only activates for exactly two focused query entities", () => {
  assert.equal(
    summarizeKingdomPairEvidence([], ["zodiac"]),
    null,
  );

  assert.equal(
    summarizeKingdomPairEvidence(
      [],
      ["zodiac", "somniosator", "emaren"],
    ),
    null,
  );
});
