---
id: "aoe2war.app-prodn.docs-replay-truth-os"
title: "AoE2WAR Replay Truth OS"
type: "runbook"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn","api-prodn","aoe2-watcher"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "operational-procedure"
reviewed_at: "2026-10-07"
review_interval_days: 30
sensitivity: "restricted"
---

# AoE2WAR Replay Truth OS

Replay Truth OS turns recurring replay-corpus forensic work into a governed,
read-only operator control plane.

Its north star is zero unexplained unknown replay truth. It does not weaken
evidence rules merely to reduce an unknown counter.

## Commands

`aoe2war truth status`

Shows local Replay Truth OS state without querying production. It preserves the
newest corpus census and newest contract audit even when later target-forensic
commands have written newer receipts.

`aoe2war truth census`

Runs the current production replay resolvers across every final GameStats row
and reports topology coverage, canonical two-team coverage, result coverage,
unknown participant results, recovery routing, parse-reason debt,
player-count debt, and the cross-layer contract state.

`aoe2war truth audit`

Runs the high-level replay-truth versus participant-result contract over the
entire final corpus.

The required invariants are:

- zero high-level statistics / participant W-L contract mismatches;
- zero incoherent scalar-authority rows.

`aoe2war truth target GAME_ID`

Shows a single replay's raw stored winner, effective truth, topology
classification, canonical two-team resolution, participant W/L, parse
provenance, current accepted normalized-stat projection, effective accepted
adjudication, exact routing class, and current blocker.

## Production safety

Census, audit and target are read-only production commands.

They:

1. connect through the protected root SSH operator boundary;
2. require the production Git worktree to be clean;
3. require the web service active;
4. require Wolo listeners 8092 and 8093 present before execution;
5. load the root-protected production environment without printing secrets;
6. export `AOE2WAR_PROD_DB_PREVIEW=true`;
7. require PostgreSQL itself to report both transaction and default transaction
   read-only mode;
8. run only read queries;
9. prove production source, service and Wolo listener state are unchanged
   afterward.

No Replay Truth OS V1.1 command performs database, projection,
adjudication, betting, settlement, claim, payout or Wolo mutation.

## Receipts

Successful live commands write local receipts under:

`.aoe2war-release/truth-receipts/`

The receipt records the production source, generated time, command, read-only
proof and result payload. It never records production credentials. Target
receipt filenames include the GameStats ID so independent target commands
cannot collide merely because they execute during the same UTC second.

## Coverage dimensions

Topology, canonical two-team resolution and result truth are separate
dimensions.

Replay Truth OS V1.1 reports:

- topology known;
- topology unresolved;
- unexplained topology debt;
- canonical/legacy two-team resolver coverage;
- result resolved;
- result unknown;
- unknown participant-results.

Topology means the replay's observed side structure, not winner authority.
Known topology may include balanced two-team games, uneven team games, FFA,
multi-side games and exact single-group observations.

Exact immutable parser-candidate evidence may establish topology through
`game.diplomacy` or complete direct-header `player.team_id` observations even
when the normalized public GameStats roster is incomplete or the canonical
balanced-team resolver correctly refuses the proposition.

Candidate-file reads are bounded to the immutable parser-output root and occur
only after the canonical team projection fails to establish topology.

An unresolved topology receives an operational recovery disposition. Missing
canonical source bytes route to `SOURCE_ARTIFACT_REQUIRED`; a replay with an
existing parser run whose evidence still cannot establish topology routes to
`PARSER_RESEARCH_REQUIRED`; an archived but not-yet-parsed source may route to
`REPARSE_REQUIRED`.

Current-parser exhaustion is scoped to immutable source bytes, not to the
historical `GameStats` row that happened to request a run. If the exact live
parser contract has already attempted the exact `replay_hash`, every
`GameStats` row bound to that SHA is considered parser-attempted even when the
append-only `ReplayParseRun.gameStatsId` points to a different historical row
or is absent. Deterministic `failed` runs also exhaust that exact parser
identity: rerunning identical bytes through identical parser/pass/schema
versions is not recovery work. Those cases route to parser research while the
source artifact remains available; they never grant result, statistics,
betting, settlement or Wolo authority.

A game is result-resolved only when the participant resolver produces a
complete coherent proposition containing at least one winner, at least one
loser and no unknown participant result.

Topology evidence never grants winner, statistics, betting, settlement,
financial or Wolo authority. Those authority lanes remain independently
governed.

## Workflow routing

V1.1 routes unresolved work into operator workflow classes including:

- `SOURCE_ARTIFACT_REQUIRED`;
- `PARSER_RESEARCH_REQUIRED`;
- `TEAM_EVIDENCE_REQUIRED`;
- `REPARSE_REQUIRED`;
- `RESULT_EVIDENCE_REQUIRED`;
- `HUMAN_REVIEW_REQUIRED`;
- `NON_BATTLE_CANDIDATE`.

These are workflow recommendations only. They never create replay truth.

Future versions may add candidate-confidence and artifact-availability evidence
to support `AUTO_RECOVERABLE`, external-evidence and irrecoverable queues.

## Cross-layer contract

A replay-truth source change is not complete merely because focused tests pass.

Production must preserve agreement between:

1. high-level `statsEligible` replay authority; and
2. complete coherent participant W/L projection.

`aoe2war truth audit` makes that production-wide proof repeatable.

## Historical repair boundary

Historical repair may improve W/L, records, streaks and Site Elo.

It must not directly redefine Watcher-owned current Steam DM rating.

Statistics authority remains independent from betting and Wolo authority.

## Targeted roster-only recovery

The internal `/api/admin/replay-roster-recovery` rail closes a narrower gap
than result adjudication: an exact current canonical parser run may contain
complete direct Steam/team/player-number evidence while the stored
`GameStats.players` roster remains too incomplete for later result policies to
consume.

The sealed historical `public_replay_roster_v2` campaign remains bound to its original Pass-8 parser identity. Current targeted recovery does not reuse or rewrite that frozen campaign contract; it consumes the live `HD_REPLAY_PARSER_CONTRACT` instead. Pass 9 added candidate-only terminal observations and Pass 10 added `terminal.saved_chapters`; both were additive to the roster-bearing observation paths used here.

The sealed historical campaign remains `public_replay_roster_v2`. Current
targeted recovery uses `public_replay_roster_v3`, which extends only the
topology envelope: an exact resolved two-team roster may be asymmetric
(`2v1`, `3v1`, `3v2`, `4v1`, `4v2`, or `4v3`) when each side has
1-4 players, the declared format/player count agrees with the two explicit
teams, and those teams cover the complete exact Steam roster. Odd player count
alone is never team evidence; FFA, missing-team, incomplete, conflicting, and
three-team shapes remain blocked.

The rail remains deliberately **roster-only**:

- source must be the exact current replay hash and canonical current parser contract (Pass 10 as of this release);
- only candidate observations with no public-aggregate authority are consumed;
- direct Steam identity and explicit replay/final team-ID provenance are
  required;
- finality, disconnect/desync, linked-market, linked-claim,
  accepted-adjudication and prior promotion boundaries are rechecked;
- every projected player winner flag must remain `null`;
- the complete public result-authority snapshot before and after roster
  projection must be identical;
- apply runs under a per-game advisory lock inside a SERIALIZABLE transaction;
- the only permitted mutations are one append-only `ReplayRosterPromotion`
  row and replacement of that GameStats row's `players` JSON;
- `affectsResults=false`, `affectsBets=false` and
  `settlementAuthority=false` are explicit ledger facts.

The append-only `replay_roster_promotions` ledger carries the same bounded V3
format envelope at the database layer. Its format CHECK permits exactly two-team
`1v2` through `4v4` combinations whose total roster size is 3-8, including
asymmetric `2v1`; ordinary `1v1` remains outside roster recovery. A source-level
format expansion is incomplete until this persistent CHECK contract advances through
the production-proven CHECK-replacement migration rail.

Dry-run is the default. Mutation requires `apply=1`, the protected internal
API key and the configured admin recovery actor.

Roster recovery never declares a winner. After an eligible roster repair, the
automatic terminal-result reconciler independently re-evaluates the game under
`replay-team-terminal-action-tail-v4`. V4 removes only the stale balanced-team
assumption: it still requires exactly two teams covering the exact roster,
exact Steam/player-number/team identity, exact parser resignation counts,
per-player action evidence, the existing resignation advantage and terminal
activity gaps, and no conflicting serialized result. It does not add a new
winner heuristic; an asymmetric game that cannot satisfy those existing proof
requirements remains under review.

V4 may consume the exact topology observation already bound to a
`public_replay_roster_v3` promotion when the historical
`GameStats.key_events.team_resolution` is stale. That substitution is permitted only after
re-validating the promotion against the current game, replay hash, persisted projected-roster
hash, candidate-only observation and exact current parser contract. The topology observation
is identified by canonical `fieldPath = "teams.resolution"`; producer-specific
`observationKind` labels are informational and do not grant or revoke authority.

If V4 then fails specifically at `parser_resignation_counts_missing`, it may consume only
`teams.resolution.result_evidence.resignation_counts_by_team` from that same exact promoted
observation. The bridge requires exactly two unique count rows whose team IDs and
`player_count` values match the promoted canonical topology; invalid or absent rows are not
derived or synthesized. No other promoted result metadata is copied. Historical result trust,
winner flags, candidate winner/team fields, resignation conclusion fields and sources remain
unchanged, and V4 independently cross-checks the counts against the serialized resignation
roster and raw player activity before applying its existing action-tail thresholds. A broken
binding or count mismatch remains fail-closed.


Historical sealed V2 campaign scripts remain immutable. The targeted rail does
not relax or reuse their campaign-specific manifest, plan or game-ID seals.

## Full-vault certainty closure

`aoe2war truth closure` complements the census by forcing every final game into
one explicit current-vault disposition. The closure distinguishes resolved
truth, reparse work, parser research, source-artifact absence, human
adjudication/evidence work, non-decisive rows, and candidate winners that are
not authoritative.

The closure target is **100% disposition accounting**, not manufactured winner
certainty. `UNPARSEABLE_FROM_CURRENT_VAULT` means the current vault does not
contain the source/candidate evidence needed for parser recovery; it does not
claim that missing bytes can be inferred. Candidate winners remain separate
from statistics/betting authority until the existing provenance rules permit
promotion.

The per-disposition game-ID manifests are the canonical handoff for bounded
parser/backfill campaigns. Parser work should target artifact-present reparse
and parser-research cohorts first; source-missing rows require evidence recovery,
not looser parsing.

## Player Result Recovery — 2026-10-06 checkpoint

The bounded campaign owns exact Steam identities for Zodiac
`76561198103810510`, mYsTikaL_VeGeTa `76561199849204394`, and mYsTikaL JiReN
`76561198754754435`. Display names and uploader identity never expand that scope.

From the governed app checkout, run:

```bash
python3 scripts/player-replay-truth.py plan --target all --max-games 3
python3 scripts/player-replay-truth.py baseline --targets config/replay-truth-player-first-20261005.json
```

`plan` compiles the checked-in read-only planner and sends it through the existing
protected observer. No deployment or production source file is written. Both
commands seal immutable SHA-named receipts in the owning canonical checkout's
`.aoe2war-release/truth-receipts/`, preserving them when a worktree is retired.
`evidence --baseline <receipt> --baseline-sha256 <exact-digest>` independently
checks the scoped archive and stored compressed candidate bytes. It never applies
roster recovery, reconciles results, writes parser rows or schedules native work.

The admin Parser Lab includes the same Player Result Recovery dry-run plan,
separate Full Truth/result unknown counts, source/financial blockers and existing
commissioner review links. The plan deduplicates logical battles and SHA execution
work, caps selection at 1–10 games and fixes concurrency to one. Unknown batch
execution remains disabled; no resumable unknown dispatcher is claimed by this
checkpoint. Existing persistent OS run receipts track bounded known controls;
workers reject duplicate attempt IDs and serialize native execution.

The fresh production census at 2026-10-06T13:10:15.554Z was 3670/5396 Full Battle
Truth (68.013343%). Target totals remained 761/356/255 with 55/17/22 Full Truth
unknowns; only 52/17/22 are result unknowns. The later plan observed 94 distinct
logical battles and 94 replay jobs: 23 native structural candidates, 2 existing
roster-only plans, 10 parser research cases and 59 financial-linked commissioner
review cases. All archives were present, and their exact bytes were verified in
the companion evidence receipt. These route counts are not promised winner yield.

That read-only census promoted no result and wrote no production data. Existing roster plans
25892/27269 pass their own contract but add no Workshop Full Truth under the current
completeness rule. The local display correction for existing adjudications 25985
and 41041 projects two fewer Zodiac roster gaps, with zero new winners; it is not
deployed. Exact per-case IDs, SHAs, roster, slots, teams, financial exposure,
parser lineage, raw blockers and immutable receipt seals live in
`replay-receipts/player-first-2026-10-06-report.json` and its linked immutable
campaign report.

### Historical Zodiac result tranche — 2026-10-06

This preserves the earlier 761-battle checkpoint. The three-account continuation
below supersedes its inventory and next-action instructions.

The exact sealed 761-battle Zodiac cohort now has **50 result unknowns, down from
52**. Full Truth incomplete remains **55**. This is a scoped closure update, not
a new census or a changed corpus definition.

The existing roster-only writer recovered 25892 and 27269 (promotion rows 127/128).
Independent full-byte rescans then established the complete voluntary losing side
for 27269 and 44670. Tony explicitly approved both frozen Commissioner packets;
the existing adjudication writer appended rows 189/190 with `affectsStats=true`
and `affectsBets=false`. Fresh read-only public-result checks resolve Zodiac as a
loss in both games. The winning sides are PKNT/Monty_Python/Trickster and
Jim/Emaren respectively. Markets, wagers, claims, settlement and Wolo were not
mutated. No code was deployed; production source remained `af406960`.

The two rosters have five and three exact participants. They do not pass the
current Workshop completeness rule, so these two accepted results add zero Full
Truth battles. The frozen proposal, safe roster apply, approved writes and
independent post-apply checks are indexed in
[`zodiac-tranche-a-2026-10-06.json`](replay-receipts/zodiac-tranche-a-2026-10-06.json).
Immutable final report SHA-256:
`826066125585ded32cee398a5da4b1ce629c8f44ee6e1bff805a2727f4adb086`.

All nine cheap cases and 29 financial cases were inspected without expanding the
scope. Remaining unknown routes: 16 native, six parser research, one partial-team
roster case, and 27 financial review cases. Financial review produced zero new
complete-result proposals: 14 lack serialized results, six have only partial
voluntary sides, two have disconnect-marked resignations, two have unproven saved
chapter terminal states, one has both sides resigned, one has ambiguous serialized
identity, and 31588 has a forbidden recorder-exit inference. The other two financial
cases were already known. Exact IDs and evidence are in immutable financial triage
SHA `da40553c3158d73c7c315be80ba38df0653a17b08fe628359a15b42010c10f2f`.

The branch rejects the partial-team action-tail automatic writer and excludes
retired recorder-exit/action-tail ledger rows from current projection while
preserving their history. The exact unchanged-roster 31588 regression demonstrates
why historical acceptance alone cannot grant current winner authority. These code
changes await normal review/release.

Two governed fast-play 32388 runs reached coherent memory terminal state with
slots 1/2 winning and 3/4 losing at simulation 1,485,022ms, measured 11.905× and
11.460× playback. Both known-memory referees passed and cleanup preserved Steam.
Neither provides the complete text/EOF witness. A separate read-only diagnostic
observed 1,027 successful reads with AILog gate `0xaeefdc=0` and handle
`0xaf472c=0`, including terminal state; zero read failures. Sixteen full/delta logs
contained no GAME OVER/Won-Lost block. Native receipts:
`4bc3c840c633a864f30aed11a25d1ed41e3c93b5ba640625f2aab6387c5729d7`
and `13e0a3ffbd3a9681ebeb40dc28c2663e1d42118b3e9796726d7b70b2cf4d1fa0`.

Next autonomous action: observe the preserved read-only post-finalizer boundary
`0x739618` to prove natural EOF/result completeness on 32388. Finish the trusted
1v1/team/4v4 ladder before admitting Zodiac's fixed 16-game native cohort, beginning
with 21018. The logger words explain a dormant path; they are not permission to
write target flags or synthesize terminal text. Native evidence remains candidate
only and grants no result, betting, claim, settlement or Wolo authority.


Verification and continuation: app branch
`fix/player-first-truth-current-rating-20261005`, implementation checkpoint
`42b5979c` after the tested proposal/fence checkpoint `b8c98df3` and automatic
team-tail fence `6ac713fa`. API branch
`fix/historical-upload-identity-authority-20261005`, implementation `129e5c0b`
after restored native hooks `2db3efdb`. App: 95 focused proposal, adjudication,
retired-inference, terminal and rating-delta tests; Prisma generation, TypeScript
and build passed. API: 307 focused tests passed. The producer still precedes the
stricter current-rating reader at deployment; no campaign deployment occurred.
Frozen original packets remain evidence; the superseding accepted report is
current for this tranche. No uncommitted implementation work remains. Do not
repeat parser/roster work on these nine cases; resume at the native terminal
completeness boundary above.

### Three-account continuation — 2026-10-07 UTC

The Steam identities remain separate: Zodiac `76561198103810510`,
mYsTikaL_VeGeTa `76561199849204394`, and mYsTikaL JiReN
`76561198754754435`. The read-only census preserves the existing logical battle
grain and Workshop roster-completeness rule. `player-replay-truth.py baseline
--inventory-only` reduces collection volume without changing those contracts;
omitted bulk evidence is explicitly marked as uncollected.

At `2026-10-07T01:17:14.139Z`, the deployed public projection was
**3717/5450 = 68.20183486238533%** Full Battle Truth, with unknown result counts
**51/21/22**. Its receipt SHA-256 is
`d1835f3da4245f6aaf485881a0f4a9d7fb573cac2479f7b0836ee4906230cb94`.
This observation does not establish the user's reported 69% metric.

The independent admissible census at `01:23:33.687Z` excludes the six exact
retired recorder-exit/action-tail policy versions through the same query and
projection fence. It reports **3694/5450 = 67.77981651376147%**, with
**57/21/22 = 100** unknown results. Receipt SHA-256:
`e7e8c6873e41a58680217cd52ac09cfdf4b68c03a9a263e6bbcf292adb05ea8a`.
The lower percentage reflects rejected authority, not lost replay evidence.
The fence is branch implementation; no campaign code has been deployed.

The six reopened Zodiac games are `23829`, `24666`, `25985`, `25994`, `29091`
and `41041`. Independent complete byte scans found four recordings without
serialized results, one partial voluntary side and one disconnect-marked
partial side. Their audit receipt SHA-256 is
`c5a3b8f7f9d3bcf39a6cd7bb91dc3651f6566d305df3c417cd5448866296b97b`.
Retired ledger rows remain history and grant no current result authority.

The 43 Vegeta/JiReN cases were each hash-checked, parsed with the current
contract and independently scanned to exact EOF. Their audit receipt SHA-256
is `d647f2d7b532cb4a3c7dcc3337a4f125ffc51b5c99308c6365a92f26030882c1`.
Only `25782` proves a complete voluntarily resigned side. Its frozen packet
is in [`three-account-stats-only-proposals-2026-10-06.json`](replay-receipts/three-account-stats-only-proposals-2026-10-06.json).
Tony explicitly approved its stats-only short-forfeit verdict. The existing
Commissioner writer appended adjudication **192** at `03:48:51.506Z`, after
independent final archive, both source snapshots, roster and financial checks
before and under its Serializable advisory lock. The bounded writer allowed
exactly one adjudication create. Raw parser rows and the full financial snapshot
were unchanged; statistics authority is true and betting authority remains false.
Application receipt SHA-256:
`42df389af7359d5ed9b460ff855583cc69d0b6d37033b6db4ad3788fc59d68ad`.
The unchanged parser excludes the 50-second game as a rated result; human
statistical adjudication must preserve that counterevidence and never declare
a Steam-rated outcome. Nonfinal `25781` is an exact prefix with only one
resignation, and supplies no result authority.

Native structural control `32388` captured 383 coherent terminal snapshots,
the complete `[1,2]`/`[3,4]` partition, a same-world route marker transition
`0→1`, and a clock matching the independently framed archive endpoint
`1485022ms`. Receipt SHA-256:
`3c6e45e72e8620511ce962fe305591c81ae78ec148b0e21a37d39c267b2daf75`.
This is candidate evidence. Engine EOF and an instruction-boundary hit are
unproven. Generalized manifest-bound memory transcription, explicit negative
controls and the actual replay input cursor are the next dependencies.

The post-application census at `2026-10-07T03:49:43.772Z` has
**57 Zodiac / 20 Vegeta / 22 JiReN = 99** admissible unknown results.
Its Full Battle Truth is **3696/5453 = 67.77920410783055%**; receipt
`a14d846e6a31f3236f45f772c3888b62c33f48d7bc144431b58f258723ade45d`.
The deployed projection at `03:49:44.446Z` still includes the retired authorities:
**3719/5453 = 68.2009902805795%**, with `51/20/22 = 93` unknown results;
receipt `f00266e3eaa012e7bebfbc9c21ac1c2ced6c5087d49d01582708b52022ac8fd0`.
Three additional corpus battles arrived between observations. The global
numerator change is not a claim that the approved verdict added Full Truth.
Production source at this observation is `335aa057f5b1e6db198c6a2ff8881f66e223088a`;
this campaign performed no deployment.

The deployed adjudication projector replaces native numeric sides with reviewed
`gold`/`blue` labels, so `25782` is result-known but Workshop roster-incomplete.
The branch correction retains native sides only after an exact complete frozen
and current Steam/name/slot/team bijection, distinct uniform sides and complete
winning-side agreement. Missing, duplicate, changed or ambiguous bindings and
manual regroupings keep the existing named-side projection. Repeated projection
preserves original parser provenance. The actual accepted `192` fixture passes
the unchanged Workshop rule locally; this code is undeployed, so the current
production Full Truth addition from `25782` remains **zero**.

All **99** remaining logical battles have fresh SHA-verified final archives,
current pass-10 parser evidence, exact Steam/slot/name bindings and adjudication
history inspection. Each has one distinct final replay hash; different nonfinal
uploads supply no result authority. The earlier 50 remaining Zodiac byte audits
also match the current canonical team bindings. Immutable complete ledger:
`22e17d482c8ee14521f1cd9571f374c2d586a997e9a024bcfefb03972000f828`;
its case index is [`three-account-current-99-2026-10-07.json`](replay-receipts/three-account-current-99-2026-10-07.json).
The primary blockers are 57 without serialized result packets, 17 disconnect
resignations, 13 partial voluntary sides, 3 resignation identity ambiguities,
3 unproven chapter terminal states, and 6 other distinct side/identity/inference
blockers. None currently passes automatic or human-packet promotion.

One of those six is `25620`: Zodiac/PKNT/Brian_de_Bois form a complete
voluntarily resigned side by `22600ms`, but opposing Monty_Python and
`[Thee]DavidJosephs88` also voluntarily resigned earlier. The exact current parse
and independent rescan agree on all five packets. The strict archive proposal
guard rejects this nomination with `proposal_complete_losing_side_not_proven`;
partial opposing resignations, action order and the last remaining player do not
establish a verdict under that contract. The 23-second early-exit exclusion
remains intact. Research receipt
`cd657aaddff5ff09a243c5d3b888558ebc7d6c5e149117ffccadb802e5104711`
and rejection receipt
`64115b3f73a2b64960dc79125b4363ac456a4345dd50e77cc225cda0cdcaa795`
grant no authority; no additional Commissioner approval is requested prematurely.

The generalized native decoder now binds complete 2/4/6/8 slot observations to
closed modern known-control manifests, exact process/helper/archive identities,
same-world progress and the observed finalizer transition. Adversarial controls
reject stale, mixed, partial and early terminal evidence. Actual unchanged
`32388` observations through sample `616` are independently rejected as
preterminal; receipt
`6c42e635d8985aabb57f6dd8c4ec2f60993e59879ed1b3fafc3d3be56bde7748`.
That historical attempt has parser pass 8, so no modern pass-10 manifest was
fabricated for it; generalized manifest controls are separately tested fixtures.
Schema-5 normal Steam control `cursor-32388-20261007T040353Z` now observes the
logical stream cursor and extent. Sample 553 is the last valid active read:
**664,789 / 665,734 bytes**, leaving **945 bytes unobserved**, with mode and
current/previous/OS errors 0. At sample 554, 253ms later, terminal state and the
finalizer marker are present but the stream pointer is null. There are 444
coherent terminal partitions; no valid bound terminal cursor proves whole-input
consumption. Aggregate receipt SHA-256:
`c7844f7c041f0b26f8940d184bbd9bc490605755af80216a2534581a90e4e421`.
All 44 bound files were reverified. The current independent referee again
rejects the unchanged preterminal prefix and an altered consumption claim.
A historical candidate-partition PASS does not pass the strengthened EOF gate.
No additional control or census was run after this frontier.

Native result authority, whole-input consumption, engine EOF,
instruction-boundary proof and unknown execution remain false. The next bounded
experiment stays on `32388`: observe the bound stream **before release at
`0x5a6e99`**, reading `F=DWORD[ESI+0x14]`, and independently bind the caller,
process/world, cursor/extent, mode and error fields. A shared stream close is not
itself EOF. Additional independently known 1v1/team/4v4 and ambiguous controls,
and a census refresh, require the strengthened known control to pass first.
The API checkpoint contains the exact read set and teardown boundary.

The final continuation is preserved in
[`three-account-structural-frontier-handoff-2026-10-07.json`](replay-receipts/three-account-structural-frontier-handoff-2026-10-07.json).
Its immutable receipt SHA-256 is
`567cd1db29e5459a442c3ab639354da7991d7cd294522546063061bfcc818e00`.
Owning suites at the validated PR heads passed: **2,711 Node tests across 401
active files**, **979 app Python tests**, and **1,518 API tests / 97 skipped**.
Prisma generation, TypeScript, app production build, exact API runtime lock,
secret scanning and documentation checks passed. Both PRs remain draft; no
production write, promotion or deployment occurred in this continuation.

### Reusable native instruction control — 2026-10-07

`aoe2war truth native-control <prepare|run|verify>` now delegates locally to the
API-owned immutable native operation. It preserves the census and every truth
plane boundary. A future Admin control must use this same adapter and receipt,
not implement another launch or interpret preparation PASS as EOF authority.
See [Native Replay Control](NATIVE_REPLAY_CONTROL.md) for the exact commands,
prerequisites, schemas, durable roots, failure/cleanup behavior, idempotency and
expansion gate. The control remains restricted to historical known-result #32388;
no modern manifest is fabricated. The separate pre-release hardware breakpoint
helper preserves raw caller/stream state and restores temporary debug contexts.
Shared close and cursor equality do not prove whole-input consumption or EOF.
