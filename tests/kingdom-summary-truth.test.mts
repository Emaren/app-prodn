import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const summarySource = readFileSync(
  new URL("../lib/kingdomSummary.ts", import.meta.url),
  "utf8",
);

const leagueSource = readFileSync(
  new URL("../lib/aoe2warLeague.ts", import.meta.url),
  "utf8",
);

const pageSource = readFileSync(
  new URL("../app/kingdom/page.tsx", import.meta.url),
  "utf8",
);

const clientSource = readFileSync(
  new URL("../app/kingdom/KingdomChroniclesClient.tsx", import.meta.url),
  "utf8",
);

test("Kingdom summary derives current civic facts from real authorities", () => {
  assert.match(
    summarySource,
    /forumThread\.count\(/,
  );
  assert.match(
    summarySource,
    /channel:\s*"wolo-chronicles"/,
  );
  assert.match(
    summarySource,
    /canonicalizeNumberedBountyTransfers/,
  );
  assert.match(
    summarySource,
    /isInternalSystemUid/,
  );
  assert.match(
    summarySource,
    /watcherClientEvent\.findMany/,
  );
  assert.match(
    summarySource,
    /15 \* 60 \* 1000/,
  );
  assert.match(
    summarySource,
    /loadKingdomWealthWolo/,
  );
  assert.match(
    summarySource,
    /fetchWoloBalanceAmount/,
  );

  assert.doesNotMatch(
    leagueSource,
    /export const kingdomStats/,
  );
});

test("Kingdom wealth excludes private, player, custody, module, and retired rails", () => {
  for (const included of [
    "Community Treasury",
    "Liquidity Reserve",
    "Growth Reserve",
    "Operations Reserve",
    "Bounty Pool",
    "Faucet Wallet",
    "Rewards Wallet",
    "Payout Wallet",
    "Relayer Wallet",
  ]) {
    assert.match(
      summarySource,
      new RegExp(included),
    );
  }

  assert.match(
    summarySource,
    /account\.role !== "founder"/,
  );
  assert.match(
    summarySource,
    /account\.role !== "user"/,
  );
  assert.match(
    summarySource,
    /account\.role !== "module"/,
  );
  assert.match(
    summarySource,
    /account\.role !== "staking"/,
  );
  assert.match(
    summarySource,
    /account\.role !== "escrow"/,
  );
});

test("Kingdom page restores Citizens, Join the Quest, Watchers Active, and Kingdom Wealth without hand-entered values", () => {
  assert.match(
    pageSource,
    /loadKingdomSummary\(\)/,
  );
  assert.match(
    pageSource,
    /summary\.citizens/,
  );
  assert.match(
    clientSource,
    /ledgerStats\.map/,
  );
  assert.match(
    clientSource,
    /citizens\.map/,
  );

  for (const label of [
    "Kingdom Wealth",
    "Watchers Active",
    "Citizens",
    "Joined The Quest",
  ]) {
    assert.match(
      summarySource,
      new RegExp(label),
    );
  }

  for (const staleLiteral of [
    "100,000,000 WOLO",
    "Watchers active</div><div",
    ">18<",
    ">3<",
  ]) {
    assert.doesNotMatch(
      clientSource,
      new RegExp(staleLiteral),
    );
  }
});
