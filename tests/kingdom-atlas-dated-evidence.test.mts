import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { KINGDOM_ATLAS_HISTORY as history } from "../lib/kingdomAtlasDatedObservations.ts";

const component = readFileSync("components/admin/work-environments/KingdomAtlasDatedEvidence.tsx", "utf8");
const observatory = readFileSync("components/admin/work-environments/WorkEnvironmentObservatory.tsx", "utf8");

test("source handoff preserves exactly recorded scope, date, provenance and metrics", () => {
  assert.equal(history.schema, "aoe2war.product.kingdom-atlas-dated-handoff.v1");
  assert.equal(history.trust, "HISTORICAL_OWNER_HANDOFF");
  assert.equal(history.liveSource, "UNKNOWN");
  assert.equal(history.estateObservedAt, "2026-11-15T02:25:08.899756Z");
  assert.equal(history.mac.trackedPaths, 4171);
  assert.equal(history.mac.readableUtf8Files, 3124);
  assert.equal(history.mac.sourceLines, 821867);
  assert.equal(history.mac.unicodeCharacters, 40226527);
  assert.equal(history.mac.staticImportStrings, 11233);
  assert.equal(history.mac.ownerDirtyIndexEntries, 1);
  assert.equal(history.mac.modeMismatches, 0);
  assert.equal(history.hel1.volumeEffectivePercent, 87.85);
  assert.equal(history.hel1.volumeCeilingPercent, 88);
  assert.equal(history.hel1.rootNextStageReserve, "HOLD");
  assert.equal(history.hel1.estateObserver, "HOLD_NOT_NATIVE_ADOPTED");
  assert.equal(history.hel1.financialAuthorized, false);
  assert.ok(history.sourceComment.endsWith("6887923735"));
});

test("admin renders source-attributed dated observations with current status UNKNOWN", () => {
  assert.match(observatory, /<KingdomAtlasDatedEvidence\s*\/>/);
  assert.match(component, /Current native evidence: UNKNOWN/);
  assert.match(component, /Reported four-host scan:/);
  assert.match(component, /Reported Mac observation:/);
  assert.match(component, /permanently dated/);
  assert.match(component, /both naturally scheduled daily\s+executions were still pending/);
  assert.match(component, /Root deployment stage reserve: HOLD/);
  assert.match(component, /financial authority or live agent heartbeat is implied/);
  assert.match(component, /KINGDOM_ATLAS_HISTORY/);
  assert.match(component, /rel="noopener noreferrer"/);
});

test("no native scanner, API publication, financial grant or fake agent status in view", () => {
  const source = component + observatory;
  assert.doesNotMatch(source, /\b(fetch|setInterval|setTimeout|execSync|execFile|spawn|readFileSync|WebSocket)\s*\(/);
  assert.doesNotMatch(source, /\b(GET|POST|PUT|DELETE)\s+\/api\//);
  assert.doesNotMatch(source, /\bwriteFile\s*\(|child_process|\bprocess\.env\b/);
  assert.match(component, /No unattended HEL1 estate adoption, HMAC receiver/);
  assert.match(component, /not an intrusion verdict/);
});
