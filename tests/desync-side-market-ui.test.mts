import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import test from "node:test";


const server =
  readFileSync(
    new URL(
      "../lib/bets.ts",
      import.meta.url
    ),
    "utf8"
  );

const page =
  readFileSync(
    new URL(
      "../app/bets/page.tsx",
      import.meta.url
    ),
    "utf8"
  );

const wagerRoute =
  readFileSync(
    new URL(
      "../app/api/bets/wager/route.ts",
      import.meta.url
    ),
    "utf8"
  );


test(
  "board market payload exposes proposition type",
  () => {
    assert.match(
      server,
      /marketType:\s*string/
    );

    assert.match(
      server,
      /marketType:\s*market\.marketType/
    );
  }
);


test(
  "desync markets can pass board visibility without fake team fields",
  () => {
    assert.match(
      server,
      /isDesyncSideMarketType\(\s*market\.marketType\s*\)/
    );

    assert.match(
      server,
      /market\.teamResolutionStatus ===\s*"resolved"/
    );
  }
);


test(
  "desync side markets can never become the main featured book",
  () => {
    assert.match(
      server,
      /const primaryOpenMarkets\s*=/
    );

    assert.match(
      server,
      /!isDesyncSideMarketType\(\s*market\.marketType\s*\)/
    );

    assert.match(
      server,
      /const featuredMarket\s*=/
    );
  }
);


test(
  "main settled result history remains winner-market history",
  () => {
    assert.match(
      server,
      /marketType:\s*WINNER_MARKET_TYPE,\s*status:\s*\{\s*in:\s*\["settled",\s*"voided"\]/
    );

    assert.match(
      server,
      /marketType:\s*WINNER_MARKET_TYPE,\s*status:\s*"under_review"/
    );
  }
);


test(
  "betting page exposes Desync as one optional ticket leg",
  () => {
    assert.match(
      page,
      /function DesyncTicketLeg/
    );

    assert.match(
      page,
      /Optional Desync call/
    );

    assert.match(
      page,
      /Same wallet signature/
    );

    assert.match(
      page,
      /both legs move in one WOLO transaction/
    );
  }
);


test(
  "ordinary book ordering hides independent side markets",
  () => {
    assert.match(
      page,
      /market\.marketType !==\s*DESYNC_SIDE_MARKET_TYPE/
    );
  }
);


test(
  "featured winner book consumes its server-nested desync proposition",
  () => {
    assert.match(
      page,
      /const spotlightDesyncMarket = spotlightMarket\?\.desyncMarket \?\? null/
    );

    assert.doesNotMatch(
      page,
      /board\?\.openMarkets\.find\(\s*\(market\)\s*=>\s*market\.marketType === DESYNC_SIDE_MARKET_TYPE/
    );
  }
);


test(
  "all three page modes wire the companion into the shared composer",
  () => {
    const bindings =
      page.match(
        /desyncMarket=\{spotlightDesyncMarket\}/g
      ) ?? [];

    assert.equal(
      bindings.length,
      3
    );

    assert.match(
      page,
      /handleCombinedTicketLock/
    );

    assert.match(
      page,
      /desyncMarket=\{market\.desyncMarket\}/
    );

    assert.match(
      page,
      /onDesyncSelect=\{handleDesyncSelection\}/
    );
  }
);


test(
  "Extreme view never mislabels NO and YES as Team A and Team B",
  () => {
    assert.match(
      page,
      /detailMode ===\s*"extreme"\s*&&\s*market\.marketType !==\s*DESYNC_SIDE_MARKET_TYPE/
    );
  }
);


test(
  "desync proposition suppresses winner-only founder controls",
  () => {
    /*
     * Founder controls now live in one shared component rather
     * than being repeated inline across E and A card surfaces.
     *
     * The component must disappear for both non-admin viewers
     * and independent desync propositions.
     */
    assert.match(
      page,
      /function FounderControlRail\(/
    );

    assert.match(
      page,
      /!isAdmin\s*\|\|\s*market\.marketType\s*===\s*DESYNC_SIDE_MARKET_TYPE/
    );

    const founderRails =
      page.match(
        /<FounderControlRail/g
      ) ?? [];

    assert.equal(
      founderRails.length,
      3
    );

    assert.match(
      page,
      /Nested Desync proposition · human-confirmed incident truth/
    );
  }
);


test(
  "desync mini-book explains both authoritative and review-closed NO finality",
  () => {
    assert.match(
      page,
      /YES settles on confirmed desync · NO on a human correction or\s*after the final-result review window/
    );

    assert.match(
      page,
      /Human NO or a cleared review window/
    );
  }
);


test(
  "a nested app-side Desync wager retains a direct clear path",
  () => {
    assert.match(
      page,
      /board\?\.openMarkets\s*\.flatMap\(\(entry\) => \[entry, entry\.desyncMarket\]\)/
    );

    assert.match(
      page,
      /market\.viewerWager[\s\S]*onchainLocked[\s\S]*onClick=\{\(\) => onClear\(market\.id\)\}[\s\S]*Clear Desync slip/
    );

    assert.match(
      page,
      /current\.desync\?\.marketId === marketId[\s\S]*desync: null/
    );

    assert.match(
      wagerRoute,
      /marketId,\s*userId: viewer\.id,\s*status: "active"/
    );

    assert.match(
      wagerRoute,
      /wager\.executionMode === "onchain_escrow" \|\| Boolean\(wager\.stakeTxHash\)/
    );

    assert.match(
      wagerRoute,
      /await prisma\.betWager\.deleteMany\(\{[\s\S]*marketId,[\s\S]*userId: viewer\.id,[\s\S]*status: "active"/
    );
  }
);
