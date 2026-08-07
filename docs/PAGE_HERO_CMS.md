---
id: "aoe2war.app-prodn.page-hero-cms"
title: "Page Hero CMS"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["developers","ai-agents"]
source_of_truth: "git"
authority: "product-contract"
reviewed_at: "2026-08-07"
review_interval_days: 90
sensitivity: "internal"
---

# Page Hero CMS

## Contract

Media Armory owns reusable Hero Image files. Page Hero Studio owns presentation:
page assignment, ordering, enabled state, dwell time, crossfade duration, focal
point, and B/A/E eligibility.

The first wired consumer is `/game-stats` (Parser Observatory). The surface
registry in `lib/pageHeroes.ts` is deliberately broader so future page hero tiles
can adopt the same system without another persistence migration.

## Persistence

No new database table is introduced. The system reuses the existing generic Hero
schema:

- `ManagedMediaAsset(kind="hero", target=null)` = reusable Hero Image library
- `HeroPlaylist(key="page-hero-<surface>")` = one ordered chain per page surface
- `HeroScreen(key="page-hero-<surface>-<assetId>")` = image source plus B/A/E,
  focal-point, and overlay configuration
- `HeroPlaylistItem` = ordering, enabled state, and optional dwell override

Homepage/lobby Hero Studio filters `page-hero-*` screens out of its own screen
library. The Main Stage and page-specific Hero chains therefore share trustworthy
persistence without sharing editorial controls.

## Runtime

`PageHeroRotator` server-renders the chain markup with the first image visible,
preloads the next image after hydration, and crossfades passively. There are no
arrows, dots, progress meters, or slideshow controls. Reduced-motion viewers stay
on a still image.

Page routes call `loadPageHeroChain(surface, view)` and pass the result to the
shared rotator. An empty chain is safe: the page's native gradient/background
remains visible.

## Parser Observatory B/A/E

- **B**: slim presentation; three headline metrics; corpus cards become compact;
  advanced review and research panels are omitted.
- **A**: wider; all headline metrics; adds the recovery frontier, unknowns,
  unresolved battles, and roadmap.
- **E**: widest; adds extraction coverage, advanced evidence lanes, current Engine
  Room campaign, and historical failure signatures.

All three views draw from the same managed Hero chain. An individual image can be
eligible for B, A, E, or any combination.
