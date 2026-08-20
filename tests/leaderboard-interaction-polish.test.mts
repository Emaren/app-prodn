import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import {
  join,
} from "node:path";
import test from "node:test";

const root =
  process.cwd();

function source(
  path: string,
) {
  return readFileSync(
    join(
      root,
      path,
    ),
    "utf8",
  );
}

test("row detail is a persisted E1-default user preference", () => {
  const preferences =
    source(
      "lib/livingLeaderboardPreferences.ts",
    );

  const living =
    source(
      "components/leaderboard/LivingLeaderboard.tsx",
    );

  assert.match(
    preferences,
    /LivingLeaderboardDrilldownMode/,
  );

  assert.match(
    preferences,
    /drilldownMode:\s*1/,
  );

  assert.match(
    preferences,
    /input\.drilldownMode === 2[\s\S]*input\.drilldownMode === 3[\s\S]*:\s*1/,
  );

  assert.match(
    preferences,
    /\n\s*drilldownMode,\n/,
  );

  assert.match(
    living,
    /preferences\.drilldownMode/,
  );

  assert.match(
    living,
    /RowDetailModeGlyph/,
  );

  assert.match(
    living,
    /Row detail: Inline · click for Docked/,
  );

  assert.match(
    living,
    /preferences\.drilldownMode ===[\s\S]*1[\s\S]*\? 2[\s\S]*2[\s\S]*\? 3[\s\S]*: 1/,
  );

  assert.doesNotMatch(
    living,
    /Row Lab|visualLabEnabled|activeRowLabMode|rowLabMode/,
  );

  assert.doesNotMatch(
    living,
    /Inline \(E1\)|Docked \(E2\)|Modal \(E3\)/,
  );
});

test("E1 is the certified production inline experience", () => {
  const table =
    source(
      "components/leaderboard/LivingLeaderboardTable.tsx",
    );

  assert.match(
    table,
    /drilldownMode === 1/,
  );

  assert.match(
    table,
    /colSpan=\{11\}/,
  );

  assert.match(
    table,
    /className="px-3 py-3"/,
  );

  assert.match(
    table,
    /sm:grid-cols-2 xl:grid-cols-5/,
  );

  assert.match(
    table,
    /entry\.nameHistory\.map/,
  );

  assert.match(
    table,
    /href=\{\s*entry\.href\s*\}[\s\S]*entry\.currentName/,
  );

  assert.doesNotMatch(
    table,
    /visibleDesktopColumnCount|expansionColumnSpan|\[contain:inline-size\]/,
  );
});

test("E2 Docked and E3 Modal remain selectable", () => {
  const table =
    source(
      "components/leaderboard/LivingLeaderboardTable.tsx",
    );

  assert.match(
    table,
    /DockedWarriorInspector/,
  );

  assert.match(
    table,
    /createPortal/,
  );

  assert.match(
    table,
    /drilldownMode === 2/,
  );

  assert.match(
    table,
    /drilldownMode === 3/,
  );

  assert.match(
    table,
    /DesktopWarriorInspector/,
  );

  assert.match(
    table,
    /fixed bottom-20 left-1\/2/,
  );
});

test("Living desktop rows own drilldown interaction", () => {
  const table =
    source(
      "components/leaderboard/LivingLeaderboardTable.tsx",
    );

  assert.match(
    table,
    /onClick=\{\(event\)\s*=>\s*toggleFromRow/,
  );

  assert.match(
    table,
    /title=\{`Inspect \$\{entry\.currentName\}`\}/,
  );

  assert.match(
    table,
    /href=\{entry\.href\}/,
  );
});

test("Spotlight exit restores canonical cache without waiting", () => {
  const page =
    source(
      "components/leaderboard/ModernLeaderboardPage.tsx",
    );

  const living =
    source(
      "components/leaderboard/LivingLeaderboard.tsx",
    );

  assert.match(
    page,
    /const exitsSpotlight/,
  );

  assert.match(
    page,
    /readLeaderboardLaneCache\(\s*lane,\s*scope/,
  );

  assert.match(
    page,
    /personalViewWasActiveRef\.current\s*=\s*false/,
  );

  assert.match(
    living,
    /previousSpotlightTargetRef/,
  );

  assert.match(
    living,
    /tableSnapRef\.current\?\.offsetTop/,
  );
});

test("Extreme leaderboard owns three responsive scroll focus presets", () => {
  const living = source(
    "components/leaderboard/LivingLeaderboard.tsx",
  );

  assert.match(living, /data-leaderboard-focus=\{focusStage\}/);
  assert.match(living, /data-leaderboard-snap="overview"/);
  assert.match(living, /data-leaderboard-snap="command"/);
  assert.match(living, /data-leaderboard-snap="table"/);
  assert.match(living, /\[scroll-snap-type:y_mandatory\]/);
  assert.match(living, /\[scroll-snap-stop:always\]/);
  assert.match(living, /commandSnapRef/);
  assert.match(living, /tableSnapRef/);
  assert.match(living, /appHeaderHeight/);

  const appShell = readFileSync(
    join(process.cwd(), "app", "AppShell.tsx"),
    "utf8",
  );
  const mobileNav = readFileSync(
    join(process.cwd(), "components", "pwa", "MobileFloatingNav.tsx"),
    "utf8",
  );
  const globals = readFileSync(
    join(process.cwd(), "app", "globals.css"),
    "utf8",
  );

  assert.match(appShell, /data-app-shell-header/);
  assert.match(mobileNav, /data-mobile-floating-nav/);
  assert.match(globals, /data-leaderboard-focus="command"/);
  assert.match(globals, /data-leaderboard-focus="table"/);
  assert.match(globals, /\[data-app-shell-header\]/);
  assert.match(globals, /\[data-mobile-floating-nav\]/);

  const livingTable = source(
    "components/leaderboard/LivingLeaderboardTable.tsx",
  );

  assert.match(
    livingTable,
    /<thead className="sticky top-0/,
  );

  assert.doesNotMatch(
    livingTable,
    /hidden overflow-x-auto rounded-\[1\.4rem\]/,
  );
});
