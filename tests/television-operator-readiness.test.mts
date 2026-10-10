import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const route=readFileSync("app/api/admin/television-readiness/route.ts","utf8");
const panel=readFileSync("components/admin/TelevisionReadinessPanel.tsx","utf8");
test("readiness is admin-only and derived from canonical live replay sessions",()=>{
  assert.match(route,/await requireAdmin\(request\)/);
  assert.match(route,/loadPublicLiveGamesSnapshot\(gate.prisma\)/);
  assert.match(route,/session.teamResolution/);
  assert.match(route,/assignTelevisionCameras\(stage, streams\)/);
  assert.match(route,/televisionCameraStatus\(camera.stream\)/);
  assert.match(route,/slice\(0, MAX_BATTLES\)/);
});
test("operator view does not invent game teams, players or stream matches",()=>{
  assert.match(route,/teamsProven: stage.confirmedTeams/);
  assert.match(route,/Unverified|unverified/);
  assert.match(route,/unassignedStreams/);
  assert.doesNotMatch(route,/playerLabel.*includes|fuzzyName|winnerOverride/);
  assert.match(route,/A VIDEO LIVE marker proves recent chunks\/heartbeat/);
});
test("live readiness refreshes only while admin browser is visible",()=>{
  assert.match(panel,/document.visibilityState === "hidden"/);
  assert.match(panel,/document.addEventListener\("visibilitychange",onVisible\)/);
  assert.match(panel,/clearInterval\(timer\)/);
  assert.match(panel,/No registered POV/);
  assert.match(readFileSync("app/admin/video-vault/page.tsx","utf8"),/TelevisionReadinessPanel/);
});
test("readiness is read-only and never establishes competitive or financial results",()=>{
  assert.doesNotMatch(route,/\.create\(|\.update\(|\.delete\(|\$executeRaw/);
  assert.match(route,/Read-only canonical replay identities/);
});
