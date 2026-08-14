import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const visual = fs.readFileSync(
  new URL("../components/kingdom-forge/ForgeVisuals.tsx", import.meta.url),
  "utf8",
);

const client = fs.readFileSync(
  new URL("../components/kingdom-forge/KingdomForgeClient.tsx", import.meta.url),
  "utf8",
);

const page = fs.readFileSync(
  new URL("../app/kingdom-forge/page.tsx", import.meta.url),
  "utf8",
);

const forgeLib = fs.readFileSync(
  new URL("../lib/kingdomForge.ts", import.meta.url),
  "utf8",
);

const staking = fs.readFileSync(
  new URL("../app/staking/page.tsx", import.meta.url),
  "utf8",
);

test("Kingdom Forge uses the dedicated visual estate instead of Marketplace art", () => {
  for (const asset of [
    "academy-intelligence.jpg",
    "battle-cam.jpg",
    "council-chamber.jpg",
    "construction.jpg",
    "forge-vision.jpg",
    "round-chamber.jpg",
    "tournament-engine.jpg",
  ]) {
    assert.match(visual, new RegExp(asset.replace(".", "\\.")));
  }

  assert.doesNotMatch(client, /agora-marketplace/);
  assert.doesNotMatch(page, /agora-marketplace/);
  assert.match(page, /\/kingdom-forge\/construction\.jpg/);
});

test("Forge hero is compact, static-shell friendly and performance disciplined", () => {
  assert.doesNotMatch(page, /force-dynamic/);
  assert.doesNotMatch(client, /text-\[7\.4rem\]/);
  assert.match(visual, /priority/);
  assert.match(visual, /loading="lazy"/);
  assert.match(visual, /sizes="100vw"/);
});

test("Forge presents the constitutional staking-to-ownership path literally", () => {
  assert.match(visual, /The first million earns\. The rest builds\./);
  assert.match(visual, /Forge Power chooses\./);
  assert.match(visual, /Build Fuel builds\./);
  assert.match(visual, /1,000,000/);
  assert.match(visual, /100 deeds = 1%/);
  assert.match(visual, /70 \/ 20 \/ 10/);
  assert.match(visual, /kingdom-forge-constitution\.pdf/);
});

test("Each project separates Mandate, Build Fuel and Construction truth", () => {
  assert.match(client, /label="Mandate"/);
  assert.match(client, /label="Build Fuel"/);
  assert.match(client, /label="Construction"/);
  assert.match(client, /project\.fundedWolo/);
  assert.match(client, /milestone\.status === "proven"/);
  assert.match(forgeLib, /commitment\.status === "funded"/);
  assert.match(forgeLib, /commitment\.settlementMode !== "app_signal"/);
  assert.match(forgeLib, /Boolean\(commitment\.fundingTxHash\)/);
});

test("Forge Power pledge remains distinct from Build Fuel ignition", () => {
  assert.match(client, /Pledge power/);
  assert.match(client, /reversible and no WOLO moves/);
  assert.match(client, /explicit Ignition into verified project escrow/);
});

test("Staking and Forge are explicitly linked in both directions", () => {
  assert.match(visual, /href="\/staking"/);
  assert.match(staking, /href="\/kingdom-forge"/);
  assert.match(staking, /Above 1,000,000 WOLO/);
});
