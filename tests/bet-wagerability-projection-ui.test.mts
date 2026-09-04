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
  "production financial admission remains canonical while fixtures may preview interaction",
  () => {
    assert.match(
      page,
      /const visualBettingOpen =\s*market\.bettingOpen \|\|\s*previewInteraction/
    );

    assert.match(
      page,
      /const canEditSlip =\s*visualBettingOpen &&\s*!marketWorkflow/
    );

    assert.match(
      page,
      /if \(!market\.bettingOpen\)/
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
  "interactive fixture is visually live but financially dead",
  () => {
    assert.match(
      page,
      /previewInteraction=\{\s*fixtureInteractionMode\s*\}/
    );

    assert.match(
      page,
      /if \(fixtureInteractionMode\) \{[\s\S]*?Design fixture: wager locking is disabled\.[\s\S]*?return;/
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
