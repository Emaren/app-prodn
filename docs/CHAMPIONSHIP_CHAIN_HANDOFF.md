---
id: "aoe2war.app-prodn.docs-championship-chain-handoff"
title: "Championship Belt Chain Capability Handoff"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn","wolochain"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "integration-contract"
reviewed_at: "2026-09-30"
review_interval_days: 60
sensitivity: "internal"
---

# Championship Belt Chain Capability Handoff

## Established boundary

The supplied WoloChain September 24 source reference describes `x/wartrophy`
authority-controlled entitlement records. `MsgReassignTrophy` is not a safe
team-seat NFT executor: there is no restricted holder-NFT minting, expected-owner
comparison, durable app request deduplication, or grouped seat-transfer service.
Standard NFT `MsgSend` permits a holder to bypass Warbound restrictions.
This is source/reference evidence, not a fresh production capability audit.
No Wolo binary, consensus, listener, signer, or state is changed here.

The existing protected Founder money rail is a separate capability. New app
team allocations use its authenticated port-8093 payout/transaction lookup,
exact string uwolo and committed bank-event proof, without a mnemonic fallback.
A known-hash uncertain outcome can reconcile read-only in admin. Current source
does not register an HTTP request-ID lookup. For an unknown hash, inspect the
chain-owned receipt using `wolochaind settlement inspect --request-id
<TrophyPayoutAllocation.requestKey> --summary-only` with the actual Founder
listener's runtime environment/home/state directory. Remove `--summary-only`
to inspect its stored request/response. Do not guess the receipt authority or
replace the ID to rebroadcast. A protected read-only request-inspection API is
a useful separate follow-up for automatic unknown-hash recovery; it is not
the missing belt-NFT transfer executor.

App custody/reign and TrophyPayout obligations can be complete while belt chain
execution is `blocked / NFT_EXECUTOR_UNAVAILABLE`. A desired recipient is not
a proven owner. `ChampionshipTransferGroup` and `ChampionshipTransferSeat`
persist the exact work. Never mark ownership from an app admin text field or
a transaction hash whose successful code/events/owner readback were not verified.

## Proposed protected executor API

This API is a required WoloChain follow-up, **not an existing callable route**:

`POST /settlement/v1/championship-belts/transfers/validate`

`POST /settlement/v1/championship-belts/transfers`

`GET /settlement/v1/championship-belts/transfers/{request_id}`

Use a loopback/protected server authenticated with `Authorization: Bearer` and
the established settlement authentication policy. WoloChain's dedicated Trophy
Authority signs through its own restricted keyring; AoE2WAR never receives keys
or mnemonics, and the validator signer is forbidden. Executor health must prove
expected chain ID, authority, restricted-NFT capability version, and collection.
No fallback to an unrelated listener or old settlement signer is permitted.

Request shape:

```json
{
  "schema_version": "aoe2war.championship-belt-transfer.v1",
  "request_id": "<stored ChampionshipTransferGroup.requestKey>",
  "source_app": "aoe2hdbets",
  "chain_id": "wolo-1",
  "title_id": "<canonical Trophy.trophyId>",
  "app_custody_epoch": "<sealed prior custody epoch>",
  "app_transition_id": "<durable transfer group id>",
  "challenge_id": 123,
  "policy": "authority_reassign_warbound_seats",
  "required_seats": 2,
  "seats": [
    {
      "seat": 0,
      "request_id": "<group.requestKey>:seat:<zero-based-seat>",
      "class_id": "<persisted nftClassId>",
      "token_id": "<persisted nftId>",
      "expected_owner": "wolo1...",
      "recipient": "wolo1..."
    }
  ]
}
```

Persisted IDs are authority. Solo token defaults to `Trophy.nftId` or trophy key;
team token defaults to `<Trophy.nftId-or-key>:seat:<one-based-seat>`. The stable
seat index in the app is zero-based. Class retains the existing Trophy class;
the reference collection is `aoe2war-war-trophies`. Do not silently remap an
existing class/token or discover token identity from display names. Tokens
without registered chain identity require explicit registration/mint follow-up
before transfer; an empty expected owner cannot bypass ownership validation.

Validate exact roster size 1/2/3/4, complete unique stable seats/tokens/requests,
valid `wolo` addresses, exact registered title/class/seat mapping, restricted
Warbound policy, and current chain owner equal to `expected_owner`. Validate
all recipients before broadcasting. App eligibility and battle evidence are
caller authority; WoloChain validates chain custody and transaction semantics.

## Idempotency, proof, and partial recovery

Persist and digest the full request before any broadcast. Identical retries
return stored work. Changed payload under the same request ID is a 409 conflict.
Each seat has an independent deterministic request ID derived from the stored
group request key and immutable seat index: `<group.requestKey>:seat:<seat>`.
There is no separate `requestKey` column on `ChampionshipTransferSeat` in V1.
Durable broadcast state survives executor restart and includes uncertainty;
never automatically rebroadcast a seat with an unknown outcome.

Successful proof must include chain ID, transaction hash, committed height,
success code, emitted title/class/token/from/to/seat event, request identity,
and authoritative post-commit owner readback. App confirmation requires exact
match to its persisted seat request. Standard `MsgSend` cannot be the unrestricted
execution mechanism. Implement a class-specific transfer guard and authority
keeper path before minting wallet-visible Warbound assets.

Prefer an atomic authority message that compares every expected old owner and
transfers all seats in one transaction. If chain support permits only individual
messages, the executor must persist per-seat results and report the aggregate
as `partial` until every required seat is confirmed. Two of four confirmations
must never become a completed team transfer. A confirmed seat is skipped on
retry; failed transaction-free seats may retry with the same request identity;
uncertain or transaction-backed seats require read-only reconciliation first.

Group response includes `request_id`, immutable payload digest, group status,
required/confirmed counts, every seat's state/request/expected owner/recipient,
tx proof, and exact machine failure reason. Statuses distinguish blocked,
pending, broadcasting, uncertain, partial, confirmed, and failed. Read-only
inspection exposes proof without signer material.

## Ready follow-up engineering prompt

Implement the protected `aoe2war.championship-belt-transfer.v1` executor in
WoloChain against this contract and its actual current source. First prove the
current chain module/NFT capability and follow the independently reviewed
upgrade lane if capability is absent. Add Warbound class transfer enforcement,
dedicated Trophy Authority custody, compare-and-swap expected owner checks,
immutable request digest/deduplication, full team-seat grouping, success-event
plus owner-readback proof, uncertain-broadcast recovery, and per-seat retry.
Do not infer app eligibility or replay results. Preserve existing WOLO supply,
consensus and settlement authorities. Test single/2/3/4-seat transfer, payload
conflicts, stale owner, wrong token/title mapping, restricted MsgSend rejection,
restart during broadcast, and partial retry without resending confirmed seats.
Do not deploy or replace the running node binary without a separately proven
chain upgrade plan. Return API compatibility and upgrade/deployment evidence
before connecting the app executor. App integration then consumes its durable
queue; it must never fabricate chain ownership to unblock UX.
