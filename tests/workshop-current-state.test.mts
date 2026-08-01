import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(
  new URL("../app/workshop/page.tsx", import.meta.url),
  "utf8",
);

const chronicle = readFileSync(
  new URL("../components/workshop/WorkshopChronicle.tsx", import.meta.url),
  "utf8",
);

const publisher = readFileSync(
  new URL(
    "../scripts/publish-workshop-2026-08-01.mts",
    import.meta.url,
  ),
  "utf8",
);

test("obsolete Workshop hero copy is removed", () => {
  assert.doesNotMatch(page, /The strange machine is forged in public/);
  assert.doesNotMatch(page, /\{data\.status\.description\}/);
});

test("Workshop presents Evidence in Motion as the current campaign", () => {
  assert.match(page, /AOE2WAR_WORKSHOP_EVIDENCE_IN_MOTION_20260801/);
  assert.match(page, /Evidence in Motion\./);
  assert.match(page, /44 audited app commits/);
  assert.match(page, /Pass 8 · Account Identity · Watcher 1\.5\.7/);
  assert.match(page, /Player Identity Wave 2/);
  assert.match(page, /persistent B\/A\/E views/);
  assert.match(page, /immutable byte snapshot/);
  assert.match(page, /Human review, financial/);
  assert.match(page, /Open Replay Operations/);
  assert.match(page, /Identity Leaderboard/);
});

test("Workshop preserves the authority boundaries", () => {
  assert.match(page, /Account\s+evidence is not a human merge/);
  assert.match(page, /archived bytes are not a winner/);
  assert.match(page, /visible final proof is not an open book/);
  assert.match(page, /Wave 2 links and claims remain proposed/);
  assert.match(page, /explicit financial-authority bridge/);
});

test("old parser campaign framing is no longer current", () => {
  assert.doesNotMatch(page, /Campaign IV · Parser Front/);
  assert.doesNotMatch(page, />\s*Into the Fog\.\s*</);
  assert.doesNotMatch(page, />\s*Deterministic Evidence\.\s*</);
});

test("Workshop publication audits and curates the exact release range", () => {
  assert.match(
    publisher,
    /aece6b2f2b4640e73f2207cfdf7120638deca4e9/,
  );
  assert.match(
    publisher,
    /223612f7583ece499c551a6ea62ae376ce5d0115/,
  );
  assert.match(
    publisher,
    /c3d3af0a2c03a05d631b44eab773bf20650de0f8/,
  );
  assert.match(publisher, /EXPECTED_APP_COMMIT_COUNT = 44/);
  assert.match(publisher, /Player Identity Wave 2 populates/);
  assert.match(publisher, /Watcher 1\.5\.7 binds every upload/);
  assert.match(publisher, /The forge reclaims 5\.4 GB/);
  assert.match(
    publisher,
    /PUBLISH-WORKSHOP-EVIDENCE-IN-MOTION-2026-08-01/,
  );
});

test("Workshop still protects public Match Rooms and private DMs", () => {
  assert.match(page, /Public Match Rooms are separate Challenge-scoped/);
  assert.match(page, /private DMs/);
});

test("Workshop Chronicle includes players in the living build history", () => {
  assert.match(chronicle, /Emaren, AI, players, and the Kingdom/);
});
