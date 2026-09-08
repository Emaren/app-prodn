import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("staking page aggregates lifetime transaction fees in Postgres without loading every event", async () => {
  const source = await readFile("app/staking/page.tsx", "utf8");

  assert.match(source, /sum\([\s\S]*?metadata ->> 'txFeeWolo'[\s\S]*?from staking_events/);
  assert.match(source, /where status = 'CONFIRMED'/);
  assert.doesNotMatch(source, /stakingEvent\.findMany\(\{[\s\S]*?metadata:\s*true/);

  const overviewStart = source.indexOf("const overviewPromise = Promise.allSettled([");
  const query = source.indexOf("total_tx_fees_wolo", overviewStart);
  const overviewEnd = source.indexOf("  ]);", query);
  const overviewAwait = source.indexOf("] = await overviewPromise;", overviewEnd);
  assert.ok(
    overviewStart >= 0 &&
      query > overviewStart &&
      overviewEnd > query &&
      overviewAwait > overviewEnd,
  );

  assert.match(source, /async function StakingTrustRail/);
  assert.match(source, /<Suspense fallback=\{<StakingTrustRailFallback \/>\}>/);
  assert.doesNotMatch(source, /trustRailPromise/);
});

test("recent activity owns a bounded flex viewport with internal scrolling", async () => {
  const [page, feed] = await Promise.all([
    readFile("app/staking/page.tsx", "utf8"),
    readFile("app/staking/StakingActivityFeed.tsx", "utf8"),
  ]);

  assert.match(page, /id === "staking-advanced"[\s\S]*?h-\[72svh\][\s\S]*?max-h-\[54rem\]/);
  assert.match(page, /h-0 min-h-0 flex-1 overflow-hidden/);
  assert.match(feed, /h-0 min-h-0 flex-1[^"]*overflow-y-auto/);
  assert.match(feed, /\[scrollbar-gutter:stable\]/);
});
