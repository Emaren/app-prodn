# Team Market Integrity

## Product law

No confident teams, no market. No matching final roster, no settlement.

Watcher-created 2v2, 3v3, and 4v4 books require exactly two complete, equal-size teams from explicit replay team IDs. Team ID `0` is valid. Player-array order, display names, and aliases never assign team membership. A game with incomplete or conflicting team evidence may remain visible on `/live-games`, but it has no betting controls.

## Data path

`api-prodn/utils/replay_team_contract.py` normalizes replay players once and preserves name, Steam identity, civilization, color, position, team ID, player number, winner flag, score, rating snapshot, EAPM, and achievements when present. The API stores those canonical players in `game_stats.players` and stores `team_resolution` in `key_events`.

`lib/liveSessionSnapshot.ts` merges replay iterations by stable player identity, retains the most complete evidence, and blocks on roster-size or team-assignment conflicts. `lib/teamResolution.ts` is the app-side resolver shared by live presentation, market creation, proposition hashing, final settlement validation, and audit tooling.

## Immutable proposition

A bettable market persists its format, resolution status/provenance/confidence, left/right roster snapshots, source iteration, roster hash, and proposition hash. The first accepted stake atomically writes the roster/betting/first-stake lock timestamps. Later replay changes never rewrite a locked proposition; they close the book and create a deduplicated `roster_changed_after_stake` incident.

Settlement requires a trusted final replay from the linked game/session, the same complete player identities, the same two team assignments and proposition hash, coherent winner/loser flags for every player, a compatible winner string, and final betting eligibility. Failure creates `settlement_integrity_blocked`, sets the market to `under_review`, and creates no payout, fee, or bonus. `voided` is terminal: later seed reconciliation or genuinely new final replay evidence may add review context but can never restore `settled`, a winner side, betting controls, or interrupt a queued correction. A final replay already linked as the integrity evidence is not misclassified as `late_final_after_void`.

## Operator surfaces and events

- `/admin/market-integrity` shows review markets, incidents, exact financial adjustments, and pending player aliases.
- `/bets/[marketId]` shows the immutable team source/lock state and incident correction context without exposing parser JSON.
- Durable event/incident names include `market_proposition_locked`, `roster_changed_after_stake`, `settlement_integrity_blocked`, `late_final_after_void`, `market_voided_invalid_teams`, `corrective_refund_queued`, `corrective_refund_completed`, and `market_overpayment_detected`.
- Aliases resolve identity only. Pending `player_identity_aliases` require commissioner review and never supply team membership.

## Historical audit

Run the audit read-only after the integrity migration:

```bash
node scripts/audit-watcher-team-markets.mjs --out-dir runtime/team-market-audits
```

It writes deterministic JSON, CSV, and Markdown and classifies every watcher team market as `safe`, `needs_review`, `invalid_team_assignment`, `financial_correction_required`, or `insufficient_evidence`. It never splits player order and never mutates a market. Additional repairs require exact evidence and explicit operator approval.

## Exact incident repairs

Both repair commands default to dry-run, check locked production facts, write mode-`0600` evidence under `runtime/market-integrity-backups`, require an explicit confirmation token to apply, and support `--verify`. They preserve stake/payout tx hashes and all ledger history. A void returns each original accepted stake exactly once, charges no fee, pays no winner/founder bonus, and never auto-debits an overpaid wallet.

```bash
node scripts/repair-invalid-team-market.mjs --market-id 345524
node scripts/repair-invalid-team-market.mjs --market-id 345524 --apply --confirm VOID-INVALID-TEAMS-345524-50000-48000
node scripts/repair-invalid-team-market.mjs --market-id 345524 --verify
```

`scripts/repair-unpaid-invalid-team-market.mjs` is the same evidence-locked pattern for a confirmed invalid market with one unpaid stake. Never turn either script into a heuristic bulk-refund tool.

The ordinary correction rail returns only `amount_still_owed_wolo` from the configured Bet Escrow signer—the custody account that received the stake, not the winner-payout reserve. Its unique incident/wager memo and escrow sender are checked against WoloChain before retry, and the distinct-send guard must pass before the claim or wager is marked paid. Market reconciliation is single-flight inside the production web process so independent route triggers cannot race two escrow transfers against the same account sequence. A fully returned incident is marked `resolved`/`refunded`; `resolved_overpayment`/`corrected_with_overpayment` is reserved for cases with a preserved prior overpayment. An amount already paid above the void entitlement remains an incident overpayment with `automaticClawback=false`; a voluntary return requires the user's explicit signed transaction.

## Release order

1. Back up the affected database tables and exact incident rows; record SHA-256 hashes.
2. Deploy API contract changes.
3. Pull the exact app commit and run `npx prisma migrate deploy`.
4. Verify new columns, tables, constraints, and indexes.
5. Build and restart the web service; inspect API/web logs and public routes.
6. Generate the read-only historical audit.
7. Dry-run, apply, trigger the ordinary correction rail, and verify each approved incident repair.
8. Re-run the audit and preserve both reports.

Never run `prisma migrate reset`, delete financial history, rewrite an on-chain description, or reopen a voided market automatically when late final evidence arrives.
