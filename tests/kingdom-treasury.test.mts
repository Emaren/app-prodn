import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  KINGDOM_RESERVE_LABELS,
  REPORTED_TREASURY_COSTS,
  disclosedKingdomReserveBalance, legacyIdentityMembership, isPublicTreasuryHolders,
  isTreasuryNetwork, isTreasuryPool, isTreasuryTransfers,
  observedKingdomOutflows, publicSystemAccounts, reportedMonthlyOutlay,
  type TreasuryHolders, type TreasuryNetwork,
} from "../lib/kingdomTreasury.ts";

const address = (digit: string) => `wolo1${digit.repeat(38)}`;

function sampleHolders(): TreasuryHolders {
  return {
    chainId:"wolo-1", denom:"uwolo", view:"public",
    balancePolicy:"protocol_system_only", updatedAt:"2026-10-12T17:00:00Z",
    count: 2, currentNonzeroOwnerCount: 2, retainedTransferAddressCount: 70,
    holders: [
      { address:address("a"), alias:"Community Treasury", role:"treasury", use:"Treasury",
        classification:"protocol", balanceWoloFormatted:"1,000.000000", balanceHidden:false },
      { address:address("b"), alias:"Emaren", role:"user", use:"Player Wallet",
        classification:"player", balanceWoloFormatted:null, balanceHidden:true },
    ],
  };
}

function sampleNetwork(): TreasuryNetwork {
  return {
    chainId:"wolo-1", denom:"uwolo", count:3,
    registryAddressCount: 3, liveOwnerCount:2,
    accounts: [
      { address:address("a"), label:"Community Treasury",role:"treasury",use:"Treasury",
        isModule:false,isRetired:false,isUserFacing:false,
        amountWoloFormatted:"1,000.000000",directAmountWoloFormatted:"1,000.000000" },
      { address:address("b"),label:"Emaren",role:"user",use:"Player Wallet",
        isModule:false,isRetired:false,isUserFacing:true,
        amountWoloFormatted:"5000.000000",directAmountWoloFormatted:"5000.000000" },
      { address:address("c"),label:"Module: mint",role:"module",use:"Network Module",
        isModule:true,isRetired:false,isUserFacing:false,
        amountWoloFormatted:"0.000000",directAmountWoloFormatted:"0.000000" },
    ],
  };
}

test("canonical monetary commitments are reported, never fake bank activity", () => {
  assert.equal(reportedMonthlyOutlay(), 71.89);
  assert.equal(REPORTED_TREASURY_COSTS.find((x) => x.id === "apple")?.status, "planned-unpaid");
  assert.equal(REPORTED_TREASURY_COSTS.find((x) => x.id === "apple")?.billing, "unconfirmed");
});

test("live holder membership is not padded with registered or historical wallets", () => {
  const holders = sampleHolders(), network = sampleNetwork();
  assert.equal(isPublicTreasuryHolders(holders), true);
  assert.equal(isTreasuryNetwork(network), true);
  const system = publicSystemAccounts(network, holders);
  assert.equal(holders.count, 2);
  assert.equal(holders.retainedTransferAddressCount, 70);
  assert.equal(network.count, 3);
  assert.equal(system.length, 2);
  assert.equal(system[0]?.publicBalance, "1,000.000000");
  assert.equal(system[1]?.publicBalance, "0.000000");
  assert.equal(system.some((row) => row.address === address("b")), false);
  const networkWithBounty = {
    ...network,
    count: 4,
    accounts: [...network.accounts, {
      address: address("d"),label: "Ecosystem Bounties", role: "bounty",
      use:"Bounty Pool",isModule:false,isRetired:false,isUserFacing:true,
      amountWoloFormatted:"20.000000",directAmountWoloFormatted:"20.000000",
    }],
  };
  assert.equal(publicSystemAccounts(networkWithBounty, holders).some((a) => a.label === "Ecosystem Bounties"), true);
  assert.equal(isPublicTreasuryHolders({ ...holders, count: 38 }), false);
});

test("legacy registered [BDB]Pigman and Ra identities do not inflate active holder census", () => {
  const holders = sampleHolders();
  const legacy = legacyIdentityMembership(holders);
  assert.equal(legacy.length, 2);
  assert.ok(legacy.some((row) => row.label === "[BDB]Pigman" &&
    row.address === "wolo1ntal93v8c5wryq2d9puhks8l25zedhepyv8n5k"));
  assert.ok(legacy.some((row) => row.label === "Ra 𓁛𓇳" &&
    row.address === "wolo198ajhn5atpw65u6z89z5hwfer2vx90u4ydxe7z"));
  assert.ok(legacy.every((row) => row.isCurrentHolder === false));
  assert.equal(holders.count, 2);
});

test("player-linked balance never becomes a public protocol balance", () => {
  const holders = sampleHolders();
  assert.equal(isPublicTreasuryHolders({
    ...holders,
    holders: holders.holders.map((h) => h.classification === "player"
      ? {...h,balanceWoloFormatted:"5000.000000",balanceHidden:false} : h),
  }), false);
  assert.equal(isPublicTreasuryHolders({ ...holders, view:"operator" }), false);
  assert.equal(isPublicTreasuryHolders({ ...holders, balancePolicy:"admin_all_current" }), false);
});

test("unencumbered kingdom wealth fails closed and excludes escrow, founder and staking", () => {
  const rows = [...KINGDOM_RESERVE_LABELS].map((label) => ({label,publicBalance:"10.000000"}));
  rows.push({label:"Staking Wallet",publicBalance:"900000.000000"});
  rows.push({label:"Founder Operating / Emaren",publicBalance:"500000.000000"});
  assert.equal(disclosedKingdomReserveBalance(rows), 80);
  assert.equal(disclosedKingdomReserveBalance(rows.slice(1)), null);
  assert.equal(disclosedKingdomReserveBalance(rows.map((r,i) =>
    i === 0 ? {...r,publicBalance:null} : r)), null);
});

test("transfer stream is strictly observed kingdom-origin bank sends", () => {
  const system = publicSystemAccounts(sampleNetwork(), sampleHolders());
  const mk = (senderAddress:string) => ({
    key:senderAddress,txHash:"AB".repeat(32),timestamp:"2026-10-12T16:00:00Z",
    senderAddress,senderLabel:null,recipientAddress:address("b"),recipientLabel:"Emaren",
    senderKind:null,recipientKind:"user",amountWolo:2,amountLabel:"2 WOLO",source:"wolo-mainnet-bank-send",
  });
  assert.equal(observedKingdomOutflows([mk(address("a")),mk(address("b"))],system).length,1);
  const hotWallet = { address: address("d"), label: "Faucet Hot Wallet", role: "faucet" };
  assert.equal(
    observedKingdomOutflows(
      [mk(address("a")), mk(address("d")), { ...mk(address("a")), key: "claimed", senderKind: "faucet" }],
      [...system, hotWallet],
    ).length,
    1,
    "Never surface small faucet claims as kingdom payout activity",
  );
  assert.equal(isTreasuryTransfers({ok:true,source:"wolo-mainnet-bank-send",latestTimestamp:null,totalRows:2,rows:[mk(address("a"))]}),true);
  assert.equal(isTreasuryTransfers({ok:true,source:"random",latestTimestamp:null,totalRows:2,rows:[mk(address("a"))]}),false);
});

test("liquidity requires a real independently sourced pool and not a $44 placeholder", () => {
  const pool={ok:true,poolId:"3461",poolUrl:"https://app.osmosis.zone/pool/3461",
    updatedAt:"2026-10-12T17:00:00Z",pairLabel:"WOLO / USDC",
    priceUsd:.00001,reserveWolo:2200000,reserveUsdc:22,liquidityUsd:44};
  assert.equal(isTreasuryPool(pool),true);
  assert.equal(isTreasuryPool({...pool,liquidityUsd:NaN}),false);
  assert.equal(isTreasuryPool({...pool,ok:false}),false);
  assert.equal(isTreasuryPool({...pool,poolUrl:"javascript:evil"}),false);
});

test("public site wiring preserves source and performance boundaries", () => {
  const page=readFileSync("app/kingdom-treasury/page.tsx","utf8");
  const client=readFileSync("components/treasury/KingdomTreasury.tsx","utf8");
  const css=readFileSync("app/kingdom-treasury/treasury.css","utf8");
  const shell=readFileSync("app/AppShell.tsx","utf8");
  const wolo=readFileSync("components/wolo/WoloChainLiveTransparency.tsx","utf8");
  const index=readFileSync("docs/audits/performance-route-cohort-v2.txt","utf8");
  const kingdom=readFileSync("lib/kingdomSummary.ts","utf8");
  assert.match(page,/KingdomTreasury/);
  assert.match(client,/\/api\/wolo\/holders/);
  assert.match(client,/\/api\/wolo\/network/);
  assert.match(client,/\/api\/wolo\/osmosis-pulse/);
  assert.match(client,/\/api\/wolo\/mainnet-transfers\?limit=25/);
  assert.match(client,/document.visibilityState/);
  assert.match(client,/SpeedReadyMarker route="\/kingdom-treasury"/);
  assert.match(client,/No signing\. No payments from this page/);
  assert.match(client,/HISTORICAL \/ NOT CURRENT FUNDED/);
  assert.match(client,/legacyIdentityMembership/);
  assert.doesNotMatch(client, /FAUCET RAID|TREASURY_FAUCET_INCIDENT|Incident evidence/);
  assert.doesNotMatch(readFileSync("lib/kingdomTreasury.ts","utf8"), /TREASURY_FAUCET_INCIDENT/);
  assert.match(client,/Personal balance hidden/);
  assert.match(css,/prefers-reduced-motion:reduce/);
  assert.match(shell,/href: "\/kingdom-treasury", label: "Kingdom Treasury"/);
  assert.match(wolo,/current holders on the Wolo Chain network/);
  assert.match(index,/^\/kingdom-treasury$/m);
  for (const name of KINGDOM_RESERVE_LABELS) {
    assert.ok(kingdom.includes(`"${name}"`), `reserve name ${name} must stay canonical`);
  }
  assert.doesNotMatch(client,/fetch\([^)]*\{\s*method:\s*["'](?:POST|PUT|DELETE)/);
});
