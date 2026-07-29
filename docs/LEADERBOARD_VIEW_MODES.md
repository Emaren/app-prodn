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

Implementation baseline: `c8b11c0373f6b276b34870d535bda35d656a2ccf`.

## Contract

`/leaderboard` owns a persistent Basic, Advanced, and Extreme presentation
preference under the `leaderboard` tile-view key.

Advanced is the default for visitors who do not already have a saved
leaderboard preference. Previously saved Basic, Advanced, or Extreme choices
remain respected.

The B/A/E selector is positioned in the upper-right corner of the leaderboard
surface.

## Basic

Basic preserves the compact legacy presentation:

- controlled maximum width of `72rem`;
- original hero hierarchy;
- RM/DM lane selector;
- compact Warriors and Kingdom scope selector;
- identity and rank-pulse metric row remains visible;
- standard leaderboard table padding.

## Advanced

Advanced is the default public composition:

- maximum width of `90rem`;
- compact branded AoE2WAR Watcher card;
- premium Warriors and Kingdom scope selector modeled after RM/DM;
- administrative identity metric row is removed;
- leaderboard table begins directly beneath the controls;
- B/A/E selector remains in the surface’s upper-right corner.

## Extreme

Extreme is the widest command composition:

- maximum width of `118rem`;
- full branded AoE2WAR Watcher card;
- premium Warriors and Kingdom scope selector;
- administrative identity metric row is removed;
- expanded desktop width and reduced outer padding;
- B/A/E selector remains in the surface’s upper-right corner.

## Scope terminology

The public scope choices are intentionally concise:

- `Warriors`: the complete public identity board;
- `Kingdom`: public claimed AoE2WAR profiles.

The old `All Players`, `AoE2WAR Users`, and claimed-count subtitles are not part
of the current control.

## Watcher card

The card retains the AoE2WAR Watcher logo and the `/watch` call to action.

The public reconstruction disclaimer and the `Open Game Stats` link are removed
from this leaderboard presentation.

## Data behavior

View mode changes presentation only. RM/DM lane, Warriors versus Kingdom scope,
search, pagination, ranking, identity folding, and reconstructed 24-hour
movement retain their existing underlying contracts.

## Administrative metrics

The census tiles are not part of Advanced or Extreme. Their canonical long-term
home is an authenticated administrative dashboard rather than the wide public
leaderboard presentation.
