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
reviewed_at: "2026-10-01"
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

`GET /api/wolo/holders` builds one bounded projection whose membership comes
only from live paginated Cosmos `denom_owners`: every listed row is a current
nonzero `uwolo` owner. Other sources enrich those current owners; they do not
admit historical zero-balance addresses into the public address book:

- live paginated Cosmos `denom_owners` for every current nonzero `uwolo` owner;
- the indexed mainnet transfer ledger for discovery timestamps and provenance
  attached to a current owner;
- app user wallet links and active staking positions for identity/classification;
- the governed Wolo network-account and operator alias registries.

The scan validates chain ID, denom, pagination keys, unique addresses, account
checksums, total pages, total addresses, per-page bytes, and a total deadline.
Unknown wallets remain unclassified until an identity source exists. A single
verified or active-staker identity may contribute its public player name; an
ambiguous shared address does not publish one guessed identity.

## Public historic-address directory (not funded holders)

The WoloChain visual holder table retains the live, ordered list from
`GET /api/wolo/holders` as its **funded/staked census**. After those rows,
it may append only two registered historical player identities currently
absent from that census: `[BDB]Pigman` and `Ra 𓁛𓇳`. Their canonical
Bech32 addresses come from `lib/woloMainnetNetworkAccounts.ts`. They are
never manually counted as current holders or inserted into the REST
denom-owner index. A typical current count of 36 + 2 registered historical
addresses means **38 visible rows**, not "38 active holders" and not a
proof that WoloChain has only 38 addresses in existence.

Each historic row uses the read-only, exact-address
`GET /api/wolo/balance/{address}`, with full chain, denom, decimals and
timestamp validation; it displays "0 WOLO" only on a verified zero.
If funds are observed but the current holder census has not caught up,
it displays a refresh state rather than silently exposing a player balance.
An upstream failure is "Balance unavailable", not an invented zero.
Any historical address that enters the live funded/staked holder census
is de-duplicated out of the separate historical rows.

The operator provided a screenshot identifying eight trailing unclassified
addresses as part of the August 2026 faucet incident. Their **exact,
checksum-valid addresses**, not mutable ranks #29–36, are stored in
`lib/woloFaucetIncidentAnnotations.ts`. The public WoloChain table marks
only **matching unclassified** accounts as "August 2026 faucet hack" with
"Operator-reported · forensic match pending" adjacent. This is an
operator attribution, NOT an independently verified attack membership
or a statement about the actual controller of the wallet.

The eight address-specific liquid bank balances use the existing public
`/api/wolo/balance/{address}` adapter (bounded four concurrent calls,
foreground-only recheck every two minutes) and validate chain, denom,
decimals, address, amount and timestamp. Unavailable is not a zero.
Unlike the bulk holder API, the page deliberately discloses these
**explicitly operator-tagged pseudonymous addresses** after that source
check; it never discloses unrelated player or other unclassified balance
amounts, nor labels wallet identities by rank. If one address becomes a
known player wallet, the explicit label and display exception disappear.
This scoped disclosure was specifically requested by the operator and
does not change the established `protocol_system_only` API contract.
A further transaction-graph audit can corroborate or correct the
operator-provided incident classification later. Faucet claim totals
remain internal records and are not on the public Treasury page.

## Public and operator policies

The normal public response is `view: "public"` and
`balancePolicy: "protocol_system_only"`:

- protocol/system/module accounts include exact balances;
- player and unclassified accounts include addresses and classification but
  every balance representation is `null`;
- every current funded owner is ranked by its exact live minimal-denom balance,
  descending, with address as the deterministic tie-breaker;
- hidden player and unclassified values render as an intentionally blank balance
  cell rather than a `Private` label. Their relative rank remains visible, but
  the amount is not published by this bulk app projection;
- no aggregate private balance total is emitted in JSON or text format.

The admin-authenticated operator response is:

```text
GET /api/wolo/holders?view=operator
```

It requires the normal admin session before any chain scan. It returns
`balancePolicy: "admin_all_current"`, minimal and display-denom balances,
identity candidates, classification, first/last indexed observation, and
discovery sources for every current funded row. Responses are private and no-store.
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
denom-owner membership, balance ranking, and privacy projection.
