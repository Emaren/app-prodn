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
reviewed_at: "2026-07-31"
review_interval_days: 60
sensitivity: "internal"
---

# Live Final-Proof Visibility

Implementation baseline: `85b11ea419fb14f089500c16bb9cf8847fd685f9`.

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
