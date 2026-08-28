import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import type { PrismaClient } from "../lib/generated/prisma/index.ts";
import {
  appendLiveArchiveClientPage,
  buildLiveArchiveClientState,
  reconcileLiveArchiveClientState,
} from "../lib/liveGamesClientReconcile.ts";
import { loadPublicBattleArchivePage } from "../lib/publicBattleArchive.ts";

function archiveRow(
  id: number,
  observedAt: string,
  options: {
    platformMatchId?: string;
    players?: Array<Record<string, unknown>>;
    map?: Record<string, unknown>;
    parseIteration?: number;
  } = {}
) {
  return {
    id,
    replayHash: String(id).padStart(64, "a"),
    winner: "Alpha",
    map: options.map ?? { name: "Arabia" },
    players: options.players ?? [
      { name: "Alpha", winner: true },
      { name: "Bravo", winner: false },
    ],
    played_on: new Date(observedAt),
    timestamp: new Date(observedAt),
    createdAt: new Date(observedAt),
    parse_reason: "recorded_resignation_final",
    parse_source: "watcher_final",
    original_filename: `MP Replay ${id}.aoe2record`,
    replay_file: `MP Replay ${id}.aoe2record`,
    key_events: {
      completed: true,
      ...(options.platformMatchId
        ? { platform_match_id: options.platformMatchId }
        : {}),
    },
    parse_iteration: options.parseIteration ?? 1,
    is_final: true,
    replayResultAdjudications: [],
  };
}

test("archive paging keeps visible offsets and totals beyond the former 5,000-row ceiling", async () => {
  const queryValues: unknown[] = [];
  const first = archiveRow(1, "2026-08-26T12:00:00.000Z", {
    platformMatchId: "battle-6000",
  });
  const second = archiveRow(2, "2026-08-26T12:01:00.000Z", {
    platformMatchId: "battle-6001",
  });
  let selectedIds: number[] = [];

  const prisma = {
    $queryRaw: async (...args: unknown[]) => {
      queryValues.push(...args.slice(1));
      return [
        {
          id: 2,
          battleIdentity: "platform:battle-6001",
          pageOrdinal: 1n,
          total: 6_001n,
        },
        {
          id: 1,
          battleIdentity: "platform:battle-6000",
          pageOrdinal: 2n,
          total: 6_001n,
        },
      ];
    },
    gameStats: {
      findMany: async (args: { where: { id: { in: number[] } } }) => {
        selectedIds = args.where.id.in;
        return [first, second];
      },
    },
  } as unknown as PrismaClient;

  const page = await loadPublicBattleArchivePage(prisma, {
    offset: 5_001,
    limit: 12,
  });

  assert.deepEqual(queryValues, [12, 5_001]);
  assert.deepEqual(selectedIds, [2, 1]);
  assert.equal(page.total, 6_001);
  assert.equal(page.offset, 5_001);
  assert.equal(page.nextOffset, 5_003);
  assert.deepEqual(page.rows.map((row) => row.id), [2, 1]);
});

test("archive paging chooses the adjudication-aware canonical proof within each database identity", async () => {
  const shallow = archiveRow(10, "2026-08-26T12:05:00.000Z", {
    platformMatchId: "shared-platform-id",
    players: [
      { name: "Alpha", winner: true },
      { name: "Bravo", winner: false },
    ],
    map: {},
    parseIteration: 1,
  });
  const rich = archiveRow(11, "2026-08-26T12:04:00.000Z", {
    platformMatchId: "shared-platform-id",
    players: [
      { name: "Alpha", winner: true },
      { name: "Bravo", winner: false },
      { name: "Charlie", winner: true },
      { name: "Delta", winner: false },
    ],
    map: { name: "Black Forest" },
    parseIteration: 24,
  });
  const other = archiveRow(12, "2026-08-26T12:03:00.000Z", {
    platformMatchId: "other-platform-id",
  });

  const prisma = {
    $queryRaw: async () => [
      {
        id: 12,
        battleIdentity: "platform:other-platform-id",
        pageOrdinal: 2n,
        total: 2n,
      },
      {
        id: 10,
        battleIdentity: "platform:shared-platform-id",
        pageOrdinal: 1n,
        total: 2n,
      },
      {
        id: 11,
        battleIdentity: "platform:shared-platform-id",
        pageOrdinal: 1n,
        total: 2n,
      },
    ],
    gameStats: {
      findMany: async () => [shallow, rich, other],
    },
  } as unknown as PrismaClient;

  const page = await loadPublicBattleArchivePage(prisma, {
    offset: 0,
    limit: 2,
  });

  assert.equal(page.total, 2);
  assert.equal(page.nextOffset, 2);
  assert.deepEqual(page.rows.map((row) => row.id), [11, 12]);
});

test("archive route pages canonical database battles instead of loading a bounded upstream corpus", async () => {
  const source = await readFile("app/api/game_stats/route.ts", "utf8");

  assert.match(
    source,
    /if \(archiveMode\)[\s\S]*loadPublicBattleArchivePage\(getPrisma\(\)/
  );
  assert.match(source, /matches: page\.rows/);
  assert.match(source, /nextOffset: page\.nextOffset/);
  assert.doesNotMatch(source, /archiveMode\s*\?\s*5000/);
});

test("archive SQL mirrors public identity and eligibility normalization", async () => {
  const source = await readFile("lib/publicBattleArchive.ts", "utf8");

  assert.match(source, /jsonb_typeof\(gs\.key_events::jsonb -> 'platform_match_id'\) = 'string'/);
  assert.match(source, /lower\(btrim\(gs\.key_events::jsonb ->> 'platform_match_id'\)\) not in/);
  assert.match(source, /then 'platform:' \|\| platform_match_id/);
  assert.match(source, /else 'hash:' \|\| replay_hash/);
  assert.match(source, /archive_filename not like '%\.aoe2mpgame'/);
  assert.match(source, /normalized_parse_reason <> 'watcher_final_unparsed'/);
  assert.match(source, /or named_player_count >= 2/);
  assert.match(source, /select count\(\*\)::bigint as total[\s\S]*from battles/);
});

test("identical live polls preserve loaded archive pages while refreshing seed metadata", () => {
  const seed = [archiveRow(101, "2026-08-26T12:00:00.000Z")];
  const loaded = archiveRow(100, "2026-08-26T11:00:00.000Z");
  const initial = buildLiveArchiveClientState(seed, 1, 3);
  const expanded = appendLiveArchiveClientPage(initial, {
    requestedSeedSignature: initial.seedSignature,
    requestedOffset: 1,
    matches: [loaded],
    nextOffset: 2,
    total: 3,
  });
  const refreshedSeed = [{ ...seed[0], map: { name: "Arena" } }];
  const refreshed = reconcileLiveArchiveClientState(
    expanded,
    refreshedSeed,
    1,
    3
  );

  assert.deepEqual(refreshed.matches.map((match) => match.id), [101, 100]);
  assert.deepEqual(refreshed.matches[0].map, { name: "Arena" });
  assert.equal(refreshed.offset, 2);
  assert.equal(refreshed.hasMore, true);
});

test("changed archive seeds reset pagination and stale page responses are discarded", () => {
  const oldSeed = [archiveRow(201, "2026-08-26T12:00:00.000Z")];
  const oldState = buildLiveArchiveClientState(oldSeed, 1, 4);
  const newSeed = [archiveRow(202, "2026-08-26T12:05:00.000Z")];
  const reset = reconcileLiveArchiveClientState(oldState, newSeed, 2, 5);
  const stale = appendLiveArchiveClientPage(reset, {
    requestedSeedSignature: oldState.seedSignature,
    requestedOffset: 1,
    matches: [archiveRow(199, "2026-08-26T11:00:00.000Z")],
    nextOffset: 2,
    total: 4,
  });

  assert.deepEqual(reset.matches.map((match) => match.id), [202]);
  assert.equal(reset.offset, 2);
  assert.equal(reset.hasMore, true);
  assert.equal(stale, reset);
});
