import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  deriveWoloBalanceReadState,
  formatMinimalDenomAmount,
  isValidBech32AccountAddress,
  normalizeMinimalDenomAmount,
  parseWoloBalanceApiPayload,
  resolveVerifiedWalletStakeCap,
} from "../lib/woloBalanceRead.ts";
import {
  classifyPublicWoloHolder,
  comparePublicWoloHolderBalance,
  projectPublicWoloHolderBalance,
} from "../lib/woloPublicHolderPrivacy.ts";

const validBalancePayload = {
  amount: "0001200000",
  address: "wolo1r8kvt7me33rsv9ldaczj03xjrld4yumx0c0jkg",
  denom: "uwolo",
  decimals: 6,
  chainId: "wolo-1",
  source: "rest",
  observedAt: "2026-08-29T20:00:00.000Z",
} as const;

const expectedBalance = {
  address: validBalancePayload.address,
  denom: "uwolo",
  decimals: 6,
  chainId: "wolo-1",
};

test("balance payload validation accepts only exact amount, denom, decimals, chain, and provenance", () => {
  assert.equal(
    parseWoloBalanceApiPayload(validBalancePayload, expectedBalance).amount,
    "1200000",
  );
  assert.equal(normalizeMinimalDenomAmount("000"), "0");

  for (const amount of [12, "1.25", "-1", "", null]) {
    assert.throws(() => normalizeMinimalDenomAmount(amount));
  }
  assert.throws(() => normalizeMinimalDenomAmount("9".repeat(79)));

  assert.throws(() =>
    parseWoloBalanceApiPayload(
      { ...validBalancePayload, denom: "wolo" },
      expectedBalance,
    ),
  );
  assert.throws(() =>
    parseWoloBalanceApiPayload(
      { ...validBalancePayload, decimals: 18 },
      expectedBalance,
    ),
  );
  assert.throws(() =>
    parseWoloBalanceApiPayload(
      { ...validBalancePayload, source: "unknown" },
      expectedBalance,
    ),
  );
  assert.throws(() =>
    parseWoloBalanceApiPayload(
      { ...validBalancePayload, observedAt: "2026-08-29T20:00:00+00:00" },
      expectedBalance,
    ),
  );
});

test("wallet address validation checks Bech32 prefix, checksum, casing, and account length", () => {
  const valid = "wolo1r8kvt7me33rsv9ldaczj03xjrld4yumx0c0jkg";
  assert.equal(isValidBech32AccountAddress(valid, "wolo"), true);
  assert.equal(isValidBech32AccountAddress(valid, "cosmos"), false);
  assert.equal(isValidBech32AccountAddress(valid.toUpperCase(), "wolo"), false);
  assert.equal(isValidBech32AccountAddress(`${valid.slice(0, -1)}q`, "wolo"), false);
  assert.equal(isValidBech32AccountAddress("wolo1short", "wolo"), false);
});

test("balance presentation preserves precision and never formats invalid input as zero", () => {
  assert.equal(formatMinimalDenomAmount("0"), "0.00");
  assert.equal(formatMinimalDenomAmount("1"), "0.000001");
  assert.equal(formatMinimalDenomAmount("123456789000000"), "123,456,789.00");
  assert.equal(formatMinimalDenomAmount(undefined), null);
  assert.equal(formatMinimalDenomAmount("not-a-balance"), null);
});

test("wallet reads expose disconnected, loading, zero, funded, refreshing, and error states", () => {
  const derive = (
    overrides: Partial<Parameters<typeof deriveWoloBalanceReadState>[0]>,
  ) =>
    deriveWoloBalanceReadState({
      connected: true,
      amount: undefined,
      isLoading: false,
      isFetching: false,
      isError: false,
      ...overrides,
    });

  assert.equal(derive({ connected: false }), "disconnected");
  assert.equal(derive({ isLoading: true }), "loading");
  assert.equal(derive({ amount: "0" }), "success-zero");
  assert.equal(derive({ amount: "1" }), "success-funded");
  assert.equal(derive({ amount: "1", isFetching: true }), "refreshing");
  assert.equal(derive({ amount: "1", isError: true }), "error");
  assert.equal(derive({ amount: "malformed" }), "error");
});

test("an absent, invalid, or zero wallet read fails the betting cap closed", () => {
  assert.equal(resolveVerifiedWalletStakeCap(undefined), 0);
  assert.equal(resolveVerifiedWalletStakeCap("not-a-balance"), 0);
  assert.equal(resolveVerifiedWalletStakeCap("0"), 0);
  assert.equal(resolveVerifiedWalletStakeCap("999999"), 0);
  assert.equal(resolveVerifiedWalletStakeCap("1000000"), 1);
  assert.equal(resolveVerifiedWalletStakeCap("90000000000"), 50_000);
});

test("player and unclassified holder projections redact every balance representation", () => {
  for (const classification of ["player", "unclassified"] as const) {
    assert.deepEqual(
      projectPublicWoloHolderBalance({
        classification,
        balanceWolo: "42.000000",
        balanceWoloFormatted: "42.000000",
      }),
      {
        balanceWolo: null,
        balanceWoloFormatted: null,
        exactBalanceWolo: null,
        balanceHidden: true,
      },
    );
  }

  assert.deepEqual(
    projectPublicWoloHolderBalance({
      classification: "protocol",
      balanceWolo: "42.000000",
      balanceWoloFormatted: "42.000000",
    }),
    {
      balanceWolo: "42.000000",
      balanceWoloFormatted: "42.000000",
      exactBalanceWolo: "42.000000",
      balanceHidden: false,
    },
  );

  assert.equal(
    classifyPublicWoloHolder({ isKnownUser: true, isInfrastructure: false }),
    "player",
  );
  assert.equal(
    classifyPublicWoloHolder({ isKnownUser: true, isInfrastructure: true }),
    "player",
  );
  assert.equal(
    classifyPublicWoloHolder({ isKnownUser: false, isInfrastructure: false }),
    "unclassified",
  );
});

test("public holder ranking follows exact live balances without publishing hidden values", () => {
  const rows = [
    { amountUwolo: "2", address: "wolo1player" },
    { amountUwolo: "10000000", address: "wolo1protocol" },
    { amountUwolo: "0000009", address: "wolo1other" },
  ].sort(comparePublicWoloHolderBalance);

  assert.deepEqual(
    rows.map((row) => row.address),
    ["wolo1protocol", "wolo1other", "wolo1player"],
  );
});

test("runtime, route, hook, and UI retain the hardening contracts", () => {
  const runtimeSource = readFileSync(
    new URL("../lib/woloRuntime.ts", import.meta.url),
    "utf8",
  );
  const holderRouteSource = readFileSync(
    new URL("../app/api/wolo/holders/route.ts", import.meta.url),
    "utf8",
  );
  const hookSource = readFileSync(
    new URL("../hooks/useWoloBalance.ts", import.meta.url),
    "utf8",
  );
  const walletDashboardSource = readFileSync(
    new URL("../components/wolo/WalletDashboardClient.tsx", import.meta.url),
    "utf8",
  );
  const transparencySource = readFileSync(
    new URL("../components/wolo/WoloChainLiveTransparency.tsx", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(runtimeSource, /rejectUnauthorized\s*:\s*false/);
  assert.match(runtimeSource, /parseBankBalanceAmount\(payload, WOLO_BASE_DENOM\)/);
  assert.match(runtimeSource, /MAX_WOLO_UPSTREAM_RESPONSE_BYTES/);
  assert.match(runtimeSource, /verifyRestChainIdentity\(restSource\)/);
  assert.match(runtimeSource, /verifyRpcChainIdentity\(cliNode\)/);
  assert.match(runtimeSource, /isValidBech32AccountAddress\(trimmed, WOLO_ADDRESS_PREFIX\)/);
  assert.match(holderRouteSource, /owner\.balance\?\.denom !== denom/);
  assert.match(holderRouteSource, /from wolo_indexed_transfers/);
  assert.match(holderRouteSource, /retainedDiscoveryAvailable: retained\.available/);
  assert.match(holderRouteSource, /MAX_PUBLIC_HOLDERS/);
  assert.match(holderRouteSource, /signal: controller\.signal/);
  assert.match(holderRouteSource, /verifyRestChainIdentity\(restUrl, deadlineAt\)/);
  assert.match(
    holderRouteSource,
    /balancePolicy: operatorView \? "admin_all_current" : "protocol_system_only"/,
  );
  assert.match(holderRouteSource, /request\.nextUrl\.searchParams\.get\("view"\) === "operator"/);
  assert.match(holderRouteSource, /const gate = await requireAdmin\(request\)/);
  assert.match(holderRouteSource, /identities: userIdentities/);
  assert.match(holderRouteSource, /publicUserAliasByAddress/);
  assert.doesNotMatch(holderRouteSource, /\btotalWolo(?:Formatted)?\b/);
  assert.match(hookSource, /parseWoloBalanceApiPayload/);
  assert.doesNotMatch(hookSource, /return\s+"0"/);
  assert.match(transparencySource, /fetch\("\/api\/wolo\/holders"/);
  assert.doesNotMatch(transparencySource, /fetch\("\/api\/wolo\/network"/);
  assert.match(
    holderRouteSource,
    /const allAddresses = new Set\(\[\s*\.\.\.ownerByAddress\.keys\(\),\s*\.\.\.stakedUwoloByAddress\.keys\(\),\s*\]\)/,
  );
  assert.match(
    holderRouteSource,
    /const rankedHolderAddresses = \[\.\.\.allAddresses\]\.sort/,
  );
  assert.match(
    holderRouteSource,
    /amountUwolo: rankingAmountUwolo\(left\)/,
  );
  assert.match(
    holderRouteSource,
    /amountUwolo: rankingAmountUwolo\(right\)/,
  );
  assert.match(transparencySource, /current holders/);
  assert.match(transparencySource, /holder\.classification !== "protocol" \|\| holder\.balanceHidden/);
  assert.doesNotMatch(transparencySource, />\s*Private\s*</i);

  const refreshFailureGuard = walletDashboardSource.indexOf(
    "if (refreshResult.isError || refreshResult.data === undefined)",
  );
  const refreshSuccessNotice = walletDashboardSource.indexOf(
    'setWalletNotice("Balance refreshed.")',
  );
  assert.ok(refreshFailureGuard >= 0);
  assert.ok(refreshSuccessNotice > refreshFailureGuard);
});
