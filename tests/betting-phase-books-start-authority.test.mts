import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildWatcherBattleStartIndex,
  earliestBattleStartedAt,
  resolveWatcherBattleStartedAt,
} from "../lib/betBattleStartAuthority.ts";
import { ensurePublicBattleIdentities } from "../lib/battleIdentity.ts";

test("Watcher start authority resolves canonical and promoted aliases", () => {
  const start = new Date("2026-09-29T21:00:00.000Z");
  const index = buildWatcherBattleStartIndex([
    {
      sessionKey: "platform:battle-42",
      identityAliases: ["watcher:jims:42", " Legacy:42 "],
      createdAt: start,
    },
  ]);

  for (const key of ["platform:battle-42", "WATCHER:JIMS:42", "legacy:42"]) {
    assert.equal(
      resolveWatcherBattleStartedAt(index, key)?.toISOString(),
      start.toISOString()
    );
  }
});

test("an alias claimed by two canonical sessions loses start authority", () => {
  const index = buildWatcherBattleStartIndex([
    {
      sessionKey: "platform:battle-42",
      identityAliases: ["shared-alias"],
      createdAt: "2026-09-29T21:00:00.000Z",
    },
    {
      sessionKey: "platform:battle-43",
      identityAliases: ["shared-alias"],
      createdAt: "2026-09-29T21:02:00.000Z",
    },
  ]);

  assert.equal(resolveWatcherBattleStartedAt(index, "shared-alias"), null);
  assert.equal(
    resolveWatcherBattleStartedAt(index, "platform:battle-42")?.toISOString(),
    "2026-09-29T21:00:00.000Z"
  );
});

test("duplicate evidence for one canonical session keeps the earliest proven start", () => {
  const index = buildWatcherBattleStartIndex([
    {
      sessionKey: "platform:battle-42",
      identityAliases: [],
      createdAt: "2026-09-29T21:00:05.000Z",
    },
    {
      sessionKey: "platform:battle-42",
      identityAliases: [],
      createdAt: "2026-09-29T21:00:00.000Z",
    },
  ]);

  assert.equal(
    resolveWatcherBattleStartedAt(index, "platform:battle-42")?.toISOString(),
    "2026-09-29T21:00:00.000Z"
  );
});

test("earliest battle start merge is monotonic toward the earliest proof", () => {
  assert.equal(
    earliestBattleStartedAt([
      new Date("2026-09-29T21:00:10.000Z"),
      null,
      new Date("2026-09-29T21:00:00.000Z"),
      new Date("2026-09-29T21:00:05.000Z"),
    ])?.toISOString(),
    "2026-09-29T21:00:00.000Z"
  );
});

test("BattleIdentity start is latched after first persistence", async () => {
  const row = {
    id: 1,
    identityKey: "platform:battle-42",
    publicNumber: 2820,
    state: "live",
    platformMatchId: "battle-42",
    startedAt: new Date("2026-09-29T21:00:00.000Z"),
    completedAt: null as Date | null,
  };

  const tx = {
    $executeRaw: async () => 0,
    battleIdentity: {
      findUnique: async ({ where }: {
        where: { platformMatchId?: string; identityKey?: string };
      }) => {
        if (where.platformMatchId) {
          return row.platformMatchId === where.platformMatchId ? row : null;
        }
        return row.identityKey === where.identityKey ? row : null;
      },
      update: async ({ data }: { data: Partial<typeof row> }) => {
        Object.assign(row, data);
        return {
          id: row.id,
          identityKey: row.identityKey,
          publicNumber: row.publicNumber,
        };
      },
      create: async () => {
        throw new Error("existing battle identity must be reused");
      },
    },
  };
  const prisma = {
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
  };

  await ensurePublicBattleIdentities(prisma as never, [
    {
      sessionKey: "platform:battle-42",
      state: "live",
      startedAt: new Date("2026-09-29T21:00:20.000Z"),
      allowCreate: true,
    },
  ]);

  assert.equal(row.startedAt.toISOString(), "2026-09-29T21:00:00.000Z");
});

test("bet seed plumbing carries start authority without persisting it on BetMarket", () => {
  const bets = readFileSync(new URL("../lib/bets.ts", import.meta.url), "utf8");

  assert.match(bets, /battleStartedAt\?: Date \| null/);
  assert.match(bets, /buildWatcherBattleStartIndex/);
  assert.match(bets, /resolveWatcherBattleStartedAt/);
  assert.match(bets, /startedAt: seed\.battleStartedAt \?\? null/);
  assert.match(
    bets,
    /family\.winnerSeed\.battleStartedAt[\s\S]*battleIdentities\.map\(\(identity\) => identity\.startedAt\)/
  );

  const createStart = bets.indexOf("function marketSeedCreateData");
  const updateStart = bets.indexOf("function marketSeedUpdateData", createStart);
  assert.ok(createStart >= 0 && updateStart > createStart);
  assert.doesNotMatch(
    bets.slice(createStart, updateStart),
    /battleStartedAt/
  );
});
