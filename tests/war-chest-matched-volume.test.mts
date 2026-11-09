import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { matchedVolumeFromSideTotals } from "../lib/warChestMatchedVolume.ts";

const row = (marketId: number, side: string, amountWolo: number | null) => ({
  marketId, side, _sum: { amountWolo },
});

test("War Chest weekly/all-time counts matching funded sides, not gross unmatched stake", () => {
  assert.equal(matchedVolumeFromSideTotals([
    row(7, "left", 100), row(7, "right", 15),
    row(8, "left", 50), row(8, "right", 100),
    row(9, "left", 900), row(9, "right", null),
  ]), 130);
  assert.equal(matchedVolumeFromSideTotals([row(1, "left", 100)]), 0);
  assert.equal(matchedVolumeFromSideTotals([]), 0);
});

test("War Chest side groups aggregate exactly even with duplicate row parts", () => {
  assert.equal(matchedVolumeFromSideTotals([
    row(1, "left", 2), row(1, "left", 3), row(1, "right", 1),
    row(2, "left", 10), row(2, "right", 10),
  ]), 22);
});

test("War Chest rejects cross-market totals beyond exact JS whole-WOLO representation", () => {
  const half = (Number.MAX_SAFE_INTEGER - 1) / 2;
  // Both market sums are safe; accumulating their Number totals is not.
  assert.throws(() => matchedVolumeFromSideTotals([
    row(1, "left", half), row(1, "right", half),
    row(2, "left", 1), row(2, "right", 1),
  ]), /WAR_CHEST_MATCHED_VOLUME_UNSAFE_TOTAL/);
  assert.equal(matchedVolumeFromSideTotals([
    row(1, "left", half), row(1, "right", half),
    row(2, "left", 0), row(2, "right", 1),
  ]), Number.MAX_SAFE_INTEGER - 1);
  assert.throws(() => matchedVolumeFromSideTotals([
    row(1, "left", Number.MAX_SAFE_INTEGER),
    row(1, "left", 1), row(1, "right", 1),
  ]), /WAR_CHEST_MATCHED_VOLUME_UNSAFE_TOTAL/);
});

test("War Chest rejects invalid group identity and fabricated/rounded amounts", () => {
  for (const invalid of [
    row(0, "left", 1), row(1.1, "left", 1),
    row(1, "unknown", 1), row(1, "left", -1),
    row(1, "right", 1.5), row(1, "right", Number.MAX_SAFE_INTEGER + 1),
  ]) {
    assert.throws(() => matchedVolumeFromSideTotals([invalid]),
      /WAR_CHEST_MATCHED_VOLUME_INVALID_GROUP/);
  }
});

test("existing War Chest consumer uses the same canonical exact matched-only helper", () => {
  const chest = readFileSync(new URL("../lib/warChest.ts", import.meta.url), "utf8");
  assert.match(chest, /import \{ matchedVolumeFromSideTotals \} from "@\/lib\/warChestMatchedVolume"/);
  assert.match(chest, /volumeWolo: matchedVolumeFromSideTotals\(weeklyMatchedSideTotals\)/);
  assert.match(chest, /totalWageredWolo: matchedVolumeFromSideTotals\(lifetimeMatchedSideTotals\)/);
  assert.doesNotMatch(chest, /current\.left \+=|current\.right \+=/);
});
