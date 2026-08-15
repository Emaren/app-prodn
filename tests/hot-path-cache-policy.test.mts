import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const statisticsSource = fs.readFileSync(
  new URL("../app/api/statistics/route.ts", import.meta.url),
  "utf8",
);

const watcherSource = fs.readFileSync(
  new URL("../app/admin/watcher-funnel/page.tsx", import.meta.url),
  "utf8",
);

const cacheSource = fs.readFileSync(
  new URL("../lib/staleWhileRevalidateCache.ts", import.meta.url),
  "utf8",
);

test(
  "Statistics uses deterministic process-local SWR caching",
  () => {
    assert.match(
      statisticsSource,
      /createStaleWhileRevalidateCache/,
    );

    assert.doesNotMatch(
      statisticsSource,
      /unstable_cache/,
    );

    assert.match(
      statisticsSource,
      /async function queryStatisticsRows/,
    );

    assert.match(
      statisticsSource,
      /const loadStatisticsRows = createStaleWhileRevalidateCache/,
    );

    assert.match(
      statisticsSource,
      /60 \* 60 \* 1000/,
    );

    assert.match(
      statisticsSource,
      /export const dynamic = "force-dynamic"/,
    );
  },
);

test(
  "Watcher Funnel uses deterministic short SWR caching",
  () => {
    assert.match(
      watcherSource,
      /createStaleWhileRevalidateCache/,
    );

    assert.doesNotMatch(
      watcherSource,
      /unstable_cache/,
    );

    assert.match(
      watcherSource,
      /15_000/,
    );

    assert.match(
      watcherSource,
      /export const dynamic = "force-dynamic"/,
    );
  },
);

test(
  "SWR helper deduplicates cold work and preserves stale good data",
  () => {
    assert.match(
      cacheSource,
      /let inFlight: Promise<T> \| null = null/,
    );

    assert.match(
      cacheSource,
      /if \(inFlight\)/,
    );

    assert.match(
      cacheSource,
      /return entry\.value/,
    );

    assert.match(
      cacheSource,
      /void refresh\(\)\.catch/,
    );
  },
);
