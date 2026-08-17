import assert from "node:assert/strict";
import test from "node:test";

import {
  summarizeKingdomPairArchiveEvidence,
} from "../lib/kingdomKnowledgePairEvidence.ts";

test("targeted pair archive sees 1v1, team opponents, and teammates", () => {
  const result = summarizeKingdomPairArchiveEvidence(
    [
      {
        queryPlayer: "somniosator",
        page: {
          items: [
            {
              id: 30001,
              playersLabel:
                "Zodiac vs somniosator",
              result: "loss",
              mapName: "TU_GA no cliffs",
              playedAt:
                "2026-08-14T17:24:00.000Z",
              winnerLabel: "Zodiac",
            },
            {
              id: 30002,
              playersLabel:
                "The_DreaM / Zodiac / mYsTikaL_TrUnKs vs El matador / somniosator / BrutalCommander",
              result: "loss",
              mapName: "Mayans",
              playedAt:
                "2026-08-14T17:26:00.000Z",
              winnerLabel:
                "The_DreaM / Zodiac / mYsTikaL_TrUnKs",
            },
          ],
        },
      },
      {
        queryPlayer: "Zodiac",
        page: {
          items: [
            {
              id: 24322,
              playersLabel:
                "Zodiac / Brian_de_Bois / somniosator / Fer vs Jamal_ / JAbill / BigDipper / LeGenD_",
              result: "win",
              mapName: "Arabia Green DM EX",
              playedAt:
                "2026-08-15T14:19:41.541Z",
              winnerLabel:
                "Zodiac / Brian_de_Bois / somniosator / Fer",
            },
          ],
        },
      },
    ],
    ["zodiac", "somniosator"],
  );

  assert.ok(result);
  assert.equal(result.meetingsFound, 3);
  assert.equal(result.oneVOneOpponents, 1);
  assert.equal(result.teamOpponents, 1);
  assert.equal(result.teammates, 1);
  assert.equal(result.firstPlayerWins, 2);
  assert.equal(result.secondPlayerWins, 0);
  assert.equal(result.winsTogether, 1);

  assert.ok(
    result.meetings.some(
      (meeting) =>
        meeting.battleType === "1v1" &&
        meeting.relationship === "opponents",
    ),
  );

  assert.ok(
    result.meetings.some(
      (meeting) =>
        meeting.battleType === "team_game" &&
        meeting.relationship === "opponents",
    ),
  );

  assert.ok(
    result.meetings.some(
      (meeting) =>
        meeting.relationship === "teammates" &&
        meeting.result === "won_together",
    ),
  );
});

test("duplicate battle IDs from both player feeds collapse to one meeting", () => {
  const shared = {
    id: 77,
    playersLabel: "Alpha vs Beta",
    mapName: "Yucatan",
    playedAt: "2026-08-01T00:00:00.000Z",
  };

  const result = summarizeKingdomPairArchiveEvidence(
    [
      {
        queryPlayer: "Alpha",
        page: {
          items: [
            {
              ...shared,
              result: "win",
              winnerLabel: "Alpha",
            },
          ],
        },
      },
      {
        queryPlayer: "Beta",
        page: {
          items: [
            {
              ...shared,
              result: "loss",
              winnerLabel: "Alpha",
            },
          ],
        },
      },
    ],
    ["alpha", "beta"],
  );

  assert.ok(result);
  assert.equal(result.meetingsFound, 1);
  assert.equal(result.oneVOneOpponents, 1);
  assert.equal(result.firstPlayerWins, 1);
});

test("targeted exact-name archive absence remains bounded, not absolute", () => {
  const result = summarizeKingdomPairArchiveEvidence(
    [
      {
        queryPlayer: "Alpha",
        page: {
          items: [],
        },
      },
      {
        queryPlayer: "Beta",
        page: {
          items: [],
        },
      },
    ],
    ["alpha", "beta"],
  );

  assert.ok(result);
  assert.equal(result.meetingsFound, 0);
  assert.match(
    result.note,
    /Do not convert this bounded result into an absolute historical no-record claim/,
  );
});
