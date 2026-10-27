---
id: "aoe2war.app-prodn.epoch-v3-hd-wolo-wire"
title: "New-Epoch HD-Wolo v3 Financial Interface (Held)"
type: "reference"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn", "wolochain"]
audience: ["developers", "operators", "ai-agents"]
source_of_truth: "git"
authority: "review-only-nonactivating-contract-candidate"
reviewed_at: "2026-10-26"
review_interval_days: 14
sensitivity: "internal"
---
# New-Epoch HD-Wolo v3 Financial Interface (Held)

**SOURCE-REVIEW ONLY / UNDEPLOYED / NO MONEY AUTHORITY.** This is the Codex-owned Wolo executor handoff; new HD pure source is lib/warSatchelNewEpochFinancialContracts.ts. Neither existing HD nor Wolo executable imports these v3 candidates. No signer, DB migration, permit, nonce, endpoint, account or transaction is created here.

## Two independent financial domains

- Chain wolo-1, native denom uwolo; immutable epoch ID h-star. Dedicated vault address and vault signer; genuinely different new escrow account with different public signing key, OS security principal, keyring lineage, signed policy, append-only journal, lease and executor. A different Bech32 address with a legacy key or keyring MUST HOLD.
- 8092/8093 old payout, HD/DE legacy writers, generic CLI, faucet, staking, callbacks, cron, containers and outside producers must have NO signer, debit, journal or permission path into EITHER new account. No generic /settlement/v1/runs or old satchel:claim-return:<claim-id> accepted by new executor.
- Each account must independently pass same authenticated H/H+1 chain root: spendable(H) >= source-complete unique liabilities(H) + finite maximum unknown outflow(H) + gas reserve(H) + operating floor(H) + this precise debit. No use of another account's excess funds to cover a deficit.
- Historic 889, 8477, original 100 WOLO, reused payout hash groups and unfiltered DE obligations remain protected UNKNOWN_NO_REPLAY; no old payments promoted into a new epoch.

## Canonical permit and v3 signature domain

Proposed immutable, canonical-byte-signed domain: aoe2war/escrow-epoch/v3. Wolo Codex executor must strictly enforce every item:
chain_id=wolo-1; denom=uwolo; epoch_id; h_star; vault and escrow Bech32 addresses; cryptographically matched account pubkey digests and keyring lineage; installed escrow policy SHA256; signed executor source commit and binary/config SHA256; owner UID and authorized original wallet; original wager intent/ticket/leg/market IDs; signed owner mandate; independent operator authorization; exact sender, recipient, principal, memo; matched-only fee exposure and return entitlement; trusted Comet header/root H and signed H+1 commitment, native bank proofs for both accounts, account-local liability inventory and maximum unresolved outflows; positive gas and operating reserve; issued_at, expires_at; offhost durable nonce; original immutable operation ID and separately signed reviewer permit ID.

The owner has one actual human identity. Do not counterfeit a multi-human panel. Define a real, independently reviewed SOLO_CUSTODY_ESCROW v1 actor/policy architecture with physical custody separation and nonce authority, not self-asserted YAML digests.

Canonical v3 operation identity:
  satchel:e3:<epoch-id>:<ticket-id>
Canonical v3 vault-to-escrow memo:
  aoe2war/satchel/epoch-v3/<epoch-id>/ticket/<ticket-id>
Canonical v3 escrow return memo:
  aoe2war/satchel/epoch-v3/<epoch-id>/return/<entitlement-id>
Canonical independent epoch entitlement:
  satchel:e3:<epoch-id>:entitlement:<market-id>:<ticket-id>:<leg-id>
One physical MsgSend globally:
  (chain_id, tx_hash, message_index)
Full economic ownership:
  (chain_id, epoch_id, owner_uid, original_operation_id, funding_tx_hash, funding_message_index, market_id, ticket_id, leg_id, entitlement_id, return_or_fee_operation_id, payout_tx_hash, payout_message_index)

## Requested new private Wolo wire commands — NONE EXISTS YET

1. epoch.wager.admit.v3: HD original durable new-epoch owner+Keplr mandate, ticket and market legs, principal <=10000 WOLO per bet, <=50000 WOLO per owner-day in DB, escrow account and installed policy identity; Wolo vault signer authenticates actual account/config and native bank rather than trusting HD JSON. Durable attempt fence BEFORE signer call. No ambiguous retry.
2. epoch.escrow.return.prepare.v3: immutable epoch, original authenticated vault->escrow MsgSend, one ticket/leg, true market resolution, owner, unique entitlement, exact unmatched refund / void stake / matched payout; canonical 2% applies only to matched user volume (existing HD betWagerSettlement planner). This stage cannot sign or send.
3. epoch.escrow.return.execute.v3: independent new escrow signer and signature domain, active lease, source/binary/config policy pin, owner+reviewer authority, off-host reserved nonce, exact permit/expiry, distinct new escrow bank H proof and reserves, exact one-shot escrow->vault MsgSend. Never delegate to 8092, 8093, DE, CLI or old settlement. For fee payouts require separate epoch.escrow.fee.execute.v3 with an independently allowlisted destination and durable once-only fee identity.
4. epoch.escrow.operation.lookup.v3: read-only immutable request-fingerprint lookup, cannot broadcast or sign; on timeout/inconsistent chain response return UNKNOWN_NO_REPLAY.
5. epoch.escrow.return.observe.v3: read-only genuine Comet/ICS23 rooted finality of exact sender=new escrow, recipient=new vault, amount, denom, original entitlement ID, memo, hash/MsgSend ordinal; authenticated latest H plus H+1 bank commitment. HD may prepare an UNAUTHENTICATED_CANDIDATE_ONLY from this data, but must subsequently authenticate the native proof and enforce global unique physical receipt before any credit.

## Escrow append-only journal and replay state

PREPARED_UNSIGNED -> ATTEMPT_FENCED -> SIGNED_UNKNOWN -> BROADCAST_UNKNOWN -> PROVEN_FINAL or UNKNOWN_QUARANTINED.
Only a genuinely source-proven pre-sign failure may cancel an unsigned request. fsync append-only journal and globally durable nonce reservation must finish before any signing/network attempt. Any RPC timeout, lost database COMMIT acknowledgement, sequence error, broadcast ambiguity or after-sign crash is UNKNOWN_NO_REPLAY. Never resend based on absence of a local hash. A native anchored effect proves finality, not a signer HTTP reply. The same entitlement, nonce, payout hash/ordinal cannot be consumed in multiple epochs.

## Exact future integration files / ownership

HD future source (NOT edited by this branch): lib/warSatchelAutoBetExecutor.ts; lib/warSatchelDedicatedSignerClient.ts; lib/warSatchelFundedLedger.ts; lib/warSatchelClaimReturnAuthorization.ts; lib/warSatchelClaimReturnAttribution.ts. A separately held migration is needed for immutable epoch-specific owner, original operation, economic/physical identity and DB role separation; no migration applied here.

Wolo Codex-owned source frontier (NO FILES EDITED): internal/satchelservice/engine.go, returns.go, return_allocation.go, http.go, plus a NEW dedicated escrow signer process, OS user, isolated keyring, private journal/nonce and binary/config policy witness. Leave signed recovery executor/worktrees untouched.

Negative native tests required: new address with old 8092/8093 signing key or shared keyring inode; stale policy/chain root/permit; DE/faucet/cron callback or 8092 impersonating issuer; wrong owner/leg/ticket; zero/duplicate refund, one physical hash ordinal credited twice, cross-epoch claim or reused payout hash; matched-only fee and exact unmatched/void economics; split/multiple-leg original physical funding; escrow insolvent though vault solvent; fee recipient collision; crash after signer before receipt, no retransmission and definitive UNKNOWN hold.

## Remaining genuine live evidence

HEL1 effective service owners/port bindings, raw public signer identities and address derivation, independently proven keyring ACL+mount/namespace/credential lineage, all legacy/external writer exclusion, original full HD+DE SELECT-only census including historic claim kinds, native Comet H/H+1 bank+escrow and liability proof, full writer fence and recoverable backup, and exact one-transaction owner permit are UNKNOWN. Do not substitute app superuser credentials, self-authored packets or pretend five human actors exist.

**Financial release: NO-GO.** No deploy/merge/transfer/replay or independent signing authority arises from source CI.