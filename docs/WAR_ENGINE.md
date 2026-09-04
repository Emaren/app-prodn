---
id: "aoe2war.app-prodn.docs-war-engine"
title: "The War Engine"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn","api-prodn"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "replay-evidence-escalation-contract"
reviewed_at: "2026-09-04"
review_interval_days: 30
sensitivity: "internal"
---

# The War Engine

The War Engine is AoE2WAR's escalation path for replay files whose normal parser evidence cannot prove a competitive result.

## Evidence ladder

1. Header Scan
2. Event Parse
3. Fast Verdict Replay
4. Full Battle Reconstruction
5. Visual Forensic Playback
6. Human Adjudication

A higher tier may recover more state, but it cannot invent events that were never recorded. Every public classification must therefore remain one of:

- Verified Result
- Reconstructed Result
- Likely Outcome
- Inconclusive Recording
- Aborted Battle
- Human Adjudication Required

## Authority boundary

War Engine cases, events and runs are append-only. Every run is constrained to:

- `candidate_only = true`
- `affects_public_aggregates = false`
- `affects_bets = false`

A War Engine run never changes `game_stats`, rivalry totals, markets, wagers, claims, settlement or chain state. Statistical publication requires a separate accepted projection or result adjudication. Historical betting state is permanently locked.

## Founding corpus

The first seven cases are the recovered Emaren–Julio recordings from games 108, 1964, 1967, 2979, 2981, 2994 and 5003. Standard parsing and private Engine Room runs completed without trusted winner evidence. Game 5003 has immutable historical market activity and is explicitly protected from financial reinterpretation.
