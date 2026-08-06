import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const chronicle = readFileSync(
  "components/workshop/WorkshopChronicle.tsx",
  "utf8",
);
const publication = readFileSync(
  "scripts/publish-workshop-2026-08-06.mts",
  "utf8",
);

test("Workshop Chronicle uses one full-width reading rail", () => {
  assert.match(chronicle, /max-w-6xl/);
  assert.match(chronicle, /pl-12 sm:pl-16/);
  assert.match(chronicle, /loaded records/);
  assert.doesNotMatch(chronicle, /sm:grid-cols-2/);
  assert.doesNotMatch(chronicle, /alignmentByPublicId/);
});

test("dense Chronicle evidence is optional but preserved", () => {
  assert.match(chronicle, /Read technical record/);
  assert.match(chronicle, /Hide technical record/);
  assert.match(chronicle, /aria-expanded/);
  assert.match(chronicle, /entry\.dialogue\.map/);
  assert.match(chronicle, /entry\.artifacts\.map/);
  assert.match(chronicle, /\[overflow-wrap:anywhere\]/);
});

test("August 6 publication records the BAE release and readability pass", () => {
  assert.match(
    publication,
    /222c4601f925c966232afff6d9b9aaf6570f2a0d/,
  );
  assert.match(publication, /20260806153401-ba04dfc88b/);
  assert.match(publication, /The Workshop becomes a three-level observatory\./);
  assert.match(
    publication,
    /The Chronicle trades narrow zig-zags for one readable record\./,
  );
  assert.match(
    publication,
    /PUBLISH-WORKSHOP-CHRONICLE-2026-08-06/,
  );
});
