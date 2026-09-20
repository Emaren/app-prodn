import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("completed #JimsRule backfill accepts an empty correction plan as idempotently complete", async () => {
  const source = await readFile("scripts/audit-backfill-jims-rule.mts", "utf8");

  assert.match(
    source,
    /before\.length\s*>\s*0\s*&&\s*before\.every\(\(row\)\s*=>\s*!row\.existingClaim\)/
  );
  assert.match(
    source,
    /if \(outstanding\.length === 0\)[\s\S]*PASS: no outstanding #JimsRule corrections remain\./
  );
});
