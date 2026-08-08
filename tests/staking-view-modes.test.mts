import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const preferences = fs.readFileSync("lib/tileViewPreferences.ts", "utf8");
const shell = fs.readFileSync("app/staking/StakingViewShell.tsx", "utf8");
const page = fs.readFileSync("app/staking/page.tsx", "utf8");
const styles = fs.readFileSync("app/globals.css", "utf8");

test("staking participates in canonical BAE preferences with Basic as default", () => {
  assert.match(preferences, /"staking",/);
  assert.match(preferences, /staking: "basic"/);
  assert.match(shell, /useTileViewPreference\("staking"\)/);
  assert.match(shell, /data-staking-view=\{viewMode\}/);
  assert.match(shell, /TILE_VIEW_MODES\.map/);
});

test("staking BAE changes shell width without replacing page content", () => {
  assert.match(page, /<StakingViewShell>/);
  assert.match(page, /<StakingViewToggle \/>/);
  assert.match(styles, /staking-view-shell\[data-staking-view="basic"\][\s\S]*?max-width: 72rem/);
  assert.match(styles, /staking-view-shell\[data-staking-view="advanced"\][\s\S]*?82rem/);
  assert.match(styles, /staking-view-shell\[data-staking-view="extreme"\][\s\S]*?max-width: none/);
});

test("staking width control exposes an accessible pressed-button group", () => {
  assert.match(shell, /role="group"/);
  assert.match(shell, /aria-label="Staking page width"/);
  assert.match(shell, /aria-pressed=\{active\}/);
  assert.match(shell, /focus-visible:ring-2/);
});
