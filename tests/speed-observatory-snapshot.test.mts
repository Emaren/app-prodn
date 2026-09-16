import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function numberAfter(source: string, label: string) {
  const match = source.match(new RegExp(`${label}:\\s*([0-9.]+)`));
  assert.ok(match, `missing ${label}`);
  return Number(match[1]);
}

const source = fs.readFileSync("lib/speed/observatorySnapshot.ts", "utf8");

test("SpeedOS route cohort counts reconcile to the audited estate", () => {
  const audited = numberAfter(source, "audited");
  const edge = numberAfter(source, "edgeCached");
  const dynamic = numberAfter(source, "dynamic");
  assert.equal(edge + dynamic, audited);
});

test("SpeedOS edge proof remains internally coherent", () => {
  assert.equal(numberAfter(source, "hitRoutes"), numberAfter(source, "eligibleRoutes"));
  assert.equal(numberAfter(source, "cookieLeaks"), 0);
  assert.equal(numberAfter(source, "rscLeaks"), 0);
  assert.ok(numberAfter(source, "afterTtfbP50Ms") < numberAfter(source, "beforeTtfbP50Ms"));
  assert.ok(numberAfter(source, "speedup") > 1);
});

test("SpeedOS TTFB histogram accounts for all 78 benchmark routes", () => {
  const block = source.match(/routeDistribution:\s*\[([\s\S]*?)\n\s*\],/);
  assert.ok(block);
  const counts = [...block[1].matchAll(/count:\s*(\d+)/g)].map((match) => Number(match[1]));
  assert.equal(counts.reduce((sum, count) => sum + count, 0), 78);
});
