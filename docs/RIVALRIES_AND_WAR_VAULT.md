---
id: "aoe2war.app-prodn.docs-rivalries-and-war-vault"
title: "Rivalries and the War Vault"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn","api-prodn"]
audience: ["developers","ai-agents"]
source_of_truth: "git"
authority: "product-contract"
reviewed_at: "2026-07-26"
review_interval_days: 90
sensitivity: "internal"
---

# Rivalries and the War Vault

**Last updated:** 2026-07-11

This document records the shipped replay-history architecture for
AoE2WAR.

The governing rule is:

> One replay remains one historical battle, while every legitimate
> rivalry receives the correct cumulative history.

The system must never turn teammates into opponents or flatten an
exact team battle into fake one-on-one games.

## Public routes

### `/battle-archive`

The Battle Archive is the War Vault: the chronological collection of
safely surfaced replays.

Current contract:

- one archive card per replay;
- newest-first filing;
- a running Total Filed count;
- subtle sequential vault stamps such as `#2875`;
- map, result, participants, time, replay link, rivalry link, betting
  market link when present, and direct `/game-stats/[id]` access;
- the total represents the full filed collection even when only the
  newest working set is initially rendered.

### `/game-stats/[id]`

This is the authoritative detail surface for one replay.

It links back to the canonical rivalry:

- two-player replay: `/matchups/[left]/[right]`;
- balanced 2v2, 3v3, or 4v4:
  `/matchups/team/[left]/[right]`;
- malformed or unsafe side reconstruction: no invented rivalry link.

Team rivalry destinations use the shared replay-side parser and the
same canonical roster encoding used throughout the rivalry system.

### `/rivalries`

The directory presents cumulative player and exact-team histories.

Global B/A/E behavior:

- **B — Basic:** original narrow rivalry visual language;
- **A — Advanced:** wider connected rivalry presentation;
- **E — Extreme:** full-width raw rivalry hall.

Extreme is the default for a visitor without a stored preference.
A changed B/A/E selection persists through the shared tile-view
preference system and is surfaced in Admin preference analytics.

Basic also has a page-session presentation cycle. Clicking the
`Replay-Backed Battles` heading rotates through:

1. two rivalry cards across;
2. one full-width rivalry card per row;
3. the original Basic duel composition;
4. back to the two-across layout.

The third state preserves the original duel treatment. Team entries
use a compact roster-safe adaptation so long names cannot overlap
the score.

### `/matchups/[left]/[right]`

The player rivalry route combines:

- true one-on-one duels;
- battles where the players opposed each other on separate teams;
- allied context where they fought on the same side.

Team battles affect comprehensive opposing-player history without
being misrepresented as standalone duels.

Match-feed cards open `/game-stats/[id]`. Known warrior names inside
the feed independently open their public player profiles.

### `/matchups/team/[left]/[right]`

The exact-team route preserves both complete rosters.

Supported formats:

- 2v2;
- 3v3;
- 4v4.

Each route contains two base64url-encoded JSON arrays of canonical
public-player tokens. Roster order and side order are normalized so
equivalent teams cannot create duplicate rivalry URLs.

Recent-battle cards open `/game-stats/[id]`. Warrior names open their
player pages.

The Individual Rivalry Matrix keeps each cross-side player-rivalry
card clickable while each warrior name independently opens that
warrior's profile.

## Replay-side reconstruction

`lib/replaySides.ts` owns safe side reconstruction.

A valid exact-team rivalry requires:

- exactly two sides;
- equal roster sizes;
- 2, 3, or 4 players per side;
- explicit team evidence, including valid zero-based team IDs such as `0` and `1`;
- canonical public-player tokens;
- no duplicate member inside a roster.

Unsafe or malformed team data is quarantined instead of being
converted into misleading rivalry records.

## Rivalry aggregation

`lib/publicMatchups.ts` owns the public rivalry model.

It provides:

- player-pair rivalry context;
- exact-team rivalry context;
- latest-rivalry activity;
- duel, 2v2, 3v3, and 4v4 counts;
- cumulative wins, losses, and unresolved results;
- navigation among player, team, game-stats, archive, and profile
  surfaces.

Important invariants:

- one replay creates one archive entry;
- teammates do not become opposing meetings;
- a team replay does not fan out into multiple recent-activity cards;
- the latest rivalry is the cumulative series changed by the newest
  battle, not merely a duplicate latest-game card;
- unresolved results remain visible and do not silently become wins
  or losses.

## Winner-truth safety

The watcher may occasionally finish a two-player replay without a
complete postgame block.

The application accepts the narrow recovered result only when every
condition below is true:

- parse reason is exactly
  `watcher_inferred_opponent_win_on_incomplete_1v1`;
- there are exactly two named players;
- a stored winner exists;
- exactly one reliable player winner flag exists;
- the stored winner and the sole reliable flag agree.

Only that internally consistent shape is eligible for public
statistics and betting settlement. Broader inferred or contradictory
results remain rejected.

## Navigation graph

    Battle Archive
        -> Game Stats
            -> Player Rivalry or Exact Team Rivalry
                -> Game Stats

    Rivalry Match Feed
        -> Game Stats

    Warrior Name
        -> Player Profile

    Individual Rivalry Matrix
        -> Player Rivalry

Visible action copy is intentionally minimal where the card itself is
the obvious click target.

## Operational verification

The completed production pass was verified with:

- successful Next.js production build;
- active `aoe2hdbets-web.service`;
- HTTP 200 responses for player rivalry, exact-team rivalry, duel
  game-stats, and team game-stats routes;
- clickable player and team match-feed cards;
- player-profile links inside both match feeds;
- clickable Individual Rivalry Matrix cards and profile names;
- preserved game-stats-to-rivalry crosslinks;
- no visible redundant `Open Stats` or matrix
  `Open Player Rivalry` labels.

## 2026-08-17 identity authority boundary

Exact SteamID64 is the sovereign replay participant key whenever it is present.
Replay display names are observations, not merge keys. Composite comma-name
observations remain raw evidence and must not be split into aliases for another
account.

Replay-player snapshots narrow candidate game IDs; they do not replace GameStats
truth. Pair summaries must independently prove both canonical players in the
same cleaned GameStats row. Watcher uploader/site UID proves upload provenance,
not participant identity.

The Zodiac/somniosator release canary resolves five legitimate meetings:
one 1v1 opponent game, one team-opponent game and three teammate games. Zodiac
is 2-0 when opposed; together they are 1-2. Game 23876 is excluded because the
display string containing Zodiac belongs to the Brian/Trunks Steam account and
the exact Zodiac Steam account is absent.
