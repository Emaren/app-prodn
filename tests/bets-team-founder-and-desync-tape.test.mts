import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const bets =
  fs.readFileSync(
    "lib/bets.ts",
    "utf8"
  );

const founders =
  fs.readFileSync(
    "lib/betFounderBonuses.ts",
    "utf8"
  );

const modal =
  fs.readFileSync(
    "components/bets/FounderBonusModal.tsx",
    "utf8"
  );

const page =
  fs.readFileSync(
    "app/bets/page.tsx",
    "utf8"
  );

test(
  "main winner market receives sibling desync wager rows",
  () => {
    assert.match(
      bets,
      /attachDesyncWarTapeToWinnerMarkets/
    );

    assert.match(
      bets,
      /label: "Desync Bet"/
    );

    assert.match(
      bets,
      /attachDesyncWarTapeToWinnerMarkets\(\s*openMarketsWithFeeds/
    );
  }
);

test(
  "Founder participant bonus uses actual roster count",
  () => {
    assert.match(
      founders,
      /buildFounderParticipantTargets/
    );

    assert.match(
      founders,
      /founderParticipantCount/
    );

    assert.doesNotMatch(
      founders,
      /Math\.floor\(bonus\.totalAmountWolo \/ 2\)/
    );

    assert.doesNotMatch(
      founders,
      /Math\.ceil\(bonus\.totalAmountWolo \/ 2\)/
    );
  }
);

test(
  "Founder modal receives participant count",
  () => {
    assert.match(
      modal,
      /participantCount: number/
    );

    assert.match(
      modal,
      /every player in the match/
    );

    assert.doesNotMatch(
      modal,
      /Math\.floor\(amountWolo \/ 2\)/
    );

    assert.match(
      page,
      /participantCount=\{founderComposer\?\.participantCount \|\| 2\}/
    );
  }
);
