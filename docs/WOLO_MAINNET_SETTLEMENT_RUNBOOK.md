---
id: "aoe2war.app-prodn.docs-wolo-mainnet-settlement-runbook"
title: "WOLO Mainnet Settlement App Runbook"
type: "runbook"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn","wolochain"]
audience: ["operators","ai-agents"]
source_of_truth: "git"
authority: "operational-procedure"
reviewed_at: "2026-10-14"
review_interval_days: 30
sensitivity: "restricted"
---

# WOLO Mainnet Settlement App Runbook

## October 16, 2026 — canonical escrow sender binding in payout evidence

The existing `validateDistinctClaimPayoutTxBatch` already used canonical
transaction identity and count-based duplicate detection, but counted
`recipient|amount` without checking the **sender**. An unrelated
successful bank send to the correct recipient for the correct amount
could pass that part of the settlement evidence guard.

The guard now supports optional `expectedFromAddress`, normalized and
rejected if malformed. Known escrow-backed settlement paths in
`lib/bets.ts` (batched bet settlements and corrective refunds) and
`scripts/audit-backfill-jims-rule.mts` supply the **configured
escrow wallet**. A missing configuration supplies an invalid value
and fails closed instead of silently skipping the source requirement.
For a known sender, the guard also counts exact
`sender|recipient|uwolo amount` bank sends; duplicate obligations
require distinct matching sends. Existing recipient+amount consumption
checks remain in force for older claimed rows. The pure validator and
tests exercise foreign payers, same-amount transfers and insufficient
distinct sends.

**Scope / remaining holds:** the admin/founder claim routes do not yet
possess a reliably attested and date-correct expected payout signer.
They deliberately receive no invented source address; optional sender
support does not certify those legacy paths. Founder #889 stays on
hold. A matching transfer still does not prove unique request/memo
binding, complete historical receipt consumption, canonical chain
trust, or safe signer/escrow reserves. Do not treat this incremental
source improvement as financial-release clearance. No payout, claim
write, correction execution or deployment occurs in this PR.


## October 16, 2026 — canonical WOLO payout response identity and size gate

The read-only batch payout reconciliation library previously treated an
absent or malformed `tx_response.code` as `0` and extracted `MsgSend`
data without independently verifying `tx_response.txhash` or a positive
committed height. A valid HTTP response was thus too easily equated with
a successful canonical transaction. The REST response was also parsed
using unbounded `Response.json()` and without a request timeout.

`inspectWoloPayoutTxEnvelope` now requires an exact 64-hex requested
transaction hash match, a positive committed height, and a decoded
transaction body before a bank send can count as payout evidence. The
execution code is parsed strictly: explicit nonzero rejects, malformed
or explicitly null codes reject. **Missing code is accepted ONLY with
the complete canonical envelope** because Cosmos' Go JSON
`omitempty` legitimately omits a successful zero. The endpoint is
accessed with mandatory HTTP 200 (not partial HTTP 206), without redirects, on a 6.5-second timeout, and the response
is bounded to 750,000 bytes even for chunked transfers. Missing,
oversized, mismatched, or failed evidence returns zero sends.

This is an additional *read-only reconciliation* gate. It does not
prove consensus finality or independence of the REST trust path by
itself, does not establish payout ownership or a signer balance, and
cannot settle a claim or authorize a retry. Real payout confirmation
still requires unique `MsgSend`, correct recipient/amount/sender,
canonical chain state, durable request identity, and a safe financial
review. Historic #889 remains held if evidence is ambiguous.


## October 15, 2026 — read-only historical paid-status/proof-gap census

The legacy authenticated profile Claim WOLO route used to mark matched
`pending_wolo_claims` as `claimed` by player-name association without
an independently proved `wolo-1` payout, a stored tx hash, or a safe
claimant-bound atomic completion predicate. PR #598 stopped all *new*
phantom-paid profile transitions. That source repair does not tell us how
many historical claim rows, if any, were already marked claimed without
recorded transaction proof.

`scripts/wolo-claimed-without-proof-readonly.mjs` adds a bounded,
**aggregate-only** historical census. Run it only from the protected
application EnvironmentFile, never supply `DATABASE_URL` on a shell
command line. It opens a read-only repeatable-read PostgreSQL transaction
with connection/query timeouts, reads only fixed `status='claimed' AND
payout_tx_hash IS NULL` cohorts, and rolls back before summarizing.
The output reports anonymized count buckets by mainnet-era versus legacy
creation time (cutoff 2026-05-25) and a fixed allowlist of payout kinds,
plus counts of prior attempt timestamps and unverified proof-URL presence.
It **never prints** player names, owner IDs, wallets, amounts, raw error
text, settlement memos, hashes, or credentials.

Exit 0 means this particular predicate found no rows in the observed
snapshot, **not** that all claims were paid or full chain state was
reconciled. Exit 3 means one or more rows demand independent historical
settlement review; exit 2 means the source/database cannot be validated.
Hashless claimed rows do **not** prove unpaid funds, and even a hash-bearing
claim does not independently prove a successful transaction. Do not
automatically reopen, retry, rescind, repay, or rewrite any legacy record
to make this report green. Current WoloChain state, signer records,
claim identity, and unique transfer evidence must be verified separately.

The script performs no payments, migrations, balance writes, Satchel
credits, bets, wallet access, or production promotions. Its presence
does not clear founder claim #889 or the financial-release gate.


## October 15, 2026 — profile Claim WOLO cannot mean paid without chain proof

Source review found that the legacy `POST /api/user/wolo-claims/claim`
called `claimPendingWoloClaimsForUser`, which selected name-matched
`pending` claims and used `pendingWoloClaim.updateMany` to change them
directly to `claimed`, attach a session user ID, and stamp `claimedAt`.
There was no required on-chain payout hash, no distinct finalized
`wolo-1` `MsgSend`, and no database compare-and-set requiring an
unattempted, unclaimed row. A user pressing Claim WOLO therefore risked
making an **unpaid liability look paid**, including inappropriately
claiming rows associated with another owner sharing a player name.

The source-only correction replaces that legacy write path with a bounded,
read-only eligibility observation; name-matched unassigned claims and
claims already attached to the requesting user may be observed, never
consumed. A pending claim (including a team-name split visible on the
profile) returns HTTP 409 with `CHAIN_SETTLEMENT_REQUIRED` and current
pending totals. The profile surfaces the specific detail. An empty
profile reports no verified claim ready. The entire pending record,
payout-attempt timestamp, payout hash, claimant identity and liability
are unchanged. The protected admin settlement rail remains the only
existing path capable of finalizing a payout with independently validated
mainnet transaction proof.

**This is a containment repair, not restoration of live profile payouts.**
The next product step is a separately reviewed and certified owner-bound
claim/payout request with unique on-chain proof, wallet ownership and
transaction/ledger idempotency. Do not simply call an admin payout function
from a public profile endpoint, forge `payoutTxHash`, clear claim #889,
or infer payout from a UI click. No live WOLO transfer, production schema
change, mainnet service operation or UI redesign was performed.


## October 15, 2026 — immutable historical claim writes (shared boundary)

Admin and automated Founder payout retry prevention must not rely only on
HTTP endpoints. The previous generic `createPendingWoloClaim` market-identity
`upsert` could unconditionally rewrite `payout_attempted_at`, payout tx
hash, and a final claim status on a repeated settlement/synchronization
attempt. This was a potential financial-history erasure path independent of
the explicit admin retry and rescind protections.

The shared claim writer now executes a **conditional database update** on
the exact compound market identity, requiring original status `pending`
with BOTH `payoutAttemptedAt IS NULL` and `payoutTxHash IS NULL`. That
database predicate protects the row atomically against concurrent payout
changes. If no eligible row exists (Prisma P2025), a true first-time claim
may be created. When the identity already exists with a recorded attempt,
proof hash, claimed or rescinded status, the existing UNIQUE identity
rejects the insert; the caller must stop and investigate, never clear
history, retry the payout, or convert it into an ordinary pending claim.
No fallback reads or attempts to rewrite the historical row are allowed.

This protects the recorded claim evidence of #889 and other past payout
attempts. It does **not** prove the claim was paid or unpaid, reimburse
anyone, close the Wolo service cutover, or activate a real funded Satchel
or Watcher/Mecha wager. Live activation requires independently certified
HD deployment after current Wolo runtime/source financial gate resolution.

## October 15, 2026 — fail-closed admin claim retries and rescission

Founder claim #889 remains **pending and payout-ambiguous**, not proved
paid or unpaid. Canonical wolo-1 inspection ruled out the three
same-amount indexed transfers as exact Founder bonus #15 memo matches, and
both root-private current settlement request directories had zero matching
bonus #15 durable records. Neither observation covers every historical
payout path or proves absence of a prior successful transfer. Maintain its
liability and preserve the attempted-at timestamp. No admin retry, blind
rescind, or new payout is approved.

The app now refuses its **admin retry** for any `pending_wolo_claims`
row with `payout_attempted_at IS NOT NULL` but no stored payout hash,
with a specific HTTP 409 `ambiguous_prior_attempt` outcome. This condition
is checked before payout planning, and founder retries recheck it **inside
the existing idempotency lock**. The background Founder bonus auto-settlement
flow also refuses any previously attempted or hash-bearing claim on a
re-read inside its founder idempotency lock; its ordinary existing-group
dedupe remains intact. A stored non-empty tx hash may still enter
the exact existing chain-validation path, not an unproven new send.
If an operator independently proves nonpayment, resolution requires a
separately reviewed evidence-preserving financial correction; **do not**
clear `payout_attempted_at` to bypass this hold.

Administrative wallet-link claim **rescission** is now an atomic
database compare-and-set requiring status `pending`, null attempted-at
and null payout tx hash; any attempted/claimed/changed row fails closed.
The route returns HTTP 409 on observed conflicting state or a concurrent
Prisma `P2025` guard failure. Removed the prior second update that could
overwrite `error_state` and zero a payout-attempt timestamp. No
financial amounts, ledger balances, signer keys, consensus state or
chain services are changed by this source update. These protections
will only be active once the HD site receives its independent certified
deployment; CI green is not production activation.

## October 15, 2026 — founder claim #889 canonical candidate cross-check (read-only)

The October 15 protected two-service preflight is **PASS** on the original shared payout executable, separate consensus executable, staged settlement verifier, immutable private snapshot, healthy 8092/8093 listeners, and no observed request locks. That certifies **preflight state only**, not permission to promote either financial service. It does not certify a clean app release or automated betting.

Founder claim #889 remains unresolved: prior read-only app-cache analysis found **three same-amount indexed transactions lifetime** and **zero within ±48 hours** of its payout-attempt timestamp. The cached index is incomplete and cannot establish that no transfer occurred.

`scripts/wolo-claim889-canonical-candidates-readonly.mjs` adds a new evidence lane:
- Reads exactly claim #889 and at most 12 distinct same-amount cached hash candidates under read-only, repeatable-read PostgreSQL transaction (running through the private production EnvironmentFile, not command-line secrets).
- Pins public `wolo-1` RPC status/network and individually reads those hashes from the public Cosmos transaction REST API with bounded response sizes, no redirects and per-request timeouts.
- Compares actual successful on-chain `MsgSend` denomination/amount to the deterministic founder-bonus #15 memo from the production source, and reports only public hashes and evidence flags.
- **Never** marks the historical cache complete; never assumes a matching memo proves recipient identity, signer's payout authority, or unique global payout; even a good candidate remains a review-only lead.

Codes: `2` means source, DB, RPC, or complete candidate retrieval failed; `3` means the bounded investigation ran, remains inconclusive, and **no payout/retry or release is authorized**. No operation signs, broadcasts, moves WOLO, updates a claim, pauses ingress, changes source checkout, or changes the consensus node. Before any settlement-only promotion, independently prove claim #889's actual state through full canonical chain history and signer/recipient checks plus separately approved financial-drain and watchdog recovery; do not clear it from a cache absence, error hint, or a CI green score.



## Claim #889 follow-up: crosscheck indexed amount, not only memo (October 14)

The operator's immutable memo-only diagnostic at 2026-10-14T19:40:06Z
scanned 4,097 cached `wolo-1` `uwolo` transfer rows (170 within
48 hours of the July 4 attempted founder payment). It found **zero**
memo-pattern hits and produced verdict `INCONCLUSIVE_NO_PROOF_FROM_PARTIAL_INDEX`.
The code intentionally searched by memo first, so an older payout with a
different or blank memo could never be returned. This is a **coverage
gap in the diagnostic**, not evidence of missing funds or a chain reset.

`scripts/wolo-claim889-amount-window-readonly.mjs` runs an independent
READ ONLY / REPEATABLE READ PostgreSQL transaction and checks the exact
amount derived internally from claim #889 against `wolo_indexed_transfers`,
using ±10 minutes, ±2 hours, and ±48 hours around the recorded
attempt. It also checks for **one exact known server-not-configured**
error substring in the private claim record and reports only an allowlisted
error category, never the raw text. Even this source-matched category is
not independent proof that no earlier transfer was broadcast. It outputs only aggregate counts and at most twelve **public**
transaction hashes with indexed timestamps and transfer ordinals. It never
prints private identities, signer addresses, recipient addresses, amounts,
raw error text or memos. It does not query, sign or broadcast to WoloChain.
A source-verified invocation must run with the existing protected
production app EnvironmentFile, under a restrictive transient systemd
unit, never by pasting `DATABASE_URL`.

**Regardless of results**, its exit code 3 means the payout is still
unproven. The app transfer index is an incomplete cache and cannot attest
chain success, true sender/recipient, denomination or idempotency. Each
possible transaction must be checked against canonical `wolo-1` evidence;
no match cannot certify nonpayment. Never clear, retry or rescind claim
#889 merely to make the release gate pass.


## October 14 blocked claim #889 — secondary index-only evidence

The protected live finance audit returned **one** old unproven payout attempt:
pending `founders_win` claim #889, bonus #15, market #4476, attempted
July 4, 2026. Under currently derived request IDs and memo patterns,
no record matched in the primary/founder settlement state or private backup.
A direct Wolo REST **transaction search** by sender failed with HTTPError;
the error did not prove the node was unavailable or that no payment occurred.

`scripts/wolo-claim889-indexed-proof-readonly.mjs` is a separately
audited, restricted read-only database diagnostic. It compares this exact
claim to the existing `wolo_indexed_transfers` cache, reports the indexed
time-span and coverage near the attempt, and lists bounded public tx hash
**candidates** only for transfer memos matching the founder/bonus/claim/
market reference patterns. It checks amount equality internally without
printing the amount, recipient, sender or raw memo. It does not call a
signer or Cosmos transaction-search endpoint, and it never modifies
the claim or any transfer. The script exits code 3 intentionally
even when candidates are found.

**The application transfer index is incomplete by design** and its lookup
cannot prove nonpayment. A possible hash must be checked directly on
the canonical `wolo-1` chain for successful execution, the exact memo,
sender, recipient, amount in `uwolo` and distinct transfer ordinal. If
no candidate is found, the operator must not assume no transfer occurred.
The missing financial proof remains a release blocker until separately
reconciled. Never clear the old attempt timestamp or fabricate a tx hash
to manufacture a green preflight.


This is the AoE2HDBets-side runbook only. WoloChain owns the chain service,
keys, signer funding, and settlement truth.

## October 14 live finance-drain blocker — one unproven claim

At 2026-10-14T10:14:52.444Z the operator ran the immutable,
read-only PostgreSQL financial snapshot from app-prodn merge
`3ecc28bd983bd517f4e82b982ef5726f3f33eaf7`
as a restricted transient systemd unit. Five scanned categories were zero.
Exactly **one** `pending_wolo_claims` record had
`payout_attempted_at IS NOT NULL`, no `payout_tx_hash`, and was not
`claimed` or `rescinded`. The tool exited code 3 by design and **blocked**
the settlement-only promotion. This is not evidence that a transfer occurred
nor evidence it did not occur.

The follow-up `scripts/wolo-unproven-claim-forensics-readonly.mjs` performs
one read-only repeatable-read transaction using the exact same predicate and
outputs a bounded list of claim ID, payout kind, grouping/source IDs, status,
attempt/creation/update times, presence of proof URL, and a broad nonauthoritative
error classification. It never prints player names, wallets, amounts,
stored notes, raw error text, credentials or transaction memos. Its SQL session
is explicitly read-only and its return code remains 3 when any row exists.
It must be run as a temporary scoped systemd unit with the protected
`/etc/aoe2hdbets/aoe2hdbets-web.env` EnvironmentFile (not echoed), using
the production app package for the `pg` module. This is investigation,
**not a manual retry**.

If a claim is found, review its persisted settlement request identity and
independently corroborate WoloChain transaction inclusion, success, memo,
denomination, amount, exact recipient and prior idempotency outcome
**without broadcasting a transfer**. Only after that evidence may a separate
financial correction be designed and reviewed. Do not zero the attempt time,
rescind the claim, fabricate a proof hash, or mark it paid merely to clear the
release gate. Other app-side and on-demand payout ingress also must be drained
before any two-service executable promotion.


Review note (2026-10-10): App-side procedural review checked the
documented separation of WoloChain settlement authority, escrow
and payout signer roles, health gates, and staking custody safeguards.
Historical balances and runtime observations remain dated evidence,
not a certification of current mainnet state. Before any financial
operation, obtain current chain and service evidence and the required
separate authorization. This review authorizes no Wolo mutations.

Review note (2026-08-28): the app-side signer-role separation, health gate,
financial containment, and settlement call paths were re-reviewed against the
current implementation and financial regression suite. Commit identities,
binary hashes, balances, and inventory counts below are preserved as dated
2026-07-26/29 evidence only. Before any operation, read current truth with
`aoe2war status`, `aoe2war audit`, and `aoe2war doctor`; never make the running
node binary equal the checkout without a separately proven chain-upgrade plan.

## Mainnet service shape and dated evidence

### Verified source and binary split — 2026-07-26

- active checkout: `/var/www/WoloChain-wolo-1`, branch `wolo-1-mainnet-prep`, clean at `d5dea8d6f1a2b0b57489a5e468dd21e34246891e`;
- mainnet node service: `wolochaind-mainnet.service`;
- node executable: `/usr/local/bin/wolochaind-mainnet-node-prewartrophy`, commit `d3bd62414a047a492a3814b7d3baa2717d64db2e`, SHA-256 `4b77f622191db7550cb87cafb8f1886a0aadebee3eb6565f9f90036f809e61d3`;
- Bet settlement service: `wolochain-mainnet-settlement.service`, loopback port `8092`;
- Founder Rewards settlement service: `wolochain-founder-rewards-settlement.service`, loopback port `8093`;
- settlement executable: `/usr/local/bin/wolochaind-mainnet`, commit `d5dea8d6f1a2b0b57489a5e468dd21e34246891e`, SHA-256 `f0e199b8988ced2cbbd6e899406f550280b6da548cf2be340456ea8d818b01b0`.

The consensus node is deliberately pinned to the pre-War-Trophy binary while settlement uses the newer isolated-market binary. Treat this as an intentional compatibility boundary. Never replace the node executable merely to make its commit equal the source checkout.

At inspection, `wolo-1` was synchronized (`catching_up=false`). Bet settlement reported approximately 499,955.25 WOLO payout balance and 522,045.75 WOLO escrow balance against 250,000 and 100 WOLO minimums. Founder Rewards settlement reported approximately 364,837.24 WOLO payout balance against a 1,000 WOLO minimum. Both services were loopback-only with auth tokens configured.

The 2026-07-29 reliability check again found all three Wolo services active,
`wolo-1` synchronized, and both settlement health endpoints green. The Bet
service reported 499,948.75 WOLO payout balance and 522,508 WOLO escrow
balance; Founder Rewards reported 364,651.991424 WOLO. This app release
therefore does not authorize or require a consensus upgrade. Preserve the
intentional node/settlement binary split unless a separate coordinated
chain-upgrade plan proves otherwise.


- Settlement URL: `http://127.0.0.1:8092`
- Chain ID: `wolo-1`
- Bet Payout signer: `wolo1zfa9ssu2gpgqg7yzvhmjt4w66mza07qr2a4rwu`
- Bet Escrow signer: `wolo1zygwt232ymc4h2g52yvkntffhmd5alx2kglw7p`
- Community Treasury: `wolo1hlfvzuv4dc46ngvh3zlteuegx0xga20hj20zd2`

`127.0.0.1:8091` is wolo-testnet. Do not use it for mainnet payout, staking
reward, Treasury, escrow, or admin retry paths.

## Cutover gate

Keep these unset in `/etc/aoe2hdbets/aoe2hdbets-web.env` until WoloChain
settlement health is green:

```bash
WOLO_SETTLEMENT_URL=http://127.0.0.1:8092
WOLO_SETTLEMENT_AUTH_TOKEN=<copy from root-only WoloChain env>
WOLO_BET_PAYOUT_ADDRESS=wolo1zfa9ssu2gpgqg7yzvhmjt4w66mza07qr2a4rwu
WOLO_BET_ESCROW_ADDRESS=wolo1zygwt232ymc4h2g52yvkntffhmd5alx2kglw7p
WOLO_COMMUNITY_TREASURY_ADDRESS=wolo1hlfvzuv4dc46ngvh3zlteuegx0xga20hj20zd2
```

Health must report `ok=true` and `chain_id=wolo-1`:

```bash
curl -sS http://127.0.0.1:8092/settlement/v1/health
```

If health reports `PAYOUT_FEE_HEADROOM_TOO_LOW`, `ESCROW_BALANCE_TOO_LOW`, or
any non-ok status, AoE2HDBets should show a blocker and must not execute live
payouts.

AoE2HDBets health/capability surfaces must probe `GET /settlement/v1/health`.
Do not use an empty grouped-run validation request as a capability probe; a
zero-payout `runs/validate` call creates fake `INVALID_RUN` settlement noise.
Real payout dry-runs still use `validateWoloSettlementRun` with actual payout
items before execution.

The app keeps health diagnostics split by audience:

- Public `/bets`, `/war-chest`, and `/staking` copy should stay calm: `Settlement
  rail online`, `Settlement rail waiting for operator top-up`, or `Settlement
  status unavailable`.
- Admin/operator surfaces may show exact `chain_id`, `runtime_chain_id`, payout
  signer address/balance/minimum, escrow address/balance, `failure_code`, and
  raw detail.
- Staking reserve warnings are about the staking custody wallet and unstake
  rail, not the Bet Payout signer. Public copy should say `Staking wallet
  reserve top-up needed.` Admin copy can include the staking wallet address,
  current balance, confirmed liability, required balance, actual reserve
  headroom, reserve target, gap, and last checked time.

## Staking custody liability versus operating reserve

The staking wallet and app ledger must distinguish three economic classes:

- **direct staking principal** — user WOLO proven by the canonical staking
  position and its chain-backed deposit/withdrawal history;
- **compounded reward liability** — earned rewards that may become additional
  staking principal only after equivalent custody backing is independently
  proven on WoloChain;
- **operator reserve funding** — non-user-liability WOLO held only to keep
  withdrawals liquid.

Direct principal and confirmed compounded rewards both contribute to displayed
withdrawable liability, but they do not share the same evidence path. A
compound allocation must not become `COMPOUNDED` merely because an app row was
written. The mainnet invariant is:

`earned reward -> COMPOUND_PENDING -> escrow-funded chain transfer -> staking custody proven -> COMPOUNDED`.

The chain-backed compound v1 source implementation enforces that invariant for
new mainnet distributions:

- the distribution freezes `rewardSettlementPolicy=chain_backed_compound_v1`
  and the explicit staking custody address;
- auto-compound allocations are created as `COMPOUND_PENDING`, not
  `COMPOUNDED`;
- the historical inline synthetic `COMPOUND-*` confirmation path is disabled
  on mainnet;
- reward settlement uses the grouped **Bet Escrow** rail because betting fees
  are the economic source of the staker reward pool;
- the dry-run must prove `signerRole=escrow`, the exact configured Bet Escrow
  signer address, every recipient, and every minimal-denom amount;
- execution must again prove the escrow signer, and each returned payout must
  match the exact planned recipient and `uwolo` amount with a real tx hash;
- only after that receipt is proven may the allocation transition to
  `COMPOUNDED`, increment `compoundedRewardsWolo`, and create a confirmed
  `COMPOUND` event using the real chain tx hash;
- direct `currentStakedWolo` principal is never incremented by compounding;
- allocation finalization uses an atomic conditional state claim so concurrent
  retries cannot double-credit liability;
- v2 settlement run IDs and per-allocation request IDs are deterministic and
  versioned, and retries reconstruct the complete original positive-reward
  payout set so grouped-run identity cannot drift after partial success.
- reward read models treat the mainnet allocation ledger as canonical across
  both historical position-less rows and v2 position-linked rows; `position_id
  IS NULL` is a historical storage shape, not reward-authority semantics.
- confirmed stake/unstake receipt ingestion serializes both normalized tx-hash
  reuse and per-user balance mutation with transaction-scoped PostgreSQL advisory
  locks before checking or writing the staking event, preventing concurrent
  requests from double-crediting one chain receipt or overwriting balance state.

Historical distributions that do not carry the v2 settlement-policy metadata
remain on their legacy semantics and are not silently rewritten or replayed.

**Activation remains safety-paused.** Source implementation alone does not
authorize reward distribution. The September 9 historical compound liability,
staking custody deficit, and operating reserve must be reconciled and an
explicitly certified activation decision must occur before the reward timer or
application reward gate is re-enabled.

Current direct-principal values come from the canonical app position; strict
reconciliation uses confirmed staking events across retired and current custody
wallets plus chain evidence for wallet migrations. Raw indexed transfers remain
audit input and cannot independently create liability. Operational reserve
funding remains visible in the indexed audit trail as `RESERVE` /
`Admin operational funding`, but is excluded from principal, weight,
leaderboard order, and staker status-room totals. Admins can inspect it
explicitly through the `Reserve/Admin` activity filter.

### September 9, 2026 custody containment

A read-only production audit at `2026-09-09T14:27:58Z` established:

- active direct staking principal: **5,356,076 WOLO**;
- confirmed compounded reward liability: **92,285 WOLO** across 109
  `COMPOUND` events;
- all 109 compound event hashes were synthetic `COMPOUND-*` identifiers;
- indexed WoloChain matches for those compound hashes: **0**;
- public staking-wallet balance: **5,434,586.735 WOLO**;
- total confirmed displayed liability: **5,448,361 WOLO**;
- operating reserve before target: **-13,774.265 WOLO**;
- operating reserve target: **10,000 WOLO**;
- operator top-up needed to satisfy liability plus target: **23,774.265 WOLO**.

Current-wallet chain reconciliation separately proved Jim and Julio's active
principal against their exact current-wallet deposits. Emaren's surviving
100-WOLO legacy principal is explained by the old-custody-wallet migration.
Historical pre-migration event rows must not be treated as current-wallet
principal authority.

The staking wallet also contains **101,055.015 WOLO** of explicitly memoed
manual/reserve top-ups. These top-ups are custody funding, not user stake, and
do not excuse synthetic compound confirmation.

At the containment check the systemd reward timer was already
`disabled`/`inactive`, and the application now has a second fail-closed barrier:
authenticated reward-run requests return
`STAKING_REWARD_DISTRIBUTION_SAFETY_PAUSED` before Prisma is acquired.

No staking balance, reward allocation, or WoloChain transfer is rewritten by
that containment change.

### September 10 UTC legacy synthetic-compound reconciliation

A second read-only production census proved the 109 synthetic events map
one-to-one to exactly 109 `COMPOUNDED` allocations totaling **92,285 WOLO**:
Emaren 4 WOLO across 3 rows, Julio 23,619 across 45 rows, and Jim 68,662 across
61 rows. There were zero missing allocation links, user mismatches, amount
mismatches, distribution mismatches, unexpected confirmed `COMPOUND` events,
or unmapped `COMPOUNDED` allocations. There were still zero chain-backed
compound events.

The one-time repair is intentionally an accounting/provenance correction, not
a treasury top-up and not a reward haircut. It keeps all historical synthetic
`COMPOUND-*` events immutable, keeps `lifetimeRewardsWolo` unchanged, changes
the 109 linked allocations from `COMPOUNDED` to `COMPOUND_PENDING`, and removes
exactly 92,285 unbacked WOLO from `compoundedRewardsWolo`. Any independently
chain-backed compound principal is preserved.

The source read model separately rejects compound principal unless the event
has both `chainBackedCompound=true` and a real 64-hex WoloChain transaction
hash. Legacy `COMPOUND_PENDING` rows on distributions without
`rewardSettlementPolicy=chain_backed_compound_v1` are quarantined from the
legacy payout rail and surface an operator-reconciliation error rather than
being silently skipped or paid through the wrong signer path.

Run the production tool only from the clean deployed `main` checkout after the
merged source has been certified and while stake, unstake, and reward mutation
remain safety-paused and `aoe2hdbets-staking-rewards.timer` is disabled:

```bash
set -a
. /etc/aoe2hdbets/aoe2hdbets-web.env
set +a

node scripts/reconcile-legacy-synthetic-staking-compounds.mjs
node scripts/reconcile-legacy-synthetic-staking-compounds.mjs \
  --apply \
  --confirm RECONCILE-LEGACY-SYNTHETIC-COMPOUNDS-109-92285
node scripts/reconcile-legacy-synthetic-staking-compounds.mjs --verify
```

Dry-run is the default. Apply rechecks the exact cohort inside a PostgreSQL
transaction under an advisory lock, writes mode-0600 precondition evidence and
a pre-commit receipt, and refuses source/timer drift. It performs no WoloChain
transaction. Re-running apply after a successful correction is an idempotent
no-op; `--verify` is the canonical postcondition check.

### September 20 UTC chain-custody closure and reward resumption

The historical custody liability is now closed on mainnet. The 109 linked
allocations are `COMPOUNDED` only because equivalent WOLO reached the canonical
staking wallet from the canonical Bet Escrow through three code-0 transactions:

- Emaren: 4 WOLO — `44DCF1A978177F444F7787C6056FB4A8F33CAF3586B028CCE77F45993EB1621B`;
- Julio Alvarez: 23,619 WOLO — `85315997AD6939A808CBDCDC221B453A02DDA0471DACA5121E601662EC4BB093`;
- Jim: 68,662 WOLO — `E7053CC994F667295D95A169DC533B1B6B510B2B2FCD96E5E07D999CAB5AF178`.

All three transfers use the canonical escrow sender
`wolo1zygwt232ymc4h2g52yvkntffhmd5alx2kglw7p` and canonical staking custody
recipient `wolo18v9ugfdrnz2ll2ah5z2yqzm5kzlg3e7l7jy6rn`. After finalization,
the corrected public staking balances are Emaren 104 WOLO, Julio 388,545 WOLO,
and Jim 5,059,712 WOLO. The staking wallet remains reserve-healthy with more
than 68,000 WOLO above the 10,000-WOLO operating-reserve target.

Reward distribution may be resumed only after the chain-backed reward contract
and matched-only fee-volume rule are deployed. Because the timer was disabled
during containment, first backfill every closed UTC date from September 9
through September 19 with explicit `--date=YYYY-MM-DD` runs. The read-only
pre-backfill census found 600,650 WOLO of fee-bearing matched volume, producing
12,013 WOLO of total betting fees. The precise 50/50 economic split is
6,006.5 WOLO for stakers and 6,006.5 WOLO for Community Treasury; legacy
whole-WOLO compatibility fields may display 6,006 / 6,007, but new settlement
and reward authority is the exact `uwolo` mirror. Dates with settled wagers but zero matched fee-bearing
exposure must produce zero fee.

A September 21 pre-backfill precision audit also proved that historical
sub-WOLO carry had accumulated past whole-WOLO boundaries without being
released: Emaren 4,844,555 uWOLO, Julio Alvarez 27,910,788 uWOLO, Jim
33,102,336 uWOLO, and soso 1,109 uWOLO, totaling **65,858,788 uWOLO**. The
precision columns already exist in production as `BIGINT NOT NULL DEFAULT 0`;
the accompanying Prisma migration records that runtime schema in Git and is
idempotent against the current database.

The durable reward rule is exact minimal-unit conservation. Each distribution
allocates every uWOLO in the current staker pool deterministically, adds each
recipient's prior carry, releases every crossed whole WOLO through the normal
chain-backed reward rail, and leaves only a remainder below 1 WOLO in
`micro_reward_carry_uwolo`. Because carry is shared state across dates, reward
distribution takes one transaction advisory lock, rechecks the distribution
after acquiring it, and locks recipient positions in ascending user-ID order.
For the September 9–19 backlog, the proven model combines the exact
**6,006.5 WOLO** current staker entitlement with the historical carry and
releases **6,071 whole WOLO** through the chain-backed rail, while preserving
exactly **1,358,788 uWOLO** of residual carry across all stakers.

Enable the persistent daily timer only after the precision release is deployed,
all backfill dates are finalized sequentially, their chain receipts are proven,
and no `COMPOUND_PENDING` reward liability remains.

Do **not** fund the apparent historical 23,774.265-WOLO deficit as a substitute
for this reconciliation. After repair, re-measure custody against real direct
principal and any independently proven chain-backed compound liability, then
make any later reserve-funding decision from that corrected state.

Unstake checks and confirmed-event finalization must use that same combined
mainnet liability. Finalization consumes direct principal before compounded
principal, records the combined balance before/after on the event, and marks a
position inactive only when both buckets are zero.

Use one of these canonical memos for a direct operational top-up:

```text
staking-wallet-reserve-top-up:<amount>wolo:<YYYYMMDD>
staking-wallet-operating-reserve-top-up:<amount>wolo:<YYYYMMDD>
```

The memo must come from a known operator/network account. A normal user cannot
escape staking liability by copying a reserve memo.

Do not use the site Stake button to repair the operating reserve. The Stake
button intentionally writes `AoE2HDBets staking deposit`; that is real stake
and remains a user liability even if an operator wallet signed it.

The production operating reserve target is:

```text
max(10,000 WOLO, configured unstake/settlement fee headroom)
```

The app derives the operator figures as:

```text
confirmed liability = canonical current staking positions
actual reserve headroom = staking wallet chain balance - confirmed liability
required balance = confirmed liability + reserve target
healthy = chain balance >= required balance
```

Verify the live calculation without an admin session:

```bash
curl -sS https://aoe2war.com/api/staking/config | jq '.operatorFunding'
```

Repeated transfer-index scans are safe: the transaction hash/index remains
the unique storage key, and indexed rows remain an audit source rather than the
current-liability authority. Existing reserve transfers therefore reclassify without deleting
or hiding their indexed ledger rows.

## App payout behavior

- Staker reward payouts use grouped `validateWoloSettlementRun` first, then
  execute only when the dry-run is ok.
- Community Treasury payout uses grouped `validateWoloSettlementRun` first, then
  execute only when the dry-run is ok and signer role/address are verified.
- Scheduled-match escrow settlement uses `signer_role=escrow` and refuses local
  payout-signer fallback.
- Pending core market claim retries must preserve custody authority: bettor
  payouts, exact refunds, and winner bounties dry-run and execute with
  `signer_role=escrow` from the configured Bet Escrow signer. The dry-run must
  prove the exact escrow role/address before execution; a generic payout/staking
  reserve signer is not an allowed fallback for escrow-backed market debt.
- Before that payout dry-run, Admin recovery must independently prove the
  original stake exists on the current WoloChain. The proof binds transaction
  hash, bettor sender, exact funded amount, and the exact market or ticket stake
  memo to the configured Bet Escrow. `execution_mode=onchain_escrow`, a stored
  stake hash, timestamps, or historical chain evidence alone are never enough.
  Payout/refund recovery requires all contributing funding sources; winner
  bounties require at least one current-chain-funded wager on the source market.
  A chain-era mismatch or unavailable escrow verifier fails closed without
  broadcasting a payout.
- Legacy retry state is immutable. When a historical claim was already attempted
  on the old payout-signer rail, the escrow migration uses deterministic
  `escrow-v2` run and request IDs rather than reusing an existing idempotency
  key with a changed signer payload. Repeating that v2 identity must replay the
  same stored result and cannot create a second payment.
- Pending claim retries should distinguish unresolved wallet identity from
  settlement service or signer unavailability.
- Team-market settlement must pass the immutable proposition/final-roster gate before any payout plan, betting fee, winner bounty, or founder bonus is created.
- Integrity corrections send only the exact unpaid void entitlement from the Bet Escrow signer that received the stake, never from the winner-payout reserve. The unique incident/wager memo and escrow sender are recovered from WoloChain before retry and must pass distinct-send validation before local rows become paid.
- A prior payout above the void entitlement is recorded as an incident overpayment. The app never auto-debits it; any return is a separate user-signed transaction.

## Deploy and backfill

After deploying code and running Prisma migrations, refresh the direct-transfer
index from mainnet start:

```bash
node scripts/backfill-wolo-mainnet-transfers.mjs --block-limit=5000000 --address-limit=400 --per-address-limit=5000 --global-limit=100000
```

Then verify:

```bash
curl -sS http://127.0.0.1:3030/api/wolo/mainnet-transfers?limit=50
curl -sS http://127.0.0.1:3030/api/wolo/holders?format=table
```

For `/profile`, sign in as the relevant user and confirm the Money in / money
out rail includes direct outgoing mainnet sends to Jim and Sniper after the
backfill completes.

The public network inventory uses chain supply as the canonical total and the
sum of named bank balances as a reconciliation subtotal:

```bash
curl -sS https://aoe2war.com/api/wolo/network | \
  jq '{totalSource,totalWolo,knownAddressTotalWolo,untrackedWolo,count}'
curl -sS 'https://aoe2war.com/api/wolo/network?format=table'
```

Never hard-code a fixed-supply display to conceal a missing address. The
2026-07-29 reconciliation identified
`wolo1m943tq5tuqf7ejucmac9knpls04jtmh3apzlrg` as the Workshop sponsorship
recipient, funded by two confirmed 100 WOLO transfers. It is separate from the
already-listed Emaren #2 player wallet, which independently holds 200 WOLO.
