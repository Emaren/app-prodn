import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const page =
  fs.readFileSync(
    "app/bets/page.tsx",
    "utf8"
  );

test(
  "stake maximum is not forced to zero by settlement readiness",
  () => {
    assert.doesNotMatch(
      page,
      /bettingPaused\s*\?\s*0\s*:\s*resolveStakeMax/
    );

    assert.match(
      page,
      /const maxStakeWolo = useMemo\([\s\S]*?resolveVerifiedWalletStakeCap\(walletBalance\.data\)/
    );

    assert.doesNotMatch(
      page,
      /const maxStakeWolo = useMemo\([\s\S]{0,240}?bettingPaused/
    );
  }
);

test(
  "settlement readiness has an explicit helper",
  () => {
    assert.match(
      page,
      /function isBettingSettlementRailPaused/
    );

    assert.match(
      page,
      /groupedRunCapability ===\s*"unknown"/
    );
  }
);

test(
  "uncertain settlement rail is refreshed before wallet action",
  () => {
    assert.match(
      page,
      /if \(bettingPaused\)/
    );

    assert.match(
      page,
      /await loadBoard\(true\)/
    );

    assert.match(
      page,
      /No WOLO moved/
    );
  }
);
