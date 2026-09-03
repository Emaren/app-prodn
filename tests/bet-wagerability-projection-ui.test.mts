import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const bets =
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

test(
  "bet board projects canonical fresh-wager authority",
  () => {
    assert.match(
      bets,
      /freshBettingCloseReason/
    );

    assert.match(
      bets,
      /bettingOpen:\s*bettingCloseReason === null/
    );

    assert.match(
      bets,
      /bettingCloseReason/
    );

    assert.match(
      bets,
      /scheduledMatchId:\s*market\.scheduledMatchId/
    );
  }
);

test(
  "both bet card renderers disable editing when pre-game betting is closed",
  () => {
    assert.equal(
      (
        page.match(
          /market\.bettingOpen &&\s*!marketWorkflow/g
        ) ?? []
      ).length,
      2
    );

    assert.ok(
      (
        page.match(
          /Pre-game closed/g
        ) ?? []
      ).length >= 2
    );
  }
);

test(
  "closed market keeps existing slip visible but forbids adding WOLO",
  () => {
    assert.match(
      page,
      /Pre-game betting is closed\. Your existing slip remains active\./
    );

    assert.match(
      page,
      /if \(!market\.bettingOpen\)/
    );
  }
);

test(
  "live design fixture is financially closed",
  () => {
    assert.match(
      page,
      /status:\s*"live",[\s\S]*?bettingOpen:\s*false/
    );
  }
);
