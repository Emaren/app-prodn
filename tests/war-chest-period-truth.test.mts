import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  getWarChestModeSeedEntries,
  getWarChestPeriodMetrics,
  getWarChestUtcWeekStart,
} from "../lib/warChestPeriodTruth.ts";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dirname, "..");


test("War Chest UTC weeks begin Monday at midnight from one captured clock", () => {
  assert.equal(
    getWarChestUtcWeekStart(
      new Date("2026-09-27T23:59:59.999Z"),
    ).toISOString(),
    "2026-09-21T00:00:00.000Z",
  );
  assert.equal(
    getWarChestUtcWeekStart(
      new Date("2026-09-28T00:00:00.000Z"),
    ).toISOString(),
    "2026-09-28T00:00:00.000Z",
  );
});

test("War Chest starts earner and weekly evidence lanes before the shared await", () => {
  const source = fs.readFileSync(
    path.join(root, "lib/warChest.ts"),
    "utf8",
  );

  const earnerStart = source.indexOf(
    "const earnersPromise",
  );
  const weeklyStart = source.indexOf(
    "const weeklySnapshotPromise",
  );
  const join = source.indexOf(
    "] = await Promise.all([",
  );

  assert.ok(earnerStart >= 0);
  assert.ok(weeklyStart > earnerStart);
  assert.ok(join > weeklyStart);
  assert.match(
    source.slice(earnerStart, join + 240),
    /earnersPromise,[\s\S]*weeklySnapshotPromise,[\s\S]*sharedSnapshotPromise/,
  );
  assert.doesNotMatch(
    source.slice(earnerStart, weeklyStart),
    /await loadLobbyWoloEarnersBoard/,
  );
});

test("War Chest earner and weekly lanes share the same generatedAt boundary", () => {
  const chest = fs.readFileSync(
    path.join(root, "lib/warChest.ts"),
    "utf8",
  );
  const earners = fs.readFileSync(
    path.join(root, "lib/lobbyWoloEarners.ts"),
    "utf8",
  );

  assert.match(
    chest,
    /const generatedAt = new Date\(\);[\s\S]*getWarChestUtcWeekStart\(generatedAt\)/,
  );
  assert.match(
    chest,
    /loadLobbyWoloEarnersBoard\([\s\S]*generatedAt,[\s\S]*\)/,
  );
  assert.match(
    earners,
    /const generatedAt = options\.generatedAt \?\? new Date\(\)/,
  );
  assert.match(
    earners,
    /getWarChestUtcWeekStart\(generatedAt\)/,
  );
});

test("weekly mode selects weekly settled and wagered truth", () => {
  const metrics = getWarChestPeriodMetrics(
    {
      settledWolo: 738_311,
      wageredWolo: 1_255_500,
      weeklySettledWolo: 41_250,
      weeklyWageredWolo: 93_000,
    },
    "weekly",
  );

  assert.deepEqual(metrics, {
    settledWolo: 41_250,
    wageredWolo: 93_000,
  });
});

test("all-time mode selects lifetime settled and wagered truth", () => {
  const metrics = getWarChestPeriodMetrics(
    {
      settledWolo: 738_311,
      wageredWolo: 1_255_500,
      weeklySettledWolo: 41_250,
      weeklyWageredWolo: 93_000,
    },
    "all_time",
  );

  assert.deepEqual(metrics, {
    settledWolo: 738_311,
    wageredWolo: 1_255_500,
  });
});

test("alternate War Chest mode can seed synchronously from prefetched entries", () => {
  const weekly = [{ key: "weekly" }];
  const allTime = [{ key: "all-time" }];

  assert.equal(
    getWarChestModeSeedEntries({
      activeMode: "weekly",
      boardMode: "weekly",
      boardEntries: weekly,
      prefetchedEntriesByMode: { all_time: allTime },
    }),
    weekly,
  );

  assert.equal(
    getWarChestModeSeedEntries({
      activeMode: "all_time",
      boardMode: "weekly",
      boardEntries: weekly,
      prefetchedEntriesByMode: { all_time: allTime },
    }),
    allTime,
  );
});

test("server accumulator keeps independent weekly settled and matched-wagered counters", () => {
  const source = fs.readFileSync(
    path.join(root, "lib/lobbyWoloEarners.ts"),
    "utf8",
  );

  assert.match(source, /planMatchedWagerExposure\(/);
  assert.match(source, /matchedWoloByWagerId\.set\(row\.id, row\.matchedWolo\)/);
  assert.match(source, /actor\.wageredWolo\s*\+=\s*matchedWolo/);
  assert.match(source, /actor\.weeklyWageredWolo\s*\+=\s*matchedWolo/);
  assert.doesNotMatch(source, /actor\.weeklyWageredWolo\s*\+=\s*wager\.amountWolo/);
  assert.match(source, /actor\.weeklySettledWolo\s*\+=\s*claim\.amountWolo/);
  assert.match(
    source,
    /actor\.weeklySettledWolo \+=\s*wagerTakeWolo/,
  );
});

test("lobby snapshot prefetches both War Chest rankings before interaction", () => {
  const source = fs.readFileSync(
    path.join(root, "lib/lobbySnapshot.ts"),
    "utf8",
  );

  assert.match(
    source,
    /loadLobbyWoloEarnersBoard\(prisma, \{\s*mode: "weekly",\s*prefetchAlternate: true,\s*\}\)/,
  );
  assert.match(source, /prefetchedEntriesByMode/);
});

test("home War Chest renders earned and matched-wagered truth from the active period", () => {
  const source = fs.readFileSync(
    path.join(root, "components/lobby/TopWoloEarnersTile.tsx"),
    "utf8",
  );

  assert.match(source, /getWarChestPeriodMetrics\(entry, mode\)/);
  assert.match(source, /h\("Earned"\)/);
  assert.match(source, /formatWolo\(periodMetrics\.settledWolo\)/);
  assert.match(source, /formatWolo\(periodMetrics\.wageredWolo\)/);
});
