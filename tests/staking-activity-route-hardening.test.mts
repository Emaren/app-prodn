import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(
  new URL("../app/api/staking/activity/route.ts", import.meta.url),
  "utf8",
);

test("staking activity rejects malformed cursors before querying the ledger", () => {
  const validation = route.indexOf('detail: "Invalid before cursor."');
  const ledgerLoad = route.indexOf("loadMainnetTransferStakingActivityPage(getPrisma()");

  assert.ok(validation > 0);
  assert.ok(ledgerLoad > validation);
  assert.match(route, /\{ status: 400, headers: NO_STORE_HEADERS \}/);
});

test("staking activity never caches financial history or exposes internal failures", () => {
  assert.match(
    route,
    /ok: true,[\s\S]*?nextBefore: null,[\s\S]*?\{ headers: NO_STORE_HEADERS \}/,
  );
  assert.match(route, /console\.error\("Staking activity load failed:", error\)/);
  assert.match(route, /detail: "Staking activity is unavailable\."/);
  assert.doesNotMatch(
    route,
    /const detail\s*=\s*error instanceof Error \? error\.message/,
  );
});
