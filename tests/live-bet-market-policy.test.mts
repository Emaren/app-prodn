import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  isBettableLiveWinnerMarket,
  selectPrimaryLiveWinnerMarket,
} from "../lib/liveBetMarketPolicy.ts";

test(
  "only open winner markets are wagerable",
  () => {
    assert.equal(
      isBettableLiveWinnerMarket({
        marketType: "winner",
        status: "open",
      }),
      true
    );

    assert.equal(
      isBettableLiveWinnerMarket({
        marketType: "winner",
        status: "live",
      }),
      false
    );
  }
);

test(
  "live closing settled and Desync markets are not fresh-bettable",
  () => {
    for (const status of [
      "live",
      "closing",
      "settled",
      "awaiting_final_proof",
      "under_review",
    ]) {
      assert.equal(
        isBettableLiveWinnerMarket({
          marketType: "winner",
          status,
        }),
        false,
        status
      );
    }

    assert.equal(
      isBettableLiveWinnerMarket({
        marketType: "desync",
        status: "open",
      }),
      false
    );
  }
);

test(
  "open winner market is selected even when a newer Desync market appears first",
  () => {
    const selected =
      selectPrimaryLiveWinnerMarket([
        {
          id: 424221,
          marketType: "desync",
          status: "live",
        },
        {
          id: 424220,
          marketType: "winner",
          status: "open",
        },
      ]);

    assert.equal(
      selected?.id,
      424220
    );
  }
);

test(
  "a live winner market produces no wagering CTA",
  () => {
    const selected =
      selectPrimaryLiveWinnerMarket([
        {
          id: 424220,
          marketType: "winner",
          status: "live",
        },
      ]);

    assert.equal(
      selected,
      null
    );
  }
);

test(
  "live-games presentation cannot advertise live wagering",
  () => {
    const source =
      readFileSync(
        new URL(
          "../components/live/LiveGamesBoard.tsx",
          import.meta.url
        ),
        "utf8"
      );

    assert.match(
      source,
      /session\.state === "live"/
    );

    assert.doesNotMatch(
      source,
      /return "Bet live"/
    );

    assert.doesNotMatch(
      source,
      /return "Betting open"/
    );
  }
);
