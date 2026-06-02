import assert from "node:assert/strict";
import test from "node:test";

import { deriveWeightedPoolWoloPriceUsd } from "../lib/woloMarket.ts";

test("derives WOLO price from Osmosis pool 3461 asset balances", () => {
  const price = deriveWeightedPoolWoloPriceUsd({
    usdcAmount: "20999000",
    usdcWeight: "536870912000000",
    woloAmount: "190503387103",
    woloWeight: "536870912000000",
  });

  assert.ok(price);
  assert.equal(price.toFixed(7), "0.0001102");
});

test("does not derive a price from missing or zero pool assets", () => {
  assert.equal(
    deriveWeightedPoolWoloPriceUsd({
      usdcAmount: "0",
      woloAmount: "190503387103",
    }),
    null
  );
});
