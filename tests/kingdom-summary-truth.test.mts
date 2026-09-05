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

const internalAccountsSource = readFileSync(
  new URL("../lib/internalSystemAccounts.ts", import.meta.url),
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
    internalAccountsSource,
    /MOOSE_SYSTEM_UID\s*=\s*\n?\s*"aoe2hd-moose"/,
  );
  assert.match(
    summarySource,
    /gameStats\.findMany/,
  );
  assert.match(
    summarySource,
    /parse_source:\s*\{\s*startsWith:\s*"watcher"/,
  );
  assert.match(
    summarySource,
    /is_final:\s*true/,
  );
  assert.match(
    summarySource,
    /distinct:\s*\[\s*"userUid"/,
  );
  assert.doesNotMatch(
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

test("Kingdom wealth is an explicit unencumbered community-reserve allowlist", () => {
  for (const included of [
    "Community Treasury",
    "DEX Liquidity Reserve",
    "Faucet Growth Reserve",
    "Faucet Hot Wallet",
    "Validator Ops",
    "Ecosystem Bounties",
    "Workshop Sponsorships",
    "Wolo-Osmosis Relayer Gas",
  ]) {
    assert.equal(
      summarySource.includes(included),
      true,
      `missing Kingdom wealth account: ${included}`,
    );
  }

  for (const excluded of [
    "Founder's Cold Reserve",
    "Founder Operating / Emaren",
    "Founder Rewards",
    "Staking Distribution Reserve",
    "Staking Wallet",
    "Bet Escrow Signer",
    "IBC Escrow",
  ]) {
    assert.equal(
      summarySource.includes(excluded),
      false,
      `encumbered/private account entered Kingdom wealth: ${excluded}`,
    );
  }
});

test("Kingdom page restores Citizens, Join the Quest, proven Watchers, and Kingdom Wealth without hand-entered values", () => {
  assert.match(
    pageSource,
    /loadKingdomSummary\(\)/,
  );
  assert.match(
    pageSource,
    /summary\.citizens/,
  );
  assert.match(
    pageSource,
    /watchers=\{summary\.watchers\}/,
  );
  assert.match(
    clientSource,
    /ledgerStats\.map/,
  );
  assert.match(
    clientSource,
    /citizens\.map/,
  );
  assert.match(
    clientSource,
    /watchers\.map/,
  );
  assert.match(
    clientSource,
    /final replay successfully uploaded through the Watcher/,
  );

  for (const label of [
    "Kingdom Wealth",
    "Watchers",
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
    "Watchers Active",
    ">18<",
    ">3<",
  ]) {
    assert.doesNotMatch(
      clientSource,
      new RegExp(staleLiteral),
    );
  }
});
