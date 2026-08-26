import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  getWarChestModeSeedEntries,
  getWarChestPeriodMetrics,
} from "../lib/warChestPeriodTruth.ts";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dirname, "..");

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

test("server accumulator keeps independent weekly settled and wagered counters", () => {
  const source = fs.readFileSync(
    path.join(root, "lib/lobbyWoloEarners.ts"),
    "utf8",
  );

  assert.match(source, /actor\.weeklyWageredWolo \+= wager\.amountWolo/);
  assert.match(source, /actor\.weeklySettledWolo \+= claim\.amountWolo/);
  assert.match(
    source,
    /actor\.weeklySettledWolo \+= wager\.payoutWolo \?\? 0/,
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

test("home War Chest renders settled and wagered from the active period", () => {
  const source = fs.readFileSync(
    path.join(root, "components/lobby/TopWoloEarnersTile.tsx"),
    "utf8",
  );

  assert.match(source, /getWarChestPeriodMetrics\(entry, mode\)/);
  assert.match(source, /formatWolo\(periodMetrics\.settledWolo\)/);
  assert.match(source, /formatWolo\(periodMetrics\.wageredWolo\)/);
});
