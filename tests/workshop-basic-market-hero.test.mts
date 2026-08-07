import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const experience = readFileSync(
  "components/workshop/WorkshopExperience.tsx",
  "utf8",
);
const polish = readFileSync(
  "app/workshop/workshop-polish.css",
  "utf8",
);

test("Basic uses the Marketplace-inspired Workshop hero", () => {
  assert.match(experience, /data-workshop-basic-market-hero/);
  assert.match(experience, />\s*The Workshop\s*</);
  assert.match(experience, /AoE2WAR · The Workshop/);
  assert.match(experience, /Living history/);
  assert.match(experience, /Public observatory/);
  assert.match(experience, /market-display-gold market-hero-title/);
  assert.match(experience, /market-gold-button/);
  assert.match(experience, /market-iron-button/);
});

test("Basic hero preserves useful Workshop actions and live state", () => {
  assert.match(experience, /Enter the Forge/);
  assert.match(experience, /Workshop Radio/);
  assert.match(experience, /Classic Chronicle/);
  assert.match(experience, /Result coverage/);
  assert.match(experience, /Watcher live/);
  assert.match(experience, /Current front ·/);
});

test("the mural remains in Advanced and Extreme behavior is untouched", () => {
  assert.match(experience, /<WorkshopHeroBanner tone="advanced" \/>/);
  assert.match(experience, /data-workshop-extreme-hero/);
  assert.match(
    experience,
    /setHeroBackgroundVisible\(\(current\) => !current\)/,
  );
});

test("Basic market styling is isolated to Basic", () => {
  assert.match(polish, /WORKSHOP_BASIC_MARKET_HERO_20260806/);
  assert.match(
    polish,
    /main\[data-workshop-view="basic"\] \.workshop-basic-market-hero/,
  );
  assert.doesNotMatch(
    polish,
    /main\[data-workshop-view="advanced"\] \.workshop-basic-market-hero/,
  );
  assert.doesNotMatch(
    polish,
    /main\[data-workshop-view="extreme"\] \.workshop-basic-market-hero/,
  );
});
