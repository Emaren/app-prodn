import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(path, "utf8");
}

test("Oracle and Kingdom Intelligence preserve Basic and add B/A/E width provenance", () => {
  const preferences = source("lib/tileViewPreferences.ts");
  const shell = source("app/AppShell.tsx");
  const oracle = source("components/oracle/OracleClient.tsx");
  const intelligence = source("app/kingdom-intelligence/page.tsx");
  const bar = source("components/tile-view/PageWidthSettingsBar.tsx");

  assert.match(preferences, /"oracle"/);
  assert.match(preferences, /"kingdom_intelligence"/);
  assert.match(preferences, /oracle: "basic"/);
  assert.match(preferences, /kingdom_intelligence: "basic"/);

  assert.match(shell, /getTileViewMode\([\s\S]*?"oracle"/);
  assert.match(shell, /getTileViewMode\([\s\S]*?"kingdom_intelligence"/);
  assert.match(shell, /pageWidthSurfaceViewMode === "extreme"[\s\S]*?"max-w-none"/);
  assert.match(shell, /pageWidthSurfaceViewMode === "advanced"[\s\S]*?"max-w-\[82rem\]"/);
  assert.match(shell, /"max-w-6xl"/);

  assert.match(oracle, /PageWidthSettingsBar tileKey="oracle" label="Oracle"/);
  assert.match(
    intelligence,
    /tileKey="kingdom_intelligence"[\s\S]*?label="Kingdom Intelligence"/,
  );
  assert.match(bar, /TILE_VIEW_MODES\.map/);
  assert.match(bar, /Page view/);
});

test("Kingdom Intelligence renders activity clocks in the browser locale", () => {
  const intelligence = source("app/kingdom-intelligence/page.tsx");
  const browserTime = source("app/kingdom-intelligence/BrowserLocalTime.tsx");

  assert.match(intelligence, /<BrowserLocalTime value=\{item\.at\} \/>/);
  assert.doesNotMatch(intelligence, /item\.at\)\.toLocaleTimeString/);
  assert.match(browserTime, /Intl\.DateTimeFormat\(undefined/);
  assert.match(browserTime, /hour: "numeric"/);
  assert.match(browserTime, /minute: "2-digit"/);
});

test("Kingdom Intelligence promotes active OS work above historical activity", () => {
  const intelligence = source("app/kingdom-intelligence/page.tsx");
  const brain = source("scripts/aoe2_brain.py");

  assert.match(intelligence, /ACTIVE_PROCESS_STATES/);
  assert.match(intelligence, /activeAgentRows/);
  assert.match(intelligence, /item\.activeProcess/);
  assert.match(intelligence, /item\.key === "recovery"/);
  assert.match(intelligence, /item\.key === "storage"/);
  assert.match(intelligence, /item\.activeSince/);
  assert.match(intelligence, /Number\(right\.current\) - Number\(left\.current\)/);
  assert.match(intelligence, /Live process/);
  assert.match(intelligence, /animate-\[pulse_4\.5s_ease-in-out_infinite\]/);
  assert.match(intelligence, /orderedSystemAgents/);

  assert.match(brain, /recovery_current_class/);
  assert.match(brain, /current_class/);
  assert.match(brain, /"active_process": recovery_active/);
  assert.match(brain, /current_class_started_at/);
  assert.match(brain, /Ordinary encrypted capture/);
});
