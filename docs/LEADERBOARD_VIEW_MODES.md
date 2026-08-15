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
reviewed_at: "2026-08-15"
review_interval_days: 60
sensitivity: "internal"
---

# HD Leaderboard View Modes

Classic visual reference baseline:
`d7cbd44c5c6b8a1ecd6c0c3211e075a43655a893`.

## Contract

`/leaderboard` owns persistent Basic, Advanced, and Extreme presentation
preferences under the `leaderboard` tile-view key.

Extreme is the default when no explicit leaderboard preference exists.
Explicitly saved B, A, or E choices remain respected.

View mode changes presentation only. RM/DM lane, Warriors/Kingdom scope, search,
pagination, ranking, identity folding, cache behavior, and leaderboard truth
remain shared contracts.

## Basic — Classic Compact

Basic is the preserved compact classic leaderboard:

- controlled maximum width of `76rem`, preserving the compact classic identity while giving the final table column deliberate breathing room;
- clean classic hero composition;
- compact branded AoE2WAR Watcher card;
- premium RM/DM selector;
- premium Warriors/Kingdom selector;
- rounded warrior search;
- no public administrative census strip;
- classic leaderboard table presentation.

Basic is a benchmark surface.

## Advanced — Classic Wide

Advanced is the preserved wide classic leaderboard:

- controlled maximum width of `90rem`;
- current classic visual composition;
- compact branded AoE2WAR Watcher card;
- premium RM/DM selector;
- premium Warriors/Kingdom selector;
- rounded warrior search;
- no public administrative census strip;
- classic leaderboard table presentation.

Advanced is the primary visual control specimen while Extreme evolves.

## Extreme — Living Leaderboard

Extreme is the default flagship leaderboard:

- controlled maximum width of `118rem`;
- dedicated Living Leaderboard presentation tree, separate from the Basic/Advanced classic tree;
- full branded AoE2WAR Watcher card;
- premium RM/DM selector;
- premium Warriors/Kingdom selector;
- no public administrative census strip;
- expanded desktop command canvas.

Extreme exclusively owns Living Leaderboard presentation and interaction.

### Living foundation

The Living foundation includes:

- a canonical podium rail;
- direct 24-hour movement sorting;
- transparent rank-pulse highlighting based only on existing movement/new-board/winning-streak evidence;
- account-persisted warrior bookmarks with guest local fallback;
- compact/comfortable row density control;
- richer scan-first warrior rows;
- inline direct-manipulation warrior expansion;
- Spotlight Me with top-of-viewport and centered modes;
- direct rank-window projection by start rank and row count;
- personal warrior hiding without renumbering canonical ranks;
- a persistent hidden-warrior recovery control;
- an inner leaderboard viewport so the ranked field scrolls independently of the page shell;
- mobile-equivalent interaction;
- no additional base-board network request and no deep-warrior preload.

Spotlight and rank-window modes fetch the requested canonical rank slice directly
through server pagination. They must never download every earlier row merely to
reach the requested warrior.

Signed-in Living preferences are account-scoped through authenticated server
state and mirror locally for immediate rendering. Guests retain local
preferences. Personal hiding is presentation-only: hiding canonical rank `#37`
must render `#36` followed by `#38`; rank truth is never rewritten.

The preference contract already reserves the standard discovery windows
`24h`, `3d`, `7d`, and `30d` plus mover directions `both`, `up`, and `down`.
Most Active, Biggest Movers, and Heat must use separate lightweight projections
rather than inflate the base leaderboard payload.

## Classic baseline boundary

Basic and Advanced are preserved reference surfaces.

New Living Leaderboard capabilities must not be added to B or A merely because
they are added to E.

Shared ranking truth, APIs, caches, and low-level primitives may remain common,
but flagship presentation and interaction belong to Extreme.

## Interaction law

Extreme should reveal depth through intuitive interaction rather than
instructional UI.

Prefer:

- hover;
- click;
- focus;
- direct manipulation;
- contextual icons;
- progressive disclosure.

Avoid explanatory paragraphs, configuration-form clutter, and permanent columns
for information that can be revealed naturally on demand.

## Performance law

The Living Leaderboard must preserve the instant leaderboard architecture:

- cached RM/DM switching remains immediate;
- cached Warriors/Kingdom switching remains immediate;
- stale-good server projections return immediately while revalidating;
- deep warrior intelligence must not inflate the base-board payload;
- hover and expansion data load progressively;
- no Extreme feature may require loading every deep fact for every warrior
  before the board becomes usable.
