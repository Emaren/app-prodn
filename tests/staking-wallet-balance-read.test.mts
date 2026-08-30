import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildUnstakeReserveCheck } from "../lib/stakingExecution.ts";

test("unknown staking-wallet balance fails the reserve execution check closed", () => {
  const check = buildUnstakeReserveCheck({
    requestedUnstakeWolo: 100,
    userConfirmedStakeWolo: 100,
    totalConfirmedStakedWolo: 1_000,
    stakingWalletBalanceUWolo: null,
    operatorReserveUWolo: 10_000_000_000n,
  });

  assert.equal(check.stakingWalletBalanceWolo, null);
  assert.equal(check.availableAfterUnstakeWolo, null);
  assert.equal(check.executable, false);
});

test("known sufficient and insufficient balances produce exact reserve decisions", () => {
  const sufficient = buildUnstakeReserveCheck({
    requestedUnstakeWolo: 100,
    userConfirmedStakeWolo: 100,
    totalConfirmedStakedWolo: 1_000,
    stakingWalletBalanceUWolo: 11_000_000_000n,
    operatorReserveUWolo: 10_000_000_000n,
  });
  const insufficient = buildUnstakeReserveCheck({
    requestedUnstakeWolo: 100,
    userConfirmedStakeWolo: 100,
    totalConfirmedStakedWolo: 1_000,
    stakingWalletBalanceUWolo: 10_999_999_999n,
    operatorReserveUWolo: 10_000_000_000n,
  });

  assert.equal(sufficient.requiredBalanceAfterUnstakeWolo, 10_900);
  assert.equal(sufficient.availableAfterUnstakeWolo, 10_900);
  assert.equal(sufficient.executable, true);
  assert.equal(insufficient.executable, false);
  assert.equal(insufficient.operatorTopUpNeededWolo, 0.000001);
});

test("staking execution consumes the canonical provenance-bearing balance adapter", async () => {
  const [executionSource, routeSource] = await Promise.all([
    readFile("lib/stakingExecution.ts", "utf8"),
    readFile("app/api/staking/me/route.ts", "utf8"),
  ]);

  assert.match(executionSource, /fetchWoloBalanceSnapshot\(runtime\.stakingWalletAddress\)/);
  assert.match(executionSource, /snapshot\.chainId !== WOLO_CHAIN_ID/);
  assert.match(executionSource, /balanceLookupErrorCode = "upstream_unavailable"/);
  assert.match(
    executionSource,
    /executable:\s*availableAfterUnstakeUWolo != null &&[\s\S]*?availableAfterUnstakeUWolo >= requiredBalanceAfterUnstakeUWolo/,
  );
  assert.match(routeSource, /status: limits\.balanceLookupError \? "DEGRADED" : "READY"/);
  assert.match(routeSource, /execution remains fail-closed/);
});
