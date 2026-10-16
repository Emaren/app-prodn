import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  SATCHEL_MAX_SIGNED_INT64,
  hasMinimumSatchelConfirmations,
  isPositiveSatchelInt64,
} from "../lib/warSatchelInt64Evidence.ts";

test("Satchel evidence admits only canonical positive PostgreSQL signed-64 quantities", () => {
  assert.equal(SATCHEL_MAX_SIGNED_INT64, 9223372036854775807n);
  for (const valid of ["1","2","3","9223372036854775806","9223372036854775807"]) {
    assert.equal(isPositiveSatchelInt64(valid), true, valid);
  }
  for (const invalid of [
    "0","-1","+1","01"," 1","1 ","1.0","1e5","9223372036854775808",
    "9999999999999999999","10000000000000000000","9".repeat(30),
    "8".repeat(100000),"",null,undefined,10,1n,{},[],
  ]) {
    assert.equal(isPositiveSatchelInt64(invalid), false,
      typeof invalid === "string" && invalid.length > 45 ? "oversized string" : String(invalid));
  }
});
test("three confirmed blocks are the minimum, with no oversized bigint parsing", () => {
  assert.equal(hasMinimumSatchelConfirmations("3",3),true);
  assert.equal(hasMinimumSatchelConfirmations("4",3),true);
  assert.equal(hasMinimumSatchelConfirmations("2",3),false);
  assert.equal(hasMinimumSatchelConfirmations("0",3),false);
  assert.equal(hasMinimumSatchelConfirmations("9223372036854775807",3),true);
  assert.equal(hasMinimumSatchelConfirmations("9223372036854775808",3),false);
  assert.equal(hasMinimumSatchelConfirmations("9".repeat(100000),3),false);
  assert.equal(hasMinimumSatchelConfirmations("3",0),false);
  assert.equal(hasMinimumSatchelConfirmations("3",Number.NaN),false);
  assert.equal(hasMinimumSatchelConfirmations("3",3.3),false);
});
test("read-only canonical inspector and immutable recorder both share exact DB-safe bounds", () => {
  const inspector = readFileSync(new URL("../lib/warSatchelCanonicalReceipt.ts",import.meta.url),"utf8");
  const recorder = readFileSync(new URL("../lib/warSatchelUncreditedProofRecorder.ts",import.meta.url),"utf8");
  assert.match(inspector,/isPositiveSatchelInt64\(it\.amountUwolo\)/);
  assert.match(inspector,/isPositiveSatchelInt64\(sync\.latest_block_height\)/);
  assert.match(inspector,/isPositiveSatchelInt64\(tx\.height\)/);
  assert.match(recorder,/isPositiveSatchelInt64\(proof\.height\)/);
  assert.match(recorder,/hasMinimumSatchelConfirmations\(proof\.confirmations, 3\)/);
  assert.match(recorder,/isPositiveSatchelInt64\(intent\.amountUwolo\)/);
  assert.doesNotMatch(recorder,/\[1-9\]\[0-9\]\*/);
  assert.match(recorder,/creditAuthorized: false/);
  assert.match(recorder,/wagerAuthorized: false/);
  assert.match(recorder,/isolationLevel: "Serializable"/);
});
