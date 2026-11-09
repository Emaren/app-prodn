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

test("serial heavy corpus loader never overlaps distinct generations", async () => {
  const load = createGenerationKeyedLoader<object, string[]>(1, {
    serializeLoads: true,
  });
  const source = {};
  let running = 0;
  let maximumRunning = 0;
  const gates: Array<() => void> = [];
  const started: string[] = [];
  const fresh = (key: string) => async () => {
    running += 1;
    maximumRunning = Math.max(maximumRunning, running);
    started.push(key);
    await new Promise<void>((resolve) => gates.push(resolve));
    running -= 1;
    return [key, "all historical rows retained"];
  };

  const a = load(source, "a", fresh("a"));
  const b = load(source, "b", fresh("b"));
  const c = load(source, "c", fresh("c"));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(started, ["a"]);
  assert.equal(running, 1);
  gates.shift()?.();
  assert.deepEqual(await a, ["a", "all historical rows retained"]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(started, ["a", "b"]);
  gates.shift()?.();
  assert.deepEqual(await b, ["b", "all historical rows retained"]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(started, ["a", "b", "c"]);
  gates.shift()?.();
  assert.deepEqual(await c, ["c", "all historical rows retained"]);
  assert.equal(maximumRunning, 1);
});

test("serial failure cannot poison a later generation or cross-source work", async () => {
  const load = createGenerationKeyedLoader<object, number>(1, {
    serializeLoads: true,
  });
  const sourceA = {};
  const sourceB = {};
  let release!: () => void;
  const first = load(sourceA, "first", async () => {
    await new Promise<void>((resolve) => { release = resolve; });
    throw new Error("database denied");
  });
  const subsequent = load(sourceA, "second", async () => 42);
  const other = load(sourceB, "second", async () => 99);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(await other, 99);
  release();
  await assert.rejects(first, /database denied/);
  assert.equal(await subsequent, 42);
  const reuse = await load(sourceA, "second", async () => {
    throw new Error("same-gen should never rerun");
  });
  assert.equal(reuse, 42);
});

test("heavy corpus serial retry stays bounded under rapid generation churn", async () => {
  const load = createGenerationKeyedLoader<object, number[]>(1, {
    serializeLoads: true,
  });
  const source = {};
  let concurrent = 0;
  let maxConcurrent = 0;
  const all = Array.from({ length: 12 }, (_, generation) =>
    load(source, String(generation), async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise<void>((resolve) => setImmediate(resolve));
      concurrent--;
      return Array.from({ length: 128 }, (_, n) => generation * 128 + n);
    }),
  );
  const values = await Promise.all(all);
  assert.equal(values.length, 12);
  assert.equal(values.every((v) => v.length === 128), true);
  assert.equal(new Set(values.flat()).size, 12 * 128);
  assert.equal(maxConcurrent, 1);
});
