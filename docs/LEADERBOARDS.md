---
id: "aoe2war.app-prodn.docs-leaderboards"
title: "AoE2WAR Leaderboards"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn","api-prodn"]
audience: ["developers","ai-agents"]
source_of_truth: "git"
authority: "product-contract"
reviewed_at: "2026-07-28"
review_interval_days: 90
sensitivity: "internal"
---

# AoE2WAR Leaderboards

AoE2WAR has two first-class HD leaderboard routes backed by current production data:

- `/leaderboard` is the modern ranked-warrior board. It reuses
  `loadLobbyLeaderboard`, folds accepted replay history by exact SteamID64 when
  present, preserves canonical RM/DM ordering and active-scope rank numbers,
  searches the complete current/alias set on the server, calculates win rate
  from wins and losses only, and paginates through
  `/api/lobby/leaderboard`.
- `/leaderboard/og` is the chronological battle board. It loads newest final replays first through `/api/leaderboard/og` and projects only the fields required by the archive cards.

The homepage leaderboard chrome and the shared Kingdom menu open the modern board. Both leaderboard pages link directly to the other view.

## Data boundaries

`lib/lobbyLeaderboard.ts` remains the ranking system of record. The dedicated page does not create a second rating or streak interpretation.

`lib/publicPlayerDirectory.ts` owns the account-grain replay projection used by
the board. `lib/leaderboardIdentity.ts` owns SteamID64 validation, identity-key
construction, name-history aggregation, and 24-hour delta state semantics.

## Identity-aware row contract

The current safe migration grain is:

1. one row per exact SteamID64 when an accepted replay-player snapshot contains
   Steam identity;
2. one provisional normalized-name row when accepted evidence has no Steam ID;
3. one SiteAccount row only for a claimed profile that cannot yet be attached
   to exact replay evidence.

This folds old display names for the same Steam account. It does not merge two
different Steam IDs because their names match, and it does not claim that one
Steam account has always represented one human. The final one-row-per-Warrior
projection requires reviewed multi-account links and a published identity run.

Only accepted, public-affecting, unsuperseded normalized replay projections may
create or extend a replay-backed identity. Raw final `GameStats.players` JSON
may supply compatible rating presentation, but cannot create an identity
outside that accepted corpus.

The dated 2026-07-28 identity census contains:

- 14,036 accepted replay-player snapshots;
- 13,839 with SteamID64 and 197 without;
- 2,216 exact replay-backed Steam accounts;
- 126 name-only provisional buckets;
- 175 Steam accounts with multiple normalized display names;
- 26 normalized names shared by multiple Steam accounts.

These are runtime snapshot values. See
[Replay Corpus and Public Metric Contract](REPLAY_CORPUS_METRICS.md); do not
hardcode them as permanent leaderboard totals.

The post-exclusion RM projection contains **2,345 additive identity rows**:

```text
2,345 current board rows
= 2,216 replay-backed exact-Steam rows
+   124 public name-only replay rows
+     5 profile-only rows
```

The five profile-only rows are four exact-Steam profiles without accepted
replay history plus one site-only profile. The accepted discovery corpus has
126 name-only buckets, while the public board has 124 name-only rows: two
corpus buckets have no surviving current War Vault/public-battle row. The
corpus count and board count therefore answer different questions and must not
be forced to match.

The public claimed AoE2WAR scope contains **16 profiles**:

```text
16 public claimed AoE2WAR profiles
= 11 replay-backed claimed profiles
+  5 profile-only claimed profiles

16 public claimed AoE2WAR profiles
= 15 exact-Steam identities
+  1 site-only identity
```

Here `claimed` is the existing public-player-directory fact that an identity is
attached to an AoE2WAR SiteAccount. It is not an active Player Identity Wave 2
`WarriorClaim`: that discovery ledger remains proposed-only. Claimed profiles
may be replay-backed or profile-only, and a profile-only row may remain
`Pending`.

## Scope, system-account, and pagination contract

`/leaderboard` exposes two explicit scopes:

- `all` is the default complete public identity board;
- `claimed` is the public AoE2WAR-user board described above.

`lib/leaderboardScope.ts` normalizes missing or unknown values to `all`. Scope
filtering occurs before alias search, column sorting, rank assignment,
24-hour comparison, and pagination. Rank is therefore canonical inside the
active RM/DM lane and active scope:

- default pages naturally continue `1…50`, `51…100`, and so on;
- the claimed view uses `1…16`, not sparse full-board positions such as
  `53`, `190`, or `860`;
- search and column sorting may change display order but do not renumber a
  warrior inside that active scope.

`/api/lobby/leaderboard` is strict: `limit=N` returns no more than `N` entries,
and `nextOffset = offset + entries.length`. The dedicated page sets
`includePendingClaimed: false` and `includeFeaturedClaimed: false`; it never
appends off-page featured profiles to a normal page. The homepage/lobby
snapshot is deliberately different and opts into
`includeFeaturedClaimed: true` so its small contender panel can include
featured claimed profiles. Featured enrichment is therefore an explicit
homepage composition feature, not part of the public pagination contract.
`trackedPlayers` is the full count for the active scope and search;
`entries.length` is only the current returned page. Neither value should be
relabeled as the other.

Leaderboard caches are scope-safe. Server cache keys include normalized lane,
scope, offset, limit, enrichment flags, search, and sort. The client lane cache
and in-flight request map key by `lane:scope`, and a response is accepted only
when both fields match the request. Switching scope cannot momentarily show a
cached response from the other board.

Competitive boards remove internal systems by exact reserved UID:

- `aoe2hd_ai_concierge` — The AI Scribe;
- `aoe2hd_ai_grimer` — Grimer;
- `aoe2hd_ai_guy` — Guy of Moxica;
- `challenge-protocol` — Challenge Protocol.

`lib/internalSystemAccounts.ts` owns those identifiers. The first, second, and
fourth currently account for the three excluded live profile rows; Guy is
reserved before a profile exists. Name matching is not used: a public user who
independently chooses one of those display names remains eligible unless the
account also has the reserved UID.

## Current name and expandable history

The main row label is the latest accepted replay display name for the exact
account. Latest means greatest effective observation time; deterministic
snapshot order breaks equal-time ties. A claimed profile without accepted
replay evidence falls back to its profile name.

Activating the row’s name-history disclosure shows each normalized historical
name with:

- games;
- resolved wins;
- resolved losses;
- unresolved results;
- first observed time;
- last observed time.

The folded row reports cumulative totals across those names. A
`gameStatsId + identity key` guard prevents the same replay from contributing
twice to one row. Name-history ordering is newest observation first.

## RM/DM competitive evidence boundary

The RM and DM boards are **independent competitive projections**, not two
sorting views over one all-modes record. The bounded public game corpus carries
the parser's `GameStats.game_type` explicitly. Only recognized `RM` /
`Random Map` / `Ranked Match` and `DM` / `Death Match` values enter the
respective lane; missing, unknown, TurboRandom9 and custom modes remain
unclassified and contribute to neither lane's competitive results.

Per-lane replay evidence exclusively determines wins, losses, unresolved counts,
game totals, last-10 results, 30-day results, last played, streaks and a
separately reconstructed Site Elo. This is a presentation/read-model change:
the canonical global player directory, replay adjudication, settlement evidence,
and financial authority remain unchanged. Steam RM/DM account ratings come
from current receipt-backed observations or dated historical HD headers and may
be present even when the replay evidence for a particular match lane is absent.

**Steam rating numbers and Site Elo are not comparable units.** Ranking places
Steam-rated warriors on the Steam scale first (current and explicitly
historical values retain source labels); Site-Elo-only warriors occupy a distinct
lower source tier, ranked within Site Elo. Profile-only rows remain unranked.

## 24-hour rank change

The previous `reconstructed_current_corpus` delta compared the currently
accepted replay corpus against itself with a 24-hour ingestion-time cutoff.
Bulk late replay ingestion could make a warrior appear to jump thousands of
positions despite no corresponding 24-hour competitive change.

Until AoE2WAR persists comparable **immutable per-lane rank snapshots**, 24H
movement is intentionally **unavailable**, never fabricated. The response
retains observation/cutoff timestamps for client compatibility and reports
`rankDelta24hMethod = unavailable_pending_rank_snapshots`, each entry's
`rank24hAgo = null`, `rankDelta24h = null` and
`rankDelta24hState = unavailable`; the UI renders `—` with an explanatory
title. No reconstructed value is presented as observed 24-hour movement.

`lib/ogBoard.ts` is a presentation projection, not replay truth. It passes game rows through `cleanPublicGameRows`, uses the existing winner/finality rules, and resolves player URLs with the shared public-player helpers. Raw player JSON, key events, parser diagnostics, and internal failure details never enter the browser payload.

Chronology is ordered by `COALESCE(played_on, timestamp, created_at) DESC, id DESC` so legacy rows without `played_on` cannot jump ahead of genuinely newer battles.

Postgame data is field-presence aware:

- explicit `has_scores: false` and `has_achievements: false` signals suppress those groups;
- null, undefined, empty, or non-finite achievement values are omitted;
- a genuinely stored numeric zero remains visible;
- non-positive RM/DM rating snapshots are treated as unavailable because legacy parser rows use zero as a rating sentinel;
- partial/fallback replays still show map, duration, date, roster, civilizations, ratings/EAPM where stored, and only a reliable winner;
- cards without score/achievement payloads say that postgame statistics are unavailable instead of rendering zeroes.

## Navigation and telemetry

The homepage panel uses guarded `router.push("/leaderboard")` navigation. Anchors, buttons, form controls, lane/view toggles, the internal scroll region, and load-more controls do not trigger the panel route. Enter and Space work when the panel itself is focused.

Existing authenticated user-activity telemetry records:

- `leaderboard_open_home_tile`
- `leaderboard_open_kingdom_menu`
- `leaderboard_switch_view`

The destination/from/to metadata is allow-listed by `/api/user/experience`. Tracking failures never block navigation.

## Verification rail

Run:

```bash
npx prisma generate
npx tsc --noEmit --pretty false
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/leaderboards.test.mts tests/hd-replay-truth.test.mts
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/leaderboard-scope.test.mts tests/leaderboard-directory-integration.test.mts tests/leaderboard-lane-instant-switch.test.mts
npm run build
```

No schema migration is required for these pages.

## Replay backfill and current rating chronology

Manual single-file uploads, package/batch uploads, Watcher imports, and recovery
may add historical matches after newer matches are already known.

Replay ingestion time is **not** rating chronology.

Current displayed Steam RM/DM rating may advance only from trustworthy replay
`played_on` chronology. `game_stats.created_at`, parser execution time, upload
arrival time, and generic timestamp fallbacks must never make an old replay's
embedded rating become current merely because its bytes were ingested today.

An undated replay may bootstrap an identity that has no known rating. Once a
rating exists, an undated historical replay cannot replace it. A newer
trustworthy `played_on` observation may replace an older or undated
observation.

Historical uploads still belong in battle history and may legitimately change
reconstructed Site Elo, records, streaks, and aggregate statistics because the
historical corpus itself changed. They must not regress a player's displayed
current Steam RM/DM rating.

Player profiles, player directory, and leaderboard surfaces consume the same
chronology-aware current-rating authority.

### Leaderboard rating presentation order

The ranked board keeps **current authority** and **useful historical
presentation** separate. Its lane value resolves in this order:

1. current immutable Watcher receipt-backed Steam RM/DM rating;
2. newest dated accepted replay-player HD-header snapshot for that exact Steam
   identity, rendered explicitly as `Last RM` / `Last DM`;
3. reconstructed **lane-specific** `Site Elo` when no Steam lane snapshot is available;
4. unrated/profile state when there is no replay-backed history.

The second tier is historical presentation, not current-account authority. It
cannot populate `CurrentWatcherAccountState`, rename or verify an account,
supersede a newer receipt-backed lane, or gain result/financial authority.
Non-positive legacy rating sentinels are unavailable. Historical Steam fallback
chronology uses replay `played_on` only; ingestion/acceptance time does not make
an older embedded rating newer.
