import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(path, "utf8");
}

test("Oracle preserves Basic while Kingdom Intelligence defaults Advanced and both keep B/A/E width provenance", () => {
  const preferences = source("lib/tileViewPreferences.ts");
  const shell = source("app/AppShell.tsx");
  const oracle = source("components/oracle/OracleClient.tsx");
  const premiumOracle = source("components/oracle/OraclePremiumFloor.tsx");
  const intelligence = source("app/kingdom-intelligence/page.tsx");
  const bar = source("components/tile-view/PageWidthSettingsBar.tsx");
  const globalCss = source("app/globals.css");

  assert.match(preferences, /"oracle"/);
  assert.match(preferences, /"kingdom_intelligence"/);
  assert.match(preferences, /oracle: "basic"/);
  assert.match(preferences, /kingdom_intelligence: "advanced"/);

  assert.match(shell, /getTileViewMode\([\s\S]*?"oracle"/);
  assert.match(shell, /getTileViewMode\([\s\S]*?"kingdom_intelligence"/);
  assert.match(shell, /pageWidthSurfaceViewMode === "extreme"[\s\S]*?"max-w-none"/);
  assert.match(shell, /pageWidthSurfaceViewMode === "advanced"[\s\S]*?"max-w-\[82rem\]"/);
  assert.match(shell, /"max-w-6xl"/);

  assert.match(oracle, /PageWidthSettingsBar tileKey="oracle" label="Oracle"/);
  assert.match(oracle, /viewMode === "basic"/);
  assert.match(oracle, /<OraclePremiumFloor/);
  assert.match(premiumOracle, /data-oracle-premium-floor=\{viewMode\}/);
  assert.match(premiumOracle, /ProbabilityChart/);
  assert.match(premiumOracle, /Create market/);
  assert.match(premiumOracle, /data-oracle-advanced-hero="workshop-open-image"/);
  assert.match(premiumOracle, /data-oracle-extreme-hero="workshop-open-image"/);
  assert.doesNotMatch(premiumOracle, /data-oracle-extreme-hero="cinematic"/);
  assert.match(premiumOracle, /oracle-wolo-button/);
  assert.match(premiumOracle, /oracle-arcane-button/);
  assert.doesNotMatch(
    premiumOracle,
    /Read the Kingdom in motion|One clean probability field|Ask one question the Kingdom can actually settle|Question\. Close\. Source\. Exact YES rule/,
  );
  assert.doesNotMatch(premiumOracle, /Oracle Marks|whale advantage/i);
  assert.match(
    intelligence,
    /tileKey="kingdom_intelligence"[\s\S]*?label="Kingdom Intelligence"/,
  );
  assert.match(bar, /TILE_VIEW_MODES\.map/);
  assert.match(bar, /Page view/);
  assert.match(globalCss, /AOE2WAR ORACLE PREMIUM CONTROLS START/);
  assert.match(globalCss, /oracle-arcane-mist/);
  assert.match(globalCss, /#ffe85b/);
});

test("Kingdom Intelligence falls back to the sanitized production signal in read-only preview", () => {
  const intelligence = source("app/kingdom-intelligence/page.tsx");

  assert.match(intelligence, /isLiveProductionReadOnlyPreview/);
  assert.match(intelligence, /buildPreviewDataUrl\("\/api\/kingdom-intelligence"\)/);
  assert.match(intelligence, /cache: "no-store"/);
  assert.match(intelligence, /if \(!data\.available/);
});

test("Kingdom Intelligence keeps Agent Constellation shell plain while rows cycle three themes", () => {
  const intelligence = source("app/kingdom-intelligence/page.tsx");
  const panel = source("app/kingdom-intelligence/AgentConstellationPanel.tsx");

  assert.match(intelligence, /<AgentConstellationPanel/);
  assert.match(panel, /const THEMES: ThemeKey\[\] = \["plain", "sapphire", "aurora"\]/);
  assert.match(panel, /data-agent-constellation-theme=\{theme\}/);
  assert.match(panel, /cursor-pointer/);
  assert.doesNotMatch(panel, /click to change/i);
  assert.match(panel, /\(current \+ 1\) % THEMES\.length/);

  // The outer display tile is invariant and truly flat blue.
  assert.match(panel, /const PANEL_SHELL/);
  assert.match(panel, /border-white\/10 bg-\[#071426\]/);
  assert.doesNotMatch(panel, /function panelShell/);
  assert.doesNotMatch(panel, /panelShell\(theme\)/);

  // Only the inner rows and progress rails cycle through the premium skins.
  assert.match(panel, /border-white\/8 bg-white\/\[0\.025\]/);
  assert.match(panel, /theme === "sapphire"/);
  assert.match(panel, /theme === "aurora"/);
  assert.match(panel, /rowShell\(theme\)/);
  assert.match(panel, /progressFill\(theme\)/);

  // Keep the blue authority tile compact; it is the vertical sizing authority
  // for the paired War Pulse tile on desktop.
  assert.match(panel, /mt-3 space-y-2/);
  assert.match(panel, /px-4 py-2\.5/);
  assert.match(panel, /mt-3 border-t border-white\/6 pt-3 text-\[10px\] leading-4/);
});

test("Kingdom Intelligence cycles the whole War Pulse tile through plain and two premium themes", () => {
  const intelligence = source("app/kingdom-intelligence/page.tsx");
  const panel = source("app/kingdom-intelligence/WarPulsePanel.tsx");

  assert.match(intelligence, /<WarPulsePanel/);
  assert.match(panel, /const THEMES: ThemeKey\[\] = \["plain", "signal", "cosmic"\]/);
  assert.match(panel, /data-war-pulse-theme=\{theme\}/);
  assert.match(panel, /cursor-pointer/);
  assert.doesNotMatch(panel, /click to change/i);
  assert.match(panel, /\(current \+ 1\) % THEMES\.length/);

  // The outer War Pulse display tile stays black in every theme.
  assert.match(panel, /const PANEL_SHELL/);
  assert.match(panel, /border-cyan-200\/10 bg-\[#02060c\]/);
  assert.doesNotMatch(panel, /function panelShell/);
  assert.doesNotMatch(panel, /panelShell\(theme\)/);

  // Plain preserves the original row presentation.
  assert.match(panel, /my-1 rounded-xl border border-cyan-200\/12 bg-white\/\[0\.018\]/);

  // Signal preserves the hot row gradient; Cosmic is the second premium row skin.
  assert.match(panel, /theme === "signal"/);
  assert.match(panel, /theme === "cosmic"/);
  assert.match(panel, /linear-gradient\(115deg,rgba\(8,47,73,0\.42\)/);
  assert.match(panel, /from-cyan-300 via-violet-300 to-fuchsia-300/);
  assert.match(panel, /rowShell\(theme, item\.current\)/);
  assert.match(panel, /PANEL_SHELL/);
  assert.match(panel, /progressFill\(theme\)/);

  // The black tile contributes no intrinsic desktop row height. The grid row is
  // therefore sized by Agent Constellation and War Pulse stretches to exactly it.
  assert.match(panel, /flex h-full min-h-0[\s\S]*flex-col/);
  assert.match(panel, /xl:\[contain:size\]/);
  assert.match(panel, /min-h-0 flex-1 overflow-y-auto/);
  assert.doesNotMatch(panel, /max-h-\[34rem\]/);
});

test("Kingdom Intelligence row cards drill into noob-friendly process detail without changing the parent theme", () => {
  const intelligence = source("app/kingdom-intelligence/page.tsx");
  const agent = source("app/kingdom-intelligence/AgentConstellationPanel.tsx");
  const pulse = source("app/kingdom-intelligence/WarPulsePanel.tsx");
  const detail = source("app/kingdom-intelligence/ProcessDrilldown.tsx");

  assert.match(intelligence, /activeSince: agent\.activeSince/);
  assert.match(agent, /event\.stopPropagation\(\)/);
  assert.match(agent, /aria-expanded=\{expanded\}/);
  assert.match(agent, /<ProcessDrilldown/);
  assert.match(agent, /formatLiveRecoveryProgressLabel/);
  assert.match(pulse, /event\.stopPropagation\(\)/);
  assert.match(pulse, /aria-expanded=\{expanded\}/);
  assert.match(pulse, /<ProcessDrilldown/);
  assert.match(pulse, /formatLiveRecoveryProgressLabel/);

  assert.match(agent, /kind="agent"/);
  assert.match(pulse, /kind=\{item\.current \? "process" : "event"\}/);
  assert.match(detail, /data-process-drilldown-kind="process"/);
  assert.match(detail, /data-process-drilldown-kind="event"/);
  assert.match(detail, /data-process-drilldown-kind="agent"/);
  assert.match(detail, /What it does/);
  assert.match(detail, /What this means/);
  assert.match(detail, /Elapsed/);
  assert.match(detail, /ETA/);
  assert.match(detail, /Sealed event/);
  assert.doesNotMatch(detail, /Learning…/);
});

test("Kingdom Intelligence samples live Recovery bytes every five seconds without mutating the campaign", () => {
  const hook = source("app/kingdom-intelligence/useLiveRecoveryProgress.ts");
  const route = source("app/api/kingdom-intelligence/live-recovery/route.ts");
  const pulse = source("app/kingdom-intelligence/WarPulsePanel.tsx");
  const agent = source("app/kingdom-intelligence/AgentConstellationPanel.tsx");

  assert.match(hook, /setTimeout\(\(\) => \{/);
  assert.match(hook, /void pollSharedRecovery\(\)/);
  assert.match(hook, /listeners = new Set<Listener>\(\)/);
  assert.match(hook, /cache: "no-store"/);
  assert.match(hook, /formatLiveRecoveryProgressLabel/);
  assert.match(hook, /GiB/);

  // A cold preview must never present the old coarse 4/5 = 80% as if it were
  // the live byte-level result. It shows a syncing state until denominator-backed
  // live telemetry arrives.
  assert.match(pulse, /live signal syncing/);
  assert.match(pulse, /denominatorSource !== "unavailable"/);
  assert.match(agent, /live signal syncing/);
  assert.match(agent, /denominatorSource !== "unavailable"/);

  assert.match(route, /AOE2WAR_PROD_DB_PREVIEW/);
  assert.match(route, /operator_preview_only/);
  assert.match(route, /ordinary_stage_estimates/);
  assert.match(route, /sealedChunks/);
  assert.match(route, /observedBytes/);
  assert.match(route, /overallPercent/);
  assert.match(route, /etaSeconds/);
  assert.match(route, /CHUNK_PLAINTEXT_LIMIT/);
  assert.match(route, /LEGACY_ESTIMATE_CACHE_MS = 6 \* 60 \* 60 \* 1000/);
  assert.match(route, /one_time_read_only_inventory/);
  assert.match(route, /campaign", "plan", "--json"/);
  assert.match(route, /legacyEstimatePromise/);
  assert.match(route, /failed\.stdout/);
  assert.match(route, /full-campaign[\s\S]*capacity is not ready/);
  assert.doesNotMatch(route, /writeFile|unlink|rmSync|rmdir|rename/);
});

test("Kingdom Intelligence renders activity clocks in the browser locale", () => {
  const pulse = source("app/kingdom-intelligence/WarPulsePanel.tsx");
  const browserTime = source("app/kingdom-intelligence/BrowserLocalTime.tsx");

  assert.match(pulse, /<BrowserLocalTime value=\{item\.at\} \/>/);
  assert.doesNotMatch(pulse, /item\.at\)\.toLocaleTimeString/);
  assert.match(browserTime, /Intl\.DateTimeFormat\(undefined/);
  assert.match(browserTime, /hour: "numeric"/);
  assert.match(browserTime, /minute: "2-digit"/);
});

test("Kingdom Intelligence keeps all server-rendered ModuleCard icons imported", () => {
  const intelligence = source("app/kingdom-intelligence/page.tsx");

  assert.match(intelligence, /\n  Cpu,\n/);
  assert.match(intelligence, /icon=\{Cpu\}/);
});

test("Kingdom Intelligence promotes active OS work above historical activity", () => {
  const intelligence = source("app/kingdom-intelligence/page.tsx");
  const pulse = source("app/kingdom-intelligence/WarPulsePanel.tsx");
  const brain = source("scripts/aoe2_brain.py");

  assert.match(intelligence, /ACTIVE_PROCESS_STATES/);
  assert.match(intelligence, /activeAgentRows/);
  assert.match(intelligence, /item\.activeProcess/);
  assert.match(intelligence, /item\.key === "recovery"/);
  assert.match(intelligence, /item\.key === "storage"/);
  assert.match(intelligence, /item\.activeSince/);
  assert.match(intelligence, /Number\(right\.current\) - Number\(left\.current\)/);
  assert.match(intelligence, /orderedSystemAgents/);
  assert.match(pulse, /Live process/);
  assert.match(pulse, /animate-\[pulse_4\.5s_ease-in-out_infinite\]/);

  assert.match(brain, /recovery_current_class/);
  assert.match(brain, /current_class/);
  assert.match(brain, /"active_process": recovery_active/);
  assert.match(brain, /current_class_started_at/);
  assert.match(brain, /Ordinary encrypted capture/);
});
