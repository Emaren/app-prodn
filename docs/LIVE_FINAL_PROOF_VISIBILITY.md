---
id: "aoe2war.app-prodn.docs-live-final-proof-visibility"
title: "Live Final-Proof Visibility"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn","api-prodn","aoe2-watcher"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "product-contract"
reviewed_at: "2026-08-08"
review_interval_days: 60
sensitivity: "internal"
---

# Live Final-Proof Visibility

Implementation baseline: `ea28fcbe378bb37fb78f5347734fef8a4768f453`.

## Problem

A watcher can submit a final replay artifact before the parser has enough
trusted evidence to resolve the result. Historically, that newer final row
suppressed the corresponding live row and caused the battle to disappear from
the public live surface.

## Contract

An unresolved `watcher_final` row may remain visible on the active command
surface for a bounded 15-minute final-proof window.

During that window:

- the battle is labeled **Final proof pending**;
- the previously captured roster and battle context remain visible;
- the session is excluded from active market lookup;
- no live betting call to action is enabled;
- market status is `awaiting_final_proof`;
- settlement is not eligible;
- trusted final results bypass the hold and move directly to Completed.

The visibility hold changes presentation only. It does not reopen betting,
downgrade final transport evidence, or authorize settlement without canonical
result truth.

## Deadline and refresh invariants

- Entering `awaiting_final_proof` and persisting `proof_deadline_at` are one
  lifecycle transition, including direct unresolved-final market seeds.
- An existing deadline is immutable. A legacy or anomalous null deadline gets
  one fresh bounded migration grace when repaired; after it is persisted,
  reconciliation cannot restart it from `updated_at` or worker time. A desync
  child inherits an already-persisted parent deadline.
- Repair runs before expiry. Expired winner propositions void first, linked
  desync propositions follow their terminal parent, and the normal settlement
  rail returns each active stake exactly.
- `/bets` refreshes every two seconds while visible and immediately after
  focus/visibility resume. `/live-games` refreshes every five seconds with the
  same foreground contract.
- Expired live-snapshot cache hits wait on one coalesced fresh load. Stale truth
  is only a refresh-failure fallback, never the healthy-path response while a
  refresh runs.


<!-- AOE2WAR:TERMINAL_RESULT_EXIT_FROM_PENDING_V3:START -->
## Decisive 1v1 exit from pending

A final rated HD 1v1 may leave the pending presentation when
`replay-terminal-action-tail-v3` appends a valid stats-only effective result.
The completed battle then shows the later-active player as winner through the
normal adjudicated-result projection.

This transition requires the exact terminal activity fences documented in the
HD Replay Truth Pipeline. It does not turn Watcher transport success into
settlement truth. The automatic row remains `affectsBets = false`; a linked
market stays on the separate operator financial-authority rail.
<!-- AOE2WAR:TERMINAL_RESULT_EXIT_FROM_PENDING_V3:END -->
