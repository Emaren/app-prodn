import assert from "node:assert/strict";
import test from "node:test";

import {
  reconcileBetMarketStatsLinks,
} from "../lib/bets.ts";

test(
  "settled market proof linking is bounded, deduplicated, and append-only",
  async () => {
    const uniqueSessionKeys = Array.from(
      { length: 31 },
      (_, index) => `platform-game-${index + 1}`
    );
    const rows = uniqueSessionKeys.flatMap((linkedSessionKey) => [
      { linkedSessionKey },
      { linkedSessionKey: `  ${linkedSessionKey}  ` },
    ]);

    let marketQuery: Record<string, unknown> | null = null;
    let resolverCalls = 0;
    let activeResolvers = 0;
    let maxActiveResolvers = 0;
    const updates: Array<Record<string, unknown>> = [];

    const prisma = {
      betMarket: {
        findMany: async (args: Record<string, unknown>) => {
          marketQuery = args;
          return rows;
        },
        updateMany: async (args: Record<string, unknown>) => {
          updates.push(args);
          return { count: 1 };
        },
      },
      gameStats: {
        findFirst: async () => {
          const call = resolverCalls++;
          activeResolvers += 1;
          maxActiveResolvers = Math.max(
            maxActiveResolvers,
            activeResolvers
          );

          await new Promise<void>((resolve) => setImmediate(resolve));
          activeResolvers -= 1;

          // One temporarily unresolved final must remain unlinked. It must
          // never trigger an update that clears or fabricates proof.
          return call === 5 ? null : { id: 10_000 + call };
        },
      },
    };

    await reconcileBetMarketStatsLinks(prisma as never);

    assert.equal(resolverCalls, uniqueSessionKeys.length);
    assert.ok(maxActiveResolvers > 1);
    assert.ok(maxActiveResolvers <= 12);
    assert.equal(updates.length, uniqueSessionKeys.length - 1);

    const where = (
      marketQuery as {
        where?: Record<string, unknown>;
      }
    )?.where;
    assert.equal(where?.linkedGameStatsId, null);
    assert.equal(where?.status, "settled");
    assert.ok(where?.wagers);

    for (const update of updates) {
      const updateWhere = update.where as Record<string, unknown>;
      const data = update.data as Record<string, unknown>;
      assert.equal(updateWhere.linkedGameStatsId, null);
      assert.equal(updateWhere.status, "settled");
      assert.equal(typeof data.linkedGameStatsId, "number");
      assert.notEqual(data.linkedGameStatsId, null);
    }
  }
);
