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
});
