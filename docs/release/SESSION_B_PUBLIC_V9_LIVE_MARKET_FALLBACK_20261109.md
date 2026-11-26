---
id: "aoe2war.app-prodn.session-b-public-v9-live-market-fallback-20261109"
title: "R25 finance-restricted published v9 current market preview"
type: "historical"
status: "historical"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["developers", "operators", "ai-agents"]
source_of_truth: "historical-evidence"
authority: "dated incident evidence only; no current operational authority"
reviewed_at: "2026-11-25"
review_interval_days: 0
sensitivity: "public"
---

# R25 finance-restricted published v9 current market preview

> **November 25, 2026 — documentation disposition (source only).** Historical disposition: preserve the original November incident record and its subsequent source review verbatim. Prior authority label: nonfinancial App SELECT on already-approved public v9 view only. All process IDs, receipts, commands, source pins and deployment claims below refer to their original observation only. Do not execute old controllers or treat this record as current admission; use the current Factory and separate financial authority. No renewed operational approval or physical attestation.


## Physical source and schema verification

At 18:45 UTC November 9, Session B physically checked PostgreSQL16 on HEL1 in BEGIN READ ONLY transaction under exact role aoe2war_web_prod. The already-authorized aoe2war_public_v9.published_markets view returned 3462 rows total, zero eligible active (open, live, closing, awaiting_final_proof), and zero active of any integrity status. The role has SELECT on this view, but no direct SELECT or INSERT/UPDATE/DELETE privilege on the raw public.bet_markets table. The sealed root-only physical report SHA-256 is bbb2085d847506898025066d696e3fede6c8973f0141e05e0557f7a56e1dae28; status PASS_APPROVED_PUBLIC_V9_MARKET_READ_FENCED.

Critically, the actual pg_get_viewdef contains no status filter. The published v9 view would include open/live/closing/awaiting_final_proof rows when they exist; the absence of those statuses in the current census is a real source observation, not proof the view excludes them. The view already projects 14 nonfinancial public columns, of which this App route selects only 10 safe card fields and requires publicIntegrityEligible true. It does NOT present seed funding as actual liquidity, infer payouts, expose personal wager/slips or support any financial execution.

## App-only acceptance boundary

The existing GET /api/bets/public-history performs exactly two bounded SELECTs on the *same already-approved* v9 view: the pre-existing historical 48-row archive and an additional integrity-eligible 48-row active-market preview. No new route is introduced; existing 88-page/283-handler inventories remain source-compatible. Only published statuses, labels, market identifiers and closing times are projected. No DML or other SQL is needed. HTTP200 means only that the approved public archive and preview loaded; zero active rows are explicitly NO_ELIGIBLE_PUBLISHED_ACTIVE_MARKETS inside publicLivePreview. A missing view, denied access, malformed query or source error returns HTTP503 and must NOT be converted into a successful empty market.

The existing PublishedBetHistoryFallback component within the finance-held Betting Hall now displays the integrity-gated current-market preview before its already-working historical archive, validating both schemas and every false financial flag. No new page or route identity is created. It never exposes wager, stake, claim, balance, pending settlement or admin controls. This is a source-only App extension: it does not alter the original /api/bets full BetBoardSnapshot route, its protected finance-read 503, and does not convert its current HTTP500 to false HTTP200. Existing full signed-in role functionality still must be accepted separately. This source is not deployed until exact-head CI, guarded release/rollback and genuine signed-in/browser and live runtime testing.

## Financial isolation

No Chain keys, role grants, financial ownership changes, Satchel 8094/8095 activation, legacy 8092/8093 fallback, public payout proof, wallet movement, funded service or chain reset. Session A retains financial SQL and recovery authority; C03_APP_HANDOFF=HOLD and C02_APP_TRANSPORT=HOLD.


## November 17, 2026 — WE2 historical-source re-review

This is a **dated November 9 draft/source-and-incident record**, not the current
HEL1 release procedure, current process-ID census, operational signer permit,
or proof that its proposed Steam/rollback runtime is now installed. Statements
such as “current PID,” “original runtime” and candidate BUILD_ID in the
historical sections refer to their recorded November 9 observation. The
November 16 public website had source
`09ff9eeccb93b4701d1cfd1ff329f0286cdc6e16`, with the existing
Factory V3 controller and finance sockets 8092–8095 closed; the proposed
nonfinancial follow-up PR #1394 has separate exact-source review, Factory and
authenticated browser gates. Never run a historical controller or trust an
old source-pinned permit against the newer runtime. All WoloChain custody,
writer fences, funding, C02/C03/05/06/07/09 and independent restores remain
under WE1 authority; nothing in this re-review authorizes financial SQL,
native 8094/8095, customer funds or changes to protected services.

This WE2 `aoe2war-web` source-owner review renewed the **historical-document
freshness only**. It does not re-attest the original host's transient PID,
systemd, NFT, PostgreSQL or memory measurements. New physical assertions
require a fresh, source-bound operational receipt.
