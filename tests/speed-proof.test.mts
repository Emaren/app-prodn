import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const proof = fs.readFileSync("components/speed/SpeedProof.tsx", "utf8");
const store = fs.readFileSync("lib/speed/clientStore.ts", "utf8");
const shell = fs.readFileSync("app/AppShell.tsx", "utf8");

test("Speed Proof only exposes valid authoritative explicit readiness", () => {
  assert.match(proof, /ready_source === "explicit"/);
  assert.match(proof, /valid_for_aggregation/);
  assert.match(proof, /!sample\.visibility_tainted/);
  assert.match(proof, /AUTHORITATIVE_ROUTES/);
  for (const route of [
    "/bets",
    "/live-games",
    "/players",
    "/rivalries",
    "/leaderboard",
    "/war-chest",
    "/staking",
  ]) {
    assert.match(proof, new RegExp(route.replace("/", "\\/")));
  }
});

test("Speed Proof says exactly what was measured instead of making an aggregate site claim", () => {
  assert.match(proof, /Measured live on this device/);
  assert.match(proof, /authoritative readiness/);
  assert.match(proof, /Ready/);
  assert.match(proof, /Restored/);
  assert.doesNotMatch(proof, /fastest site/i);
  assert.doesNotMatch(proof, /site-wide/i);
});

test("Speed Proof receives idempotent sample upgrades from the recorder", () => {
  assert.match(store, /SPEED_SAMPLE_UPDATED_EVENT/);
  assert.match(store, /publishSampleUpdate\(next\)/);
  assert.match(proof, /addEventListener\(SPEED_SAMPLE_UPDATED_EVENT/);
});

test("Speed Proof is globally wired while the personal Speed Observatory remains a later phase", () => {
  assert.match(shell, /import SpeedProof from "@\/components\/speed\/SpeedProof"/);
  assert.match(shell, /<SpeedProof \/>/);
  assert.doesNotMatch(shell, /href="\/speed"/);
});
