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

test("Kingdom Intelligence falls back to the sanitized production signal in read-only preview", () => {
  const intelligence = source("app/kingdom-intelligence/page.tsx");

  assert.match(intelligence, /isLiveProductionReadOnlyPreview/);
  assert.match(intelligence, /buildPreviewDataUrl\("\/api\/kingdom-intelligence"\)/);
  assert.match(intelligence, /cache: "no-store"/);
  assert.match(intelligence, /if \(!data\.available/);
});

test("Kingdom Intelligence cycles the whole Agent Constellation tile through plain and two premium themes", () => {
  const intelligence = source("app/kingdom-intelligence/page.tsx");
  const panel = source("app/kingdom-intelligence/AgentConstellationPanel.tsx");

  assert.match(intelligence, /<AgentConstellationPanel/);
  assert.doesNotMatch(intelligence, /<AgentConstellationTile/);

  assert.match(panel, /const THEMES: ThemeKey\[\] = \["plain", "sapphire", "aurora"\]/);
  assert.match(panel, /data-agent-constellation-theme=\{theme\}/);
  assert.match(panel, /cursor-pointer/);
  assert.match(panel, /Click to change Agent Constellation theme/);
  assert.match(panel, /\(current \+ 1\) % THEMES\.length/);

  // Plain is the preserved pre-gradient presentation.
  assert.match(panel, /border-white\/8 bg-white\/\[0\.025\]/);
  assert.match(panel, /border-amber-100\/10 bg-\[radial-gradient\(circle_at_20%_0%/);
  assert.match(panel, /from-cyan-400\/70 via-amber-300\/80 to-emerald-300\/85/);

  // The two optional display skins theme the panel and every contained row together.
  assert.match(panel, /theme === "sapphire"/);
  assert.match(panel, /theme === "aurora"/);
  assert.match(panel, /rowShell\(theme\)/);
  assert.match(panel, /panelShell\(theme\)/);
  assert.match(panel, /progressFill\(theme\)/);
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
