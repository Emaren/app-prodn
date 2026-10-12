import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function source(relative: string) {
  return fs.readFileSync(
    path.join(root, relative),
    "utf8",
  );
}

const holdersRoute = source(
  "app/api/wolo/holders/route.ts",
);

const networkAccounts = source(
  "lib/woloMainnetNetworkAccounts.ts",
);

const walletAliases = source(
  "lib/woloMainnetWallets.ts",
);

const transparency = source(
  "components/wolo/WoloChainLiveTransparency.tsx",
);

test(
  "founder cold reserve is explicitly protocol-visible",
  () => {
    assert.match(
      networkAccounts,
      /label: "Founder's Cold Reserve"/,
    );

    assert.match(
      walletAliases,
      /label: "Founder's Cold Reserve"/,
    );

    assert.match(
      holdersRoute,
      /forceFounderColdReserve\s*=\s*lower === FOUNDER_COLD_RESERVE_ADDRESS/,
    );

    assert.match(
      holdersRoute,
      /isInfrastructure\s*=\s*forceFounderColdReserve \|\|/,
    );

    assert.match(
      transparency,
      /"Founder's Cold Reserve": "Long-hold reserve\. Hard-anchor scarcity\."/,
    );
  },
);

test(
  "Emaren operating wallet is player-private",
  () => {
    assert.match(
      holdersRoute,
      /forceEmarenOperating\s*=\s*lower === EMAREN_OPERATING_ADDRESS/,
    );

    assert.match(
      holdersRoute,
      /forceEmarenOperating \|\|\s*knownUserAddresses\.has\(lower\)/,
    );

    assert.match(
      holdersRoute,
      /address === EMAREN_OPERATING_ADDRESS\s*\?\s*"Emaren"/,
    );
  },
);

test(
  "holder rank uses liquid wallet plus canonical active stake",
  () => {
    assert.match(
      holdersRoute,
      /loadMainnetStakingPositions/,
    );

    assert.match(
      holdersRoute,
      /position\.currentStakedWolo/,
    );

    assert.match(
      holdersRoute,
      /rankingAmountUwolo = \(address: string\) =>\s*addAmountStrings/,
    );

    assert.match(
      holdersRoute,
      /stakedUwoloByAddress\.get\(address\) \|\| "0"/,
    );

    assert.match(
      holdersRoute,
      /amountUwolo: rankingAmountUwolo\(left\)/,
    );

    assert.match(
      holdersRoute,
      /amountUwolo: rankingAmountUwolo\(right\)/,
    );
  },
);

test(
  "public copy explains stake-aware private ranking",
  () => {
    assert.match(
      transparency,
      /current holders on the WoloChain network/,
    );

    assert.match(
      transparency,
      /Current liquid holders and active stakers\./,
    );
    assert.doesNotMatch(transparency, /wallet \\+ stake totals|determine rank but remain unpublished/);
    assert.match(transparency, /historicalRows\.map/);
    assert.match(transparency, /parseWoloBalanceApiPayload/);
  },
);


test(
  "curated aliases and staked-only holders survive the public projection",
  () => {
    assert.match(
      holdersRoute,
      /return input\.configuredAlias \|\| "Unclassified wallet"/,
    );

    assert.match(
      holdersRoute,
      /WOLO_MAINNET_NETWORK_ACCOUNTS\.map\(\(account\) =>/,
    );

    assert.match(
      holdersRoute,
      /const allAddresses = new Set\(\[\s*\.\.\.ownerByAddress\.keys\(\),\s*\.\.\.stakedUwoloByAddress\.keys\(\),\s*\]\)/,
    );

    assert.match(
      networkAccounts,
      /label: "Workshop Sponsorships"/,
    );
  },
);


test("historical staking wallets retain player identity after wallet rotation", () => {
  assert.match(
    holdersRoute,
    /with wallet_bindings as/,
  );

  assert.match(
    holdersRoute,
    /from staking_positions sp[\s\S]*historical_staking_binding/,
  );

  assert.match(
    holdersRoute,
    /bool_or\(historical_staking_binding\)/,
  );

  assert.match(
    holdersRoute,
    /identity\.historicalStakingBinding/,
  );

  assert.doesNotMatch(
    holdersRoute,
    /wolo12dt237zsltr30d6exa6m3tlzkge932nm3yfu6q|["']soso["']/i,
  );
});
