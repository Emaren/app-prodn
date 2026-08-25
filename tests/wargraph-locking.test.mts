import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { warGraphAdvisoryLockKey } from "../lib/wargraph/foundationContract.ts";

async function source(path: string): Promise<string> {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("every graph writer delegates to one canonical advisory-lock key", async () => {
  assert.equal(warGraphAdvisoryLockKey(7), "wargraph:7");

  const [foundation, commands, presence, gravity, correlation, settlement] =
    await Promise.all([
      source("../lib/wargraph/foundation.ts"),
      source("../lib/wargraph/commands.ts"),
      source("../lib/wargraph/presence.ts"),
      source("../lib/wargraph/gravity.ts"),
      source("../lib/wargraph/prismaCorrelationWorker.ts"),
      source("../lib/wargraph/prismaSettlementWorker.ts"),
    ]);

  assert.match(
    foundation,
    /pg_advisory_xact_lock\(hashtextextended\(\$\{warGraphAdvisoryLockKey\(graphId\)\}, 0\)\)/u,
  );
  assert.match(
    foundation,
    /lockWarGraphTransaction\(tx, graphIdentity\.id\)/u,
  );
  assert.equal(
    commands.match(/lockWarGraphTransaction\(tx, foundation\.graphId\)/gu)
      ?.length,
    3,
  );
  assert.match(presence, /lockWarGraphTransaction\(tx, foundation\.graphId\)/u);
  assert.match(gravity, /lockWarGraphTransaction\(tx, input\.graphId\)/u);
  assert.match(correlation, /lockWarGraphTransaction\(tx, graphId\)/u);
  assert.match(settlement, /lockWarGraphTransaction\(tx, graphId\)/u);
  assert.match(settlement, /lockWarGraphTransaction\(tx, input\.graphId\)/u);

  for (const worker of [correlation, settlement]) {
    assert.doesNotMatch(worker, /hashtextextended/u);
  }
});

test("battle workers acquire the game lock before the graph lock", async () => {
  for (const path of [
    "../lib/wargraph/prismaCorrelationWorker.ts",
    "../lib/wargraph/prismaSettlementWorker.ts",
  ]) {
    const worker = await source(path);
    const gameLock = worker.indexOf("pg_advisory_xact_lock(${gameStatsId})");
    const graphLock = worker.indexOf("lockWarGraphTransaction(tx, graphId)");
    assert.ok(gameLock >= 0, `${path} must acquire the game lock`);
    assert.ok(graphLock > gameLock, `${path} must acquire the graph lock second`);
  }
});
