import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import test from "node:test";


const source =
  readFileSync(
    new URL(
      "../lib/betWagering.ts",
      import.meta.url
    ),
    "utf8"
  );


test(
  "wager preflight reads the proposition market type",
  () => {
    assert.match(
      source,
      /marketType:\s*string/
    );

    assert.match(
      source,
      /isDesyncSideMarketType/
    );

    assert.match(
      source,
      /context\.market\.marketType/
    );
  }
);


test(
  "every proposition still requires verified integrity and a frozen proposition hash",
  () => {
    assert.match(
      source,
      /context\.market\.integrityStatus\s*!==\s*"verified"/
    );

    assert.match(
      source,
      /!context\.market\.propositionHash/
    );
  }
);


test(
  "winner markets still require resolved high-confidence teams",
  () => {
    assert.match(
      source,
      /!desyncSideMarket/
    );

    assert.match(
      source,
      /context\.market\.teamResolutionStatus\s*!==\s*"resolved"/
    );

    assert.match(
      source,
      /context\.market\.teamConfidence\s*!==\s*"high"/
    );
  }
);


test(
  "winner markets still require frozen non-empty rosters",
  () => {
    assert.match(
      source,
      /context\.market\.leftRosterSnapshot\.length\s*===\s*0/
    );

    assert.match(
      source,
      /context\.market\.rightRosterSnapshot\.length\s*===\s*0/
    );
  }
);


test(
  "desync markets do not force a participant onto their competitive team side",
  () => {
    assert.match(
      source,
      /const forcedSide\s*=\s*desyncSideMarket\s*\?\s*null\s*:\s*resolveViewerMatchSide/
    );
  }
);


test(
  "same-user market side lock remains enforced",
  () => {
    assert.match(
      source,
      /viewerActiveSides\.size\s*>\s*0/
    );

    assert.match(
      source,
      /!viewerActiveSides\.has\(input\.side\)/
    );

    assert.match(
      source,
      /you cannot switch sides/
    );
  }
);


test(
  "wallet side lock remains enforced for desync markets",
  () => {
    assert.match(
      source,
      /walletLockSide\s*&&\s*walletLockSide\s*!==\s*input\.side/
    );

    assert.match(
      source,
      /That wallet already has WOLO on the other side of this market/
    );
  }
);


test(
  "atomic stake lock skips team predicates only for desync markets",
  () => {
    assert.match(
      source,
      /isDesyncSideMarketType\(\s*market\.marketType\s*\)/
    );

    assert.match(
      source,
      /\?\s*\{\}\s*:\s*\{\s*teamResolutionStatus:\s*"resolved",\s*teamConfidence:\s*"high"/
    );
  }
);


test(
  "fresh desync stake lock remains closed during closing review",
  () => {
    /*
     * The atomic lock now has two explicit paths:
     *
     * 1. A narrowly fenced recovery for WOLO that was already
     *    broadcast before the market locked.
     * 2. The ordinary fresh-wager path.
     *
     * This assertion protects the ordinary path: desync books
     * remain open/live only, while winner books retain the
     * existing open/closing/live behavior.
     */
    assert.match(
      source,
      /where:\s*postBroadcastRecovery\s*\?\s*\{/
    );

    assert.match(
      source,
      /status:\s*\{\s*in:\s*isDesyncSideMarketType\(\s*market\.marketType\s*\)\s*\?\s*\[\s*"open",\s*"live",?\s*\]\s*:\s*\[\s*"open",\s*"closing",\s*"live",?\s*\]/
    );

    const recoveryPolicySource =
      readFileSync(
        new URL(
          "../lib/betStakeRecoveryPolicy.ts",
          import.meta.url
        ),
        "utf8"
      );

    assert.match(
      recoveryPolicySource,
      /POST_BROADCAST_RECOVERY_MARKET_STATUSES/
    );

    assert.match(
      recoveryPolicySource,
      /"awaiting_final_proof"/
    );

    assert.match(
      recoveryPolicySource,
      /"under_review"/
    );

    assert.doesNotMatch(
      recoveryPolicySource,
      /"closing"/
    );
  }
);
