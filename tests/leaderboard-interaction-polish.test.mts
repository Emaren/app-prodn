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
    /spotlightExitDestinationRef/,
  );

  assert.match(
    living,
    /destination === "overview"[\s\S]*\? 0/,
  );
});

test("Extreme leaderboard owns three responsive scroll focus presets", () => {
  const living = source(
    "components/leaderboard/LivingLeaderboard.tsx",
  );

  assert.match(
    living,
    /data-leaderboard-focus=\{[\s\S]*focusStageRef\.current/,
  );
  assert.match(
    living,
    /focusStageRef/,
  );
  assert.doesNotMatch(
    living,
    /\bsetFocusStage\s*\(/,
  );
  assert.match(
    living,
    /header\.style\.transition\s*=\s*"none"/,
  );
  assert.match(
    living,
    /header\.style\.transform/,
  );
  assert.match(living, /data-leaderboard-snap="overview"/);
  assert.match(living, /data-leaderboard-snap="command"/);
  assert.match(living, /data-leaderboard-snap="table"/);
  assert.match(living, /\[scroll-snap-type:y_proximity\]/);
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
    /<thead[\s\S]*data-leaderboard-column-header[\s\S]*className="sticky top-0/,
  );

  assert.doesNotMatch(
    livingTable,
    /hidden overflow-x-auto rounded-\[1\.4rem\]/,
  );
});

test("rank rows own wheel traversal independently from chrome focus", () => {
  const living = source(
    "components/leaderboard/LivingLeaderboard.tsx",
  );

  assert.match(
    living,
    /data-leaderboard-row-scroll/,
  );
  assert.match(
    living,
    /rowScrollRef/,
  );
  assert.match(
    living,
    /onScroll=\{handleRowsScroll\}/,
  );
  assert.match(
    living,
    /overflow-y-auto overscroll-contain/,
  );
  assert.match(
    living,
    /rowsViewport\.scrollHeight -\s*anchor\.scrollHeight/,
  );
  assert.match(
    living,
    /spotlightActive &&\s*hasEarlier &&\s*node\.scrollTop <= 1800/,
  );
  assert.match(
    living,
    /viewport\.scrollTo\(\{[\s\S]*tableSnapRef\.current[\s\S]*rowsViewport\.scrollTo/,
  );
});

test("Spotlight programmatic centering cannot trigger boundary prefetch", () => {
  const living = source(
    "components/leaderboard/LivingLeaderboard.tsx",
  );

  assert.match(
    living,
    /const spotlightCenteringRef =\s*useRef\(false\)/,
  );

  const centerStart =
    living.indexOf(
      "// Center before paint and temporarily suppress boundary",
    );
  const centerEnd =
    living.indexOf(
      "useLayoutEffect(() => {",
      centerStart + 1,
    );
  const centerBlock =
    living.slice(
      centerStart,
      centerEnd,
    );

  assert.ok(
    centerStart >= 0,
    "Spotlight centering contract block must exist",
  );

  assert.match(
    centerBlock,
    /spotlightCenteringRef\.current =\s*true/,
  );
  assert.match(
    centerBlock,
    /prependAnchorRef\.current =\s*null/,
  );
  assert.match(
    centerBlock,
    /rowsViewport\.scrollTo\(\{[\s\S]*behavior: "auto"/,
  );
  assert.doesNotMatch(
    centerBlock,
    /rowsViewport\.scrollTo\(\{[\s\S]*behavior: "smooth"/,
  );

  const rowsStart =
    living.indexOf(
      "const handleRowsScroll",
    );
  const rowsEnd =
    living.indexOf(
      "const rankWindowEnd",
      rowsStart,
    );
  const rowsBlock =
    living.slice(
      rowsStart,
      rowsEnd,
    );

  const guardIndex =
    rowsBlock.indexOf(
      "spotlightCenteringRef.current",
    );
  const earlierIndex =
    rowsBlock.indexOf(
      "node.scrollTop <= 1800",
    );

  assert.ok(
    guardIndex >= 0 &&
      earlierIndex >= 0 &&
      guardIndex < earlierIndex,
    "programmatic-centering guard must run before earlier-rank prefetch",
  );
});

test("Spotlight is a two-state centered expandable view", () => {
  const preferences = source(
    "lib/livingLeaderboardPreferences.ts",
  );
  const page = source(
    "components/leaderboard/ModernLeaderboardPage.tsx",
  );
  const living = source(
    "components/leaderboard/LivingLeaderboard.tsx",
  );

  const spotlightType =
    preferences.slice(
      preferences.indexOf(
        "export type LivingLeaderboardSpotlightMode",
      ),
      preferences.indexOf(
        "export type LivingLeaderboardMoverDirection",
      ),
    );

  assert.match(
    spotlightType,
    /"off"/,
  );
  assert.match(
    spotlightType,
    /"center"/,
  );
  assert.doesNotMatch(
    spotlightType,
    /"top"/,
  );

  assert.match(
    preferences,
    /input\.spotlightMode === "center"[\s\S]*input\.spotlightMode === "top"[\s\S]*\? "center"/,
  );

  assert.match(
    living,
    /spotlightMode: "center"/,
  );
  assert.match(
    living,
    /Exit spotlight · return to top/,
  );
  assert.match(
    living,
    /Spotlight starts as a centered 50\/50 context window/,
  );
  assert.match(
    living,
    /onLoadEarlier\(\)/,
  );
  assert.match(
    living,
    /onLoadMore\(\)/,
  );

  assert.match(
    page,
    /SPOTLIGHT_CONTEXT_ROWS = 50/,
  );
  assert.match(
    page,
    /SPOTLIGHT_INITIAL_ROWS =\s*SPOTLIGHT_CONTEXT_ROWS \* 2 \+ 1/,
  );
  assert.match(
    page,
    /const contextBefore =\s*SPOTLIGHT_CONTEXT_ROWS/,
  );
  assert.match(
    page,
    /const spotlightRows =\s*SPOTLIGHT_INITIAL_ROWS/,
  );
});

test("deep leaderboard navigation exposes premium Commands and Top returns", () => {
  const living = source(
    "components/leaderboard/LivingLeaderboard.tsx",
  );

  assert.match(
    living,
    /data-leaderboard-return-rail/,
  );
  assert.match(
    living,
    /const scrollToCommand/,
  );
  assert.match(
    living,
    /const returnToBoardTop/,
  );
  assert.match(
    living,
    /aria-label="Show leaderboard commands"/,
  );
  assert.match(
    living,
    /aria-label="Return to leaderboard top"/,
  );
  assert.match(
    living,
    /rankWindowStart: null/,
  );
});

test("Extreme online count shares canonical realtime public presence", () => {
  const route = source(
    "app/leaderboard/page.tsx",
  );
  const modern = source(
    "components/leaderboard/ModernLeaderboardPage.tsx",
  );
  const living = source(
    "components/leaderboard/LivingLeaderboard.tsx",
  );

  assert.match(
    route,
    /loadPublicPresenceSnapshot/,
  );
  assert.match(
    route,
    /PublicPresenceProvider/,
  );
  assert.match(
    modern,
    /usePublicPresenceContext/,
  );
  assert.match(
    modern,
    /activePlayers=\{activePlayers\}/,
  );
  assert.match(
    living,
    /activePlayers: number/,
  );
  assert.match(
    living,
    /Realtime claimed warriors currently online/,
  );
  assert.doesNotMatch(
    living,
    /const loadedOnline/,
  );
});

test("column header wheel pulls the outer Leaderboard focus rail", () => {
  const living = source(
    "components/leaderboard/LivingLeaderboard.tsx",
  );
  const table = source(
    "components/leaderboard/LivingLeaderboardTable.tsx",
  );

  assert.match(
    table,
    /data-leaderboard-column-header/,
  );
  assert.match(
    living,
    /handleColumnHeaderWheel/,
  );
  assert.match(
    living,
    /passive: false/,
  );
  assert.match(
    living,
    /event\.preventDefault\(\)/,
  );
  assert.match(
    living,
    /viewport\.scrollBy\(\{[\s\S]*top: event\.deltaY/,
  );
});

test("Spotlight is center-or-canonical-top only", () => {
  const living = source(
    "components/leaderboard/LivingLeaderboard.tsx",
  );

  assert.match(
    living,
    /mode: "center";/,
  );
  assert.doesNotMatch(
    living,
    /mode: "top" \| "center"/,
  );
  assert.match(
    living,
    /rowScrollRef\.current\?\.scrollTo\(\{[\s\S]*top: 0/,
  );
  assert.match(
    living,
    /setFocusStageImperatively\(\s*"overview"/,
  );
  assert.match(
    living,
    /syncAppChromeToScroll\(\s*0/,
  );
});

test("navbar movement is compositor-only during Leaderboard focus scroll", () => {
  const living = source(
    "components/leaderboard/LivingLeaderboard.tsx",
  );

  assert.match(
    living,
    /header\.style\.willChange\s*=\s*"transform"/,
  );
  assert.match(
    living,
    /header\.style\.backfaceVisibility\s*=\s*"hidden"/,
  );

  const start =
    living.indexOf(
      "const syncAppChromeToScroll",
    );
  const end =
    living.indexOf(
      "const setFocusStageImperatively",
      start,
    );
  const block =
    living.slice(
      start,
      end,
    );

  assert.match(
    block,
    /header\.style\.transform/,
  );
  assert.doesNotMatch(
    block,
    /pointerEvents/,
  );
  assert.doesNotMatch(
    block,
    /style\.opacity/,
  );
});

test("Extreme leaderboard remains an open-top hanging board", () => {
  const living = source(
    "components/leaderboard/LivingLeaderboard.tsx",
  );

  const chassisMatch =
    living.match(
      /onScroll=\{handleViewportScroll\}[\s\S]*?className="([^"]+)"/,
    );

  assert.ok(
    chassisMatch,
    "Extreme leaderboard chassis must exist",
  );

  const chassis =
    chassisMatch[1];

  assert.match(
    chassis,
    /rounded-b-\[2rem\]/,
  );
  assert.match(
    chassis,
    /border-x/,
  );
  assert.match(
    chassis,
    /border-b/,
  );

  assert.doesNotMatch(
    chassis,
    /rounded-\[2rem\]/,
  );
  assert.doesNotMatch(
    chassis,
    /0_0_0_1px/,
  );

  assert.doesNotMatch(
    living,
    /absolute inset-x-16 top-0 h-px bg-gradient-to-r from-transparent via-amber-100\/50 to-transparent/,
  );

  const tableSnapMatch =
    living.match(
      /data-leaderboard-snap="table"[\s\S]*?className="([^"]+)"/,
    );

  assert.ok(
    tableSnapMatch,
    "table focus snap must exist",
  );

  assert.doesNotMatch(
    tableSnapMatch[1],
    /\bborder-t\b/,
  );
});
