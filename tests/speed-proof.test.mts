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

test("exact clan and bet realms retain a truthful last proof instead of measuring forever", () => {
  assert.match(proof, /if \(!AUTHORITATIVE_ROUTES\.has\(route\)\)/);
  assert.match(proof, /getRecentSpeedSamples\(\)\.find\(\(candidate\) => isValidProof\(candidate\)\)/);
  assert.match(proof, /Last ready/);
  assert.match(proof, /this detail realm does not make a separate speed claim/);
  assert.match(proof, /\) : authoritative \? \(/);
});

test("Speed Proof receives idempotent sample upgrades from the recorder", () => {
  assert.match(store, /SPEED_SAMPLE_UPDATED_EVENT/);
  assert.match(store, /publishSampleUpdate\(next\)/);
  assert.match(proof, /addEventListener\(SPEED_SAMPLE_UPDATED_EVENT/);
});

test("Speed Proof remains globally wired alongside the personal Speed Observatory", () => {
  assert.match(
    shell,
    /const SpeedProof = dynamic\(\(\) => import\("@\/components\/speed\/SpeedProof"\)/
  );
  assert.match(shell, /<SpeedProof \/>/);
  assert.doesNotMatch(shell, /href="\/speed"/);
});
