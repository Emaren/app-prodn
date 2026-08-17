import assert from "node:assert/strict";
import test from "node:test";

import { filterPairArchivePagesToSharedGameIds } from "../lib/kingdomKnowledgePairArchiveIntersection.ts";

test("pair archive evidence keeps only game IDs independently present in both player archives", () => {
  const pages = [
    {
      queryPlayer: "zodiac",
      page: {
        items: [
          { id: 23831, playersLabel: "Zodiac vs somniosator" },
          { id: 23857, playersLabel: "The_DreaM / Zodiac vs somniosator / BrutalCommander" },
          { id: 23868, playersLabel: "TheZodiac / somniosator vs others" },
          { id: 24241, playersLabel: "Zodiac / somniosator vs others" },
          { id: 24322, playersLabel: "Zodiac / somniosator vs others" },
        ],
      },
    },
    {
      queryPlayer: "somniosator",
      page: {
        items: [
          { id: 23831 },
          { id: 23857 },
          { id: 23868 },
          // False Zodiac positive: this game belongs to Brian/Trunks Steam.
          { id: 23876, playersLabel: "Zodiac, Brian_de_Bois / others vs somniosator / others" },
          { id: 24241 },
          { id: 24322 },
        ],
      },
    },
  ];

  const filtered = filterPairArchivePagesToSharedGameIds(pages);
  assert.equal(filtered.length, 2);
  assert.deepEqual(
    filtered.map((entry) => entry.page.items.map((item) => item.id)),
    [
      [23831, 23857, 23868, 24241, 24322],
      [23831, 23857, 23868, 24241, 24322],
    ],
  );
});

test("pair archive evidence fails closed when either independent player archive is unavailable", () => {
  const filtered = filterPairArchivePagesToSharedGameIds([
    {
      queryPlayer: "zodiac",
      page: { items: [{ id: 23831 }] },
    },
    {
      queryPlayer: "somniosator",
      error: "archive unavailable",
    },
  ]);

  assert.deepEqual(filtered, []);
});
