import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const preferences = fs.readFileSync("lib/tileViewPreferences.ts", "utf8");
const activityPreferences = fs.readFileSync(
  "lib/stakingActivityPreferences.ts",
  "utf8",
);
const shell = fs.readFileSync("app/staking/StakingViewShell.tsx", "utf8");
const page = fs.readFileSync("app/staking/page.tsx", "utf8");
const feed = fs.readFileSync("app/staking/StakingActivityFeed.tsx", "utf8");
const staking = fs.readFileSync("lib/staking.ts", "utf8");
const battleCard = fs.readFileSync(
  "components/bets/BetBattleHistoryCard.tsx",
  "utf8",
);
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

test("staking activity defaults fresh and legacy users to Grouped Bets", () => {
  assert.match(
    activityPreferences,
    /staking-activity-prefs:grouped-default-v2/,
  );

  assert.match(
    activityPreferences,
    /input\.mode === "ledger" \|\| input\.mode === "grouped" \? input\.mode : "grouped"/,
  );

  assert.match(
    activityPreferences,
    /v1 wrote ledger on mount/,
  );

  assert.match(
    activityPreferences,
    /mode: "grouped"/,
  );
});

test("Grouped Bets carries canonical battle history into the client", () => {
  assert.match(
    staking,
    /battleHistory\?: BetBattleHistoryGroup/,
  );

  assert.match(
    staking,
    /battleHistory:\s*group/,
  );

  assert.match(
    staking,
    /occurredAt:\s*group\.startedAt/,
  );
});

test("Grouped Bets renders the dedicated battle card while Ledger keeps ActivityRow", () => {
  assert.match(
    feed,
    /import BetBattleHistoryCard from "@\/components\/bets\/BetBattleHistoryCard"/,
  );

  assert.match(
    feed,
    /mode === "grouped" && item\.battleHistory/,
  );

  assert.match(
    feed,
    /<BetBattleHistoryCard[\s\S]*group=\{item\.battleHistory\}/,
  );

  assert.match(
    feed,
    /:\s*\([\s\S]*<ActivityRow[\s\S]*item=\{item\}/,
  );
});

test("battle card exposes one expandable human story with Winner and Desync proof", () => {
  assert.match(
    battleCard,
    /Battle #\$\{group\.publicNumber\.toLocaleString\(\)\}/,
  );

  assert.match(
    battleCard,
    /eyebrow="Winner"/,
  );

  assert.match(
    battleCard,
    /group\.desyncOutcome/,
  );

  assert.match(
    battleCard,
    /Open battle proof/,
  );

  assert.match(
    battleCard,
    /group\.slips\.map/,
  );

  assert.match(
    battleCard,
    /timeline\.map/,
  );

  assert.match(
    battleCard,
    /group\.corePayoutWolo/,
  );

  assert.match(
    battleCard,
    /group\.coreRefundWolo/,
  );

  assert.match(
    battleCard,
    /group\.rewardWolo/,
  );
});
