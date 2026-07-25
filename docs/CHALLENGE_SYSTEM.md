# AoE2WAR Challenge System v2

## Product contract

A Challenge is an invitation to fight, not an appointment request.

The default flow is:

1. Pick a rival.
2. Choose how long the rival has to accept (default: 72 hours).
3. Set wager / Match Guarantee terms.
4. Optionally add a callout.
5. Send and fund the Challenge.

An exact match time is optional. After both participants fund, an open Challenge is **Match Ready / Play Anytime** until its play runway expires. Players may still propose an exact time when they want one.

## Canonical clocks

Challenge v2 separates four concepts that legacy `scheduled_at` had conflated:

- `accept_by`: deadline for the challenged player to accept.
- `fund_by`: short post-acceptance deadline for both sides to finish funding.
- `play_by`: maximum funded runway before an unplayed Challenge expires.
- `match_time`: optional exact proposed/confirmed match start.

Timestamps are stored canonically and presented with browser-local time as the primary UI. UTC remains visible as a secondary audit reference.

`scheduled_at` remains a non-null legacy compatibility shadow during this migration. New v2 behavior must use the explicit lifecycle columns above.

## Default timing

- Acceptance choices: 24 hours, 72 hours, 7 days, 30 days.
- Default acceptance window: 72 hours.
- Funding window after acceptance: 1 hour.
- Funded play runway: 30 days.
- Exact match times: optional and limited to the next 30 days.

## Lifecycle

Human lifecycle phases are derived from canonical timestamps and persisted status:

- Awaiting opponent
- Awaiting creator funding
- Awaiting opponent funding
- Match Ready / Play Anytime
- Time proposed
- Scheduled
- Check-in open
- Ready
- Live
- Result pending
- Completed
- Declined
- Expired
- Funding expired
- Cancelled
- No-show
- Refunded
- Forfeited

The reconciliation worker persists terminal expiry states. A stale active Challenge must not remain indefinitely in the active runway.

## Financial truth

AoE2WAR app state is not proof that WOLO moved.

- Challenge funding is accepted only from verified funding proof.
- `scheduled_match_funding_proofs` is the canonical cross-Challenge proof registry.
- A chain transaction hash may fund exactly one Challenge side.
- A Challenge-side proof is unique per `(scheduled_match_id, participant_side)`.
- Settlement/refund execution uses deterministic request IDs, advisory locking, idempotent replay protection, and WoloChain settlement proof.
- A Challenge is displayed as **Refunded** only when planned transfers are confirmed executed with transaction proof.

The public collapsed record shows human truth. Expanded detail shows lifecycle and financial steps. `RAW` exposes bounded public audit evidence such as event types, timestamps and transaction hashes, but not secrets or signer credentials.

## Settlement rules

### Cancelled / expired / funding expired

Every externally funded side receives its full funded Challenge amount back:

`wager + Match Guarantee`

Unfunded sides receive nothing because nothing was locked for them.

### Completed match

When both sides were externally funded and replay/finality evidence uniquely identifies the winner:

- each participant's Match Guarantee is returned;
- both wagers are awarded to the winner.

If winner identity is ambiguous, execution is blocked for operator review. Replay finality is never inferred from Challenge state alone.

### No-show

No-show rules apply only to exact-time scheduled Challenges; open Play Anytime Challenges do not manufacture check-in/no-show events. When exactly one fully funded player misses check-in, both Wolo Wagers are refunded and the player who showed receives both Match Guarantees (their own returned plus the missed-side guarantee). On a double no-show, both Wolo Wagers are refunded and both Match Guarantees route to Community Treasury.

## Settlement retries

Automatic Challenge reconciliation may execute refunds for **newly expired v2 Challenges** and retry failed settlement rows belonging to `expired` / `funding_expired` Challenges.

Retry guardrails:

- 15-minute retry cooldown.
- Maximum 8 recorded attempts per transfer.
- Retry queue ordered by the oldest real attempt time.
- Maximum 20 failed Challenge retries per reconciliation pass.
- One failed transfer cannot starve later rows.
- The automatic worker is restricted to Challenge V2 rows with a non-null `creation_request_id`. Migrated legacy rows intentionally keep `creation_request_id = NULL`, so the first reconciliation pass cannot silently expire or refund old historical Challenges.
- The automatic worker intentionally does **not** sweep arbitrary legacy cancelled Challenges with no settlement rows. Historical Challenge repairs remain operator-reviewed and idempotent to prevent double refunds.

## Legacy terminal preparation

Rows with `creation_request_id = NULL` remain outside automatic V2 expiry. Use
the guarded preparation rail one Challenge at a time:

```bash
npm run challenge:legacy-prepare -- --id=<scheduled-match-id>
```

The default invocation is read-only. It reports the exact participants, current
and proposed terminal status, deadlines, wager/guarantee terms, funded sides,
funding proofs, exact potential refund liability, linked settlements/title
Challenges/market exposure, blockers, a SHA-256 funding fingerprint, and the
row-specific confirmation string.

Apply is allowed only by repeating every assertion printed by that pre-flight:

```bash
npm run challenge:legacy-prepare -- \
  --id=<scheduled-match-id> \
  --apply \
  --expected-status=<exact-status> \
  --expected-left-uid=<exact-uid> \
  --expected-right-uid=<exact-uid> \
  --expected-wager-wolo=<exact-integer> \
  --expected-guarantee-wolo=<exact-integer> \
  --expected-funding-fingerprint=<sha256:fingerprint> \
  --confirm=<row-specific-confirmation>
```

The prepare command takes an advisory lock, re-reads every asserted field, and
appends one immutable `legacy_terminal_prepared` activity while transitioning
only that exact stale row. A repeated identical invocation is idempotent.
Changed funding, linked exposure, participant, terms, status, or deadline truth
blocks the write.

Preparation is deliberately database-only. It never calls WoloChain and never
moves funds. If tx-backed liability exists, review the prepared row in
`/admin/wolochain`, run the scheduled-settlement dry-run, verify the exact
recipient and amount again, and execute through the existing idempotent escrow
settlement rail. Never replace either stage with an ad-hoc wallet send.

## Reconciliation runner

Protected route:

`POST /api/challenges/reconcile`

Authentication:

- `Authorization: Bearer $CHALLENGE_RECONCILE_TOKEN`, or
- `CRON_SECRET` fallback, or
- an authenticated admin session for manual operation.

Runner:

```bash
npm run challenge:reconcile
```

The runner executes expiry reconciliation and refunds by default. Use:

```bash
npm run challenge:reconcile -- --no-refunds
```

for state-only reconciliation.

Recommended production timer templates live at:

- `deploy/aoe2hdbets-challenge-reconcile.service`
- `deploy/aoe2hdbets-challenge-reconcile.timer`

## Jim / Zodiac historical repair

Codex's July 18, 2026 read-only production audit identified the historical Jim vs Zodiac record as Scheduled Match **#24**.

Audit finding at that time:

- Jim's visible recollection: 1,000 WOLO.
- Actual deposited Challenge liability: **1,010 WOLO** (1,000 wager + 10 Match Guarantee).
- No prior refund transaction or ScheduledMatchSettlement row was found by that audit.

This is **not permission to blindly pay 1,010 WOLO**. Before executing the repair, production must be re-queried after deployment and the chain checked again. The correct procedure is:

1. Back up production database and relevant Challenge/settlement rows.
2. Dry-run settlement plan for `ids=24`.
3. Confirm exactly one funded side and exactly 1,010 WOLO liability.
4. Confirm no executed/refund transaction already exists on-chain or in settlement records.
5. Execute Scheduled Match #24 exactly once through the deterministic settlement rail.
6. Capture the returned tx hash and verify chain confirmation.
7. Re-run the dry-run/execution gate; it must report already settled / no duplicate payout.
8. Confirm the Challenge Record headline becomes `1,010 WOLO returned` and net financial impact is 0 WOLO.

Never replace this with an ad-hoc wallet send.

## Deployment order

Challenge v2 contains a schema migration and settlement-sensitive code. Production order:

1. Confirm `origin/main`, VPS HEAD and intended release commit.
2. Take restricted database backup and exact Match #24 evidence export.
3. Run `npx prisma migrate deploy`.
4. Run `npx prisma generate` and validation gates.
5. Build to isolated `.next-release` using `NEXT_DIST_DIR=.next-release` while `.next` remains live.
6. Stop/swap release directories atomically and restart `aoe2hdbets-web.service`.
7. Smoke `/challenge`, a Challenge detail page, history API, reconciliation auth, and hashed Next assets.
8. Inspect service journal.
9. Perform Match #24 dry run and only then execute the proven outstanding refund.
10. Install/enable the reconciliation timer after the one-time historical review.

Do not build directly over the live `.next` asset tree.

## Performance contract

The Challenge Hall must not load every historical event or RAW record in initial SSR.

- Initial Challenge history is bounded.
- Older history is cursor-paginated.
- Collapsed records render summaries first.
- RAW/expanded details are user-driven.
- Reconciliation is off the public request-critical path.

Measure `/challenge` before/after deployment and watch HTML size, TTFB and total transfer size.

## Jim / Zodiac legacy challenge #24 verification rail

Legacy challenge #24 is deliberately excluded from automated V2 reconciliation
because migrated rows have no `creation_request_id`. Its historical refund uses
an explicit operator-reviewed, idempotent verification/repair command.

Use the exact guarded audit/settlement command only after the Challenge V2 migration and production build are live:

```bash
npm run challenge:jim24
npm run challenge:jim24 -- --execute --confirm=JIM-ZODIAC-24-1010
npm run challenge:jim24
```

The script refuses to execute unless production truth still resolves challenge #24 uniquely to Jim vs Zodiac, the terms remain 1,000 WOLO wager + 10 WOLO guarantee, exactly Jim is tx-backed as funded, the total outstanding liability is exactly 1,010 WOLO, the plan contains exactly one 1,010 WOLO refund, no treasury transfer is planned, and the escrow dry-run is green. Existing executed settlement proof is treated as already complete rather than paid again.

The July 25 production audit found existing executed settlement proof for #24.
The command is therefore now a verification/idempotency rail unless a later
audit disproves that state; it must never create a second refund.
