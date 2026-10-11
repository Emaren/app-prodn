import assert from "node:assert/strict";
import test from "node:test";

import {
  summarizeChampionshipHall,
} from "../lib/champions/championshipSummary.ts";
import type { ChampionTitleState } from "../lib/champions/titleState.ts";

type Fixture = Pick<ChampionTitleState, "id" | "type" | "status" | "holders" | "dailyWolo" | "bountyGrowthWolo">;

function title(
  id: string,
  type: ChampionTitleState["type"],
  active = false,
  rate = 0,
): Fixture {
  return {
    id,
    type,
    status: active ? "held" : "vacant",
    holders: active ? [{ name: "Verified holder" }] : [],
    dailyWolo: rate,
    bountyGrowthWolo: rate,
  };
}

function summarized(rows: Fixture[]) {
  return summarizeChampionshipHall(rows as ChampionTitleState[]);
}

test("12 held of 36 included positions computes 24 vacant and 73 potential WOLO/day", () => {
  const rows: Fixture[] = [
    ...["world", "chaos", "womens"].map((id) => title(id, id as ChampionTitleState["type"])),
    ...["random-map-champion", "deathmatch-champion"].map((id) => title(id, "world")),
    ...[2, 3, 4].flatMap((size) => (["rm", "dm"] as const).map((mode) => title(`${size}v${size}-${mode}`, "tag_team"))),
    ...["elo-rising", "elo-challenger", "elo-veteran", "elo-elite", "elo-legend",
      "dm-rising", "dm-contender", "dm-veteran", "dm-elite", "dm-legend"].map((id) => title(id, "elo")),
    ...Array.from({ length: 12 }, (_, i) => title(`designation-${i}`, "designation")),
    ...["national-canada", "national-usa", "national-mexico"].map((id) => title(id, "national")),
  ];
  assert.equal(rows.length, 36);
  rows.slice(0, 12).forEach((row, i) => {
    row.status = "held";
    row.holders = [{ name: `Verified holder ${i}` }];
    row.dailyWolo = i === 11 ? 7 : 6;
    row.bountyGrowthWolo = row.dailyWolo;
  });
  assert.deepEqual(summarized(rows), {
    active: 12,
    vacant: 24,
    total: 36,
    potentialDailyRewardWolo: 73,
    potentialDailyBountyGrowthWolo: 73,
  });

  // A title changes hands: one active seat remains active and the total is stable.
  rows[0].holders = [{ name: "New verified holder" }];
  assert.equal(summarized(rows).active, 12);

  // Losing custody puts the seat back into the vacant inventory.
  rows[0].holders = [];
  assert.deepEqual(
    { active: summarized(rows).active, vacant: summarized(rows).vacant },
    { active: 11, vacant: 25 },
  );
});

test("roadmap countries do not inflate vacancies, but a newly held country joins", () => {
  const rows = [
    title("national-canada", "national"),
    title("national-france", "national"),
    title("national-uk", "national"),
    title("tag-team", "tag_team"),
  ];
  assert.equal(summarized(rows).total, 1);
  rows[1].status = "held";
  rows[1].holders = [{ name: "Verified French champion" }];
  assert.deepEqual(
    { active: summarized(rows).active, vacant: summarized(rows).vacant, total: summarized(rows).total },
    { active: 1, vacant: 1, total: 2 },
  );
});

test("incomplete custody or unconfigured bounty growth cannot imply a payout", () => {
  const rows = [
    title("chaos", "chaos", true, 10),
    title("random-map-champion", "world", true, 5),
  ];
  rows[0].bountyGrowthWolo = undefined;
  rows[1].status = "vacant";
  assert.deepEqual(summarized(rows), {
    active: 1,
    vacant: 1,
    total: 2,
    potentialDailyRewardWolo: 10,
    potentialDailyBountyGrowthWolo: 0,
  });
});
