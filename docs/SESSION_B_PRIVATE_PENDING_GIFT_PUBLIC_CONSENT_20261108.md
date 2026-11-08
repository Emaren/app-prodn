---
id: "aoe2war.app.session-b-private-pending-gift-public-consent"
title: "Session B Public Gift Consent — Private Pending WOLO Aggregate Source HOLD"
type: "runbook"
status: "draft"
owner: "aoe2war-web"
systems: ["aoe2war"]
audience: ["developers", "operators", "ai-agents"]
source_of_truth: "git"
authority: "source-only-public-consent-no-production-db-ddl-or-financial-release"
reviewed_at: "2026-11-08"
review_interval_days: 7
sensitivity: "restricted"
---

# Session B Public Gift Consent — Private Pending WOLO Aggregate Source HOLD

## Release scope and Chain ownership

Session B owns the public read-model source, user-interface privacy, source
tests and nonfinancial website release. Session A exclusively owns all C03
live database role/owner/grant/view-definition physical changes, legacy
signers, transaction finality and Chain C01–C09 financial release.

This document is NOT a production database migration, owner/grant change,
funded payment authority or public cutover approval.

## Concrete original source privacy defect

The restricted public player directory queries the opt-in user-gift aggregate
at aoe2war_public_v1.pending_player_gift_totals. The historical SQL source
filters WOLO, pending and amount-positive, but did not require explicit
display_on_profile=true. The legacy Prisma public directory and individual
player profile likewise queried pending gifts without display consent.

The accepted-gifts projection already correctly filters
g.display_on_profile IS TRUE, making the inconsistency observable.
Session A's protected read-only C05 census contains one pending nominal
100-WOLO gift with display_on_profile=false, alongside a separate pending
100,000-WOLO bounty-linked gift with display_on_profile=true. Public source
could include the private gift in per-player aggregate amount and count.
Source evidence alone does NOT prove the installed HEL1 view is identical
or establish which public user page currently renders the private record.
Do not export customer IDs, private note or wallet from this review.

## Exact source-only changes

1. config/nonfinancial-public-read-model-v1.sql now adds
   AND display_on_profile IS TRUE to the pending_player_gift_totals
   security-barrier view. It retains a per-user count/sum only; no
   private note, creator, wallet, receipt, payout identity or movement.
2. lib/publicPlayerDirectory.ts legacy groupBy fallback now requires
   displayOnProfile: true for pending gifts. The restricted query still
   selects only the existing named public aggregate.
3. lib/playerProfile.ts individual WOLO gift query now requires
   displayOnProfile: true for pending and accepted gift rows.
4. tests/private-pending-gift-public-consent.test.mts contains adversarial
   checks for view consent, limited grants, both read code paths, current
   pending-display wording, and private-gift exclusion using synthetic data.
   The synthetic data is not a substitute for PostgreSQL physical proof.
5. tests/test_session_b_private_pending_gift_isolated_pg.py provides a
   separately opted-in, disposable, Unix-socket-only PostgreSQL rehearsal.
   It creates synthetic 100,000 public, 100 private and 75 unknown-flag
   WOLO amounts plus independent control rows. The test executes the
   extracted exact security-barrier view SQL, checks only opted-in rows,
   proves hidden-only people vanish from the public projection, and checks
   restricted-role SELECT, INSERT, UPDATE and DELETE denial on private base
   records plus view UPDATE denial. PostgreSQL 14.18 and 16.10 both passed
   **7/7** locally with no TCP listener and clean shutdown. This is
   off-host simulation, NOT an inspection of live HEL1 financial data or
   approval to apply production DDL. Run explicitly using environment
   RUN_PUBLIC_GIFT_CONSENT_PG_TESTS=1 with the desired pg16 bin path.
6. lib/staking.ts public /api/staking/activity feed separately used
   unrestricted pending/accepted userGift.findMany and then serialized
   source gift.note in detail, calling a pending gift Claimable and
   inferring a bounty classification from private note text. The source
   now requires displayOnProfile:true, does not SELECT note, and only
   labels the event as a gift record, with payout unverified. Public
   /staking sourceTree checksum was regenerated for only /staking and
   the exact 88-route source/full inventory check passes.

This additional public HTTP surface must get native user-facing negative
browser proof as well: nonconsented pending gifts and notes must not appear
in /api/staking/activity, direct /staking page content, or cached public
responses. Source-level tests alone do not prove live HTML/API privacy.

The parent R25 public display truth branch is
4c48178a66e950ac93c47e014ff9b006e103996f (App draft PR #1235).
The source privacy branch adds these changes separately and must remain
draft until the actual live view is independently verified.

## Source integrity and independent physical gate

The historical SQL file SHA256 at the PR parent was
8e2abc0d4ab815e29a9a682e60899648d9f4e19150c623dda261a48c7d7d97e1.
The revised SQL source file SHA256 is
8bea7d41b75c9d47559a75dae47aa1d5ba15dd27ed224288bd11a53a9616cc41.
These are *source-file* hashes, NOT PostgreSQL canonical pg_get_viewdef
or installed schema authority.

The existing r25_c_start_root.py expects a different canonical
database-definition evidence fingerprint
885cb0ed6992ff828a78b6b25f4ea3e76399ad967c48d2489843a0814386138d,
which must NOT be overwritten by Session B. The reviewed new source may
therefore conflict with the old physical definition/receipt even after CI.
That is an explicit runtime HOLD, not permission to bypass the source pin.

Before any production admission Session A must independently:

- inspect the actual installed PostgreSQL pg_get_viewdef and security_barrier
  options for the specific aggregate, together with effective restricted-role
  SELECT ownership/grants and the no-financial-table-write boundary;
- determine if and where the existing source aggregate leaks private pending
  amounts through actual HTTP rendering, using minimal privacy-preserving
  evidence and without public customer identifiers;
- qualify a reversible, exact-source safe view replacement or alternative
  deny-by-default read projection on isolated HD Postgres, including
  transaction atomicity, current sessions, rollback and finance-negative DML;
- physically apply only under a separately approved C03 cross-lane window,
  re-enroll exact schema fingerprint and produce protected root receipts;
- verify one public-consented pending gift remains visible and one
  nonconsented pending gift does NOT change a public page amount; the private
  record still exists in base storage and is not deleted or cancelled.

Do not rewrite user gifts, cancel liabilities, mark paid, modify customer
public-consent flags, relax protected R25 role, or let private C05 finance
records become an alternative public presentation source.

## Stage and release invariants

This code source is not the original SHA-accepted 3bc9 44,924-file inert
runtime. It is also not the earlier 4c481 R25 UI artifact. Source acceptance
must be followed by a **new** immutable CI runtime, native PostgreSQL view
consent test, real Chrome user-facing proof, Steam approval and safe
rollback, plus effective C03 financial fence acceptance by Session A.
Never replace the original production 3032/3030 processes under unresolved
HEL1 memory pressure or use source CI as transfer authorization.

**Current status:** SOURCE-ONLY privacy correction; ACTUAL LIVE LEAK
UNDETERMINED; DATABASE VIEW MIGRATION HOLD; C01–C09 HARD HOLD.
