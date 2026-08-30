---
id: "aoe2war.app-prodn.docs-wolo-wallet-and-holder-projection"
title: "WOLO Wallet and Holder Projection"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn","wolochain"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "wallet-read-model-contract"
reviewed_at: "2026-08-30"
review_interval_days: 30
sensitivity: "internal"
---

# WOLO Wallet and Holder Projection

## Chain boundary

WoloChain owns account, denom, balance, transfer, and settlement truth.
AoE2HDBets reads that truth and controls how it is associated with app identity
and presented. Holder discovery or a page rendering defect is not evidence for
a consensus upgrade.

All reads in this contract require `wolo-1`, `uwolo`, six display decimals, a
valid `wolo1` Bech32 account address, bounded response bytes, and bounded
timeouts. REST identity is verified before its balance is trusted; the local
CLI fallback is also pinned to the expected chain ID.

## Connected wallet balance

The connected-wallet path is:

```text
Keplr account selection
  -> useWoloBalance(address)
  -> GET /api/wolo/balance/{address}
  -> fetchWoloBalanceSnapshot(address)
  -> WoloChain bank REST, then bounded CLI fallback
```

The API returns the unsigned minimal-denom amount plus address, denom, decimals,
chain ID, source, and observation time. The hook validates every field before
rendering. Disconnected, loading, refreshing, real zero, funded, and unavailable
are distinct states. Invalid or unavailable data never becomes a synthetic zero
and never grants a betting balance cap.

The staking reserve read uses the same provenance-bearing snapshot adapter. A
missing configuration or failed upstream read returns a structured degraded
state and makes the unstake reserve predicate fail closed. It never treats an
unknown reserve balance as executable.

## Holder discovery

`GET /api/wolo/holders` builds one bounded projection from:

- live paginated Cosmos `denom_owners` for every current nonzero `uwolo` owner;
- the indexed mainnet transfer ledger for previously observed senders and
  recipients, including wallets whose current balance later becomes zero;
- app user wallet links and active staking positions for identity/classification;
- the governed Wolo network-account and operator alias registries.

The scan validates chain ID, denom, pagination keys, unique addresses, account
checksums, total pages, total addresses, per-page bytes, and a total deadline.
Unknown wallets remain unclassified until an identity source exists. A single
verified or active-staker identity may contribute its public player name; an
ambiguous shared address does not publish one guessed identity.

## Public and operator policies

The normal public response is `view: "public"` and
`balancePolicy: "protocol_system_only"`:

- protocol/system/module accounts include exact balances;
- player and unclassified accounts include addresses and classification but
  every balance representation is `null`;
- rows sort by classification, public identity, and address—not private balance;
- no aggregate private balance total is emitted in JSON or text format.

The admin-authenticated operator response is:

```text
GET /api/wolo/holders?view=operator
```

It requires the normal admin session before any chain scan. It returns
`balancePolicy: "admin_all_current"`, minimal and display-denom balances,
identity candidates, classification, first/last indexed observation, and
discovery sources for every bounded row. Responses are private and no-store.
This is an operator diagnostic view, not a public player-balance leaderboard.

The address-specific balance route remains intentionally available because a
blockchain balance is public chain truth and My Wallet needs it. The privacy
rule prevents AoE2HDBets from publishing a convenient bulk
player-name-to-balance table; it does not claim cryptographic secrecy.

## Failure behavior

Malformed chain identity, denom, owner address, amount, pagination, or oversized
input fails the complete projection. Failure does not return a partial list
labeled as current. If indexed-transfer discovery alone is unavailable, the
response says so explicitly while preserving the independently verified live
denom-owner view.
