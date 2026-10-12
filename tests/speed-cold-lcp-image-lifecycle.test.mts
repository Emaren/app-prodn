import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";

// Exercise the actual browser-owned strings. A source-only regex assertion
// would not prove the guard, timestamps or exact LCP URL filtering.
const source = readFileSync(
  new URL("../scripts/aoe2_speed_cold_lcp.mjs", import.meta.url), "utf8",
);
const init = source.match(/const INIT_SCRIPT = String\.raw`([\s\S]*?)`;/);
const snapshot = source.match(/const SNAPSHOT_EXPR = String\.raw`([\s\S]*?)`;/);
assert.ok(init && snapshot, "both browser expressions must remain extractable");

type MockImage = {
  tagName: string;
  src: string;
  currentSrc: string;
  complete: boolean;
  naturalWidth: number;
  decoding: string;
  loading: string;
};

function captureLifecycle() {
  let now = 0;
  const listeners: Record<string, ((event: { target: MockImage }) => void)> = {};
  let onMutation: (records: Array<{ type: string; addedNodes: MockImage[] }>) => void = () => {};
  const lcpUrl = "https://aoe2war.com/api/media-assets/avatar/user-123-featured?size=card&v=20260630a";
  const image: MockImage = {
    tagName: "IMG",
    src: lcpUrl,
    currentSrc: lcpUrl,
    complete: false,
    naturalWidth: 0,
    decoding: "async",
    loading: "eager",
  };
  const otherImage: MockImage = { ...image, src: "https://aoe2war.com/favicon.ico", currentSrc: "https://aoe2war.com/favicon.ico" };
  const doc = {
    title: "AoE2WAR",
    addEventListener: (event: string, cb: (event: { target: MockImage }) => void) => { listeners[event] = cb; },
    querySelectorAll: (selector: string) => selector === "img" ? [image, otherImage] : [],
  };
  const state: Record<string, unknown> = {};
  const perf = {
    timeOrigin: 10_000,
    now: () => now,
    getEntriesByType: (kind: string) =>
      kind === "resource" ? [{
        name: lcpUrl, initiatorType: "link", startTime: 400, responseStart: 540,
        responseEnd: 690, duration: 290, transferSize: 83184,
        encodedBodySize: 83184, decodedBodySize: 83184,
      }] : [],
  };
  const context = {
    window: state, document: doc, performance: perf,
    location: { href: "https://aoe2war.com/" },
    MutationObserver: class {
      constructor(cb: typeof onMutation) { onMutation = cb; }
      observe(node: unknown, options: Record<string, unknown>) {
        assert.equal(node, doc);
        assert.deepEqual(JSON.parse(JSON.stringify(options)), { childList: true, subtree: true });
      }
    },
    PerformanceObserver: class {
      observe() { /* The LCP observer is independently populated below. */ }
    },
  };
  runInNewContext(init[1], context);
  const diag = state.__AOE2WAR_COLD_DIAG__ as {
    lcp: Array<{ url: string; startTime: number; loadTime: number; renderTime: number }>;
    featuredImageEvents: Array<{ phase: string; atMs: number; url: string; complete: boolean; naturalWidth: number }>;
    featuredImageEventsCapped: boolean;
  };

  now = 820;
  onMutation([{ type: "childList", addedNodes: [image, otherImage] }]);
  // Multiple parent/child insert records for one image do not create duplicates.
  onMutation([{ type: "childList", addedNodes: [image] }]);
  now = 910;
  image.complete = true; image.naturalWidth = 240;
  listeners.load({ target: image });
  listeners.load({ target: otherImage });
  now = 1120;
  listeners.DOMContentLoaded({ target: image });
  diag.lcp.push({ url: lcpUrl, startTime: 1560, loadTime: 1472, renderTime: 1560 });

  const output = runInNewContext(snapshot[1], context) as {
    lcpImageLifecycle: {
      trackedFeaturedEvents: number; capped: boolean;
      firstInsertedAtMs: number | null;
      firstNativeLoadAtMs: number | null;
      domContentLoadedObservedAtMs: number | null;
      events: Array<{ phase: string; atMs: number; url: string; complete: boolean; naturalWidth: number }>;
    };
    lcpResourceMatchCount: number;
  };
  return { output, diag, lcpUrl, image, listeners };
}

test("records exact featured LCP insertion, native load and DOMContentLoaded without modifying image", () => {
  const { output, lcpUrl, image } = captureLifecycle();
  const life = output.lcpImageLifecycle;
  assert.equal(life.trackedFeaturedEvents, 3);
  assert.equal(life.capped, false);
  assert.equal(life.firstInsertedAtMs, 820);
  assert.equal(life.firstNativeLoadAtMs, 910);
  assert.equal(life.domContentLoadedObservedAtMs, 1120);
  assert.deepEqual(life.events.map((x) => x.phase), ["insert", "native-load", "dom-content-loaded"]);
  assert.ok(life.events.every((e) => e.url === lcpUrl));
  assert.equal(life.events[0].complete, false);
  assert.equal(life.events[1].complete, true);
  assert.equal(life.events[1].naturalWidth, 240);
  assert.equal(image.src, lcpUrl);
  assert.equal(output.lcpResourceMatchCount, 1);
});

test("when the LCP candidate is unrelated, report no exact image lifecycle timestamps", () => {
  const { diag, output, image, listeners } = captureLifecycle();
  image.currentSrc = image.src = "https://aoe2war.com/favicon.ico";
  listeners.load({ target: image });
  assert.equal(diag.featuredImageEvents.length, 3);
  assert.equal(output.lcpImageLifecycle.firstInsertedAtMs, 820);
});

test("featured event evidence is capped, rather than collecting unbounded per-image logs", () => {
  const { diag, image, listeners } = captureLifecycle();
  for (let i = 0; i < 105; i += 1) listeners.load({ target: image });
  assert.equal(diag.featuredImageEvents.length, 96);
  assert.equal(diag.featuredImageEventsCapped, true);
});
