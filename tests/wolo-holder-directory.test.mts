import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  missingHistoricalWoloAddresses,
  WOLO_HISTORIC_PLAYER_ACCOUNTS,
  woloAddressDirectorySummary,
} from "../lib/woloHolderDirectory.ts";

const [pigman, ra] = WOLO_HISTORIC_PLAYER_ACCOUNTS;

test("Pigman and Ra are verified address-book records, not invented 37th and 38th current holders", () => {
  assert.equal(WOLO_HISTORIC_PLAYER_ACCOUNTS.length, 2);
  assert.deepEqual(new Set(WOLO_HISTORIC_PLAYER_ACCOUNTS.map(x => x.label)),
    new Set(["[BDB]Pigman", "Ra 𓁛𓇳"]));
  assert.equal(pigman?.address, "wolo198ajhn5atpw65u6z89z5hwfer2vx90u4ydxe7z");
  assert.equal(ra?.address, "wolo1ntal93v8c5wryq2d9puhks8l25zedhepyv8n5k");
  const mock36 = Array.from({ length: 36 }, (_, i) => ({
    address: `wolo1mock${i.toString().padStart(3, "0")}`,
  }));
  assert.deepEqual(woloAddressDirectorySummary(mock36), {
    currentHolderCount:36,additionalHistoricalCount:2,listedAddressCount:38,
  });
});

test("directory is deduplicated when historical identity becomes an active holder", () => {
  const holders = [
    { address:"wolo1placeholder" },
    { address:pigman!.address.toUpperCase() },
  ];
  const extra = missingHistoricalWoloAddresses(holders);
  assert.equal(extra.length,1);
  assert.equal(extra[0]?.address,ra?.address);
  assert.deepEqual(woloAddressDirectorySummary(holders), {
    currentHolderCount:2,additionalHistoricalCount:1,listedAddressCount:3,
  });
});

test("public directory reads only governed historic accounts; results and totals remain source-bound", () => {
  const page = readFileSync("components/wolo/WoloChainLiveTransparency.tsx", "utf8");
  const holdersApi = readFileSync("app/api/wolo/holders/route.ts", "utf8");
  assert.match(page,/\/api\/wolo\/balance\//);
  assert.match(page,/parseWoloBalanceApiPayload/);
  assert.match(page,/parsed\.amount === "0" \? "zero" : "nonzero"/);
  assert.match(page,/Balance unavailable/);
  assert.match(page,/Current liquid holders and active stakers\./);
  assert.doesNotMatch(page,/Player and unclassified wallet \+ stake totals/);
  assert.match(holdersApi,/count: holders\.length/);
  assert.doesNotMatch(holdersApi,/WOLO_HISTORIC_PLAYER_ACCOUNTS/);
});
