---
id: "aoe2war.app-prodn.session-b-public-v9-live-market-fallback-20261109"
title: "R25 finance-restricted published v9 current market preview"
type: "runbook"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["developers", "operators", "ai-agents"]
source_of_truth: "git"
authority: "nonfinancial App SELECT on already-approved public v9 view only"
reviewed_at: "2026-11-09"
review_interval_days: 7
sensitivity: "public"
---

# R25 finance-restricted published v9 current market preview

## Physical source and schema verification

At 18:45 UTC November 9, Session B physically checked PostgreSQL16 on HEL1 in BEGIN READ ONLY transaction under exact role aoe2war_web_prod. The already-authorized aoe2war_public_v9.published_markets view returned 3462 rows total, zero eligible active (open, live, closing, awaiting_final_proof), and zero active of any integrity status. The role has SELECT on this view, but no direct SELECT or INSERT/UPDATE/DELETE privilege on the raw public.bet_markets table. The sealed root-only physical report SHA-256 is bbb2085d847506898025066d696e3fede6c8973f0141e05e0557f7a56e1dae28; status PASS_APPROVED_PUBLIC_V9_MARKET_READ_FENCED.

Critically, the actual pg_get_viewdef contains no status filter. The published v9 view would include open/live/closing/awaiting_final_proof rows when they exist; the absence of those statuses in the current census is a real source observation, not proof the view excludes them. The view already projects 14 nonfinancial public columns, of which this App route selects only 10 safe card fields and requires publicIntegrityEligible true. It does NOT present seed funding as actual liquidity, infer payouts, expose personal wager/slips or support any financial execution.

## App-only acceptance boundary

The existing GET /api/bets/public-history performs exactly two bounded SELECTs on the *same already-approved* v9 view: the pre-existing historical 48-row archive and an additional integrity-eligible 48-row active-market preview. No new route is introduced; existing 88-page/283-handler inventories remain source-compatible. Only published statuses, labels, market identifiers and closing times are projected. No DML or other SQL is needed. HTTP200 means only that the approved public archive and preview loaded; zero active rows are explicitly NO_ELIGIBLE_PUBLISHED_ACTIVE_MARKETS inside publicLivePreview. A missing view, denied access, malformed query or source error returns HTTP503 and must NOT be converted into a successful empty market.

The existing PublishedBetHistoryFallback component within the finance-held Betting Hall now displays the integrity-gated current-market preview before its already-working historical archive, validating both schemas and every false financial flag. No new page or route identity is created. It never exposes wager, stake, claim, balance, pending settlement or admin controls. This is a source-only App extension: it does not alter the original /api/bets full BetBoardSnapshot route, its protected finance-read 503, and does not convert its current HTTP500 to false HTTP200. Existing full signed-in role functionality still must be accepted separately. This source is not deployed until exact-head CI, guarded release/rollback and genuine signed-in/browser and live runtime testing.

## Financial isolation

No Chain keys, role grants, financial ownership changes, Satchel 8094/8095 activation, legacy 8092/8093 fallback, public payout proof, wallet movement, funded service or chain reset. Session A retains financial SQL and recovery authority; C03_APP_HANDOFF=HOLD and C02_APP_TRANSPORT=HOLD.
