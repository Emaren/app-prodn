import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CHRONICLE_API_SOURCE,
  CHRONICLE_AUDITED_IDS,
  CHRONICLE_AUDIT_SEAL,
  CHRONICLE_CASES,
  CHRONICLE_MILESTONES,
  CHRONICLE_RESEARCH_SEAL,
} from "../lib/phoenixResearchChronicle.ts";

test("research memory explicitly preserves exactly 13 distinct, bounded experiments", () => {
  assert.equal(CHRONICLE_CASES.length, 13);
  assert.equal(new Set(CHRONICLE_CASES.map(row => row.experiment)).size, 13);
  assert.equal(new Set(CHRONICLE_CASES.map(row => row.id)).size, 13);
  assert.equal(CHRONICLE_API_SOURCE, "e6093762fad055a1d8e8dc3b64df9e9acf36ccab");
  assert.equal(CHRONICLE_RESEARCH_SEAL, "2026-10-15T02:56:04.200Z");
  assert.equal(CHRONICLE_AUDIT_SEAL, "2026-10-15T02:52:48.686Z");
  assert.deepEqual(
    CHRONICLE_CASES.map(row => row.id),
    [13017, 42534, 42822, 42716, 42614, 12862, 25620, 25590, 25324, 12284, 54108, 54100, 54090],
  );
  assert.equal(CHRONICLE_CASES.filter(row => row.status === "retired").length, 10);
  assert.equal(CHRONICLE_CASES.filter(row => row.status === "blocked").length, 2);
  assert.equal(CHRONICLE_CASES.filter(row => row.status === "control").length, 1);
  for (const row of CHRONICLE_CASES) {
    assert.ok(Number.isSafeInteger(row.id) && row.id > 0);
    assert.match(row.experiment, /^(phoenix|historical)\./);
    assert.ok(row.method.length > 10 && row.observed.length > 20 && row.nextProof.length > 20);
  }
});

test("all 25 audit IDs are unique, and scopes are not summed as separate experiments", () => {
  assert.equal(CHRONICLE_AUDITED_IDS.length, 25);
  assert.equal(new Set(CHRONICLE_AUDITED_IDS).size, 25);
  assert.deepEqual(CHRONICLE_AUDITED_IDS.slice(0, 2), [25590, 25324]);
  assert.ok(CHRONICLE_AUDITED_IDS.includes(54108));
  assert.ok(CHRONICLE_AUDITED_IDS.includes(54100));
  assert.ok(CHRONICLE_AUDITED_IDS.includes(54090));
  assert.ok(CHRONICLE_CASES.some(row => CHRONICLE_AUDITED_IDS.some(id => id === row.id)));
  assert.equal(CHRONICLE_CASES.find(row => row.id === 25590)?.status, "blocked");
  assert.equal(CHRONICLE_CASES.find(row => row.id === 25324)?.status, "blocked");
  assert.equal(CHRONICLE_CASES.find(row => row.id === 12284)?.status, "control");
});

test("native known-result #32388 is a transport control, not a recovered unknown", () => {
  assert.equal(CHRONICLE_MILESTONES.length, 5);
  assert.equal(CHRONICLE_MILESTONES[0]?.id, 32388);
  assert.match(CHRONICLE_MILESTONES[0]!.observation, /proves loading, not terminal winner recovery/i);
  assert.equal(CHRONICLE_CASES.some(row => row.id === 32388), false);
  assert.equal(CHRONICLE_AUDITED_IDS.some(id => id === 32388), false);
});

test("public excerpt contains no private research fields or mutation authority", () => {
  const json = JSON.stringify({ CHRONICLE_CASES, CHRONICLE_MILESTONES, CHRONICLE_AUDITED_IDS });
  for (const forbidden of ["/Users/", "steam_id", "SteamID64", "secret", "access_token", "wallet_address",
    "api_key", "private_receipt", "sourceReplayHash", "file_path", "settlement_writes"]) {
    assert.equal(json.includes(forbidden), false, forbidden);
  }
  assert.equal(CHRONICLE_CASES.find(row => row.id === 25590)?.observed.includes("Conflicting date claims"), true);
});

test("historical UI is read-only and explicit about bounded scope and unknown yield", () => {
  const source = readFileSync("components/replay-engine/PhoenixResearchChronicle.tsx", "utf8");
  const page = readFileSync("components/replay-engine/HdReplayEngine.tsx", "utf8");
  assert.match(page, /<PhoenixResearchChronicle \/>/);
  assert.match(source, /NOT LIVE TELEMETRY/);
  assert.match(source, /not all-time attempts/);
  assert.match(source, /All-time attempt count/);
  assert.match(source, /Not independently measured/);
  assert.match(source, /Measured 25-case audit only/);
  assert.match(source, /CHRONICLE_CASES\.map/);
  assert.match(source, /CHRONICLE_AUDITED_IDS\.map/);
  assert.match(source, /No page-time native execution/);
  assert.doesNotMatch(source, /\b(fetch\(|setInterval\(|axios\.|POST\b|prisma\.|wallet\.send|execute\()/);
});
