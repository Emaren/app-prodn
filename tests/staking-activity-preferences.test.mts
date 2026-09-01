import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  STAKING_ACTIVITY_PREFERENCES_VERSION,
  resolveStakingActivityPreferences,
  serializeStakingActivityPreferences,
} from "../lib/stakingActivityPreferences.ts";
import { shouldQueueStakingActivityLiveRow } from "../lib/stakingActivityLivePolicy.ts";

test("new and corrupt preferences default Recent Activity to grouped", () => {
  for (const storedV2 of [null, "", "not-json", '{"version":2,"mode":"unknown"}']) {
    const result = resolveStakingActivityPreferences({
      storedV2,
      isAdmin: false,
    });
    assert.equal(result.preferences.mode, "grouped");
    assert.equal(result.preferences.filterMode, "all");
  }
});

test("the v1 auto-written ledger default is not mistaken for user intent", () => {
  const result = resolveStakingActivityPreferences({
    storedV2: null,
    storedLegacy: JSON.stringify({
      mode: "ledger",
      filterMode: "transfers",
      beltPayoutFilterMode: "tributes",
    }),
    isAdmin: false,
  });

  assert.equal(result.source, "legacy-filter-migration");
  assert.deepEqual(result.preferences, {
    version: STAKING_ACTIVITY_PREFERENCES_VERSION,
    mode: "ledger",
    filterMode: "transfers",
    beltPayoutFilterMode: "tributes",
  });
});

test("a deliberate v2 ledger choice persists exactly", () => {
  const storedV2 = serializeStakingActivityPreferences({
    mode: "ledger",
    filterMode: "all",
    beltPayoutFilterMode: "all",
  });
  const result = resolveStakingActivityPreferences({
    storedV2,
    storedLegacy: JSON.stringify({ mode: "grouped" }),
    isAdmin: false,
  });

  assert.equal(result.source, "stored-v2");
  assert.equal(result.preferences.mode, "ledger");
  assert.equal(JSON.parse(storedV2).version, STAKING_ACTIVITY_PREFERENCES_VERSION);
});

test("ledger-only filters remain ledger and reserve stays administrator-only", () => {
  const bounty = resolveStakingActivityPreferences({
    storedV2: serializeStakingActivityPreferences({
      mode: "grouped",
      filterMode: "bounties",
      beltPayoutFilterMode: "all",
    }),
    isAdmin: false,
  });
  assert.equal(bounty.preferences.mode, "ledger");

  for (const filterMode of ["belts", "staking", "compounded", "transfers"] as const) {
    const result = resolveStakingActivityPreferences({
      storedV2: serializeStakingActivityPreferences({
        mode: "grouped",
        filterMode,
        beltPayoutFilterMode: "all",
      }),
      isAdmin: false,
    });
    assert.equal(
      result.preferences.mode,
      "ledger",
      `${filterMode} must not request grouped-bet data`,
    );
  }

  const reserveRaw = JSON.stringify({
    version: STAKING_ACTIVITY_PREFERENCES_VERSION,
    mode: "grouped",
    filterMode: "reserve",
    beltPayoutFilterMode: "all",
  });
  assert.equal(
    resolveStakingActivityPreferences({ storedV2: reserveRaw, isAdmin: false })
      .preferences.filterMode,
    "all",
  );
  const adminReserve = resolveStakingActivityPreferences({
    storedV2: reserveRaw,
    isAdmin: true,
  }).preferences;
  assert.equal(adminReserve.filterMode, "reserve");
  assert.equal(adminReserve.mode, "ledger");
});

test("the feed is wired to the versioned helper and grouped initial render", () => {
  const source = readFileSync(
    new URL("../app/staking/StakingActivityFeed.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /useState<ActivityMode>\("grouped"\)/);
  assert.match(source, /resolveStakingActivityPreferences\(/);
  assert.match(source, /serializeStakingActivityPreferences\(/);
  assert.match(source, /LEGACY_STAKING_ACTIVITY_PREFS_KEY/);
  assert.match(source, /pendingLiveRows/);
  assert.match(source, /new \{pendingVisibleRows\.length === 1 \? "entry" : "entries"\} · Show/);
  assert.doesNotMatch(source, /setRows\(\(current\) => mergeActivityRows\(nextRows, current\)\)/);

  const pollPayload = source.indexOf(
    "const payload = (await response.json()) as ActivityPageResponse;",
    source.indexOf("const poll = async"),
  );
  const cancellationFence = source.indexOf("if (cancelled) return;", pollPayload);
  const pollRows = source.indexOf("const nextRows =", pollPayload);
  assert.ok(pollPayload >= 0 && cancellationFence > pollPayload && cancellationFence < pollRows);
});

test("live activity queue policy rejects stale, hidden, duplicate, and grouped browser rows", () => {
  const base = {
    mode: "ledger" as const,
    viewReady: true,
    matchesView: true,
    alreadyKnown: false,
  };

  assert.equal(
    shouldQueueStakingActivityLiveRow({ ...base, source: "poll" }),
    true,
  );
  assert.equal(
    shouldQueueStakingActivityLiveRow({
      ...base,
      source: "poll",
      cancelled: true,
    }),
    false,
  );
  assert.equal(
    shouldQueueStakingActivityLiveRow({
      ...base,
      source: "poll",
      viewReady: false,
    }),
    false,
  );
  assert.equal(
    shouldQueueStakingActivityLiveRow({
      ...base,
      source: "poll",
      matchesView: false,
    }),
    false,
  );
  assert.equal(
    shouldQueueStakingActivityLiveRow({
      ...base,
      source: "poll",
      alreadyKnown: true,
    }),
    false,
  );
  assert.equal(
    shouldQueueStakingActivityLiveRow({
      ...base,
      source: "browser-event",
      mode: "grouped",
    }),
    false,
  );
  assert.equal(
    shouldQueueStakingActivityLiveRow({
      ...base,
      source: "browser-event",
    }),
    true,
  );
});
