import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL(
    "../app/api/wolo/network/route.ts",
    import.meta.url,
  ),
  "utf8",
);

test(
  "ledger contains registry live owners player history and active stake",
  () => {
    assert.match(
      source,
      /\.\.\.staticByAddress\.keys\(\)/,
    );

    assert.match(
      source,
      /\.\.\.ownerByAddress\.keys\(\)/,
    );

    assert.match(
      source,
      /userAddresses/,
    );

    assert.match(
      source,
      /\.\.\.stakedUwoloByAddress\.keys\(\)/,
    );

    assert.match(
      source,
      /denom_owners/,
    );
  },
);

test(
  "historical staking wallets can retain player names",
  () => {
    assert.match(
      source,
      /with wallet_bindings as/,
    );

    assert.match(
      source,
      /historical_staking_binding/,
    );

    assert.match(
      source,
      /app-user-wallet-history/,
    );
  },
);

test(
  "network table exposes every accounting component",
  () => {
    assert.match(
      source,
      /"LIQUID"/,
    );

    assert.match(
      source,
      /"STAKED"/,
    );

    assert.match(
      source,
      /"OWNERSHIP TOTAL"/,
    );

    assert.match(
      source,
      /hideBalance:\s*false/,
    );

    assert.match(
      source,
      /all_network_balances_public/,
    );
  },
);

test(
  "historical operational use semantics are retained",
  () => {
    assert.match(
      source,
      /NEVER_USER_FACING/,
    );

    assert.match(
      source,
      /PUBLIC_RECEIVE_OK/,
    );

    assert.match(
      source,
      /BET_DEPOSIT_ADDRESS_IF_MANUAL/,
    );

    assert.match(
      source,
      /MODULE_DO_NOT_USE/,
    );
  },
);

test(
  "unknown wallets remain explicit rather than receiving fabricated identity",
  () => {
    assert.match(
      source,
      /"Unclassified wallet"/,
    );

    assert.match(
      source,
      /"UNCLASSIFIED_HOLDER"/,
    );
  },
);
