---
id: "aoe2war.app.r25-bets-public-history-readmodel"
title: "R25 Bets Published Historical Read Model Under Financial HOLD"
type: "reference"
status: "draft"
owner: "aoe2war-web"
systems: ["aoe2war"]
audience: ["developers", "operators", "ai-agents"]
source_of_truth: "git"
authority: "nonfinancial-read-model-source-only-not-funded-or-live"
reviewed_at: "2026-11-23"
review_interval_days: 7
sensitivity: "restricted"
---

# R25 Bets Published Historical Read Model Under Financial HOLD

## Confirmed actual web failure and source distinction

On Nov 7 2026 the running isolated R25 public GET /api/bets returns HTTP 500 while other public R25 pages remain on 3032. This is not a second or wrong database. The restricted production PostgreSQL role aoe2war_web_prod has SELECT on 25 of 190 public HD tables but cannot SELECT the raw financial tables demanded by the full BetBoardSnapshot loader.

The held App source as of merge 7b7add8e37411ff7700facd04d3dda8161fc81f0 already invokes the full loader with ensureMarkets: false and has removed queueBetMarketEnsure from GET /api/bets. The preserved legacy deployed 3030 app still has the older queueBetMarketEnsure side effect. The older handler may schedule financial DB writes from GET and MUST NOT be used as a simple proxy fallback.

## Physical approved public view discovery

On HEL1, actual PostgreSQL role-switched source transaction used:
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL ROLE aoe2war_web_prod;
SELECT id,status,"publicIntegrityEligible" FROM aoe2war_public_v9.published_markets
WHERE "publicIntegrityEligible" IS TRUE
ORDER BY "settledAt" DESC NULLS LAST,id DESC LIMIT 5;
ROLLBACK;

The existing approved v9 public view is SELECTable to the isolated role without additional grants. Live read-only catalog counted 3428 historical markets, 1458 wager records and 2433 claim records in three separate published v9 views. Market statuses: 2437 settled, 778 voided, 213 under_review. The view recorded publicIntegrityEligible for 1038 settled, 421 voided and 105 under_review rows.

The counts and status labels are DATABASE observations, not independent on-chain settlement verification. There were no open markets in the inspected view. Never fill current markets, personal balances or payout states with invented zero values.

## Narrow source-only implementation

New endpoint app/api/bets/public-history/route.ts exports GET alone, with one literal bounded 48-row parameter-free SQL SELECT on the existing aoe2war_public_v9.published_markets view. It requires the published view's publicIntegrityEligible flag and only three historical statuses. It returns market titles, sides and recorded status/date metadata, with explicit financialExecutionAuthorized=false, acceptingWagers=false, approvingPayouts=false, onchainPaymentFinalityVerified=false and personalWagersIncluded=false.

No raw wager/claims table, user ID, wallet address, payout transaction hash, payment amount, private signer, settlement service, RPC, background ensure, direct 3030 proxy, database role change, DDL or financial runtime is touched.

Errors return HTTP 503 HOLD_PUBLIC_HISTORY_READMODEL_UNAVAILABLE with no-store headers; no simulated success or fake financial amount. The existing /api/bets handler is NOT changed. A subsequent, separately reviewed BetsPage UI adds a read-only archive fallback only when the live restricted board has returned no payload. The fallback never represents unknown personal balances, current wagers, or payout finality as measured zero. Source integration is not the same as a staged R25 build release.

## Release and financial boundary

Source static negative tests, current Next TypeScript and complete production-build CI, and isolated R25 runtime SELECT permission check must all PASS before any deployment. Real login and browser acceptance, public historical display usability, strict 3030/3032 rollback, Steam policy re-admission after any new build and intact six Nginx protected selectors remain mandatory.

This endpoint is not a betting engine. C01-C09 and the C03 DB/full chain financial writer fence remain HARD HOLD. 8094/8095 remain inactive. No funded transaction or WOLO transfer is authorized.

## 2026-11-15 substantive protected-source re-review — current accepted release

**Review scope and provenance (2026-11-15, 18:53–18:55 UTC).** This is a new source-and-read-only-host comparison of the original November 7 historical evidence, not a rewrite of that incident or a FINANCIAL certification. The original November 7 statements above remain historical assertions at their stated times. Source examined on the WE2 integration tree `83d09e67ede8d502748d0a99b90a3ef8864fdfea` (unchanged historical document blob `2f1912b75f18cc403814556e78fb4a2573aada32`), against the actual accepted website source and the accepted Factory/root receipt in [PR #1358 comment #6886458435](https://github.com/Emaren/app-prodn/pull/1358#issuecomment-6886458435). This source-only review is owner-directed WE1 work through the authenticated GitHub `Emaren` admin account; it is **not** a claim of a second human signature or fresh financial, signer, or root-file attestation.

**Correct present-day HTTP distinction.** A fresh read-only HEL1 loopback check at **2026-11-15 18:53:39 UTC** found the accepted website `9c5fb786b06636a813235bc13cb2cdffaf51ffc4`, BUILD_ID `tODeDszM3vE1kOKcQUQjZ`, serving `GET /api/bets` **HTTP 503** and `GET /api/bets/public-history` **HTTP 200**. The historical **November 7 HTTP 500** above is real history; it is **not** the current guarded response. Current source `app/api/bets/route.ts` (blob `df836b36b324a2886a8e37c97bdca79109a06f41`) catches explicitly recognized protected finance-table permission denials and returns a no-store 503 HOLD via `lib/betsPublicReadHold.ts` (blob `eb25a0f7564f2e297d5e69e45266ba2d01fd89cb`); unrelated unexpected errors may still use 500. No route to the older 3030 market-ensure writer is authorized.

**Current public projection differs from the original narrow implementation.** The November 7 design described **one** bounded 48-row SELECT for historical statuses. The current `app/api/bets/public-history/route.ts` at the integrated source (blob `1e3cf7d7ae47e090bbb77c9701aa799ab79d614a`) performs **two** separately bounded, read-only `SELECT` queries against the existing published v9 view: one for `settled/voided/under_review` history and one for a `open/live/closing/awaiting_final_proof` **public published-market preview**, each at most 48 rows, each requiring `publicIntegrityEligible`. The preview is **not** authorization to trade, proof of actual liquidity, a complete market census, custody, payout, user balance, or on-chain payment finality. The handler explicitly returns `financialExecutionAuthorized=false`, `acceptingWagers=false`, `approvingPayouts=false` and `onchainPaymentFinalityVerified=false`. The November 7 v9 totals (3,428 markets / 1,458 wagers / 2,433 claims, plus historical statuses and eligibility counts) were **not re-counted** on November 15 and must not be advertised as today's database totals.

**Continuing fence.** [PR #1358's accepted Factory/reboot receipts](https://github.com/Emaren/app-prodn/pull/1358#issuecomment-6886458435) establish the older accepted PRODUCT release, not the pending 50-file PR #1370. Fresh 18:53 UTC listener observation found 3030/3032/3033/9447 present and **no** listeners on 8092–8095. C08 governance was later closed separately; the remaining seven FINANCIAL gates C01/C02/C03/C05/C06/C07/C09 are not admitted, and funding, writer privileges and on-chain settlement remain **DENIED**. No SQL queries, grants, financial service changes, or release operations were performed in this review.

## 2026-11-23 substantive R25 guarded-read source drift reconciliation

Read the complete historical 2026-11-07 HTTP500/role failure, Nov15 current 503/read-only public-history evidence, two independently bounded published v9 projection queries and historical database counts. At PR #1486 head `5b83f0881da3d2ba67805efe1e8739378cbb8adf`, `app/api/bets/route.ts` blob **`df836b36b324a2886a8e37c97bdca79109a06f41`** and `app/api/bets/public-history/route.ts` **`1e3cf7d7ae47e090bbb77c9701aa799ab79d614a`** match the Nov15 reviewed routes. The separate protected helper **changed** from `eb25a0f7564f2e297d5e69e45266ba2d01fd89cb` to `lib/betsPublicReadHold.ts` blob **`45330520d25d511a0102f8704ae900300f99a4ec`**: it now explicitly includes **`bet_auto_presets`** among the narrowly recognized restricted finance-table SELECT denials.

The helper returns a no-store explicit **HTTP503 `HOLD_RESTRICTED_PUBLIC_BOARD_READ`** when and only when the Prisma error code is `P2010` or `P2039`, message contains exact SQLSTATE `42501`, and the denied table is on the fixed restricted list. Unknown table `users`, unrelated error code `P2002`, SQLSTATE `23505` or malformed error **must not** be converted into approved finance access or silently disguised as this HOLD (original 500 handling remains for unrelated errors). The existing `tests/bets-restricted-public-read-hold.test.mts` covers `bet_auto_presets` positive and these negative cases. Recognition of a protected **read denial** does not grant SELECT, enable automated betting/presets execution, launch a legacy 3030 market writer, create a payout or change user funds. Public historical and preview counts remain bounded published-view metadata, not chain settlement finality, liquidity or balances. The 2026-11-07/15 HTTP evidence stays dated; **no new November 23 authenticated bets endpoint response was asserted**. Fresh port inspection found 8092–8095 closed and financial gates remain HOLD; current unrelated website source/BUILD `890d9dcc22d0`/`0NEGtfP0ieSzETh1JHGhE` is separate release evidence.
