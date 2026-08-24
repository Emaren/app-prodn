---
id: "aoe2war.app-prodn.deploy"
title: "app-prodn Deploy"
type: "runbook"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn","api-prodn"]
audience: ["operators","ai-agents"]
source_of_truth: "git"
authority: "operational-procedure"
reviewed_at: "2026-08-22"
review_interval_days: 30
sensitivity: "internal"
---

# app-prodn Deploy

## Production truth

For a fresh operator or AI-assisted session, begin with
`docs/OPERATOR_START_HERE.md`.

- VPS repo path: `/var/www/AoE2HDBets/app-prodn`
- HD production database: `aoe2hd_db`
- service: `aoe2hdbets-web.service`
- public domain: `https://aoe2war.com`
- bind: `127.0.0.1:3030`
- service user: `tony`
- preferred SSH alias from MBP: `hel1`

## Current systemd behavior

Base unit:

- `/etc/systemd/system/aoe2hdbets-web.service`

Restart tuning drop-in:

- `/etc/systemd/system/aoe2hdbets-web.service.d/restart-tuning.conf`

Current restart tuning:

- `KillSignal=SIGKILL`
- `KillMode=process`
- `TimeoutStopSec=2`
- `SuccessExitStatus=9 SIGKILL`

This exists because normal Next shutdowns were hanging and making deploys flaky.

## One-command operator finish

For ordinary `app-prodn` closure, run the command from the finished registered
feature worktree, canonical Mac checkout, or the production checkout:

```bash
aoe2war finish -m "Ship the finished feature"
```

A feature worktree is promoted only by validated fast-forward into an exact,
clean canonical `main`. A divergent feature is never automatically merged or
rebased. The production checkout continues to delegate through the Mac Operator
Bridge rather than becoming a competing Git authority.

### Feature-worktree closure and validation reuse

When `finish` starts in a registered non-main `app-prodn` worktree, it first
proves:

1. canonical operator `main` is clean and exact with GitHub;
2. the feature is a descendant of that exact main;
3. production source is reachable and clean;
4. candidate paths are safe to auto-commit.

It then commits the finished implementation if necessary, refreshes and commits
the governed Documentation Baseline against that implementation, runs the full
digest-bound release gate once on the resulting documentation descendant,
transfers that PASS evidence to canonical release state, fast-forwards canonical
main, and re-enters ordinary canonical finish.

Generated documentation may create a descendant release commit after the
validated implementation. The release gate may inherit expensive implementation
validation only when implementation, dependency, test-contract, toolchain and
validator digests remain exact. Cheap documentation, secret, diff and dependency
checks still run. Any material implementation or validation-contract change
forces a full gate.

For browser-sensitive UI work, complete the relevant local browser smoke before
calling `finish`. The local `aoe2hdbets_shadow` exists specifically so
interaction and persistence behavior can be tested with production-shaped data
without giving local application code a production write path.

### Interactive AI/operator shell discipline

The release engine is already fail-closed. Do not wrap `aoe2war finish`,
`aoe2war deploy`, rollback, or diagnostic recovery in an outer interactive
`set -euo pipefail` harness. When troubleshooting with an AI or when terminal
stability is in question, use small observable stages rather than one giant
shell transaction.

A long gate/build/soak is not failure evidence. If the terminal disappears,
SSH times out, or the outcome is uncertain, open a fresh terminal and inspect
`aoe2war status` and `aoe2war releases --limit 5` before any retry. The exact
source/build/version/provenance and durable receipts decide what happened.

Direct `aoe2war deploy` may generate and publish a documentation-baseline
commit after the implementation commit. In that normal case the release SHA is
newer than the implementation SHA; the Documentation Baseline continues to
name the implementation commit.

Use `aoe2war finish --dry-run` for a read-only plan that includes source
authority, expected deployment, Doctor blockers, validation steps, and the
automatic mutation boundaries.

On the Mac, `finish` directly owns the transaction. In the production checkout,
the same command authenticates to the internal control plane, queues the exact
allow-listed `finish` action for the outbound Mac Operator Bridge, and streams
the run. If the bridge or credential is unavailable, delegation fails closed;
the VPS does not SSH to itself or become a competing Git authority.

`finish` reconciles eligible unpublished Mac work or a tracked VPS-first
candidate from one exact base, gates and publishes the commit, refreshes
governed documentation and context, applies only the policy-bound cache
retention described below when eligible, deploys only when needed, certifies
the runtime, runs the independent estate audit and Doctor, and leaves one
checkpointed aggregate receipt. Untracked VPS files fail closed. Runtime
certification is recorded immediately, so a later documentation or maintenance
failure cannot incorrectly erase a successful activation.

`aoe2war deploy` is the lower-level protected web release engine invoked by
`finish`. It performs the documentation baseline decision, risk gate, exact
GitHub publish, release manifest, isolated temporary-worktree build, cache-free
staging beside live, zero-mutation activation preflight, bundled
source/build-version/runtime activation while the service is stopped,
immediate internal/public proof, a default 60-second/six-sample health soak
while the full rollback trap remains armed, certification, verified
fast-rollback retention, and an independent final proof. Invoke it directly
only for a deliberately scoped release-engineering operation.

If an exact `.next-release` candidate already exists, rerun `aoe2war finish`
for the ordinary lane, or `aoe2war deploy` for a deliberately scoped low-level
lane. The release engine resumes only the matching stage receipt and artifact;
it does not blindly rebuild or discard the candidate. During `STAGED`,
production source correctly remains on the previous live SHA.

The command observes WOLO listeners `8092` and `8093` as protected dependencies
and requires them to remain unchanged. It does not restart or mutate them.

Mutating release operations are serialized across the Mac and production host
by the canonical release lease, with checkout-local locks as a second guard.
Do not bypass the lease by manually running overlapping production mutations.

The automatic lane accepts Prisma migrations only through its protected
additive migration contract. The release must carry a `DATABASE` or `FINANCIAL`
gate. A migration may create new tables or add nullable columns to pre-existing
tables; constraints on a pre-existing table may reference only columns added by
that release, and a bounded backfill may populate only those same-release
columns. The live pending frontier must exactly equal the manifest, and
activation cannot begin until a durable pre-migration `pg_dump`, SHA-256,
exactly-once migration proof, and release-bound receipt exist. Destructive SQL,
insertion/deletion of pre-existing truth, mutation of pre-existing columns, non-additive
ALTER TABLE work, a partial frontier, unexpected pending migration, or a missing
receipt fails closed.

The lane still refuses a changed `yarn.lock` or changed dependency/package-
manager sections in `package.json`. A dependency-contract-changing release needs
a separately reviewed lane that atomically installs, activates, and rolls back
`node_modules`; the release engine will not silently reuse incompatible
production dependencies.

Outside that protected additive contract, it performs no database mutation. It
also never performs a Wolo mutation, host reboot, kernel/package upgrade, or
broad cleanup. Those are separately authorized maintenance procedures.
Observing exactly one listener on each protected Wolo port, `8092` and `8093`,
is a health invariant; it is not permission to change either service.

The current mutating release lane owns `app-prodn`. Estate audit observes the
replay API, Watcher, documentation, storage, and Wolo boundaries, but `finish`
does not silently deploy those repositories or turn cross-system observation
into mutation authority.

### Bounded storage retention

`finish` previews this policy before mutation and again after certification. If
the operations contract enables automatic retention and eligible caches exist,
it applies the same digest-bound policy; otherwise it records preview/no-op
truth. Preview the policy directly with:

```bash
aoe2war storage-retention
```

The preview is read-only and writes no receipt. An explicitly applied plan is:

```bash
aoe2war storage-retention --apply
```

Apply may remove only the exact `next/cache` directory from eligible older
durable `activate-*` rollback generations. It protects at least the newest two
activation generations; preserves every generation directory, source record,
BUILD_ID, staged/activation/rollback receipt, and active runtime; refuses
symlinks and special files; rechecks the digest-bound plan before each removal;
and proves source/build/service/capacity and protected Wolo identity afterward.
It must never expand into raw replay, database, settlement, user-upload,
Evidence Vault, or general filesystem retention.

Finalized release, rollback, finish, and retention receipts are immutable
operational evidence. Never edit, reuse, or delete a finalized receipt to make
state appear healthy; create a new superseding receipt. The mounted volume is
durable local evidence, but is not an off-host backup. See
`docs/EVIDENCE_VAULT.md` for the unconfigured off-host design and
`docs/HOST_MAINTENANCE.md` for explicitly authorized reboot/package work.

### Normal rollback

Before a real rollback:

```bash
aoe2war rollback --dry-run
```

A real one-step rollback is:

```bash
aoe2war rollback
```

Rollback is receipt-driven. It restores only the immediately previous
`CERTIFIED` source/build/version, preserves the current certified generation as
forward rescue evidence, proves internal/public health, and requires WOLO
listener continuity.

The August 10 live rollback and forward-recovery drill is frozen in
`docs/RELEASE_ENGINEERING_SEAL_2026-08-10.md`.

### Operator context

For a fresh terminal, operator, or AI session:

```bash
aoe2war context
aoe2war status
aoe2war releases --limit 5
```

The repository command is `bin/aoe2war`; Tony's MBP exposes it globally through
`$HOME/bin/aoe2war`.

## Break-glass manual deploy flow

This section is recovery guidance, not an alternative ordinary workflow. Stop
and prefer `aoe2war finish` whenever the protected engine can run. A manual
transaction requires an incident record, an exact release identity, a named
operator, and preservation of equivalent receipts and rollback evidence.

Production advances only to an exact reviewed commit. Source, migration,
build, runtime, and public-release truth are verified separately.

The executable release model is defined in `docs/RELEASE_ENGINEERING.md`.
`DEPLOY.md` remains the canonical operator and emergency runbook; release
automation must preserve these invariants rather than bypass them.

### 1. Seal the release

On the MBP, verify a clean worktree, run the release-specific gates, and prove
that the reviewed local commit matches the intended remote commit.

Never deploy an unspecified moving branch tip.

### 2. Verify production Git transport

The VPS `app-prodn` checkout uses one canonical Git execution identity:

- execution user: `tony`
- origin: `git@github.com:Emaren/app-prodn.git`
- deploy key: `/home/tony/.ssh/gh_deploy_aoe2hdbets_app_prodn`
- deploy-key fingerprint: `SHA256:229KVsTphLtYRwmLbqR82g+uIBRip3wzmXfR3etNcZk`
- known-hosts file: `/home/tony/.ssh/known_hosts`
- Git protocol: version `0`

All production `.git` entries must be owned by `tony`, and all `.git`
directories must be writable by `tony`. Do not run production Git mutation as
`root`; mixed Git ownership is a release-blocking condition.

The repository-local `core.sshCommand` requires `-F /dev/null`, the dedicated
key above, `IdentitiesOnly=yes`, `BatchMode=yes`, `StrictHostKeyChecking=yes`,
the canonical `UserKnownHostsFile`, no TTY, and no remote command. Disabling
the user SSH config prevents an unrelated key from silently satisfying GitHub
authentication.

Protocol v0 is intentional. Authentication and repository reads succeed with
v0; protocol v2 produced `fatal: expected flush after ref listing`.

Verify before changing source:

```bash
git remote get-url origin
git config --local --get core.sshCommand
git config --local --get protocol.version
test "$(find .git ! -user tony -printf . | wc -c)" -eq 0
test "$(find .git -type d ! -writable -printf . | wc -c)" -eq 0
ssh-keygen -lf /home/tony/.ssh/gh_deploy_aoe2hdbets_app_prodn
git fetch origin --prune
```

The fetch must succeed as `tony` through the repository-local transport. Do not
depend on a shared SSH hostname alias or an implicit fallback identity.

### 3. Capture predeploy truth and rollback

Before mutation, verify:

- branch `main`;
- exact current and target commits;
- clean tracked and untracked status;
- active `aoe2hdbets-web.service`;
- active `.next/BUILD_ID` and deployment version;
- sufficient root and mounted-volume space.

Store durable rollbacks and receipts beneath:

```text
/mnt/HC_Volume_105319120/aoe2war/rollbacks/
/mnt/HC_Volume_105319120/aoe2war/deploy-receipts/
```

Preserve a cache-free copy of `.next`, source commit, build identities, the
build-version file when present, systemd evidence, and repository-local Git
configuration. The root fast rollback may retain runtime cache; the durable
copy should not.

### 4. Keep live source on the previous commit while staging

Fetch and verify the sealed commit, but do not advance the live checkout before
activation. Production source, `public/`, `.aoe2war-build-version`,
`node_modules`, and `.next` must all remain on the current certified generation
while `.next-release` is built. Do not use an unbounded pull as the release
selector.

### 5. Apply migrations only through the protected additive lane

A deployment does not automatically require Prisma. When the sealed release
contains reviewed additive migrations, `aoe2war finish` owns their backup-first,
exact-frontier application and receipt verification before activation. Do not
run `npx prisma migrate deploy` manually around the governed transaction.

Documentation, presentation, and localization releases must not touch Prisma
or the database unless their gated release manifest specifically requires it.
Destructive or non-additive existing-table migrations remain separate break-glass work.

### 6. Build in an isolated temporary worktree

Require `yarn.lock` and the `package.json` dependency/package-manager contract to
be unchanged between the previous and sealed commits. Create a detached
per-release Git worktree outside the live checkout, copy the proven production
`node_modules` into that disposable worktree, verify pinned Yarn `1.22.22`, and
run `NEXT_DIST_DIR=.next-release yarn build` there. Remove
`.next-release/cache`, bind the artifact hash/BUILD_ID/build version in the
stage receipt, copy the cache-free artifact into the live checkout as
`.next-release`, and remove the worktree.

Verify compilation, static-page generation, artifact identity, fatal-output
absence, and that live source/public/build-version/dependencies/runtime/service
identity did not change. Prefer the automated `aoe2war deploy` implementation;
do not recreate this transaction ad hoc without its cleanup trap and receipts.

### 7. Swap runtimes

Use a Git-ignored temporary name matching `.next-rollback-*`:

```bash
systemctl stop aoe2hdbets-web.service

mv .next .next-rollback-<release>
mv .next-release .next
git reset --hard <sealed-commit>
printf '%s\n' '<candidate-build-version>' > .aoe2war-build-version

systemctl start aoe2hdbets-web.service
```

Source, build-version identity, and runtime must advance only inside the stopped
service window. Do not use an unignored `.next.pre-*` directory.

### 8. Prove or roll back

Internally and publicly prove:

- active service;
- staged and runtime BUILD_ID parity;
- staged, internal, and public build-version parity;
- homepage;
- `/api/lobby`;
- `/api/bets`;
- release-specific routes and APIs.

Do not delete fast rollback state merely because immediate proof passed. The
automated release engine retains the newest verified modern fast copies and
prunes only older `.next-rollback-activate-*` / `.next-rollback-manual-*`
directories whose BUILD_ID has a proven durable twin. Unmatched or legacy
rollback artifacts are kept. Durable rollback and deployment receipts remain
protected evidence on the mounted volume.

A failure after runtime mutation stops the service, moves the exact candidate
back to `.next-release`, restores the previous `.next`, resets the previous
source commit, restores the previous build-version file, restarts the service,
and proves the complete source/build/version/runtime identity.

## Certified release-engineering completion — 2026-08-10

The release-control system described above was completed and production-proven.

Final certified release-engineering identity:

- implementation SHA: `3a01a658f0a2c875a25447877336c7bb705ca244`;
- release SHA: `f77413662e7819eb82a180f2a01f8a181f56bfe4`;
- BUILD_ID: `jC7k39PxGZyNOGoJzwHEP`;
- build version: `20260810040737-108deccc84`;
- health soak: 60 seconds / 6 samples / PASS;
- fast retention: PASS, keep 2, pruned 2, reclaimed 1,653,296 KB;
- public build-version parity: YES;
- provenance: CERTIFIED;
- Wolo listeners `8092` and `8093`: live and untouched.

The release system also passed a live one-generation certified rollback fire
drill and ordinary forward recovery before final hardening was accepted.

Full immutable evidence and the exact rollback/storage story are recorded in
`docs/RELEASE_ENGINEERING_SEAL_2026-08-10.md`.

## Recent deployment notes

### 2026-08-04 Universal-16 homepage and shell release

- source commit: `1a8fa8981eb23307fe1bbc7620c942fba6566a3b`;
- deployed BUILD_ID: `b85fmpHZ0iR_UtOJJJxHE`;
- public build version: `20260804004945-e5350db18a`;
- all sixteen selector locales drive the global shell and homepage;
- every homepage locale contains 365 static and 31 dynamic entries;
- shell, homepage, bounty, TypeScript, ESLint, and complete production-build
  gates passed;
- internal and public homepage, lobby, and betting checks passed;
- the production checkout uses the canonical GitHub origin, dedicated deploy
  key, and repository-local Git protocol v0;
- the release was built beside the active runtime and swapped after validation;
- durable rollback and deployment receipts were retained;
- no Prisma migration and no database write occurred.



### 2026-08-01 Betting Hall and wager-rail release

- implementation commit: `45f93f8f7b5e0c4180785ab4c16776239fc4936c`;
- deployed checkout: `a0d994ed63d9351608b6d06c433cf118b82f786c`, a documentation-baseline descendant
  of the implementation commit;
- previous production checkout: `bcd4152a46f1926c7886a6b93ea23486b1a453d9`;
- deployed build ID: `WKfeJuQ2vs0XyRij6m1fm`;
- public build version: `20260801211536-2945b45ca5`;
- deployed at: `2026-08-01T21:23:56Z`;
- protected database backup: `/mnt/HC_Volume_105319120/aoe2-parser-engine/backups/aoe2war-betting-hall-20260801T210351Z`;
- prior-build rollback: `/mnt/HC_Volume_105319120/aoe2war/rollbacks/.next-rollback-20260801T210351Z`;
- restricted deployment receipt: `/root/ops-backups/aoe2war-betting-hall-20260801T210351Z`;
- post-deploy root free bytes: `5394227200`;
- post-deploy mounted-volume free bytes: `13099474944`;
- all five additive Prisma migrations applied with zero incomplete migrations;
- generated Prisma client ownership was normalized to the `tony` build user
  after the isolated build correctly stopped on a pre-existing permission
  mismatch;
- the isolated build compiled and generated all 42 static pages;
- the temporary in-repository `.next-old-*` directory was removed only after
  its BUILD_ID matched the protected rollback copy and the active BUILD_ID,
  public version, service health, migrations, and smoke checks were verified;
- local release gates passed Prisma generation/validation, TypeScript, zero
  ESLint errors, 164 focused regressions, the 50-document registry, and the
  complete production build;
- `/bets`, `/api/bets`, `/profile`, `/admin/ai`, ticket authentication,
  automation authentication, betting-bot authentication, deployment-version
  parity, and service health passed after restart;
- Basic preserves the merged heritage surface, Advanced preserves the former
  Extreme presentation, and Extreme owns the new concurrent-battle cockpit;
- winner plus optional Desync stakes use one versioned ticket and one verified
  Keplr transfer while retaining independent proposition settlement;
- Founder quick defaults are 2 WOLO per participant and 1,000 WOLO for the
  winner, with retry-stable but intentionally stackable payout identities;
- Watcher 1.5.7 concurrent sessions converge through canonical battle identity
  and immutable public numbering without stealing an in-progress user ticket;
- profile auto-betting remains Preview-only and Tony/Paulie remain disabled,
  fail-closed counter-bettor configuration. No Wolo consensus upgrade occurred.
  Funded automation still requires the separate settlement-service custody
  rail documented in `docs/BET_AUTOMATION_AND_CUSTODY.md`.


### 2026-07-31 Live final-proof visibility

- implementation baseline: `85b11ea419fb14f089500c16bb9cf8847fd685f9`;
- unresolved `watcher_final` battles remain visible for a bounded 15-minute
  final-proof window;
- the public battle status is `Final proof pending`;
- pending-proof sessions are excluded from active market lookup;
- betting and settlement remain locked;
- trusted final results continue directly to Completed;
- focused regression tests cover the Jim-style suppression case, trusted
  finals, newer-live precedence, and grace expiration;
- no Prisma migration is introduced;
- production release commit: `d2a46cc48fbb0f3ea18294ed8896cce0583e4ba2`;
- build staging mode: `volume`;
- deployed build ID: `pwZq7F-3gRsIklcNOLLOH`;
- public build version: `20260731013957-9e9cfa033f`;
- deployed at: `2026-07-31T01:42:32Z`;
- prior build rollback: `/mnt/HC_Volume_105319120/aoe2war/rollbacks/.next-rollback-20260731T013929Z`;
- restricted VPS receipt: `/root/ops-backups/aoe2war-final-proof-visibility-20260731T013929Z`;
- post-deploy root availability: `4.37 GiB`;
- internal and public live-games and betting routes, their APIs, and the
  deployment-version endpoint returned HTTP 200.


### 2026-07-29 bet and replay reliability release

- web implementation commit:
  `32be8b7b34d8ff60f8f0873c9f5762506a550228`;
- replay API implementation commit:
  `e4d1960eb26540c40193787aa8894db5e7d2d326`;
- deployed build ID: `IE_S62e0zvc7NoYqIn-z0`;
- public build version: `20260729210111-0f1bb6c20a`;
- Prisma: 72 source migrations applied, zero pending;
- backup:
  `/mnt/HC_Volume_105319120/aoe2-parser-engine/backups/aoe2-bet-reliability-20260729T200754Z/database.dump`,
  249,548,506 bytes, SHA-256
  `de2237d7ac2463ca682b2754af36c7208c4e7215bf378476059c55e185e15b34`;
- Jim's six formerly active wagers are terminal: two replay-proven losses and
  four exact chain-proven refunds;
- production wager backlog: zero active wagers, zero
  `awaiting_final_proof`, zero `under_review`, and zero pending core
  payout/refund/corrective-refund claims;
- `/bets` separates Settlement Proof, real bettor Settlement Queue, and
  Resolution Queue. Optional Founder/winner rewards no longer contaminate bet
  settlement state, and routine fast-board capability deferral is not
  presented as an outage;
- the app/API accepts a trusted structured duel winner when the raw scalar is
  only an `Unknown` placeholder, while named/team contradictions remain
  fail-closed;
- replay upload authentication commits before CPU parsing, preventing the
  parser worker from holding an API connection throughout binary parsing;
- `/matchups` and `/game-stats/[id]` share the complete-corpus rivalry builder;
  the verified Emaren–Sechma result is 13 meetings, 9–0 decided, four
  unresolved;
- 538 false-resolved public projections received append-only unresolved
  successors with zero aggregate rebuild, duplicate currents, coverage
  regressions, or invalid lineage;
- browser-local time is primary across the released user surfaces, with UTC as
  deterministic fallback and secondary inspection truth;
- `/api/wolo/network?format=table` reports 35 known addresses and reconciles
  canonical supply and known bank balances at 100,000,000.000000 WOLO;
- web/API/Wolo services were active after deploy. Wolo consensus and settlement
  binaries remain intentionally split; no chain upgrade is required.

Full evidence and invariants are recorded in
`docs/BET_AND_REPLAY_RELIABILITY_2026-07-29.md`.

### 2026-07-28 HD Leaderboard Advanced-default refinement

- implementation baseline: `c8b11c0373f6b276b34870d535bda35d656a2ccf`;
- Advanced is now the default for visitors without a saved leaderboard
  preference;
- previously saved B/A/E choices remain respected;
- the B/A/E selector is positioned in the leaderboard surface’s upper-right
  corner;
- public scope labels are `Warriors` and `Kingdom`;
- claimed-count subtitles are removed;
- `Open Game Stats` is removed from the leaderboard;
- the Watcher reconstruction paragraph is removed;
- RM/DM lane behavior, scope behavior, search, pagination, rankings, identities,
  and replay-derived movement are unchanged;
- no Prisma migration is introduced;
- production release commit: `795bc0e5ef92816439bea4dd4d87d6c2f77af7b4`;
- deployed build ID: `tveJ4q5OsZK0Dz90Igw9B`;
- public build version: `20260729020743-adcde508ec`;
- deployed at: `2026-07-29T02:10:09Z`;
- prior build rollback: `/mnt/HC_Volume_105319120/aoe2war/rollbacks/.next-rollback-20260729T020716Z`;
- restricted VPS receipt: `/root/ops-backups/aoe2war-leaderboard-advanced-default-20260729T020716Z`;
- post-deploy root availability: `6.13 GiB`;
- internal and public leaderboard routes, the leaderboard snapshot API, and the
  deployment-version endpoint returned HTTP 200.


### 2026-07-28 HD Leaderboard B/A/E presentation release

- implementation baseline: `6447fd3cad63adb8886b8e982dca3550fba61c1e`;
- Basic preserves the previously shipped `72rem` presentation and remains the
  default;
- Advanced expands to `90rem`, adds a compact branded Watcher card, uses the
  premium player-scope control, and removes the public census row;
- Extreme expands to `118rem`, uses the full branded Watcher card, removes the
  public census row, and pulls the table directly beneath the command controls;
- view choice persists under the repository-standard `leaderboard` tile-view
  preference;
- RM/DM lane, player scope, search, pagination, rank semantics, and identity
  semantics are unchanged;
- no Prisma migration is introduced;
- production release commit: `96f82670da29d70b0d1687e00c847caa2c9f48a4`;
- deployed build ID: `0xVDmZHtbuC9y0c9sw2kJ`;
- public build version: `20260728232251-8b6d5eb991`;
- deployed at: `2026-07-28T23:25:10Z`;
- prior build rollback: `/mnt/HC_Volume_105319120/aoe2war/rollbacks/.next-rollback-20260728T232229Z`;
- restricted VPS receipt: `/root/ops-backups/aoe2war-leaderboard-bae-20260728T232229Z`;
- post-deploy root availability: `6.14 GiB`;
- `/leaderboard`, the leaderboard snapshot API, the deployment-version
  endpoint, and the public leaderboard route returned HTTP 200;
- the production checkout was subsequently advanced only through the
  documentation receipt commit without rebuilding.


### 2026-07-28 leaderboard scope and pagination hardening

Implementation is complete in the release candidate, but do not treat this
subsection as a production receipt until the commit, build ID, service restart,
and browser/API checks are appended after deployment.

- `/leaderboard` defaults to `scope=all` and offers `scope=claimed` for public
  AoE2WAR profiles;
- default and claimed ranks are contiguous inside the active scope, and
  reconstructed 24-hour comparison ranks use that same scope;
- the paginated API is strict: it never appends off-page featured profiles, and
  `nextOffset` advances only by the returned row count;
- homepage/lobby contender enrichment remains available only through the
  explicit `includeFeaturedClaimed: true` snapshot option;
- client and server caches isolate RM/DM lane plus scope;
- exact reserved UIDs `aoe2hd_ai_concierge`, `aoe2hd_ai_grimer`,
  `aoe2hd_ai_guy`, and `challenge-protocol` never enter competitive boards;
  the first, second, and fourth are the three current live system rows;
- the post-exclusion projection is 2,345 public rows: 2,216 replay-backed
  exact-Steam rows, 124 public name-only rows, and five profile-only rows;
- the claimed scope is 16 public profiles: 11 replay-backed plus five
  profile-only, representing 15 exact-Steam identities and one site-only
  identity.

### 2026-07-28 identity leaderboard and corpus-census release

- clean production checkout: `main`, equal to `origin/main`; the live
  verification observed `43b1b9b0bd23f8634e88147faff6fb368e1977ea`
  before this documentation-only correction, so later documentation
  descendants may advance the checkout without changing the running
  implementation;
- running implementation build: `20260728153116-44f5f4143c`, built from
  `746251bc60d46fd52d8d23318e5d568218eb726b`; the later commits through the
  current checkout are documentation-only;
- Prisma: 72 migration directories; live ledger 74 rows, 72 applied, two
  historical rolled-back attempts, zero incomplete, and no pending migration;
- Player Identity Wave 2 applied once from the exact bounded plan at
  `2026-07-28T15:22:04.182Z`;
- populated identity foundation: 2,220 PlatformAccounts, 13,839 name
  observations, 126 provisional name-only buckets, 2,216 provisional Warriors,
  2,216 proposed links, 11 proposed claims, and zero active/publication rows;
- live leaderboard: 2,348 additive rows with exact-Steam alias folding,
  expandable per-name statistics, and reconstructed 24-hour rank movement;
- live Parser Observatory: 7,990 physical objects, 2,093 indexed/decoded
  artifacts, 5,897 unindexed/unclassified objects, and explicit
  final/public/deduplicated battle denominators;
- `/leaderboard`, `/game-stats`, and `/battle-archive` passed server and
  browser interaction/visual checks; web and replay API services were active.

The restricted plan/apply receipt hashes are recorded in
`docs/PLAYER_IDENTITY_DISCOVERY_WAVE2.md`. The apply is proposed-only and is not
an identity projection publication. Root storage had 2.3 GiB free (94% used)
after the production builds, below the preferred 6 GiB deployment floor; treat
additional package/build work as a capacity-risk decision.

### 2026-07-26 production parity seal

The inspected production deployment is tied to exact identities:

- app source `22232a0bcc038a567acd052f432883e70482a3f9` on clean `main`, equal to `origin/main`;
- API source `d2d68646b1aff3ffb9e647ee0fe4deaa143b2c6e` on clean `main`;
- active Wolo source `d5dea8d6f1a2b0b57489a5e468dd21e34246891e` on clean `wolo-1-mainnet-prep`, equal to its remote;
- web build `20260726054351-9b5a6fcd0b` started after the build completed;
- Watcher release `1.5.6` is present in Windows installer/direct EXE, Apple Silicon DMG, Linux AppImage, direct ZIP, and update manifests;
- live database: 71 applied source migrations, zero incomplete; all six July 22–26 gates applied.

A deploy is not health-green solely because source parity passes. At this seal, `aoe2hdbets-replay-auto-recovery.timer` was enabled but `active (elapsed)` with `NextElapse=infinity`, and root storage was 94% used. Post-seal remediation changed the timer to schedule from activation and prior service completion, reclaimed 1.00 GiB of regenerable root data, completed replay candidate recovery successfully, and verified a subsequent recurring run with `Result=success`. Root then had 3.33 GiB free: above the parser's 3 GiB safety reserve but still below the preferred 6 GiB deployment floor. Do not run a large build or package operation until more root capacity is reclaimed or build caches are moved off `/`.

The Wolo mainnet node intentionally runs `/usr/local/bin/wolochaind-mainnet-node-prewartrophy` at `d3bd62414a047a492a3814b7d3baa2717d64db2e` while both settlement services run `/usr/local/bin/wolochaind-mainnet` at `d5dea8d6f1a2b0b57489a5e468dd21e34246891e`. Never rebuild or replace the consensus binary as a routine app deploy step.


### 2026-07-18 Challenge lifecycle v2

- Challenge creation now defaults to a 72-hour open acceptance window and Play Anytime after both sides fund; exact match times are optional and use browser-local display with UTC as secondary truth.
- Added explicit `accept_by`, `fund_by`, `play_by`, `match_time`, exact-time confirmation, creation idempotency, canonical funding-proof uniqueness, bounded Challenge history, folded lifecycle records, and deterministic settlement retry metadata.
- Automatic reconciliation is restricted to Challenge V2 rows with non-null `creation_request_id`; migrated legacy rows remain operator-reviewed and are never silently swept by the timer.
- Install `deploy/aoe2hdbets-challenge-reconcile.service` and `.timer` only after the application migration/build/smoke gate passes and `CHALLENGE_RECONCILE_TOKEN` (or `CRON_SECRET`) is present in `/etc/aoe2hdbets/aoe2hdbets-web.env`. The timer runs every five minutes and may execute deterministic refunds for newly expired V2 Challenges.
- Before enabling the timer, take a restricted Postgres backup, run `npx prisma migrate deploy`, `npx prisma generate`, `npm run test:challenge`, `npx tsc --noEmit --pretty false`, the relevant lint/build gates, and deploy through the isolated `.next-release` atomic swap.
- Historical Jim vs Zodiac Challenge #24 is not an automatic-reconciliation target. Production audit identified a 1,010 WOLO funded liability (1,000 wager + 10 guarantee) with no refund/settlement row at audit time. Re-query current DB/chain truth after deploy, dry-run only #24 through the existing admin scheduled-settlement rail, and execute exactly once only if it is still outstanding.

### 2026-07-13 team-market integrity and incident correction rail

- API replay players now retain canonical explicit team IDs and expose team resolution/final winner coherence.
- Watcher team markets require high-confidence explicit teams, persist immutable proposition snapshots, lock on first stake, and fail closed during final settlement.
- Added `/admin/market-integrity`, exact incident/adjustment/alias tables, read-only historical audit artifacts, and evidence-locked repair scripts.
- Before migration, make a restricted Postgres backup and exact incident export with hashes. Then run `npx prisma migrate deploy`, verify `bet_market_integrity_incidents`, `bet_market_financial_adjustments`, `player_identity_aliases`, and new `bet_markets` columns/indexes, build, and restart.
- Do not apply a financial repair until new code is live, the settlement/signing rail is verified, the dry run matches every chain/database fact, and the backup exists. Never bulk repair from audit heuristics.
- Runtime evidence paths are `runtime/market-integrity-backups` (mode `0700` directory / `0600` files) and `runtime/team-market-audits`; preserve their hashes off-checkout before cleanup or redeploy.

### 2026-07-03 Hero Studio and Main Stage carousel

- Replaced the direct single EventTile placement on `/` and `/lobby` with a
  typed Hero carousel while preserving the Wolomania composition as the hard
  runtime fallback.
- Added `/admin/hero-studio` for the reusable screen library, ordering,
  enabled state, schedules, per-screen durations and links, global transition
  presets, desktop/mobile preview, atomic publication revisions, and rollback.
- Added Featured Event, Wolo Chronicle, Warrior Quote, and generic Media
  Takeover renderers. EventTile and ForumThread remain their own source-of-truth
  models.
- Added `hero_playlists`, `hero_screens`, `hero_playlist_items`, and
  `hero_playlist_publications` in
  `20260703_193000_add_hero_studio`; the follow-up
  `20260703_200000_publish_hero_bootstrap` seals the seeded three-screen chain
  as immutable revision 1 so later draft edits are private immediately.
- Media Armory now accepts `motion` MP4/WEBM assets up to 48 MB. The managed
  upload serving route supports byte ranges for video playback.
- Reuse `/mnt/HC_Volume_105319120/aoe2-managed-assets`, keep it owned by
  `tony:tony`, and preserve `MANAGED_MEDIA_UPLOAD_DIR` in the production web env.
- Deployment requires `npx prisma migrate deploy`, explicit verification of
  the four `hero_*` tables, build, restart, and public `/` plus
  `/admin/hero-studio` smoke checks.

### 2026-07-01 War Room forum and Wolo Chronicles

- Replaced the inert `/forum` display shell with a real browsable War Room while preserving the original focused composition as Basic.
- Advanced is the persistent default at `75rem`; it adds the Wolo Chronicles lead, room signals, thread excerpts, and field-manual context. Extreme currently widens the Advanced kit to `96rem`.
- Added working search, tabs, channels, feed shelves, read state, bookmarks, direct-linked thread readers, copy links, new-thread publishing, replies, and named reactions.
- Added `forum_threads`, `forum_posts`, `forum_thread_bookmarks`, and `forum_thread_reactions` in `20260701221500_add_war_room_forum`.
- The editorial archive remains readable and clickable before migration. `/api/forum` returns HTTP 200 with `ledgerAvailable=false` and `X-AoE2WAR-Forum-Ledger: migration-required`; shared writes stay disabled.
- Deployment requires `npx prisma migrate deploy` before the production build and restart. Verify `ledgerAvailable=true` after migration.

### 2026-06-20 Lobby Event Studio App Pass A

- Added persistent `event_tiles` content and `/admin/events` operator controls for the single cinematic tile shared by `/` and `/lobby`.
- Seeded the currently shipped Wolomania Jim / Julio / Commissioner / championship-belt composition as the active published event without replacing its real warrior or artifact art.
- The public routes fall back to that same hardcoded Wolomania composition if no active published row exists or EventTile persistence is unavailable.
- Event Studio supports create, edit, duplicate, publish, activate, unpublish, archive, safe internal/HTTPS media paths, and exact desktop/mobile public-component previews.
- Featured Warriors, Commissioner Overrides, Featured Warriors stat rotation, and chain behavior are unchanged in this pass.
- Deployment requires `npx prisma migrate deploy` before the production build and restart.

### 2026-06-19 War Trophy foundation

- Added persistent Trophy, economics-version, challenge, payout, event, and
  settings tables.
- Added `/admin/trophies` with holder/Guardian custody, belt/artifact
  definitions, explicit nationality-forfeiture review, replay verification,
  dry-run settlement, payout retry, chain-intent diagnostics, and audit tabs.
- Seeded Canada/USA/Mexico/UK national belts plus the Elite Guardian-held belt.
- Public Champions and Profile surfaces now read live app-side custody and show
  projected dethrone bounties.
- Seeded-title challenge links create a linked TrophyChallenge beside the
  existing scheduled match and validate holder/Guardian targeting plus
  nationality/ELO eligibility.
- Deployment requires `npx prisma migrate deploy` before the production build
  and restart.
- Chain-backed trophy mode remains disabled. NFT operations are logged intents,
  not WoloChain ownership changes.

### 2026-06-19 lobby view-width and mobile rail pass

- Restored mode-owned lobby widths: Basic `65rem`, Advanced `75rem`, and default Extreme `96rem`.
- Kept Extreme as the full-width power-user composition while making its leaderboard and War Chest internally scrollable.
- Increased the Extreme desktop War Chest rail to preview roughly nine earners and constrained the mobile War Chest to a viewport-sized scroll frame.
- Rebuilt the Wolomania lobby promo for narrow screens and hardened mobile wrapping on the installed app WOLO ledger and profile holding cards.
- Removed the redundant mid-page lobby broadcast theater and its dead component; `/watch` and shared stream/player components remain unchanged.
- No database migration is required for this release.

### 2026-06-18 premium AOE2WAR navigation shell

- Replaced the global theme-circle row with the AOE2WAR wordmark; the logo links to `/`, while theme and tile appearance controls remain on `/profile`.
- Added route-aware page headings across the shared shell.
- Added `/kingdom` to the castle dropdown and made the desktop menu hover/focus traversable without requiring a click to hold it open.
- Moved mobile castle and account surfaces into document-level sheets so blurred header stacking contexts cannot clip them.
- Refined the mobile top command rail and bottom quick-command navigation.
- No database migration is required for this release.

### 2026-05-30 Advanced lobby arena and live ticker

- Added `live_ticker_messages` for admin-managed text ticker messages.
- `/lobby` defaults to Advanced view with a moving header ticker, Watch & Chat hero/comments rail, compact hero bet slip, compact WOLO swap tile, then the existing Community Lobby content.
- Basic view remains available and should preserve the simpler lobby-first layout.
- Deployment requires `npx prisma migrate deploy` before restarting `aoe2hdbets-web.service`.
- Optional market display env: `WOLO_OSMOSIS_POOL_ID=3461`, `WOLO_OSMOSIS_POOL_URL=https://app.osmosis.zone/pool/3461`, `WOLO_OSMOSIS_LCD_URL=https://lcd.osmosis.zone`, `WOLO_MARKET_LABEL=WOLO Market`. Leave `WOLO_USD_PRICE` unset to derive the Advanced lobby market price from pool 3461; set it only as a manual override.
- `wolo-1` is strict mainnet mode: `/bets` requires a Keplr-signed stake tx, and mainnet-facing WOLO/bet rails hide pre-mainnet testnet-era rows. Optional display cutoff: `WOLO_MAINNET_DISPLAY_START_AT=2026-05-25T00:00:00.000Z`.

### 2026-05-05 watcher telemetry and funnel truth

- Added `watcher_client_events` for Electron watcher runtime telemetry.
- Admin watcher rail now treats `/download/watcher/*` rows as noisy package pulls, not confirmed users.
- Confirmed watcher users come from linked watcher client events plus the historical `game_stats.parse_source in ('watcher_live', 'watcher_final')` fallback.
- Deployment requires `npx prisma migrate deploy` before restarting `aoe2hdbets-web.service`.
- Watcher package artifacts should be rebuilt/synced before claiming the new telemetry client is in downloadable packages.

## WOLO betting env that must stay aligned

When `/bets` is expected to open real Keplr stake locks, these envs must agree in the live web env:

- `NEXT_PUBLIC_WOLO_CHAIN_ID=wolo-1`
- `NEXT_PUBLIC_WOLO_RPC_URL=https://rpc-mainnet.aoe2war.com`
- `WOLO_RPC_URL=https://rpc-mainnet.aoe2war.com`
- `NEXT_PUBLIC_WOLO_REST_URL=https://rest-mainnet.aoe2war.com`
- `WOLO_REST_URL=https://rest-mainnet.aoe2war.com`
- `NEXT_PUBLIC_WOLO_BET_ESCROW_ADDRESS`
- `WOLO_BET_ESCROW_ADDRESS`
- `WOLO_SETTLEMENT_URL` must remain empty unless the mainnet settlement service is deliberately deployed on `127.0.0.1:8092`, `/settlement/v1/health` reports `ok=true` and `chain_id=wolo-1`, and the fresh payout/escrow signers are funded. It must not point at the old local testnet settlement target `127.0.0.1:8091`.
- `WOLO_SETTLEMENT_AUTH_TOKEN` must come from the root-only WoloChain mainnet settlement env after the 8092 health gate is green.
- `WOLO_BET_PAYOUT_ADDRESS=wolo1zfa9ssu2gpgqg7yzvhmjt4w66mza07qr2a4rwu`
- `WOLO_BET_ESCROW_ADDRESS=wolo1zygwt232ymc4h2g52yvkntffhmd5alx2kglw7p`
- `WOLO_COMMUNITY_TREASURY_ADDRESS=wolo1hlfvzuv4dc46ngvh3zlteuegx0xga20hj20zd2`
- `WOLO_FAUCET_CLI=/usr/local/bin/wolochaind-mainnet`
- `WOLO_FAUCET_HOME=/var/lib/aoe2hdbets-wolo-mainnet`
- `WOLO_FAUCET_FROM` set to the wolo-1 app signer key name
- `WOLO_FAUCET_CHAIN_ID=wolo-1`
- `WOLO_FAUCET_NODE_RPC=http://127.0.0.1:27657`
- `WOLO_STAKING_WALLET_ADDRESS` / `NEXT_PUBLIC_WOLO_STAKING_WALLET_ADDRESS`
- `WOLO_STAKING_WALLET_MNEMONIC`
- `WOLO_STAKING_HOME=/var/lib/aoe2hdbets-wolo-mainnet`
- `WOLO_STAKING_UNSTAKE_FEE` (optional; defaults to `auto`)

If `NEXT_PUBLIC_WOLO_BET_ESCROW_ADDRESS` or `WOLO_BET_ESCROW_ADDRESS` are missing on `wolo-1`, `/bets` must block with an escrow config error. It should not record an app-only mainnet wager.

For `/staking`, fund the staking wallet with total confirmed user stake plus the operator reserve/headroom used for WoloChain unstake sends. AoE2HDBets defaults to a `10 WOLO` reserve unless `WOLO_STAKING_UNSTAKE_HEADROOM_UWOLO` is set. User max-unstake should not be reduced by this reserve; underfunding should show the operator top-up warning instead.

Mainnet public staking display derives from tx-backed rows only: indexed
WoloChain `MsgSend` rows to/from the staking wallet plus confirmed app
`staking_events` with verified `wolo-1` tx hashes. Legacy `staking_positions`
rows may exist for operator/history workflows, but must not drive public
mainnet totals, operator funding requirements, or unstake limits. After deploy,
run `scripts/backfill-wolo-mainnet-transfers.mjs` or the admin backfill route
to refresh `/api/wolo/mainnet-transfers`. After the June 2026 transfer-index
composition migration, run the backfill with explicit wide limits so older direct
bank sends, including Jim/Sniper transfers, are indexed:

```bash
node scripts/backfill-wolo-mainnet-transfers.mjs --block-limit=5000000 --address-limit=400 --per-address-limit=5000 --global-limit=100000
```

The `/staking` public economy rail displays bank balances for the configured
staking wallet, community treasury, bet escrow, payout signer, and DEX liquidity
addresses. Empty custody wallets should show `0.00 WOLO`; do not replace that
with modeled or app-ledger values.

`/staking` Recent Activity should not hide mainnet-era settlement debt just
because no payout tx exists yet. Verified `wolo-1` stake/transfer rows remain
tx-backed, while pending `pending_wolo_claims` rows are grouped by market and
labeled as settlement queue state. A Coco de Hae style app-only market can show
as pending settlement debt; it must not be described as a chain tx until the
claim row has a `payout_tx_hash`.

On `wolo-1`, `/staking` public totals, personal stake, leaderboards, and reward
weights are rebuilt from indexed WoloChain mainnet `MsgSend` rows to/from the
staking wallet on or after `2026-05-25T00:00:00.000Z`. Do not use legacy
app-only `staking_positions` as public mainnet truth. Refresh the transfer
index with:

```bash
node scripts/backfill-wolo-mainnet-transfers.mjs --block-limit=100000 --global-limit=100
```

The read-only smoke endpoint is:

```bash
curl -s https://aoe2war.com/api/wolo/mainnet-transfers?limit=10 | jq '{totalRows, latestTimestamp, rows: [.rows[] | {txHash, amountLabel, senderLabel, recipientLabel, timestamp}]}'
```

Unstake execution must sign from the staking wallet itself. Do not route unstake through the generic betting payout service: that service may preserve its own settlement headroom and will block or pay from the wrong custody rail. The live web env needs `WOLO_STAKING_WALLET_MNEMONIC` for `/api/staking/unstake` to broadcast the return transfer.

Staking reward distributions are executed through the protected web route
`POST /api/staking/rewards/run`. The route finalizes the last closed UTC day,
allocates the staker side of the 1% betting fee by staking weight, pays valid
wallets through the WOLO settlement rail, and records successful payouts as
staking `CLAIM` events for the Recent Activity tile.

Required env:

- `STAKING_REWARD_RUN_TOKEN`
- `STAKING_REWARD_RUN_URL=http://127.0.0.1:3030`
- `WOLO_SETTLEMENT_URL` and related settlement auth env

Recommended VPS timer shape:

```ini
# /etc/systemd/system/aoe2hdbets-staking-rewards.service
[Service]
Type=oneshot
User=tony
WorkingDirectory=/var/www/AoE2HDBets/app-prodn
EnvironmentFile=/etc/aoe2hdbets/aoe2hdbets-web.env
ExecStart=/usr/bin/npm run staking:rewards:run

# /etc/systemd/system/aoe2hdbets-staking-rewards.timer
[Timer]
OnCalendar=*-*-* 00:10:00 UTC
Persistent=true

[Install]
WantedBy=timers.target
```

## Verification

Minimum deploy checks:

```bash
curl -I https://aoe2war.com/
curl -I https://aoe2war.com/lobby
curl -I https://aoe2war.com/live-games
curl -I https://aoe2war.com/challenge
curl -I https://aoe2war.com/champions
curl -I https://aoe2war.com/players
curl -I https://aoe2war.com/contact-emaren
curl -I https://aoe2war.com/forum
curl -s https://aoe2war.com/api/forum | jq '{ledgerAvailable, threadCount: (.threads | length), firstThread: .threads[0].title}'
curl -s https://aoe2war.com/api/trophies | jq '{count: (.trophies | length), trophies: [.trophies[] | {trophyId, status, currentHolder, guardianHolder, chainStatus}]}'
curl -s https://aoe2war.com/api/trophies/canada_champion_belt/metadata | jq '{name, external_url, attributes}'
curl -s https://aoe2war.com/api/lobby | jq '.leaderboard.trackedPlayers, (.leaderboard.entries | length)'
curl -s 'https://aoe2war.com/api/lobby/leaderboard?lane=rm&scope=all&offset=0&limit=50' \
  | jq -e '.scope == "all" and (.entries | length) <= 50 and ([.entries[].rank] == [range(1; 1 + (.entries | length))])'
curl -s 'https://aoe2war.com/api/lobby/leaderboard?lane=rm&scope=all&offset=50&limit=50' \
  | jq -e '.scope == "all" and (.entries | length) <= 50 and ([.entries[].rank] == [range(51; 51 + (.entries | length))])'
curl -s 'https://aoe2war.com/api/lobby/leaderboard?lane=rm&scope=claimed&offset=0&limit=50' \
  | jq -e '.scope == "claimed" and .trackedPlayers == 16 and .claimedIdentityRows == 16 and ([.entries[].rank] == [range(1; 1 + (.entries | length))]) and (all(.entries[].uid; . != "aoe2hd_ai_concierge" and . != "aoe2hd_ai_grimer" and . != "aoe2hd_ai_guy" and . != "challenge-protocol"))'
curl -s https://aoe2war.com/api/lobby | jq '{ticker: (.liveTicker.items | length), market: .woloMarket.poolId}'
curl -s https://aoe2war.com/api/bets | jq '.wolo | { betEscrowMode, onchainEscrowEnabled, onchainEscrowRequired, betEscrowAddress }'
curl -s https://aoe2war.com/api/staking/summary?period=24h | jq '.summary["24h"] | {betsPlaced, betVolumeWolo, activeStakers, totalStakedWolo, directTransferCount}'
curl -s https://aoe2war.com/api/staking/summary?period=all | jq '.summary.all.activity[] | select(.eventType=="SETTLEMENT") | {label, detail}'
curl -s https://aoe2war.com/api/wolo/mainnet-transfers?limit=5 | jq '{totalRows, latestTimestamp}'
journalctl -u aoe2hdbets-web.service -n 20 --no-pager
```

For WOLO betting deploys, also do this manual smoke pass:

```bash
# 1. Confirm the public payload still exposes live escrow truth.
curl -s https://aoe2war.com/api/bets | jq '.wolo | { betEscrowMode, onchainEscrowEnabled, onchainEscrowRequired, betEscrowAddress }'

# 2. Verify the service is healthy, then open /bets in a real browser session.
journalctl -u aoe2hdbets-web.service -n 20 --no-pager
```

Expected result for the browser pass:
- `/bets` loads with a real open market
- clicking `Lock 100` opens Keplr
- after approval, the UI reaches `Escrow confirmed`
- only then does `/api/bets/wager` record the slip
- `/api/bets` reports `betEscrowMode: "required"` and `onchainEscrowRequired: true` on `wolo-1`
- if a stake intent exists but no usable tx proof is attached yet, Your Book shows a pending proof row and the server keeps scanning recent WoloChain escrow deposits for 24 hours
- challenge-linked markets should not appear beside a duplicate `watcher-live-*` market for the same session when the sides map safely

If browser wallets report `Failed to fetch balance`, `network error`, or a dead Keplr handoff, check these before blaming app code:

```bash
curl -sSI -H 'Origin: https://aoe2war.com' https://rpc-mainnet.aoe2war.com/status | rg 'Access-Control-Allow-Origin|HTTP/'
curl -sSI -H 'Origin: https://www.aoe2war.com' https://rpc-mainnet.aoe2war.com/status | rg 'Access-Control-Allow-Origin|HTTP/'
curl -sSI -H 'Origin: https://aoe2war.com' https://rest-mainnet.aoe2war.com/cosmos/base/tendermint/v1beta1/blocks/latest | rg 'Access-Control-Allow-Origin|HTTP/'
curl -sSI -H 'Origin: https://www.aoe2war.com' https://rest-mainnet.aoe2war.com/cosmos/base/tendermint/v1beta1/blocks/latest | rg 'Access-Control-Allow-Origin|HTTP/'
journalctl -u aoe2hdbets-web.service -n 20 --no-pager
```

For inbox attachment fixes, verify the actual binary route too:

```bash
# Requires a valid aoe2hdbets_session cookie from a real participant.
curl -I --cookie "aoe2hdbets_session=..." \
  https://aoe2war.com/api/contact-emaren/attachments/<messageId>
```

Expected result:
- `200`
- correct binary `content-type` such as `image/webp`
- safe `content-disposition` with ASCII `filename=` and UTF-8 `filename*=`

## What matters most after deploy

The most important public product smoke tests are now:

1. `/lobby` loads cleanly
2. Advanced `/lobby` shows the moving live ticker, Watch & Chat hero with comments to the right, reactions and compact bet slip under the video, WOLO swap tile, and the existing Community Lobby below them
3. Basic `/lobby` view still shows the simpler leaderboard/tournament/war-chest-first layout
4. `/api/lobby` includes `liveTicker` and `woloMarket`
5. `/admin` can create/enable/disable ticker messages without exposing controls to normal users
6. `/leaderboard` defaults to the full board, loads sequential ranks without
   off-page insertions, and toggles to 16 public AoE2WAR profiles with
   contiguous scope ranks
7. The AI Scribe, Grimer, Guy of Moxica, and Challenge Protocol do not appear
   under either scope; a public user with the same display name remains
   eligible because exclusion is UID-based
8. `/bets` reports live escrow truth and can still open a real lock flow in-browser
9. tournament panel loads cleanly
10. `/live-games` responds
11. same-origin `/api/lobby` returns a believable snapshot shape
12. browser stream routes exist: `/api/streams/active` returns JSON, and `game_watch_streams` has the browser-stream columns after `npx prisma migrate deploy`
13. `/profile?watcher_stream=1&stream_session=smoke&stream_title=Smoke%20Match` renders the streamer studio without losing the watcher handoff params through auth
14. a cancelled or failed Keplr/Ledger stake attempt records a `bet_wallet_error` activity event when it fails before stake-intent creation
15. `/api/admin/users/rails` includes `walletFriction`, and `/admin/wolochain` renders the wallet-friction rail
16. signed-stake recovery still requires a real tx hash, while recent no-proof stake intents remain visible as pending proof rows
17. recent settled `/bets` results show one row per linked session, preferring challenge-linked books over watcher shadows

This matters more now than older homepage-only checks because the lobby/community shell is the real public spine.

Browser stream runtime notes:

- `storage/live-streams/` is runtime media storage and must stay writable by the web service user.
- Optional production override: `AOE2_STREAM_STORAGE_DIR=/path/to/stream-storage`.
- Optional chunk retention override: `AOE2_STREAM_CHUNK_RETENTION_MS=21600000`; active-stream polling also ends stale browser streams and prunes old ended chunks.
- AoE2WAR streaming is browser/watcher WebM chunk distribution with a rolling playback route. It is intentionally not WOLO-gated and does not require Twitch or OBS.
- Watcher `1.5.0` can stream natively with watcher-key auth or open `/profile?watcher_stream=1&stream_session=...&stream_title=...` as a browser fallback. Unsigned macOS builds use manual download-and-replace updates until notarized; signed Windows builds can install in place when idle.

## Known deploy gotchas

### Ownership drift

If `git pull` or `npm run build` fails with `Permission denied`, inspect file ownership before doing anything else.

Common symptoms:
- `error: unable to unlink old ... Permission denied`
- `EACCES` writing `.next/cache/images`
- one or more files under the app tree owned by `root`
- `npm run build` or `npm run start` now failing early from `scripts/prepare-runtime-cache.mjs`

Fast check:

```bash
ls -l app/api/contact-emaren/attachments/[messageId]/route.ts
ls -ld .next .next/cache .next/cache/images
```

Expected:
- app tree should normally be owned by `tony:tony`

Typical fix:

```bash
sudo chown -R tony:tony /var/www/AoE2HDBets/app-prodn
```

Why this is cleaner now:
- the app prepares `.next/cache/images` during build and again before start
- ownership drift is surfaced before the service begins handling requests
- the failure path now prints the exact `chown` command instead of leaving Next to throw a murky runtime mkdir error

### Watcher download analytics truth

Watcher package buttons should keep using the tracked `/download/watcher/[artifact]` routes, but those routes are no longer allowed to count obvious prefetch or route-warmup requests.

Current guardrails:
- skip requests with headers like `next-router-prefetch`, `x-middleware-prefetch`, `purpose: prefetch`, or `sec-purpose: prefetch`
- skip likely RSC or component-prefetch requests
- keep real user-intent redirects working
- `/admin/user-list` now shows raw recorded totals alongside likely external vs internal/test splits

If watcher download totals look suspicious after a deploy:

```bash
journalctl -u aoe2hdbets-web.service -n 80 --no-pager
```

Then verify the public page is still using plain download anchors, not Next-prefetchable internal navigation.

### Dirty or historically interrupted checkout

Do not normalize a dirty production checkout with a generic stash/pull/restart
recipe. Run `aoe2war finish --dry-run`: the protected lane can adopt an exact
tracked VPS-first candidate only from one shared base and fails closed on
untracked or ambiguous state.

If a legacy manual fast-forward was interrupted, preserve `git status`, the
exact diff, current HEAD, active build/version identity, and the latest stage
and activation receipts before changing anything. Recover only through a
reviewed incident-specific transaction. Never drop a stash or reset a path
until its contents are proven redundant.

### `next-env.d.ts` drift

This file still drifts on the VPS and has caused:

- local modifications in the server repo
- file ownership issues during builds
- manual `chown tony:tony /var/www/AoE2HDBets/app-prodn/next-env.d.ts`

Treat a new `next-env.d.ts` diff as unexplained production source state. Preserve
and compare it with the sealed source, then let `aoe2war finish --dry-run`
classify the checkout. Do not publish generated drift, stash it blindly, or
resume with a manual pull merely to make status clean.

### Inbox attachments

Direct-message attachments are session-protected, so preview failures are not always frontend rendering bugs.

Check these in order:
- authenticated route response from `/api/contact-emaren/attachments/:id`
- `journalctl -u aoe2hdbets-web.service`
- `Content-Disposition` generation in the route

Known real failure:
- `TypeError: Cannot convert argument to a ByteString ...`

That points at Unicode header generation and should send you to the attachment route first, not the chat bubble component.

## When schema changes exist

If the web change depends on new Prisma tables or columns:

- apply the web Prisma migration first
- then build
- then restart

Do not restart blindly before the schema is in place.

## Related runtime truth

- backend upstream should remain `http://127.0.0.1:3330`
- browser should stay same-origin for `/api/*`
- watcher uploads should continue to target `api-prodn.aoe2war.com`, not the public web host
- browser wallet reads and stake verification depend on `rpc-mainnet.aoe2war.com` and `rest-mainnet.aoe2war.com` staying CORS-clean for both `aoe2war.com` and `www.aoe2war.com`
- dedicated nginx request-log runbook for AoE2 Phase 1 lives at [deploy/aoe2-access-logging-phase1.md](deploy/aoe2-access-logging-phase1.md)


## Staking unstake signer

`/api/staking/unstake` must use the staking custody rail.

Preferred live setup:

- key name: `staking`
- home: `/var/lib/wolochaind-testnet`
- CLI: `/var/www/WoloChain/build/wolochaind`
- keyring backend: `test`
- fee: `5000uwolo`

Do not route staking unstake through the generic betting payout service. That path has different settlement headroom semantics and can block valid staking returns.
