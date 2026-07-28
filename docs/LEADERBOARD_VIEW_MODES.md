---
id: "aoe2war.app-prodn.docs-leaderboard-view-modes"
title: "HD Leaderboard View Modes"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn","aoe2-watcher"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "product-contract"
reviewed_at: "2026-07-28"
review_interval_days: 60
sensitivity: "internal"
---

# HD Leaderboard View Modes

Implementation baseline: `6447fd3cad63adb8886b8e982dca3550fba61c1e`.

## Contract

`/leaderboard` owns a persistent Basic, Advanced, and Extreme presentation
preference under the `leaderboard` tile-view key. The default remains Basic so
existing visitors retain the previously shipped page until they deliberately
choose another presentation.

The toggle is intentionally small and uses the established `B`, `A`, and `E`
language used by other AoE2WAR command surfaces.

## Basic

Basic is the preserved production composition:

- controlled maximum width of `72rem`;
- original hero hierarchy;
- RM/DM lane selector;
- legacy compact player-scope selector;
- identity and rank-pulse metric row remains visible;
- standard leaderboard table padding.

## Advanced

Advanced is the wider clean composition:

- maximum width of `90rem`;
- compact branded Watcher card;
- premium player-scope selector modeled after the RM/DM control;
- admin-oriented identity metric row is removed;
- tighter table spacing.

## Extreme

Extreme is the widest command composition:

- maximum width of `118rem`;
- full branded Watcher card using
  `/watcher/aoe2hd-watcher-logo.webp`;
- premium player-scope selector modeled after the RM/DM control;
- admin-oriented identity metric row is removed;
- table rises directly beneath the controls;
- expanded desktop width and reduced outer padding.

## Data behavior

The view mode changes presentation only. RM/DM lane, full-board versus claimed
AoE2WAR-user scope, search, pagination, ranking, identity folding, and
reconstructed 24-hour movement retain the same underlying contracts.

The player-scope choices remain:

- `all`: the complete public identity board;
- `claimed`: public claimed AoE2WAR profiles.

The Watcher card links to `/watch` and explains that reconstructed rank movement
is evidence-derived rather than a persisted rank snapshot.

## Administrative metrics

The census tiles are not part of Advanced or Extreme. Their long-term canonical
home is an authenticated administrative dashboard rather than the wide public
leaderboard presentation.
