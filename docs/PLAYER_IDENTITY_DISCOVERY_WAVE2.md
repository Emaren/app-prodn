# Player Identity Wave 2 — Deterministic Discovery V2

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


## Reviewed first-run shape

The precision evidence establishes these expected categories before any apply:

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

Counts are review gates, not permission to mutate. A read-only production plan must reproduce or explicitly explain any difference before apply is designed.

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
