import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const page = fs.readFileSync("app/tournaments/page.tsx", "utf8");
const experience = fs.readFileSync(
  "components/tournaments/TournamentBracketExperience.tsx",
  "utf8"
);
const rosterRoute = fs.readFileSync(
  "app/api/tournaments/roster/route.ts",
  "utf8"
);
const shell = fs.readFileSync("app/AppShell.tsx", "utf8");

test("Tournaments owns a dedicated bracket battlefield", () => {
  assert.match(page, /TournamentBracketExperience/);
  assert.match(experience, /AOE2WAR \/\/ BATTLE LATTICE/);
  assert.match(experience, /ROUND OF 16/);
  assert.match(experience, /SEMIFINAL/);
  assert.match(experience, /LEFT WING CHAMPION/);
  assert.match(experience, /RIGHT WING CHAMPION/);
  assert.match(experience, /SpeedReadyMarker route="\/tournaments"/);
  assert.match(experience, /BRACKET_NATIVE_WIDTH = 2274/);
  assert.match(experience, /2 wings × \(4 × 228px columns \+ 3 × 20px connectors\)/);
  assert.match(experience, /w-\[2274px\]/);
  assert.match(experience, /ResizeObserver/);
  assert.match(experience, /transformOrigin: "top left"/);
  assert.match(
    experience,
    /BRACKET_ZOOM_ORDER: BracketZoom\[\] = \["close", "medium", "full"\]/
  );
  assert.match(experience, /useState<BracketZoom>\("close"\)/);
  assert.match(experience, /BRACKET_ZOOM_STORAGE_KEY/);
  assert.match(experience, /window\.localStorage\.getItem/);
  assert.match(experience, /window\.localStorage\.setItem/);
  assert.match(experience, /Bracket zoom:/);
  assert.match(experience, /ZoomIn/);
  assert.match(experience, /data-tournament-snap="overview"/);
  assert.match(experience, /data-tournament-snap="battlefield"/);
  assert.match(experience, /\[scroll-snap-type:y_proximity\]/);
  assert.match(experience, /\[scroll-snap-stop:always\]/);
  assert.match(experience, /data-app-shell-header/);
  assert.match(experience, /translate3d\(0, -\$\{offset\}px, 0\)/);
  assert.match(experience, /height \/ BRACKET_NATIVE_HEIGHT/);
  assert.match(experience, /overscroll-x-contain/);
  assert.match(experience, /overflow-x-auto overflow-y-hidden/);
  assert.match(experience, /battlefieldFocused[\s\S]*?"overflow-auto"/);
  assert.match(experience, /touch-action:pan-x_pan-y/);
  assert.match(experience, /currentFocusX/);
  assert.match(experience, /currentFocusY/);
  assert.doesNotMatch(experience, /overscroll-contain/);
});

test("Tournament watcher beacons come from watcher telemetry, not site presence", () => {
  assert.match(rosterRoute, /watcherClientEvent\.findMany/);
  assert.match(rosterRoute, /WATCHER_LIVE_WINDOW_MS/);
  assert.match(rosterRoute, /WATCHER_OFF_EVENTS/);
  assert.doesNotMatch(rosterRoute, /loadPublicPresenceSnapshot/);
});

test("Tournaments sits immediately after Champions in Kingdom navigation", () => {
  const champions = shell.indexOf(
    '{ href: "/champions", label: "Champions"'
  );
  const tournaments = shell.indexOf(
    '{ href: "/tournaments", label: "Tournaments"'
  );
  const nations = shell.indexOf(
    '{ href: "/national-champions", label: "Nations"'
  );

  assert.ok(champions >= 0);
  assert.ok(tournaments > champions);
  assert.ok(nations > tournaments);
  assert.match(shell, /A warrior's calling\./);
  assert.match(shell, /War records, battlecraft, and victories preserved\./);
  assert.match(shell, /const isTournamentSurface/);
  assert.match(shell, /isTournamentSurface[\s\S]*?max-w-none/);
  assert.match(
    shell,
    /isLivingLeaderboardSurface \|\| isTournamentSurface[\s\S]*?h-\[100dvh\]/
  );
  assert.match(
    shell,
    /isTournamentSurface \? "fixed inset-x-0 top-0" : "sticky top-0"/
  );
  assert.match(shell, /isTournamentSurface[\s\S]*?!py-0 !pb-0 overflow-hidden/);
});
