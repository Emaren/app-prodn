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

const accountsSource = readFileSync(
  new URL(
    "../lib/woloMainnetNetworkAccounts.ts",
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
  "network use labels remain canonical human-readable roles",
  () => {
    assert.doesNotMatch(
      source,
      /NEVER_USER_FACING|TREASURY_PUBLIC_BUT_DO_NOT_USE_FOR_RANDOM_USERS|RESERVE_NOT_USER_FACING|PLAYER_DO_NOT_SHOW_BALANCE|OPS_NOT_USER_FACING|PUBLIC_RECEIVE_OK|MODULE_DO_NOT_USE|UNCLASSIFIED_HOLDER/,
    );

    assert.match(
      source,
      /return account\.use;/,
    );

    assert.match(
      source,
      /\? "Player Wallet"[\s\S]*: "Unclassified Holder"/,
    );

    for (const use of [
      "Founder Reserve",
      "Founder Operating",
      "Community Treasury",
      "Liquidity Reserve",
      "Growth Reserve",
      "Operations Reserve",
      "Bounty Pool",
      "Staking Pool",
      "Faucet Wallet",
      "Rewards Wallet",
      "Bet Escrow",
      "IBC Escrow",
      "Payout Wallet",
      "Relayer Wallet",
      "Player Wallet",
      "Retired Escrow",
      "Retired Wallet",
      "Network Module",
    ]) {
      assert.ok(
        accountsSource.includes(
          `use: "${use}"`,
        ),
        `missing canonical human use: ${use}`,
      );
    }
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
      /"Unclassified Holder"/,
    );
  },
);
