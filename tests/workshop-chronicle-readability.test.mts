import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const chronicle = readFileSync(
  "components/workshop/WorkshopChronicle.tsx",
  "utf8",
);
const polish = readFileSync(
  "app/workshop/workshop-polish.css",
  "utf8",
);
const publication = readFileSync(
  "scripts/publish-workshop-2026-08-06-polish.mts",
  "utf8",
);

test("Advanced and Extreme retain one full-width readable Chronicle rail", () => {
  assert.match(chronicle, /max-w-6xl/);
  assert.match(chronicle, /pl-12 sm:pl-16/);
  assert.match(chronicle, /loaded records/);
  assert.doesNotMatch(chronicle, /sm:grid-cols-2/);
  assert.doesNotMatch(chronicle, /alignmentByPublicId/);

  assert.match(
    polish,
    /main\[data-workshop-view="basic"\] #chronicle[\s\S]*width:\s*50%/,
  );
});

test("dense Chronicle evidence is optional but preserved", () => {
  assert.match(chronicle, /Read technical record/);
  assert.match(chronicle, /Hide technical record/);
  assert.match(chronicle, /aria-expanded/);
  assert.match(chronicle, /entry\.dialogue\.map/);
  assert.match(chronicle, /entry\.artifacts\.map/);
  assert.match(chronicle, /\[overflow-wrap:anywhere\]/);
});

test("August 6 polish publication records the two deliberate Chronicle modes", () => {
  assert.match(
    publication,
    /The Workshop becomes a three-level observatory\./,
  );
  assert.match(
    publication,
    /The Chronicle gains two deliberate reading modes\./,
  );
  assert.match(publication, /Extreme is now the default command-deck view/);
  assert.match(publication, /Basic alternates entries around the center rail/);
  assert.match(
    publication,
    /PUBLISH-WORKSHOP-EXTREME-POLISH-2026-08-06/,
  );
});
