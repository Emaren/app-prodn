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
const activityRoute = fs.readFileSync(
  "app/api/staking/activity/route.ts",
  "utf8",
);
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
    /Battle proof/,
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

test("Recent Activity exposes B1 A1 A2 and E1 viewing modes", () => {
  assert.match(
    feed,
    /type ActivityLayoutMode[\s\S]*"b1"[\s\S]*"a1"[\s\S]*"a2"[\s\S]*"e1"/,
  );

  assert.match(
    feed,
    /aria-label="Recent activity view"/,
  );

  assert.match(
    feed,
    /data-staking-activity-layout=\{activityLayout\}/,
  );

  assert.match(
    feed,
    /data-staking-activity-layout="a1"/,
  );

  assert.match(
    feed,
    /data-staking-activity-layout="a2"/,
  );

  assert.match(
    feed,
    /activityLayout === "e1"[\s\S]*fixed inset-2/,
  );

  assert.match(
    feed,
    /event\.key === "Escape"/,
  );
});

test("Grouped Bets uses compact whole-row battle disclosures in B1 and A1", () => {
  assert.match(
    battleCard,
    /density\?: BetBattleHistoryCardDensity/,
  );

  assert.match(
    battleCard,
    /density === "a2"/,
  );

  assert.match(
    battleCard,
    /cursor-pointer/,
  );

  assert.match(
    battleCard,
    /aria-label=\{`\$\{battleLabel\(group\)\} — open battle details`\}/,
  );

  assert.match(
    battleCard,
    /desyncCode/,
  );

  assert.match(
    battleCard,
    />\s*D\s*</,
  );

  assert.match(
    battleCard,
    /settlementAmount\(group\)/,
  );
});

test("Grouped Bets display rail cannot leak raw ledger events", () => {
  assert.match(
    feed,
    /mode === "grouped"[\s\S]*rows\.filter[\s\S]*row\.battleHistory/,
  );

  assert.match(
    feed,
    /displayRows\.length\.toLocaleString\(\)/,
  );
});

test("staking activity API preserves versioned battle-history cursors", () => {
  assert.match(
    activityRoute,
    /BATTLE_HISTORY_CURSOR_PATTERN/,
  );

  assert.match(
    activityRoute,
    /\^bh2\\\.-\?\\d\+\\\.\\d\+\\\.\\d\+\$/,
  );

  assert.match(
    activityRoute,
    /mode === "grouped"[\s\S]*BATTLE_HISTORY_CURSOR_PATTERN\.test/,
  );

  assert.match(
    activityRoute,
    /before,[\s\S]*mode,/,
  );
});

test(
  "A2 uses the whole rich battle surface as its disclosure control",
  () => {
    const a2 =
      battleCard.match(
        /\{density === "a2" \? \([\s\S]*?\n      \) : \(/,
      )?.[0] ?? "";

    assert.match(
      a2,
      /role="button"/,
    );

    assert.match(
      a2,
      /tabIndex=\{0\}/,
    );

    assert.match(
      a2,
      /aria-expanded=\{expanded\}/,
    );

    assert.match(
      a2,
      /aria-controls=\{detailsId\}/,
    );

    assert.match(
      a2,
      /cursor-pointer/,
    );

    assert.match(
      a2,
      /hover:bg-cyan-300/,
    );

    assert.match(
      a2,
      /focus-visible:ring-2/,
    );

    assert.match(
      a2,
      /event\.key !== "Enter"/,
    );

    assert.match(
      a2,
      /event\.key !== " "/,
    );

    assert.doesNotMatch(
      a2,
      /Open battle proof/,
    );

    assert.match(
      a2,
      /Battle proof/,
    );
  },
);
