import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";

const source = readFileSync(
  new URL("../scripts/aoe2_speed_cold_lcp.mjs", import.meta.url),
  "utf8",
);
const match = source.match(/const SNAPSHOT_EXPR = String\.raw`([\s\S]*?)`;/);
assert.ok(match, "the browser snapshot expression must remain extractable");
const snapshotExpression = match[1];

type Resource = {
  name: string;
  initiatorType: string;
  startTime: number;
  responseStart: number;
  responseEnd: number;
  duration: number;
  transferSize: number;
  encodedBodySize: number;
  decodedBodySize: number;
};

function capture(
  url: string,
  resources: Resource[],
  hints: Array<{ href: string; fetchpriority: string }> = [],
) {
  const diag = {
    lcp: url ? [{ url, startTime: 1200, element: "img" }] : [],
    longTasks: [],
    layoutShifts: [],
  };
  const result = runInNewContext(snapshotExpression, {
    performance: {
      timeOrigin: 10000,
      getEntriesByType: (type: string) => type === "resource" ? resources : [],
    },
    window: { __AOE2WAR_COLD_DIAG__: diag },
    location: { href: "https://aoe2war.com/" },
    document: {
      title: "AoE2WAR",
      querySelectorAll: () => hints.map((hint) => ({
        href: hint.href,
        getAttribute: (name: string) => name === "fetchpriority" ? hint.fetchpriority : null,
      })),
    },
  });
  return result as {
    finalLcp: { url: string; startTime: number } | null;
    lcpResourceTiming: Resource | null;
    lcpResourceMatchCount: number;
    lcpPreloadHint: {
      imageHintCount: number;
      exactLcpHintCount: number;
      highPriorityExactHintCount: number;
    };
    resources: Resource[];
    resourceCount: number;
  };
}

function resource(name: string, startTime: number, duration: number): Resource {
  return {
    name, initiatorType: "img", startTime,
    responseStart: startTime + 20,
    responseEnd: startTime + duration,
    duration, transferSize: 83484,
    encodedBodySize: 83000, decodedBodySize: 83000,
  };
}

test("the final LCP resource is retained even when excluded from the longest 40", () => {
  const target = "https://aoe2war.com/api/media-assets/avatar/user-test-featured";
  const slowUnrelated = Array.from({ length: 45 }, (_, i) =>
    resource("https://aoe2war.com/static/" + i + ".js", 0, 1100 + i),
  );
  const lcp = resource(target, 550, 140);
  const result = capture(target, [...slowUnrelated, lcp]);

  assert.equal(result.finalLcp?.url, target);
  assert.equal(result.resources.length, 40);
  assert.equal(result.resourceCount, 46);
  assert.equal(result.resources.some((row) => row.name === target), false);
  assert.equal(result.lcpResourceMatchCount, 1);
  assert.equal(result.lcpResourceTiming?.name, target);
  assert.equal(result.lcpResourceTiming?.startTime, 550);
  assert.equal(result.lcpResourceTiming?.responseEnd, 690);
  assert.equal(result.lcpResourceTiming?.transferSize, 83484);
});

test("missing timing remains null, not a fabricated zero or unrelated resource", () => {
  const target = "https://aoe2war.com/api/media-assets/avatar/not-retained";
  const result = capture(target, [resource("https://aoe2war.com/elsewhere", 400, 80)]);
  assert.equal(result.lcpResourceTiming, null);
  assert.equal(result.lcpResourceMatchCount, 0);
  assert.equal(result.resources.length, 1);
});

test("LCP-less fallback remains null without deriving a false timing match", () => {
  const result = capture("", [resource("https://aoe2war.com/img.png", 400, 80)]);
  assert.equal(result.finalLcp, null);
  assert.equal(result.lcpResourceTiming, null);
  assert.equal(result.lcpResourceMatchCount, 0);
});

test("exact first-avatar preload hint is visible without duplicate LCP request", () => {
  const target = "https://aoe2war.com/api/media-assets/avatar/opening-featured?size=card";
  const unrelated = "https://aoe2war.com/api/media-assets/avatar/other-featured?size=card";
  const entry = { ...resource(target, 190, 110), initiatorType: "link" };
  const result = capture(target, [entry, resource(unrelated, 500, 120)], [
    { href: target, fetchpriority: "high" },
    { href: unrelated, fetchpriority: "low" },
  ]);
  assert.deepEqual(
    JSON.parse(JSON.stringify(result.lcpPreloadHint)),
    { imageHintCount: 2, exactLcpHintCount: 1, highPriorityExactHintCount: 1 },
  );
  assert.equal(result.lcpResourceMatchCount, 1);
  assert.equal(result.lcpResourceTiming?.initiatorType, "link");
  assert.equal(result.lcpResourceTiming?.startTime, 190);
});

test("a preload for a different image cannot masquerade as successful LCP preload", () => {
  const target = "https://aoe2war.com/api/media-assets/avatar/visible-featured?size=card";
  const result = capture(target, [resource(target, 700, 140)], [
    { href: "https://aoe2war.com/api/media-assets/avatar/other-featured?size=card", fetchpriority: "high" },
  ]);
  assert.equal(result.lcpPreloadHint.imageHintCount, 1);
  assert.equal(result.lcpPreloadHint.exactLcpHintCount, 0);
  assert.equal(result.lcpPreloadHint.highPriorityExactHintCount, 0);
  assert.equal(result.lcpResourceMatchCount, 1);
});
