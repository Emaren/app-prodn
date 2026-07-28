---
id: "aoe2war.app-prodn.docs-replay-corpus-metrics"
title: "Replay Corpus and Public Metric Contract"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn","api-prodn"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "runtime-evidence"
authority: "metric-contract"
reviewed_at: "2026-07-28"
review_interval_days: 30
sensitivity: "internal"
---

# Replay Corpus and Public Metric Contract

AoE2WAR does not have one universal “game count” or “player count.” Each number
answers a different question at a different grain. Public labels, operator
reports, and documentation must name the grain and watermark instead of
presenting unlike denominators as contradictory totals.

## Verified production snapshot

The following read-only snapshot was captured on **2026-07-28 at 14:25 UTC**.
These are runtime-dynamic values, not constants to hardcode into durable UI or
business logic.

| Metric | Count | Exact meaning |
| --- | ---: | --- |
| Physical archive objects | **7,990** | Immutable objects in the replay archive: 7,788 `.aoe2record` files and 202 `.aoe2mpgame` files. |
| Indexed parser artifacts | **2,093** | Unique content-addressed artifacts represented in the Engine Room candidate index. |
| Parseable at some level | **2,093** | Indexed artifacts whose latest candidate run completed with evidence. “Parseable” here does not mean full postgame summary or final battle. |
| Recorded-game candidates | **1,891** | Indexed artifacts classified by the current app formula as recorded-game evidence rather than saved-game checkpoints. |
| Saved-game checkpoints | **202** | Parseable `.aoe2mpgame` checkpoint artifacts. They are evidence, but never completed battles. |
| Latest indexed parser failures | **0** | Indexed artifacts whose latest candidate disposition is failed. Historical failed runs remain immutable history. |
| Recorded confirmed irrecoverable indexed artifacts | **0** | No indexed artifact has a recorded terminal irrecoverable disposition. A global never-parseable count is unknown because no terminal ledger exists yet. |
| Unindexed or unclassified physical objects | **5,897** | Physical archive objects not yet represented as unique indexed artifacts. They are not “junk.” |
| Final ingestion records | **3,011** | `GameStats` rows with `is_final = true`; watcher/upload records, not deduplicated real-world games. |
| Public battle records | **2,784** | Final rows accepted by the War Vault public-battle filter. |
| Unique logical public battles | **2,778** | Public battle rows deduplicated by `publicReplayIdentity`; an app presentation identity, not universal historical proof. |
| Public rows removed by logical deduplication | **6** | Duplicate public rows spread across two duplicate presentation keys. |
| Final records excluded from the War Vault | **227** | Final ingestion records rejected by the public-battle filter. All 202 saved checkpoints are inside this 227, not additive to it. |
| Exact eligible roster-name strings | **2,677** | Distinct display-name strings in the final replay roster projection. This is not a count of accounts or humans. |
| Legacy tracked leaderboard rows | **2,670** | Pre-identity-cutover public directory/leaderboard rows after its own claiming, eligibility, and name-grain rules. This is not the 2,677-name set. |
| Accepted identity snapshots | **14,036** | Current accepted, public-affecting, unsuperseded replay-player snapshots used by Player Identity discovery. |
| Steam-backed identity snapshots | **13,839** | Accepted snapshots containing an exact SteamID64. |
| Name-only identity snapshots | **197** | Accepted snapshots without a SteamID64. |
| Unique replay-backed Steam accounts | **2,216** | Exact SteamID64 values in the accepted identity corpus. This is the safe account-grain leaderboard cutover population. |
| Name-only provisional buckets | **126** | Versioned normalized-name evidence buckets for the 197 name-only snapshots; not people and not Steam accounts. |
| Steam accounts with multiple observed names | **175** | Exact SteamID64 values with more than one normalized display name. |
| Names shared by multiple Steam accounts | **26** | Normalized names observed against more than one exact SteamID64; name equality cannot merge them. |
| Current public leaderboard identity rows | **2,345** | Post-exclusion additive board projection: 2,216 replay-backed exact-Steam rows, 124 public name-only rows, and five profile-only rows. |
| Public claimed AoE2WAR profiles | **16** | Existing public directory profiles attached to SiteAccounts after reserved system UIDs are removed: 11 replay-backed plus five profile-only; 15 have exact Steam identity and one is site-only. This is not an active Wave 2 claim count. |
| Provisional Warriors populated | **2,216** | One proposed competitive-career seed per replay-backed Steam account. These are provisional records, not a consolidated-human census. |

The physical archive occupied **8,588,836,915 bytes** at the snapshot.
`ReplayArtifact` rows represented **3,394,627,739 bytes**, and every indexed
storage key was present. The Engine Room public summary rounds that indexed
candidate corpus to **3.16 GB**.

The **2,677** and **2,670** values cannot be reconciled by subtracting seven
aliases. The first counts exact roster-name strings; the second was a legacy
directory/leaderboard presentation count with different inclusion and claiming
rules. The post-exclusion exact-Steam board reports 2,345 rows and its additive
identity categories rather than preserving 2,670 for visual parity.

The 126 discovery buckets and 124 public name-only leaderboard rows are also
different grains. Discovery preserves every accepted name-only evidence
bucket. The board requires a surviving current War Vault/public-battle row, so
two corpus buckets do not appear in its current projection.

## Equations that must remain visible

```text
3,011 final ingestion records
- 227 final records excluded by the public-battle filter
= 2,784 public battle records

2,784 public battle records
- 6 duplicate public rows under publicReplayIdentity
= 2,778 unique logical public battles

2,093 indexed parser artifacts
- 202 saved-game checkpoints
= 1,891 recorded-game candidates

14,036 accepted identity snapshots
= 13,839 Steam-backed snapshots
+ 197 name-only snapshots

2,345 current public leaderboard rows
= 2,216 replay-backed exact-Steam rows
+   124 public name-only replay rows
+     5 profile-only rows

16 public claimed AoE2WAR profiles
= 11 replay-backed claimed profiles
+  5 profile-only claimed profiles
= 15 exact-Steam identities
+  1 site-only identity
```

The 227 excluded final records include all 202 saved checkpoints and 25 other
non-public shells. Do not subtract 202 a second time.

## Latest parser-mode census

Every indexed artifact had a completed latest run at the snapshot:

| Latest candidate mode | Artifacts | Recorded-game eligible |
| --- | ---: | --- |
| Full recorded-game summary | 1,740 | yes |
| Header fragment plus body recovery | 119 | yes |
| Metadata fragment plus body recovery | 20 | yes |
| Trailing body-stream recovery | 9 | yes |
| Legacy completed row without a recorded parse mode | 3 | yes under the current compatibility formula |
| Saved checkpoint decoded completely | 196 | no |
| Saved checkpoint initial-state prefix | 5 | no |
| Saved checkpoint map/roster prefix | 1 | no |
| **Total** | **2,093** | **1,891 recorded / 202 checkpoint** |

“Full,” “fragment,” and “checkpoint” describe evidence depth. They do not by
themselves prove a winner, resolved teams, a completed match, public archive
eligibility, or settlement eligibility.

## Grain definitions

### Physical archive file

One path on replay storage. Rehosts, copies, intermediate watcher files, and
different container types may all exist. File count is a storage inventory, not
a battle count.

### Indexed parser artifact

One Engine Room content-addressed artifact with candidate history. It is the
correct denominator for parser coverage and latest parser disposition.

### Final ingestion record

One final watcher/upload row in `GameStats`. It is the correct denominator for
the public result-recovery progress calculation. It is not deduplicated logical
game truth.

### Public battle record

One final row accepted by `isPublicBattleArchiveRow`. The filter removes saved
checkpoints and non-battle shells that cannot support the public War Vault.

### Unique logical public battle

One public presentation key produced by `publicReplayIdentity`. It prevents
known duplicate rows from appearing as separate battles. It is an app
deduplication contract, not proof that two different files can never represent
the same real-world match.

### Replay-backed Steam account

One exact SteamID64 observed in the accepted replay identity corpus. It is an
account, not necessarily one human and not automatically one final Warrior.

### Name-only provisional bucket

A lower-confidence grouping of snapshots without SteamID64 using a versioned
normalization rule. It never authorizes an account merge, claim, or human
identity conclusion.

### Warrior

AoE2WAR’s reviewed competitive-career unit. A provisional one-account row may
seed a Warrior, but several Steam accounts become one Warrior only through an
explicit evidence-backed link. SiteAccount, PlatformAccount, Warrior, display
name, and human are separate concepts.

There is not yet a defensible consolidated-human Warrior census. Discovery V2
has populated 2,216 provisional platform-seed Warriors, one for each
replay-backed Steam account. All 2,216 links and 11 claims remain proposed;
active links, active claims, resolution runs, projections, and publications
remain zero. Until reviewed multi-account links and a publication exist, public
documentation must say **2,216 replay-backed Steam accounts** or **2,216
provisional Warriors**, never “2,216 people.”

### Public claimed AoE2WAR profile

One public player-directory identity attached to an AoE2WAR SiteAccount under
the existing app/profile resolution rules, after exact reserved system UIDs
are removed. This is the grain behind the 16-profile leaderboard scope. It is
not the same thing as a proposed or active Player Identity `WarriorClaim`; 11
of the 16 have replay evidence, while all 11 Wave 2 exact-match claims remain
proposed.

The three excluded live system rows are `aoe2hd_ai_concierge`,
`aoe2hd_ai_grimer`, and `challenge-protocol`. Their removal changes the public
board presentation from the earlier 2,348-row projection to 2,345.
`aoe2hd_ai_guy` is also reserved before a live profile exists, so creating that
configured house persona cannot change the public count. This policy does not
delete replay evidence, alter the 2,216-account discovery corpus, or authorize
display-name-based filtering.

## “Junk” and irrecoverable evidence policy

A file is confirmed junk only after an explicit terminal
`irrecoverable` disposition records:

- content hash and storage identity;
- observed format/container signature and byte size;
- parser and recovery versions attempted;
- bounded failure reason;
- decision timestamp and responsible operator or deterministic policy version.

Unknown, unindexed, partial, corrupt-looking, saved, aborted, header-only, and
manual-review files are not automatically junk. No terminal irrecoverable
ledger exists yet, so the global never-parseable count is **unknown**, not
proven zero. The current recorded irrecoverable count is zero. The **5,897**
unindexed or unclassified physical objects must stay labeled unclassified until
evidence proves otherwise.

## Public-label contract

Public tiles must use descriptive labels, not bare “games” or “warriors”:

- `Final replay records` for the 3,011-row ingestion denominator;
- `Public battle records` for the 2,784 War Vault rows;
- `Unique public battles` for the 2,778 presentation-deduplicated count;
- `Parser-indexed artifacts`, `Recorded-game candidates`, and
  `Saved checkpoints` for the 2,093 / 1,891 / 202 corpus;
- `Replay-backed Steam accounts` for the 2,216 exact account count;
- `Name-only identities awaiting review` for the 126 provisional buckets;
- `Roster names represented` for display-name string counts such as 2,677.
- `Public claimed AoE2WAR profiles` for the 16-profile app scope; never
  shorten it to “verified people” or “active Warrior claims.”

If a surface includes a mutable value, it must also expose an as-of time,
freshness state, or link to the canonical metric explanation. A number without
its grain is a documentation and UX defect.

## Ownership and refresh

- `api-prodn` owns archive files, content-addressed artifacts, parser runs, and
  candidate disposition evidence.
- `app-prodn` owns final-record, public-battle, logical-public-battle, identity,
  and public-label projections.
- PostgreSQL and replay storage are runtime truth; this document records the
  interpretation contract and a dated evidence snapshot.

Refresh this census from one repeatable-read database transaction plus one
storage watermark. Record the production commits, schema/migration state,
query version, generated-at time, and hashes in the resulting receipt. Never
edit these snapshot numbers merely to match a screenshot.
