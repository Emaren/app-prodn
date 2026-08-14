import assert from "node:assert/strict";
import test from "node:test";

import { createGenerationKeyedLoader } from "../lib/generationKeyedLoader.ts";

test("same-generation projection loads coalesce and remain reusable", async () => {
  const load = createGenerationKeyedLoader<object, string[]>();
  const source = {};
  let queryCalls = 0;

  const loadFresh = async () => {
    queryCalls += 1;
    await Promise.resolve();
    return ["complete replay corpus"];
  };

  const [academy, zodiac, player] = await Promise.all([
    load(source, "generation-a", loadFresh),
    load(source, "generation-a", loadFresh),
    load(source, "generation-a", loadFresh),
  ]);
  const nextMatchPage = await load(source, "generation-a", loadFresh);

  assert.equal(queryCalls, 1);
  assert.strictEqual(academy, zodiac);
  assert.strictEqual(zodiac, player);
  assert.strictEqual(player, nextMatchPage);
});

test("a new generation replaces the retained projection without truncating it", async () => {
  const load = createGenerationKeyedLoader<object, number[]>();
  const source = {};
  let queryCalls = 0;

  const first = await load(source, "generation-a", async () => {
    queryCalls += 1;
    return [1, 2, 3];
  });
  const second = await load(source, "generation-b", async () => {
    queryCalls += 1;
    return [1, 2, 3, 4];
  });
  const firstReloaded = await load(source, "generation-a", async () => {
    queryCalls += 1;
    return [1, 2, 3];
  });

  assert.deepEqual(first, [1, 2, 3]);
  assert.deepEqual(second, [1, 2, 3, 4]);
  assert.deepEqual(firstReloaded, [1, 2, 3]);
  assert.equal(queryCalls, 3);
});

test("failed loads are retried and data sources remain isolated", async () => {
  const load = createGenerationKeyedLoader<object, string>();
  const sourceA = {};
  const sourceB = {};
  let sourceACalls = 0;
  let sourceBCalls = 0;

  await assert.rejects(
    load(sourceA, "generation-a", async () => {
      sourceACalls += 1;
      throw new Error("temporary query failure");
    }),
    /temporary query failure/,
  );

  const [retry, isolated] = await Promise.all([
    load(sourceA, "generation-a", async () => {
      sourceACalls += 1;
      return "source-a";
    }),
    load(sourceB, "generation-a", async () => {
      sourceBCalls += 1;
      return "source-b";
    }),
  ]);

  assert.equal(retry, "source-a");
  assert.equal(isolated, "source-b");
  assert.equal(sourceACalls, 2);
  assert.equal(sourceBCalls, 1);
});
