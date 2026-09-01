import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const views = fs.readFileSync(
  "components/bounties/BountyBoardViews.tsx",
  "utf8",
);

const shell = fs.readFileSync(
  "app/AppShell.tsx",
  "utf8",
);

const publicEntry =
  views.slice(
    views.indexOf("export default function BountyBoardViews("),
  );

test("production Bounties exposes only the Extreme presentation", () => {
  assert.match(
    publicEntry,
    /data-bounty-view="extreme"/,
  );

  assert.match(
    publicEntry,
    /<ExtremeBountyView board=\{board\}/,
  );

  assert.doesNotMatch(
    publicEntry,
    /useTileViewPreference/,
  );

  assert.doesNotMatch(
    publicEntry,
    /viewMode ===/,
  );

  assert.doesNotMatch(
    publicEntry,
    /<BountyViewToggle/,
  );
});

test("dormant Bounty Basic and Advanced implementations remain preserved", () => {
  assert.match(
    views,
    /function BasicBountyView/,
  );

  assert.match(
    views,
    /function AdvancedBountyView/,
  );
});

test("Bounties shell is permanently sized for Extreme", () => {
  assert.match(
    shell,
    /const bountyShellMaxWidth = "max-w-\[96rem\]";/,
  );

  assert.doesNotMatch(
    shell,
    /bountiesViewMode/,
  );
});
