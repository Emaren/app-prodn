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
- Extreme viewport ownership so the outer document and global footer do not move while the Living board is active;
- Spotlight navigation confined entirely to the ranked viewport;
- compact Last 10 W/L form derived from existing replay evidence;
- rolling 30-day W-L form;
- responsive Auto columns that maximize useful competitive information for the available display width;
- account-persisted Custom column visibility;
- Last Played available as an optional metric rather than permanent prime real estate;
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


### Living command experience seal — 2026-08-15

The Extreme Living Leaderboard interaction campaign is sealed with the following
presentation contract:

- Extreme owns the full-height flagship Living canvas and independent ranked
  scroll viewport.
- Whole desktop warrior rows own drilldown interaction except for explicit
  interactive descendants.
- Row detail is persisted as Inline, Docked, or Modal. Inline is the default
  and preserves the certified production warrior expansion and player link.
- Mobile continues to use inline expansion.
- The hero keeps the Broadcast Rail composition: identity left, podium
  hard-right, Watcher rail below the podium.
- The public title cycle contains exactly six approved identities:
  AoE2 Beveled Steel Dark, AoE2 Beveled Steel, Spartan Bronze,
  Titanium Legion, Cobalt Armor, and AoE2 Logo Gunmetal.
- A seventh No Title state removes the complete title wrapper and decorative
  rule from layout and compacts the remaining hero controls naturally.
- Titanium Legion is the canonical default for a new title preference.
  Explicit persisted choices remain respected.
- Historical experimental numeric title definitions remain internal only for
  preference-index compatibility and are not reachable through the public cycle.
- Rank Window, Hidden Warriors, and Columns are contextual command popovers.
  Clicking anywhere outside an open box closes it; Escape closes it; clicking
  inside the box remains interactive.
- Command sorting is server-authoritative. Warm command-sort projections are
  cached so the board can transition quickly without inventing client-only rank
  truth.
- Spotlight and rank-window navigation use direct canonical projections rather
  than traversing all earlier ranks.
- Spotlight canonical return reuses warm cached board state immediately.
- Last 10 and rolling 30-day W-L remain scan-first competitive metrics.
- Auto/Custom columns remain persisted presentation state.
- Basic, Advanced, and Extreme switching changes presentation without refetching
  ranking truth.
- The local production-data preview remains development-only and read-only:
  production public leaderboard truth may be read, but production Steam OAuth,
  auth writes, presence writes, and leaderboard-preference database writes are
  not enabled by preview mode.

The Living performance law remains unchanged: no deep-fact preload for the full
warrior population, no full-rank Spotlight traversal, no content-width animation,
no avoidable layout shift, and no base-board network fetch merely to change
presentation.

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

## 2026-08-17 identity and candidate-index boundary

Leaderboard and profile identity use exact SteamID64 across observed display
name changes. Historical standalone aliases remain searchable inside the same
exact Steam account; composite observations are exact-full-query evidence only
and cannot leak component names into another account.

Exact-Steam profile history may use replay-player snapshots as a candidate
index, but public GameStats cleanup and exact participant verification remain
the truth gate. Production release validation includes a recent-final
**public-profile-eligible** snapshot coverage audit so a partially stale
candidate estate cannot silently omit current exact-Steam matches. The audit
uses canonical replay-player normalization and intentionally excludes the same
under-60-second `no_rated_result` / not-completed early exits that public player
profiles already classify as no-game replays.
