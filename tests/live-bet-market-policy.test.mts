import assert from "node:assert/strict";
import test from "node:test";

import {
  isBettableLiveWinnerMarket,
  selectPrimaryLiveWinnerMarket,
} from "../lib/liveBetMarketPolicy.ts";

test(
  "open and live winner markets are bettable",
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
      true
    );
  }
);

test(
  "settled, closing and desync markets are not primary live bets",
  () => {
    assert.equal(
      isBettableLiveWinnerMarket({
        marketType: "winner",
        status: "settled",
      }),
      false
    );

    assert.equal(
      isBettableLiveWinnerMarket({
        marketType: "winner",
        status: "closing",
      }),
      false
    );

    assert.equal(
      isBettableLiveWinnerMarket({
        marketType: "desync",
        status: "live",
      }),
      false
    );
  }
);

test(
  "winner market is selected even when a newer desync market appears first",
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
          status: "live",
        },
      ]);

    assert.equal(
      selected?.id,
      424220
    );
  }
);

test(
  "no CTA is produced when only a desync market is live",
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
          status: "settled",
        },
      ]);

    assert.equal(
      selected,
      null
    );
  }
);
