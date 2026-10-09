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

## RM/DM rating lanes and all-mode Version 1 statistics

**Version 1 intentionally optimizes for comprehensive, truthful visibility.**
RM and DM select the **Steam ladder rating** (current Watcher account state
first, then provenance-qualified historical HD replay header). The Watcher may
capture *both* RM and DM ratings while observing a game in only one mode;
a displayed Steam RM rating does **not** prove this site has ingested a
classified RM replay for that warrior.

The main leaderboard's Games, W–L, win percentage, last 10, rolling 30-day
record, streak and last played are the **accepted all-mode AoE2WAR replay
history**, identically sourced on both boards. Valid RM, DM, TurboRandom9
and unknown/custom modes all contribute when their public replay-player
projections pass the existing accepted/unsuperseded/result authority rules.
An accepted game contributes only to its actual identified players; ratings
never manufacture game history. The UI visibly says `Stats · All modes`,
with column tooltips explaining the scope. These columns must never claim
to represent RM-only or DM-only competition.

Version 1 **never substitutes Site Elo**, including when Steam ratings are
missing. An unrated account shows an unavailable Steam Elo, not a synthesized
number. Ratings are keyed by exact Steam ID and selected independently for RM
and DM: a newer qualified Watcher account observation takes precedence over an
older one, using the actual *played_on* game clock rather than replay upload or
import time. Immutable current-account receipts and read-only Watcher-upload
observations can each supply a dated lane observation. A dated historical
HD-header replay is the remaining fallback. Manual and batch file uploads do
not enter the Watcher-upload rating rail and cannot displace its later values.

**October 2026 legacy compatibility:** Production evidence found 4,314
recent Watcher replay rows with matching client/server SHA-256, file roles,
and `live_monitor` provenance, but 0 rows with a verified HMAC. The Watcher
was signing a machine-local sender UID; the API was verifying the API-key
owner's Steam-account UID instead. The signed sender is now carried separately
by the web proxy and verified by the API. Account ownership is still established
solely through the authenticated Watcher API key, never a caller-supplied UID.

The old signatures were not preserved in the stored replay rows and **cannot
be retrospectively verified**. A strictly time-frozen, read-only compatibility
cohort therefore supplies *display-only* Steam ratings from watcher_live/final
rows both **played and originally ingested before 2026-10-09 00:00 UTC**,
subject to live-monitor provenance, verified client hash, matching server and
client SHA-256, valid file role/finality, unique 17-digit Steam participant
identity, and numeric RM/DM values. This old cohort is **not signed evidence**.
After this cutoff only an HMAC-verified upload can enter the display-rating
rail. Invalid newly supplied signatures never qualify. Manual, batch and
file uploads never qualify in either era. These readings cannot establish
game results, payments, verified aliases or account identity, and are never
relabeled `hd_header`. Source-based legacy compatibility must be retired
when fresh immutable current-account receipt coverage is demonstrably healthy.

The source maintains bounded stale-while-refresh caching to protect render
latency. Site Elo computation remains internal for later Version 2 work but
must not be displayed or used as a sort/rank tie-breaker on RM/DM V1 boards.
Long term, Watcher clients should emit the established HMAC provenance header
so new observations can use the immutable account receipt pathway, and the
temporary compatibility reader can be retired after coverage is measured.

The source retains a conservative `GameStats.game_type` /
`key_events.settings.type` resolver on each canonical accepted replay-player
observation for a later **opt-in, mode-only** statistics view. The 2026-10-08
production audit found 5,702 nonsuperseded final replay records, including
2,097 TurboRandom9 and 998 historical malformed HD version-label rows.
Within the top cohorts, 889 malformed rows had explicit RM/DM mode evidence,
but mode classification covers only part of the corpus. That is why strict
mode-only statistics must not silently replace the Version 1 all-mode table.

No database mutation, replay adjudication, financial authority, or Wolo
operation is involved in this choice.

## Steam RM/DM evidence coverage and missing-rating triage

The public player directory is an **identity and replay-history roster**. The
competitive RM board admits only qualifying Steam RM ratings; the competitive
DM board admits only qualifying Steam DM ratings. A player with a rating on
one lane is not automatically qualified for the other. A registered/claimed
profile alone is not competitive rating authority; any legacy pending-claimed
display exceptions must be removed in a separately tested presentation change.
No default 1600 or other inferred Steam number may enter either board.

Before changing ranking eligibility, run the non-mutating source audit from the
canonical Mac checkout:

```bash
python3 -m unittest tests/test_leaderboard_steam_coverage_cli.py
python3 scripts/leaderboard_steam_coverage.py
```

For missing numeric Watcher cases, a second read-only diagnostic can locate
the *furthest individual observation gate* passed, without treating numeric
source fields as proof of qualified Steam authority:

```bash
python3 -m unittest discover -s tests -p 'test_leaderboard_steam_gate_cli.py'
python3 scripts/leaderboard_steam_gate.py
```

The audit scans `game_stats` in bounded, primary-key-ordered batches
(maximum 512 rows per database statement, with an explicit batch ceiling).
This is intentional: a previous corpus-wide JSON window query exceeded the
production 20-second PostgreSQL statement timeout (`SQLSTATE 57014`).
Never bypass the read-only/session timeout safety rails merely to force a
single enormous census. If the full observer reaches its overall protected
runtime limit, reduce batch size or create resumable immutable receipts
without changing production timeout or database state.

The nine-stage funnel distinguishes raw value absence, source restrictions,
timestamp/uploader/replay-hash integrity, live-monitor provenance, HMAC or
legacy-window qualification, matching client/server hashes, valid file roles,
and lane-specific rating-field provenance plus unique Steam identity.
The maximum stage is computed **per exact Steam ID from a single observation**
at a time; flags from unrelated games must never be assembled into a
synthetic qualified upload. The diagnostic prints only aggregate counts, never
names or private Steam-ID review queues. A raw row passing every historical
mutable-game gate while the public rating remains unavailable is an
**investigate-current-overlay-or-cache** signal, not authorization to change
ranking or financial authority.

The command streams `scripts/leaderboard_steam_coverage_remote.mjs` through
the protected read-only production truth observer. It returns both-lane,
RM-only, DM-only, and neither-observed counts, plus exact Steam identity counts.
It separately detects raw numeric RM/DM values in Watcher and non-Watcher
uploads that **do not qualify** as official current-rating authority. The full
case queue remains in a locally restricted receipt, not a public API or GitHub
issue. Do not publish the case-level names/Steam IDs.

**A missing qualifying rating is not evidence that the Steam account is
actually unrated.** Each unresolved lane must be classified against preserved
source bytes, known parser mapping, exact SteamID64, header/value presence,
signature/receipt provenance, timestamp, and observational freshness. Mixed
identity, unsupported replay header, omitted terminal state, and rejected
signature are different failure classes. Manual and batch uploads may improve
historical game statistics but can never overwrite a more authoritative
Watcher rating by arrival time.

Rate coverage and result-resolution coverage are independent. An accepted
replay with no provable winner can still contain a genuine historical rating;
a replay with a reliable winner can still lack trustworthy rating evidence.
The Engine Room should improve each independently, recording exact parser
versions and evidence hashes. Only after every supported recovery pass has
failed may an unresolved case be designated source-limited; it must never be
silently fabricated, discarded, or treated as financial settlement proof.

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
3. unavailable Steam Elo when neither lane-specific source qualifies. Site Elo
   never appears on Version 1 competitive RM/DM boards.

The second tier is historical presentation, not current-account authority. It
cannot populate `CurrentWatcherAccountState`, rename or verify an account,
supersede a newer receipt-backed lane, or gain result/financial authority.
Non-positive legacy rating sentinels are unavailable. Historical Steam fallback
chronology uses replay `played_on` only; ingestion/acceptance time does not make
an older embedded rating newer.
