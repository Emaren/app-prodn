import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { warSatchelVaultDistinctFromKnownWallets } from "../lib/warSatchelVaultBoundary.ts";
import { WOLO_MAINNET_WALLET_ALIASES } from "../lib/woloMainnetWallets.ts";
import { resolveCommunityTreasuryAddressConfig } from "../lib/woloCommunityTreasury.ts";

const novel = "wolo1" + "x".repeat(38);
const alternate = "wolo1" + "v".repeat(38);

test("never nominate any registered production role/address as a dedicated Satchel vault", () => {
  assert.ok(WOLO_MAINNET_WALLET_ALIASES.length > 10);
  for (const row of WOLO_MAINNET_WALLET_ALIASES) {
    assert.equal(warSatchelVaultDistinctFromKnownWallets(row.address, []), false,
      row.role + " " + row.label);
  }
});

test("candidate vault gate refuses all conflicting configured custody and case variations", () => {
  assert.equal(warSatchelVaultDistinctFromKnownWallets(novel, []), true);
  assert.equal(warSatchelVaultDistinctFromKnownWallets(novel, [alternate]), true);
  assert.equal(warSatchelVaultDistinctFromKnownWallets(novel, [novel.toUpperCase()]), false);
  assert.equal(warSatchelVaultDistinctFromKnownWallets("", []), false);
  assert.equal(warSatchelVaultDistinctFromKnownWallets("wolo1" + "o".repeat(38), []), false);
});

test("preparation and canonical verification both share the same vault collision policy", () => {
  const intent = readFileSync("app/api/user/war-satchel/funding-intents/route.ts", "utf8");
  const evidence = readFileSync("app/api/user/war-satchel/deposit-evidence/route.ts", "utf8");
  for (const source of [intent, evidence]) {
    assert.match(source, /warSatchelVaultDistinctFromKnownWallets\(vault, excluded\)/);
    assert.match(source, /resolveCommunityTreasuryAddressConfig\(\)\.address/);
    assert.match(source, /excluded.length < 2/);
    assert.match(source, /creditAuthorized: false/);
    assert.match(source, /wagerAuthorized: false/);
  }
});

test("treasury config includes all legacy environment aliases", () => {
  assert.match(resolveCommunityTreasuryAddressConfig.toString(), /WOLO_COMMUNITY_TREASURY_ADDRESS_ENV_NAMES/);
  const treasury = readFileSync("lib/woloCommunityTreasury.ts", "utf8");
  for (const key of ["WOLO_COMMUNITY_TREASURY_ADDRESS", "WOLO_TREASURY_ADDRESS",
    "NEXT_PUBLIC_WOLO_COMMUNITY_TREASURY_ADDRESS"]) {
    assert.ok(treasury.includes(key), key);
  }
});
