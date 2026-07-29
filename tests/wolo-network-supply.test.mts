import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const accountsSource = readFileSync(
  new URL("../lib/woloMainnetNetworkAccounts.ts", import.meta.url),
  "utf8",
);
const routeSource = readFileSync(
  new URL("../app/api/wolo/network/route.ts", import.meta.url),
  "utf8",
);
const runtimeSource = readFileSync(
  new URL("../lib/woloRuntime.ts", import.meta.url),
  "utf8",
);

test("the Workshop sponsorship balance is part of the known mainnet map", () => {
  assert.match(accountsSource, /label:\s*"Workshop Sponsorships"/);
  assert.match(
    accountsSource,
    /wolo1m943tq5tuqf7ejucmac9knpls04jtmh3apzlrg/,
  );
  assert.match(accountsSource, /role:\s*"workshop"/);
  assert.match(accountsSource, /account\.role !== "workshop"/);
});

test("network totals use canonical WoloChain supply and expose reconciliation", () => {
  assert.match(
    runtimeSource,
    /cosmos\/bank\/v1beta1\/supply\/by_denom\?denom=/,
  );
  assert.match(routeSource, /totalSource = "chain_supply"/);
  assert.match(routeSource, /knownAddressTotalUwolo/);
  assert.match(routeSource, /untrackedUwolo/);
  assert.match(routeSource, /WOLO total supply \(WoloChain\)/);
  assert.match(routeSource, /chain supply unavailable/);
  assert.match(
    routeSource,
    /renderTable\(rows, totalUwolo, knownAddressTotalUwolo, totalSource\)/,
  );
});
