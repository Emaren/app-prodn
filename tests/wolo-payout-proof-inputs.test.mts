import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canonicalPayoutUWolo, canonicalPayoutTxHash } from "../lib/woloPayoutProofInputs.ts";

test("exact WOLO financial proof converts six decimal places with no value loss", () => {
  const accepted: Array<[number,string]> = [
    [1, "1000000"],
    [0.000001, "1"],
    [0.123456, "123456"],
    [500, "500000000"],
    [10_000, "10000000000"],
    [100_000_000.123456, "100000000123456"],
  ];
  for (const [value, units] of accepted) {
    assert.equal(canonicalPayoutUWolo(value), units, String(value));
  }
});
test("invalid, fractional-micro and unsafe amounts refuse financial evidence", () => {
  const refused = [0, -1, NaN, Infinity, -Infinity, 0.0000001, 0.0000005,
    0.30000000000000004, 1.0000001, 10_000_000_000, Number.MAX_VALUE];
  for (const amount of refused) assert.equal(canonicalPayoutUWolo(amount), null, String(amount));
});
test("only exact 64-hex transaction IDs reach chain proof transport", () => {
  const hash = "aB".repeat(32);
  assert.equal(canonicalPayoutTxHash(hash), "AB".repeat(32));
  assert.equal(canonicalPayoutTxHash(" " + hash + " "), "AB".repeat(32));
  for (const hash of ["", "0".repeat(16), "0".repeat(63), "0".repeat(65),
    "g".repeat(64), "0".repeat(128)]) {
    assert.equal(canonicalPayoutTxHash(hash), null);
  }
  assert.equal(canonicalPayoutTxHash(null), null);
});
test("the claim payout guard refuses before REST/MsgSend grouping, without mutating claims", () => {
  const source = readFileSync(new URL("../lib/woloClaimPayoutGuards.ts", import.meta.url), "utf8");
  assert.match(source, /return canonicalPayoutTxHash\(value\)/);
  assert.match(source, /const amount = canonicalPayoutUWolo\(amountWolo\)/);
  assert.match(source, /amountUwolo: canonicalPayoutUWolo\(entry\.amountWolo\)/);
  assert.match(source, /entry\.amountUwolo && !entry\.invalidExpectedSource/);
  assert.match(source, /else if \(!canonicalPayoutUWolo\(original\.amountWolo\)\)/);
  assert.match(source, /failureCode: "INVALID_AMOUNT"/);
  assert.doesNotMatch(source, /toUwoLoAmount\(entry\.amountWolo\)/);
  assert.doesNotMatch(source, /pendingWoloClaim\.update|signAndBroadcast|executeFounderWoloPayout/);
});
