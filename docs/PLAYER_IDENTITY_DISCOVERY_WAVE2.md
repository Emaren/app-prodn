---
id: "aoe2war.app-prodn.docs-player-identity-discovery-wave2"
title: "Player Identity Wave 2 — Deterministic Discovery V2"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn","api-prodn"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "implementation-contract"
reviewed_at: "2026-08-28"
review_interval_days: 30
sensitivity: "restricted"
---

# Player Identity Wave 2 — Deterministic Discovery V2

Review note (2026-08-28): the implementation and publication-boundary
contract was re-reviewed against the current schema, discovery command, and
production release health. The counts, commit references, and receipt hashes
below remain the sealed 2026-07-28 apply evidence; they are not current release
version telemetry. Use `aoe2war status`, `aoe2war audit`, and `aoe2war doctor`
for current estate truth.

## Release truth

This wave is **implemented, pushed, deployed, and populated in production**.
Its rows remain proposed/provisional: no identity resolution run or identity
projection has been published, no claim/link is active, and no multi-account
Warrior cutover has occurred.

| Plane | Verified state |
| --- | --- |
| Git implementation | Additive schema `59f4c86`, deterministic discovery V2 `a187aa5`, exact-Steam leaderboard `d4dc703`, and live census hardening through `baabbeb` are on `origin/main`. |
| Local MBP | Source contains 72 Prisma migration directories and the discovery command. |
| Production database | 74 migration records: 72 applied, two intentionally rolled back, zero incomplete. The additive Player Identity foundation migration is applied. |
| Production web source | Clean checkout `main`, equal to `origin/main`; live verification observed `43b1b9b0bd23f8634e88147faff6fb368e1977ea` before this documentation-only correction; deployed implementation build `20260728153116-44f5f4143c` was built from `746251bc60d46fd52d8d23318e5d568218eb726b`; intervening and later documentation commits do not change that implementation tree; web and replay API services active. |
| Discovery data | Apply committed at `2026-07-28T15:22:04.182Z`: 2,220 PlatformAccounts, 13,839 name observations, 126 provisional name-only buckets, 2,216 provisional Warriors, 2,216 proposed links, and 11 proposed claims. |
| Public account-grain board | `/leaderboard` folds accepted replay evidence to 2,216 exact Steam rows, retains 124 public name-only rows, and adds five profile-only rows after three reserved internal-system UIDs are excluded: 2,345 rows total. |
| Publication boundary | Zero active links, active claims, resolution runs, replay identity projections, and identity publications. |

Do not collapse “populated” into “identity cutover.” The account-grain
leaderboard is deployed, but a populated discovery ledger, published identity
projection, reviewed multi-account link, and active ownership claim remain
separate states.

Wave 2 populates the empty Player Identity foundation from immutable replay-player snapshots without activating claims, historical attribution, aggregate eligibility, or publication.

## Identity rules

- The source corpus is limited to current, accepted replay-stat projections that affect public aggregates and have not been superseded.
- An exact 17-digit SteamID64 creates one `PlatformAccount`.
- Current SiteAccount Steam associations also create profile-only `PlatformAccount` rows when no accepted replay evidence exists.
- Every accepted replay snapshot with SteamID64 becomes a versioned `PlatformNameObservation`.
- One provisional `Warrior` is seeded per replay-backed Steam account; profile-only accounts do not seed Warriors.
- The seed `WarriorPlatformLink` is always `proposed`; `control_verified_at` is null.
- A SiteAccount receives a `proposed` claim only when its SteamID64 exactly matches replay evidence.
- Claim evidence preserves the SiteAccount creation timestamp, and the claim decision has typed subjects for the Warrior, SiteAccount, exact PlatformAccount, and proposed claim row.
- Legacy `verified_at`, verification level, and verification method remain evidence only.
- Name-only snapshots create `ProvisionalIdentity` buckets. Each bucket receives an append-only discovery decision whose typed subjects preserve the bucket and every contributing replay snapshot independently. Buckets never create Warriors or claims.
- Normalized-name equality never merges distinct Steam accounts.
- Wave 2 creates no resolution run, replay identity projection, publication, active link, or active claim.
- Apply mode re-reads the bounded source corpus inside the serializable write transaction after acquiring the advisory lock and rejects any input/result hash change.
- `IdentityDecision.decidedAt` is the PostgreSQL transaction timestamp of the actual apply. Historical replay observation times remain evidence and attribution-window proposals; decisions are never backdated.


## Applied first-run shape

The reviewed plan and committed apply reproduced these categories exactly:

| Output | Expected |
| --- | ---: |
| Accepted current public replay snapshots | 14,036 |
| Replay snapshots with SteamID64 | 13,839 |
| Name-only snapshots | 197 |
| PlatformAccounts | 2,220 |
| Replay-backed PlatformAccounts | 2,216 |
| Profile-only PlatformAccounts | 4 |
| PlatformNameObservations | 13,839 |
| ProvisionalIdentity buckets | 126 |
| Provisional discovery decisions | 126 |
| Platform-seed Warriors | 2,216 |
| Proposed Warrior-platform links | 2,216 |
| Proposed SiteAccount claims with exact replay evidence | 11 |
| Typed IdentityDecisionSubject rows | 7,015 |
| Active links or claims | 0 |

These counts were apply gates, not the authority by themselves. The exact
bounded plan hashes were reviewed before the separately confirmed transaction.

Additional ambiguity evidence in the same accepted corpus:

- 175 exact Steam accounts have more than one normalized display name;
- those accounts contribute 440 normalized names beyond the first, with a
  maximum of 36 names on one account;
- 26 normalized names are shared by more than one exact Steam account;
- 23 of the 126 name-only buckets never appear alongside any Steam ID;
- normalized-name equality cannot safely attach the other 103 buckets either.

The public-safe account census is **2,216 exact replay-backed SteamID64 values**.
Raw final `GameStats` payloads expose 2,222 Steam IDs, but six are outside the
accepted identity projection and must not enter an identity cutover merely
because they appear in legacy JSON.

## Public leaderboard scope boundary

The modern board's `AoE2WAR users` toggle is an app/profile projection, not a
Wave 2 publication. Its **16 public claimed profiles** are:

- 11 replay-backed claimed profiles and five profile-only profiles;
- 15 exact-Steam identities and one site-only identity.

This `claimed` flag means the current public directory attached the identity to
a SiteAccount under the app's existing rules. It does not promote any proposed
`WarriorClaim` to active. Wave 2 still has 11 proposed exact-replay claims and
zero active claims, resolution runs, projections, or publications.

Competitive leaderboard candidates exclude only the exact reserved UIDs
`aoe2hd_ai_concierge`, `aoe2hd_ai_grimer`, `aoe2hd_ai_guy`, and
`challenge-protocol`. Three currently have live profile rows, so the policy
removes three rows from the former 2,348-row presentation and yields **2,345**
public rows; Guy is reserved before a row exists. This does not change the
immutable discovery input, the 2,216 replay-backed PlatformAccounts, or any
Wave 2 receipt hash. Display names are not exclusion evidence.

## Production apply receipt

The bounded production plan used:

```text
maxReplayPlayerSnapshotId = 28076
maxUserId = 159684
inputHash = bfec8bed1ca56ee9b95145fcef670ca66bada6038bdb4c7cb3c75884ee5c4c26
resultHash = 7e673ada19e27ff724f75d23b820acac2d12cf9904486f078c7b4944bb9f1085
```

Restricted mode-`0600` receipts are stored outside the checkout:

| Receipt | SHA-256 |
| --- | --- |
| `2026-07-28-wave2-v2-plan.json` | `773c3d66a0981d71af9ec8d23b2ac05e4649af37327bd3916f1714ee8628179b` |
| `2026-07-28-wave2-v2-apply.json` | `f03b3e0c3451dbdf1029531545a202fec3f9df45f2cab3df9e8556db19cae463` |
| `2026-07-28-wave2-v2-apply.json.applied.json` | `0044822daafd1ef3ff194a9f2b1417ba603de56662b3899695172abe7651de48` |

Receipt directory:
`/mnt/HC_Volume_105319120/aoe2-parser-engine/reports/player-identity/`.
The companion applied receipt confirms the result hash, transaction decision
time, every created count, and all zero-publication safety checks.

## Boundary with the full identity backfill

Wave 2 is a deterministic **discovery seed**, not the complete versioned
identity projection backfill described by the control-plane architecture.

Wave 2 intentionally creates no `IdentityResolutionRun`,
`ReplayPlayerIdentityProjection`, or `IdentityProjectionPublication`. A later
projection backfill must create those versioned rows, run shadow comparisons,
and pass explicit publication gates. Documentation and operator messages must
not call a Wave 2 apply “the identity cutover.”

## Execution modes

`plan` is the default and performs database reads only. It emits deterministic input and result hashes.

```bash
npm run identity:discover -- \
  --mode plan \
  --output /tmp/player-identity-wave2-plan.json
```

`apply` requires the reviewed source watermarks, hashes, output path, and exact confirmation phrase. The complete write runs in one serializable transaction under a PostgreSQL advisory lock and requires all Player Identity tables to be empty.

```bash
npm run identity:discover -- \
  --mode apply \
  --max-snapshot-id <REVIEWED_MAX_SNAPSHOT_ID> \
  --max-user-id <REVIEWED_MAX_USER_ID> \
  --expected-input-hash <REVIEWED_INPUT_HASH> \
  --expected-result-hash <REVIEWED_RESULT_HASH> \
  --output /protected/path/player-identity-wave2-applied-plan.json \
  --confirm APPLY-PROPOSED-IDENTITY-DISCOVERY-V2
```

Apply mode first writes the reviewed apply-intent receipt, then re-reads the bounded source inside the serializable transaction. After a successful commit it writes a companion `.applied.json` receipt. It fails closed if the source hashes change, any identity table is non-empty, any dependency cannot be resolved, any active claim or link appears, or any resolution/publication row is created.
