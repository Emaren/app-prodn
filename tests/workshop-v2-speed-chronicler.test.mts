import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function read(path: string) {
  return fs.readFileSync(path, "utf8");
}

const page = read("app/workshop/page.tsx");
const loading = read("app/workshop/loading.tsx");
const chronicle = read("components/workshop/WorkshopChronicle.tsx");
const workshop = read("lib/workshop.ts");
const chronicler = read("scripts/workshop_chronicler.mts");
const finish = read("scripts/aoe2_finish.py");
const shadow = read("scripts/aoe2_shadow.py");

test("Workshop paints a real route shell before deep data is ready", () => {
  assert.match(loading, /data-workshop-instant-shell="true"/);
  assert.match(loading, /The strange machine is forged in public/);
  assert.match(loading, /WorkshopShellReady/);
  assert.doesNotMatch(loading, /skeleton/i);
});

test("Workshop root no longer blocks navigation on Chronicle history", () => {
  assert.doesNotMatch(page, /loadCachedWorkshopChronicleFirstPage/);
  assert.match(page, /DEFERRED_CHRONICLE/);
  assert.match(page, /loadCachedPublicWorkshop/);
});

test("Workshop initial projection is bounded and Chronicle owns complete history", () => {
  assert.match(workshop, /take: 32/);
  assert.match(workshop, /complete history belongs to the independently paginated Chronicle/);
  assert.match(chronicle, /if \(nextCursor\)/);
  assert.match(chronicle, /The Chronicle opens as you approach/);
  assert.doesNotMatch(chronicle, /if \(entries\.length === 0\) return null/);
});

test("Workshop data is available inside the safe production-shaped shadow", () => {
  for (const table of [
    "workshop_status",
    "workshop_entries",
    "workshop_artifacts",
    "workshop_streams",
  ]) {
    assert.match(shadow, new RegExp(`"${table}"`));
  }
});

test("Chronicle uses one canonical Edmonton workday for every viewer", () => {
  assert.match(chronicle, /WORKSHOP_TIME_ZONE = "America\/Edmonton"/);
  assert.match(chronicle, /WORKSHOP_DAY_KEY_FORMATTER/);
  assert.match(chronicle, /timeZone: WORKSHOP_TIME_ZONE/);
});

test("historical backfill is curated and future clustering does not split one topic for volume", () => {
  assert.match(chronicler, /HISTORICAL_CURATED/);
  assert.match(chronicler, /AoE2WAR OS V1\.2 learns to ship itself/);
  assert.match(chronicler, /Clan Hall opens its doors/);
  assert.match(chronicler, /return selected\.map/);
  assert.doesNotMatch(chronicler, /candidate\.parts \+= 1/);
});

test("production Chronicler has no dev-only dotenv runtime dependency", () => {
  assert.doesNotMatch(chronicler, /from "dotenv"/);
  assert.match(chronicler, /localEnvValue\("DATABASE_URL"\)/);
});

test("daily Chronicler is deterministic bounded and idempotent", () => {
  assert.match(chronicler, /America\/Edmonton/);
  assert.match(chronicler, /MAX_PER_DAY/);
  assert.match(chronicler, /Math\.min\(4/);
  assert.match(chronicler, /deterministicUuid/);
  assert.match(chronicler, /SKIP_MANUAL/);
  assert.match(chronicler, /UPDATE_AUTO/);
  assert.match(chronicler, /PUBLISH-AOE2WAR-WORKSHOP-CHRONICLE/);
  assert.match(chronicler, /remainingGapDays/);
  assert.match(chronicler, /aoe2war-finish-chronicler/);
  assert.match(chronicler, /CONFIG\.development\?\.shadow_database/);
  assert.match(chronicler, /configureShadowDatabaseUrl/);
  assert.match(chronicler, /is not local/);
  assert.match(chronicler, /delete process\.env\.AOE2WAR_PROD_DB_PREVIEW/);
});

test("Finish publishes Workshop only after production certification", () => {
  const certification = finish.indexOf(
    'finish_phase(receipt, "release_certification", checkpoint)',
  );
  const chroniclePhase = finish.indexOf(
    'start_phase(receipt, "workshop_chronicle", checkpoint)',
  );

  assert.ok(certification >= 0);
  assert.ok(chroniclePhase > certification);
  assert.match(finish, /CERTIFIED_WORKSHOP_INCOMPLETE/);
  assert.match(finish, /public_verification/);
  assert.match(finish, /Workshop Chronicle current/);
});
