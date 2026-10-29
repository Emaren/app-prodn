---
id: "aoe2war.app-prodn.storage-os"
title: "AoE2WAR Storage OS"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn","aoe2war","wolochain","vpssentry"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "storage-operating-contract"
reviewed_at: "2026-10-13"
review_interval_days: 30
sensitivity: "internal"
---

# AoE2WAR Storage OS

## Purpose

Storage OS keeps the AoE2WAR production estate inexpensive, recoverable, bounded,
and observable without turning deployment into a long-running storage-maintenance job.

Primary operator surface:

```bash
aoe2war storage status
aoe2war storage estate --measure
aoe2war storage local-plan          # permanent, read-only Mac action board
aoe2war storage local-pressure --limit 512
aoe2war storage local-pressure --focus generic_cache   # one-level protected-aware cache triage
aoe2war storage local-maintain
aoe2war storage local-maintain --apply
aoe2war storage plan
aoe2war storage maintain
aoe2war storage maintain --apply
aoe2war storage campaign start --max-generations 25
aoe2war storage campaign status
aoe2war storage campaign pause
aoe2war storage campaign resume
aoe2war storage verify
```

The older `aoe2war storage-retention` command remains a separate cache-only
primitive and never deletes durable rollback generations.

## Storage classes

- **Live:** current runtime, databases, settlement state, parser state.
- **Hot recovery:** newest two canonical durable activation rollbacks stay expanded.
  The next archive candidate is the third-newest expanded generation: the
  generation that has just fallen out of the hot recovery window.
- **Warm/cold recovery:** older canonical generations may become verified `.tar.zst`
  archives with exact manifests and immutable receipts.
- **Legacy/unknown:** never changed automatically.
- **Regenerable:** separate bounded cache/staging retention lanes.

## Whole-estate census and local reclaim

`aoe2war storage estate` is the fast cross-plane storage census. It reports the
operator Mac filesystem, VPS root filesystem, mounted production volume, fast
rollback count, expanded rollback debt, and cold archive count in one command.
Pass `--measure` when exact local cache allocation is worth the extra filesystem
walk. Without `--measure`, the fast census reports Mac reclaimable capacity as
**NOT MEASURED**, never as zero; `local-maintain` always measures its strict
regenerable allowlist before showing or applying a plan. The estate census also measures generated context-camera retention debt:
more than one ZIP or TGZ per series is surfaced as structural debt, and the
canonical audit raises a P1 when a core TGZ series is over-retained.

Ordinary `aoe2war finish` remains the normal closure path and allows the context
retention policy to collapse each generated series to its newest camera.
`--preserve-context-history` is an exceptional forensic switch: it deliberately
suspends that pruning and should not be carried into routine Finish runs.

`aoe2war storage local-maintain` is deliberately narrower than a generic disk
cleaner. Preview mode measures exactly four allowlisted regenerable Mac caches:
Yarn, Go build cache, pnpm cache, and CoreSimulator cache. `--apply` removes only
those four paths, refuses symlinks/path escape, remeasures free space, and seals a
local maintenance receipt. Recovery vaults, Codex sessions, CrossOver bottles,
MobileSync backups, project sources, and evidence are observable protected
classes and are never targets of this command.

**Explicit opt-in package-cache reclamation (Oct 28):** `local-maintain`
now also measures four exact additional regenerable classes: `~/.npm/_cacache`,
`~/Library/Caches/Homebrew`, `~/Library/Caches/pip`, and `~/.cache/pip`.
The pre-existing `local-maintain --apply` continues to remove **only the original
four**; an owner must run `local-maintain --apply --extended` to include all
four additional download/content caches. This does not classify the rest of
`~/.npm`, `~/.cache`, developer worktrees, Xcode DerivedData, Homebrew
installations, project dependencies, iPhone backups or historical evidence as
prunable. Symlinked/escaped extended targets hold **before** any deletion, and
legacy apply remains operable if an unrelated extended candidate is unsafe.
The receipt records every deleted target and same-filesystem measured free-space
delta. On nearly-full APFS systems the measured free-space delta can differ from
allocated bytes due to clones and snapshots; neither estimate is a success
receipt until actual execution returns. Inspect current disk free with
`df -k "$HOME"` before/after the operation. Running from an unmerged feature
branch is never a production release authorization.

## Reusable Mac cleanup operating cycle (2026-10-28)

**Single operator entrypoint:** `aoe2war storage local-plan` (or `--json`).
This is a permanent **read-only federation** within the existing Storage OS,
not another deletion controller or a shell transcript. It invokes the existing
local-maintain previews (four original caches, four extra opt-in content
caches, and two opt-in Electron download caches), the named local-pressure
census, and VPSSentry's independent Mac receipt watchdog if available.
Unknown probes remain UNKNOWN; protected or overlapped source buckets are
never declared reclaimable. The plan ranks named, measurable cache classes
but does not infer all unclassified user files are junk. A zero cache preview
means those *specific* classes are empty, **not** zero junk across the Mac.

The new exact mode `aoe2war storage local-maintain --electron-only` previews
ONLY `~/Library/Caches/electron` and `~/Library/Caches/electron-builder`,
without selecting original/extended cache roots. After owner validation,
`aoe2war storage local-maintain --apply --electron-only` operates within
the same Storage OS retention/receipt authority and before/after APFS free
measurement. This option and `--extended` are mutually exclusive. Apply
now verifies the macOS owner session, a complete process census for active
Electron builders, and open file descriptors beneath both named targets;
failed census, unsafe ancestors and symlinks cause HOLD, never blind deletion.
**Never schedule apply**: observation and recommendation may be timed;
reclaim requires a separately authorized owner action and receipt.

Historical physical Mac acceptance on Oct 28: isolated, exact-head PR #964
source passed 11 focused native tests; the owner approved and executed
only these two cache deletions, and APFS gained **0.538 GiB**. Historical
receipt: `~/.local/state/aoe2war/storage/electron-pr964-e07021d1898a/`
`.aoe2war-release/storage-local-receipts/20261028T162940Z-local-maintenance.json`.
That approved one-time source checkout was an isolated acceptance path, not
the normal future operating mechanism. After this feature is merged into
source, use the canonical operator CLI rather than fetching PR archives.

Local pressure now permits up to **512 displayed named rows**, including
the 328 observed on the operator Mac on October 28, and reports
`named_census_complete`, displayed/observed counts, reasons for truncation,
and explicit `NAMED_PATHS_ONLY_NOT_WHOLE_DISK` scope. This fixes a 300-row
presentation cap; it does **not** infer complete filesystem coverage. Repo
and worktree enumeration limits, unreadable children or symlinks still
produce INCOMPLETE/HOLD, even if all names can be displayed.

`aoe2war storage local-pressure --focus generic_cache` provides a bounded,
**read-only one-level** breakdown of `~/.cache` through the same permanent
Storage OS router. Its first 64 child entries are measured under a bounded
time budget; capped, timed-out or symlinked children remain explicitly
INCOMPLETE rather than guessed. The `codex-runtimes` child is categorically
`PROTECTED_ACTIVE_RUNTIME_UNKNOWN`. Other immediate children are
`REVIEW_CACHE_CHILD_NEEDS_AUTHORITY`, not allowlisted for deletion.
The gross `generic_cache` row (~5.11 GiB observed previously) includes
this known protected subtree (~4.77 GiB previously measured); do not equate
the parent's allocated bytes with reclaimable bytes or sum overlapping rows.
The permanent `local-plan` recommends this specific read-only focus when
a generic cache bucket is present; it never suggests deleting the parent.

Additional named Electron, Chrome, Docker VM, Codex and CrossOver locations
remain review/protected **without deletion permission**. Project roots
and their generated children overlap; do not sum allocations to claim
free-space recovery. When a class is unmeasured or partially observed, it
remains UNKNOWN and must be triaged before adding exact-path cleanup policy.

Daily launchd `com.aoe2war.mac-storage-pulse` and the VPSSentry watchdog
remain the observation/freshness authorities; this planning command does
not create a second timer. Three-plane HEL1 volume capacity and financial
release/backup admission remain independently held as needed, regardless
of local cache cleanup success.

Capacity health and retention topology are separate facts. A volume below the
capacity threshold may still carry structural rollback debt. The lean-retention
expiry lane remains authoritative for reducing the runtime estate to two hot
expanded rollback generations plus three proven cold checkpoints.

## Exact three historical Next.js build reclaim (owner-approved)

When the read-only Mac pressure census identifies these **three exact old
worktree builds**, `./bin/aoe2war storage local-reclaim-three-next` previews
their metadata and process-reference protections before any deletion:

- `.worktrees/codex-authenticated-satchel-deposit/.next` with BUILD_ID
  `blonE7yFq5o1cHzYKgxU7`;
- `.worktrees/codex-satchel-complete-financial-paths/.next` with BUILD_ID
  `knIrFoqHX9wcagyb6VeOv`;
- `.aoe2war-workspaces/app-prodn/update-independent-docs-context-20261015/.next`
  with BUILD_ID `umMYGufkqoA0nkvTGXIo2`.

These were **owner-measured** on Oct 28 at 1,461,128 + 1,361,188 + 1,328,688
KiB = **4,151,004 KiB (3.959 GiB allocated)**. They have zero Git-tracked
`.next` files and worktrees with clean tracked source. These checks alone do
not certify inactivity. The source-owned command reruns all checks and also
rejects unsafe symlinks/hardlinks/owners/mounts, active worktree processes or
open files, changed BUILD_IDs, tracked `.next` files and dirty source.

`./bin/aoe2war storage local-reclaim-three-next --apply` asks the local
operator to type `RECLAIM THREE VERIFIED HISTORICAL NEXT BUILDS`, takes an
exclusive local receipt lock, rechecks all three pinned candidates, creates a
durable intent receipt, deletes **only those three historical generated
`.next` directories**, writes per-target receipts and final measured APFS
available-space delta. A partial/unknown outcome must be inspected, **never
automatically replayed**. Source worktrees and all non-generated files survive.

This scope explicitly excludes E5 seal `.next`, Codex runtime cache
`~/.cache/codex-runtimes` (possibly active), downloads, iPhone backups,
recovery vault, node_modules and any financial/replay/release evidence.
A source-only GitHub PR and successful CI are not equivalent to executing
the owner Mac cleanup.

## Mac gigabyte-first large-artifact census

When `local-maintain --apply --extended` measures little or no recovery,
**do not rerun the same exhausted cache policy**. Run the read-only
`./bin/aoe2war storage local-pressure --limit 30` instead. Its source
`scripts/aoe2_storage_mac_pressure.py` reports separately:
- large project roots and declared Git worktree generated outputs
  (`.next`, `node_modules`, `.direnv`, build/dist/cache) as **REVIEW only**;
- Downloads, npm residual data, Xcode outputs, toolchains and Go/Cargo sources
  as **REVIEW only**;
- recovery vaults, MobileSync backup, Documents, Movies and historical evidence
  as protected human data.

It uses `du -skx` to measure allocated bytes with bounded subprocess time;
symlinked targets are excluded. Parent project roots and nested generated
outputs **overlap and must never be summed**. Large/unknown result is not
deletion permission. A later feature may promote a candidate into an exact
clean-worktree/hardlink/reference-verified, one-transaction reclaim path;
until then it is observation, never `rm -rf`.

Owner Mac result (Oct 28): original four-cache policy reclaimed 0.00 GiB;
eight-cache opt-in policy reclaimed **81,528 KiB** (~79.6 MiB) from 3.82 to
3.90 GiB free, receipt
`.aoe2war-release/storage-local-receipts/20261028T041555Z-local-maintenance.json`.
This is **not** a capacity recovery. Further decisions must target measured
gigabyte-scale regenerable artifacts, with real APFS `df -k "$HOME"` deltas.
Do not suggest erasing a ~38-GiB protected recovery vault or ~37-GiB
MobileSync backups as automatic cleanup.

## Capacity triage and preventive operating loop (October 2026)

The estate has **three different disks** with separate risks: the operator
Mac, the VPS root filesystem, and the VPS mounted volume. A successful volume
expiry does not improve root headroom; clearing Mac caches does not increase
VPS capacity. Treat each filesystem as its own budget.

The primary read-only capacity triage is:

```bash
./bin/aoe2war storage triage
./bin/aoe2war storage triage --json
./bin/aoe2war storage deep-census
./bin/aoe2war storage local-maintain
./bin/aoe2war storage expiry inventory
```

- `triage` runs the bounded three-plane deep census, ranks
  **measured review-only** classes, identifies root free-space pressure against
  the 6 GiB preferred headroom in the operations contract, exposes Mac pressure,
  and reports expanded rollback debt independently of volume usage.
- Any slow/unreadable named bucket marks the plane **UNKNOWN**, not healthy.
  All rows carry `mutation_allowed=false`; a large cache is not
  proof that it can be discarded. Triage never invokes remote expiry,
  modifies Wolo, or writes a cleanup plan to production.
- The `expiry inventory` result has `EXPIRE` and
  `KEEP` classifications. Its candidate count is **preliminary**,
  not a deletion budget. Only a later content-hashed sealed ledger authorizes
  one-object expiry. Save the inventory output to a private JSON file and run
  `storage triage --expiry-inventory /path/to/inventory.json`
  to combine the evidence. Never automate deletion from that JSON count.
- Use `storage estate` for a lightweight regular check. Run
  `storage triage` if Mac exceeds 90% used, VPS root falls
  below the 6 GiB preferred headroom, the volume enters WATCH, or
  structural rollback debt increases. Do this **before** attempting
  Finish, not after its deployment phase fails. Kingdom Intelligence now
  routes WATCH status to this triage instead of repeating a no-op archive
  plan. Council's storage recommendation now follows the same WATCH contract;
  its explicit archival apply is reserved for maintenance-due conditions. Triage is advisory; the protected Finish gate remains authoritative.

### Diagnosis when pruning is not working

| Symptom | Correct lane | Boundary |
| --- | --- | --- |
| Mac npm, generic cache, Go module or Next build grows | `storage triage` and developer cache review | REVIEW only; never add all of .cache, build trees, or toolchains to broad auto-delete |
| Four named Mac cache allowlist entries grow | `storage local-maintain` preview; separately authorize apply | Only Yarn, Go build, pnpm, and CoreSimulator caches in apply contract |
| VPS root near 5 GiB free | Root section of `storage deep-census`, governed snap/cache/log/fast-rollback review | Root and volume headroom separate; no raw recursive delete, active Next dependency removal or unbounded journal wipe |
| Mounted volume WATCH with old runtime generations | `storage expiry inventory`, verified lean-retention ledger | Active runtime plus two hot and three verified cold checkpoints and all receipts stay protected |
| Old archive campaign PAUSED | `storage campaign status` and source/BUILD_ID reconciliation | Resume cannot adopt a new source without the separate handoff proof |
| Database snapshot scan INCOMPLETE | `storage db-snapshots plan --json`; inspect blockers | Retirement remains disabled with zero candidates until receipts/references prove safety |
| Watcher staging preview EACCES | Inspect root-owned staging identity and operator read authority | Do not chmod or bypass identity/hash proof |
| Watcher download preview source changed | Reconcile Mac/GitHub/certified runtime via protected Finish | SHA guard is intentional; do not bypass |

### Evidence-driven capacity closure

Record exact source/BUILD_ID; filesystem; measured allocated bytes before and
after **on the same filesystem**; candidate classification; which independent
lane authorizes mutation; transaction receipt and hash; protected Wolo
continuity where applicable; and verified remaining free space.

If protected or unclassified bytes still exceed practical capacity **after**
authorized reclamation is exhausted, report the actual remaining deficit as a
storage purchasing decision. Never relabel protected or unmeasured files
as junk merely to create a green score.

## Capacity policy

| Volume used | State | Policy |
| --- | --- | --- |
| `< 78%` | Healthy | No cold archival due |
| `78–82%` | Watch | Observe growth |
| `82–85%` | Maintenance due | Deliberate archival allowed |
| `85–92%` | Attention | Archival high priority |
| `>= 92%` | Critical | Fail closed on unnecessary growth |


## Maintenance hysteresis

The healthy target and maintenance trigger intentionally form a hysteresis band.

A normal maintenance run does not begin automatically while the volume is in
the `78–82%` WATCH range. Automatic/deliberate maintenance becomes due at
`>=82%`.

Once an `--until-target` batch has already completed at least one verified
archive transaction, it may continue through the WATCH range until the volume
reaches `<78%`. The batch still stops immediately on a failed safety proof,
missing eligible generation, explicit transaction limit, or other fail-closed
condition.

This avoids repeated maintenance churn around the 82% boundary while preserving
the rule that WATCH alone does not initiate archival work.

## One-generation transaction

A single transaction is the maximum mutation unit. It proves certified runtime,
Wolo continuity, canonical target identity, matching activation evidence, creates
and verifies an archive, performs isolated exact round-trip restoration proof,
rechecks the source against races, publishes immutable evidence, replaces only
that proven expanded generation, then re-proves runtime and Wolo continuity.

The activation rollback directory name identifies the activation that created the
rollback. Its embedded `source-sha` identifies the **prior runtime** preserved by
that activation. Those identities are intentionally different truth planes.

## Proven B2B2 pilot

The source-controlled lane is mechanically derived from pilot SHA-256:

`aae6f7f3c367a8a6f59c918b37ba2cafc6897cf25d18e6cc212373ca925420ae`

The pilot archived `activate-20260818T003527Z-1a4e983b86d4`, round-trip verified
it exactly, retained immutable receipts, replaced only the expanded generation,
and kept Wolo advancing without a process restart.


## Adaptive maintenance governor

Cold archival no longer assumes that the safest useful maintenance budget is a
permanent 20% CPU ceiling. Every expensive archival stage is still isolated in
its own transient systemd unit, but the runner now leases currently unused host
headroom when live evidence supports it.

The governor selects one of three profiles before each bounded stage:

- **CONSERVATIVE** preserves the proven 20% CPU / idle-I/O lane.
- **BALANCED** may use up to 50% CPU quota per vCPU, capped at 200%.
- **BURST** may use up to 75% CPU quota per vCPU, capped at 300%.

BALANCED/BURST require stronger free-memory and host-load evidence. During the
stage, Wolo remains the hard authority. A soft Wolo-staleness, no-progress, or
memory-pressure signal immediately revokes the lease and demotes the active
unit to CONSERVATIVE. The existing hard abort conditions remain unchanged.

This is deliberately not "run maintenance at maximum speed." It is
**revocable headroom leasing**: use spare capacity aggressively while proving
the protected workload remains healthy, then surrender that capacity before
the protected workload is endangered.

Rollback compression uses zstd's available worker threads; the systemd CPU
quota remains the aggregate governor. Replacement receipts record total
transaction duration so Storage OS can compare throughput across generations
and future governor revisions.

## Terminal-independent campaign controller

Long archival campaigns no longer need to remain attached to an interactive
terminal. `aoe2war storage campaign start` binds a campaign to one exact
certified app source SHA and BUILD_ID, writes atomic durable local campaign
state, then launches the controller in a detached process group with its output
redirected to a durable campaign log.

The controller still invokes the existing proven **one-generation** archive
worker. It does not weaken or enlarge the transaction mutation unit. After each
successful generation it persists the completed generation, resulting volume
usage, and verified-receipt count before it is allowed to plan the next one.

Campaign lifecycle:

- `start` creates a new source/build-bound campaign and detaches it from the
  operator terminal;
- `status` reports durable progress, current generation, process liveness,
  completion reason, and log path;
- `pause` is cooperative and only takes effect **between generations**; there
  is intentionally no campaign SIGKILL/SIGTERM operator path;
- `resume` restarts a stopped/failed/paused controller only when the canonical
  source and certified build still equal the campaign authorization;
- if source/build authority changes, planning becomes inconsistent, or a
  transaction dies in an ambiguous evidence state, the controller fails closed
  rather than manufacture continuity.

Closing a terminal therefore does not stop an active campaign. A machine reboot
or controller crash may require `resume`; if the previous interruption occurred
inside a one-generation transaction and exact evidence cannot be re-established,
resume remains blocked for explicit census/recovery rather than guessing.

## Lean retention policy — September 13, 2026

Retain two complete immediate rollback generations and three verified compressed
checkpoints: the newest archive in each of the latest two represented ISO weeks,
plus the proven B2B2 pilot `activate-20260818T003527Z-1a4e983b86d4`.
The active production runtime is additional to those recovery points.

Superseded application runtimes are rebuildable from retained Git history.
`aoe2war storage expiry` owns their explicit expiry contract:

- `inventory` is read-only and identifies every keep/expiry decision;
- `prepare <canonical-campaign-directory>` seals a complete JSON deletion ledger,
  hashes expanded content into compressed manifests or reuses an earlier sealed
  content manifest only after the current tree reproduces the exact prior metadata
  identity, verifies cold archives and their original receipts, and proves
  production identity;
- `apply-one <ledger> <sha256> <generation>` expires exactly one approved runtime
  body after rechecking the ledger, content identity, retained checkpoints,
  source/build/services, release/retention/archive locks, and Wolo progression;
- immutable intent and completion receipts supplement all existing evidence;
- archive verification recognizes a valid expiry receipt and still verifies the
  retained original tree manifest;
- legacy metadata, source patches, credentials, databases, replay/parser evidence,
  user media, settlement data, and Wolo state are never generic expiry targets.

Run this explicit, bounded maintenance lane after releases when a generation
falls outside the two-generation window. Each campaign produces its exact ledger
before expiry. Do not retain endless cold application bodies, and do not confuse
an expired compiled runtime with deleted unique project evidence.

### Cross-campaign content-proof reuse

A completed expiry campaign leaves a content-hashed manifest for every expanded
runtime it inspected. Later campaigns may reuse that proof instead of reading the
same unchanged runtime bytes again, but reuse is evidence-driven rather than a
cache shortcut.

The newer campaign first walks the live runtime tree without reading file
contents and computes the same metadata identity used by expiry verification. A
prior manifest is reusable only when its ledger and manifest are direct read-only
files, generation/path/source/build identity agrees, every regular manifest row
contains a SHA-256, every manifest path remains inside the runtime root, the
manifest reconstructs the exact current tree identity, and the tree identity is
unchanged on a second post-copy walk. The reused manifest bytes are copied into
the new campaign and their source ledger/manifest digests are recorded.

Any missing, writable, malformed, drifted, ambiguous, or otherwise unverifiable
prior evidence simply falls back to a fresh full content hash. The ledger records
`content_proof_summary.fresh_hash` and
`content_proof_summary.reused_sealed_manifest` so the optimization remains
observable.

A September 19 inode census across 12 current rollback generations found zero
cross-generation shared inodes. Hash memoization by inode therefore has no
measured value for this estate; sealed-manifest reuse is the durable acceleration
path.

## Deployment boundary

Runtime expiry is serialized with deployment. Complete or stop the current
one-generation transaction before running canonical `aoe2war finish`.


## Live handoff into a newer Storage OS

A Storage OS implementation may be upgraded without abandoning a proven
one-generation campaign. The first-class operator lane is:

```bash
aoe2war storage handoff start [CAMPAIGN]
aoe2war storage handoff status [HANDOFF]
aoe2war storage handoff resume [HANDOFF]
```

The handoff controller is detached from the initiating terminal and persists
every transition atomically. Each transition also seals a create-once, mode-0444,
fsynced JSON receipt whose path and SHA-256 are chained into the mutable handoff
state. If a terminal or process dies after that receipt seals but before the
state file advances, reinvocation reuses the exact receipt rather than inventing
a new proof. Before resumed mutation, the controller replays the persisted
history against the expected receipt path, digest, from/to identity, timestamp,
and evidence payload for every completed state. Missing or rewritten transition
proof fails closed instead of trusting the mutable state file alone. Its state
machine is:

1. `V1_RUNNING`
2. `V1_FROZEN`
3. `TRANSACTION_SEAM_PROVEN`
4. `SOURCE_READY`
5. `RUNNER_RECONCILED`
6. `V2_CERTIFIED`
7. `V1_RETIRED`
8. `V2_RESUMED`

The canonical seam is the boundary after a one-generation worker has sealed its
replacement receipt and released the release, retention and archive locks, but
before the campaign controller starts another generation. The handoff requests
the existing cooperative campaign pause; it does not SIGSTOP, SIGTERM or SIGKILL
the archive controller. `V1_FROZEN` is accepted only when the campaign itself
reports `PAUSED` with
`OPERATOR_PAUSE_BETWEEN_GENERATIONS`, no current generation timestamps remain,
and the V1 controller PID is dead.

Handoff authorization requires an actual live V1 campaign controller in
`RUNNING` or `RUNNING_TRANSACTION`: its PID must be alive and its process
command must identify the exact `aoe2_storage_campaign.py _run <campaign>`
controller. An already paused, merely created, dead, or PID-reused campaign
cannot manufacture V1 identity; start or resume the ordinary campaign first.

Authorization also writes an explicit handoff reservation into the campaign
state before the handoff runner is spawned. Admission into that reservation is
itself serialized by a separate non-blocking start lock covering the incomplete
handoff census, state creation, campaign reservation, and detached runner spawn.
The long-lived handoff execution lock remains separate so the newly spawned
runner never deadlocks against its own parent admission transaction.

The reservation carries the exact handoff ID, requests the cooperative pause,
and is merged back into controller state after an in-flight generation finishes
so stale local state cannot erase the takeover. While the reservation exists,
ordinary `storage campaign resume` is rejected with the exact
`storage handoff resume <id>` command instead. A second handoff cannot reserve
the same campaign, and a new handoff cannot hide an older incomplete takeover.
Status selection prefers incomplete handoffs until they reach `V2_RESUMED`.
The reservation is cleared only by the certified V2 rebind immediately before
the ordinary campaign resume.

The initial receipt records the V1 campaign source/build, the exact target
`main` source, and the observed V1 PID/PPID/PGID/command plus descendant
identities. After the cooperative pause, that exact recorded family is
revalidated as dead before `TRANSACTION_SEAM_PROVEN`; canonical Finish is
therefore never launched while the old archive controller or one of its recorded
descendants remains alive. The same family is revalidated again after V2
certification before `V1_RETIRED`. The target must be a clean local `main`,
equal to `origin/main`, and descend from the certified V1 source. Target drift
before canonical Finish starts fails closed.

Canonical Finish may legitimately append documentation-only descendants while
reconciling Documentation OS around an unchanged implementation. The handoff
therefore accepts a certified runtime only when it is either the exact target
source or the existing Release OS `documentation_only_descendant` proof says
every intervening path is documentation-owned. Any application,
infrastructure, financial, database, Watcher, or Replay Truth implementation
change after handoff authorization remains a hard blocker. The campaign is
rebound to the actual certified descendant SHA and BUILD_ID, not to the earlier
target label.

After the seam is proven, the handoff re-proves source authority immediately
before every newly launched canonical Finish. Local `main`, its tracking ref,
and live GitHub `main` must still agree, the worktree must still be clean, and
the current head must be the authorized target or a Release-OS-proven
documentation-only descendant. This closes the restart window in which unrelated
implementation work could otherwise land after `SOURCE_READY` and be deployed
by a resumed handoff.

The handoff then starts canonical `aoe2war finish` in its own session and
records the Finish PID and log. A lost initiating terminal therefore does not own
either the handoff or Finish lifetime. On reinvocation, the controller resumes
from the last durable state. A target implementation merely being live is not
sufficient takeover authority: it must also have a handoff-era fully
`CERTIFIED` Finish receipt proving the maintenance-runner reconciliation
phase. If activation succeeded but a later Finish closure check failed, the
handoff reruns canonical Finish to complete that closure rather than accepting
the partial receipt or deadlocking. Canonical Finish remains the only deployment
path.

Finish owns maintenance-runner reconciliation, release serialization,
certification, final Estate/Doctor proof and protected Wolo continuity. A
successful handoff does not invent a second deployment authority. Only after the
target implementation, or a Release-OS-proven documentation-only descendant of
it, is the active certified runtime may the state advance through
`RUNNER_RECONCILED` and `V2_CERTIFIED`. The bound Finish receipt must also
prove that exact certified source and its own protected Wolo continuity.

The handoff adds an independent observe-only continuity layer around that Finish
proof. Before takeover it captures the validator service state, node PID, restart
counter, active-enter monotonic timestamp, exact 8092/8093 listener counts, an
advancing height pair, and latest-block age. It repeats the snapshot after exact
V2 certification and again after V2 campaign resume. PID, restart counter and
active-enter timestamp must remain unchanged; both protected listener counts
must remain exactly one; each sample must show chain advancement and a fresh
block; and height may never regress across the handoff. The durable state records
`wolo_mutated=false`. Any discontinuity fails closed instead of being explained
away as unrelated host activity.

Before V1 retirement, every PID recorded in the original V1 process-family
snapshot must be dead. The paused campaign can then adopt the exact new certified
source SHA and BUILD_ID through a dedicated handoff rebind receipt in its own
state. Rebinding is allowed only from a proven `PAUSED` transaction seam and
only when the requested V2 source/build equals current certified production.
The existing campaign `resume` path then launches the backlog under V2 and the
handoff seals `V2_RESUMED`. That final adoption is crash-idempotent: the
campaign rebind recognizes the exact previously sealed handoff without applying
it twice, old V1 `resumed_at` evidence is cleared at first adoption, and a
reinvoked handoff detects an already-live exact V2 campaign controller or an
already-completed V2 resumed run instead of spawning a duplicate controller.

This creates the controlled "mid-air refuel" contract: finish the current exact
transaction, freeze the old controller from replanning, certify the new control
plane, retire the recorded V1 process family, then resume the same storage
backlog under the new governor. No partially verified generation is discarded,
reinterpreted, or replayed by guesswork.

If a handoff is incomplete, Kingdom Intelligence ranks the exact
`aoe2war storage handoff resume <id>` action ahead of generic Finish/storage
advice. A handoff or campaign stopped inside an ambiguous one-generation
transaction remains fail-closed until the exact transaction evidence is
reconciled.


## Deployment boundary

Cold archival is deliberately outside the latency-critical `aoe2war finish`
path. Finish may inspect storage health; multi-minute historical compression is
maintenance, not deployment.


## Privilege and serialization boundary

Read-only Storage OS inspection uses the normal `tony@hel1` authority.

Mutating cold archival uses the explicit `root@hel1` maintenance authority
because archive files, verification trees, archive receipts, and archive locks
are root-owned evidence surfaces. Those surfaces must not be made world-writable
to avoid a privilege boundary.

A cold-archive transaction acquires locks in this order:

1. canonical `release.lock`;
2. `storage-retention.lock`;
3. `rollback-archive.lock`.

All acquisitions are non-blocking and fail closed. The canonical release lock is
opened without truncating holder metadata before the flock succeeds.

This prevents deployment, rollback/release maintenance, cache retention, and cold
archival from intentionally mutating the recovery estate concurrently.

## September 19 housekeeping doctrine

The live estate is now explicitly split between proof that must survive and runtime weight
that only accelerates recovery.

The preferred lean policy is:

- keep the active production runtime;
- keep exactly two complete immediate rollback generations;
- keep exactly three verified compressed cold checkpoints under the current checkpoint policy;
- keep immutable activation, archive, expiry, and deployment receipts;
- keep protected replay, parser, user-media, database-recovery, settlement, Wolo, financial,
  and security evidence;
- retire superseded compiled runtime bodies once the ledger proves that Git and release
  evidence are sufficient to reproduce them;
- keep Watcher distribution bytes to the current release plus one previous release when
  compatibility requires it, while retaining small release manifests and checksums;
- treat build caches, package-manager caches, scratch builds, and abandoned staging bodies as
  regenerable unless a separate contract explicitly promotes them to evidence.

A local source checkout must not become a second historical binary warehouse. The operator Mac
may point its ignored public downloads path at the canonical Watcher distribution directory
instead of duplicating every installer generation.

Root and mounted-volume capacity are different control surfaces. Root should hold the live
runtime and bounded fast recovery only. Durable receipts and protected evidence belong on the
mounted volume. Moving bytes from root to the mounted volume is useful only when those bytes
still deserve retention; moving junk does not make junk authoritative.

General Inspections consumes this policy as observable maintenance debt. A proven reclaimable
runtime body may reduce the Organization & Storage score until expiry completes, while protected
evidence is not penalized merely for existing.


## Deploy database snapshot retention

Deploy-time database restore points are a separate recovery class from compiled
application rollback generations. They must never be swept by the two-hot /
three-cold runtime policy or deleted merely to drive the mounted volume below a
capacity percentage.

The V1 operator surface is intentionally read-only:

```bash
aoe2war storage db-snapshots status
aoe2war storage db-snapshots plan
aoe2war storage db-snapshots plan --verify-hashes
```

The snapshot-body inventory is bounded to
`/mnt/HC_Volume_105319120/aoe2war/deploy-receipts`, walks at most four
directory levels, ignores symlinks and non-regular files, and counts only known
database-backup suffixes. It does **not** hash multi-gigabyte dump bodies by
default. Canonical migration boundaries reuse the SHA-256 already sealed in
`migration-status.txt`; `--verify-hashes` is an explicit read-only full-body
verification pass.

Snapshot-body inventory completeness is tracked independently from reference
completeness. Traversal errors, unreadable entries, symlinked directories or
backup-shaped symlink/non-regular files make the snapshot census **INCOMPLETE**.
An incomplete snapshot census may still show observed evidence, but no observed
migration boundary may become a retirement candidate because hot/weekly/monthly
coverage cannot be proved against an unknown estate.

Retirement planning has a separate external-reference census over the bounded
deployment-receipt and AoE2WAR OS-control metadata roots. That census walks all
direct directories rather than silently truncating at the snapshot-body depth,
reads only known bounded metadata suffixes, and is capped at 10,000 metadata
documents / 64 MiB of metadata text. A missing/unreadable metadata root, metadata traversal error,
symlinked/non-regular metadata entry, oversized candidate metadata file,
read/UTF-8 failure, census budget exhaustion, malformed counter, or contradictory
"complete" flag plus blocker evidence makes the reference census
**INCOMPLETE**. Completeness is re-derived locally from the whole evidence
envelope; it is never trusted as one remote boolean. An incomplete reference
census is not interpreted as “zero references”: every otherwise-retirable exact
migration snapshot is demoted to
`PROTECTED_REFERENCE_CENSUS` and candidate count/bytes remain zero until the
reference surface can be proved complete.

A canonical `migration-boundary` snapshot requires all of the following:

- parent directory shape `migration-<UTC timestamp>-<release12>` with a calendar-valid UTC timestamp;
- filename exactly `pre-migration.dump`;
- sibling direct regular, non-empty `migration-status.txt` no larger than
  the activation verifier's 256 KiB limit, with one and only one
  `status=APPLIED`;
- a non-empty direct regular `pre-migration.dump` body;
- a bounded direct regular SHA-256 sidecar over that status receipt whose named
  path is the exact status path;
- one exact 40-hex release SHA whose first 12 hex characters equal the
  `<release12>` encoded in the parent directory;
- one non-empty database identity;
- one exact 64-hex `dump_sha256`;
- one status `dump=pre-migration.dump`;
- at least one unique recorded migration name;
- exactly one direct top-level `migration-*-<release12>` receipt entry for
  that release prefix, including malformed or unsafe siblings in the ambiguity
  census rather than silently ignoring them;
- status text with the same line-syntax rules as the protected activation
  verifier: every non-empty line must contain `=` and a non-empty key.

Anything outside that contract is never guessed into the migration class.
Paths/names that clearly identify settlement, betting, staking, escrow, Wolo or
other financial recovery material are classified `financial`. Incident,
repair, restore, rollback and replay-repair shapes are
`incident/recovery`. Everything else is `legacy-ambiguous`. All three
non-canonical classes are protected from generic retirement.

The tiered migration-boundary policy is evidence-first:

1. prove the bounded snapshot-body census is complete; if it is incomplete,
   no retirement candidate may exist;
2. prove the bounded external durable-reference census is complete; if it is
   incomplete, no retirement candidate may exist;
3. protect any snapshot whose exact snapshot/receipt path, receipt directory,
   or sealed dump SHA-256 is referenced by external durable metadata;
4. keep the newest five remaining exact migration restore points as `HOT`;
5. keep one additional exact restore point per ISO week for eight older weeks;
6. keep one additional exact restore point per calendar month for twelve older
   months;
7. mark only the remaining exact, unreferenced migration-boundary snapshots as
   `RETIRE_CANDIDATE`.

A referenced exact migration snapshot already satisfies its week/month recovery
coverage, so Storage OS does not keep a redundant cold point solely for the same
period. Hot weeks/months already represented by a newer retained snapshot likewise
do not consume a second cold slot. Age alone is never deletion authority.

The ordinary `aoe2war storage status` metadata probe now reports the bounded
database-snapshot count and allocated bytes so this recovery estate cannot
silently grow outside Storage OS visibility. The detailed planner reports
classification, retention tier, external-reference evidence and potential
candidate bytes.

The same read-only census is available through the fixed-action AoE2WAR OS
Operator Bridge. **DB Snapshot Census** runs the metadata/sealed-receipt path and
does not read dump bodies. **Verify DB Snapshot Bytes** requires the explicit
`VERIFY DB SNAPSHOTS` confirmation and runs the full-body SHA-256 plan. That
second action remains read-only, but the confirmation is deliberate because
multi-gigabyte verification creates real production-volume I/O. Full-body
verification is executed through the root-owned
`aoe2war-maintenance-run db-snapshot-verify` governor, so Wolo liveness,
memory pressure, CPU, I/O weight and emergency-abort rules are enforced while
snapshot bytes are read. The cheap metadata census deliberately does not enter
that maintenance lane. Neither bridge action accepts arbitrary paths, shell
fragments, deletion flags, database credentials, or mutation parameters.

**V1 has no apply/delete command.** The planner explicitly reports deletion as
disabled. A future apply lane must be separately reviewed and must, at minimum,
seal an immutable retirement ledger; rehash the exact candidate body; re-prove
path/size/SHA/provenance and external-reference absence; hold the canonical
release lock; re-prove production/Wolo safety before and after unlink; append
intent/completion receipts; and preserve the parent deployment/migration
evidence after the dump body is retired. Until that lane exists and a fresh
production plan is reviewed, every candidate is informational only.

## Safety invariants

- Wolo mutation forbidden.
- Database mutation forbidden.
- Legacy metadata and unique source/data mutation forbidden; generated runtime bodies require their own exact reviewed ledger.
- Newest-two rollback mutation forbidden.
- One archive transaction = one generation.
- Missing/inconsistent evidence fails closed.
- Deploy receipts remain protected evidence.
\n


## 2026-10-08 three-plane hardening

Operational pressure on the Mac, VPS root, and evidence volume exposed three
control-plane gaps:

- Workspace OS now treats a Git-registered worktree whose directory/gitdir has
  disappeared as `STALE_GIT_WORKTREE_METADATA`. `workspace clean --apply`
  runs `git worktree prune --verbose`, then recomputes cleanup candidates and
  stale AoE2WAR registry metadata before removing ordinary worktrees.
- Lean Runtime Expiry adds `storage expiry apply-ledger <ledger> <sha256>
  [--max-objects N]`. The coordinator consumes only sealed `EXPIRE` rows,
  requires the executing expiry tool SHA-256 to equal the ledger's sealed
  `tool_sha256`, takes a non-blocking campaign coordinator lock, and launches
  every generation through its own existing bounded
  `storage-runtime-expiry` maintenance transaction.
- Ledger batch resume is fail-closed: a row is skipped only when a sealed
  `.expired.json` receipt matches the exact ledger hash, generation and path,
  and the target remains absent. An orphan intent, receipt mismatch, reappeared
  target, runtime drift, lock failure or Wolo proof failure stops the batch.

The batch cap is explicit (1-1000, default 250). Existing hot/cold checkpoint,
runtime identity, archive/tree-content proof, release/storage/archive lock,
Wolo-progress and per-object receipt gates remain unchanged.

This is orchestration hardening, not broader deletion authority. Database
snapshot deletion and automatic threshold-triggered expiry remain separate
future contracts.


## Deep three-plane census

`aoe2war storage deep-census` is deliberately read-only. It exists because the
fast estate view can tell us that the Mac or VPS root is full without explaining
where the unclassified bytes live.

The deep census measures only named storage classes. It does not crawl or publish
arbitrary operator-home paths and it grants no new deletion authority.

Mac rows cover the existing strict regenerable allowlist, protected recovery /
Codex / CrossOver / MobileSync paths, and named developer/runtime buckets such as
active AoE2WAR dependency/build environments, package/toolchain caches, and Xcode
artifacts. Review-only rows remain `mutation_authority=NONE`.

The VPS-root census runs under the configured root maintenance identity because
an unprivileged filesystem walk cannot accurately size root-owned Docker, Snap,
journal, or root-cache storage. The embedded probe performs no mutation. Each
named size probe has its own short timeout and reports `probe_ok`; a slow or
unreadable bucket becomes `PROBE?` instead of aborting the complete census.
The local named buckets use the same fail-soft bounded-size rule. The root census
classifies active runtime trees as protected, staged release trees as
receipt-gated review, fast rollback pairs as durable-proof-gated, previously
proven bounded recovery classes separately, and unproven pools such as Docker
and the Snap download cache as review-only. Disabled Snap revisions are measured
separately because that reclaim class already has observed release-recovery
evidence.

The mounted evidence volume is included using the normal Storage OS snapshot so
one report covers all three planes. Classification is evidence for the next
planning step, not permission to delete.


## Session D named Mac measurement and Level 1 review registers

The permanent `aoe2war storage local-plan --json` command incorporates a
bounded `local-pressure --limit 512 --json` named-path census. Every observed
name has a typed `measurement_reason`, `allocated_bytes` and a metadata-only
SHA-256 fingerprint. A verified absent path has zero allocation; symlinks,
foreign mounts, permission/timeout/du failure, a vanished path, and identity
drift produce **null allocation**, an exact entry in `measurement_gaps`, and
a source-owned **read-only** next action. Rows remain named-only and can overlap;
the census does not inspect the entire Mac.

`coverage.measurement_gaps` in the local plan preserves *all* failing named
rows, even when the display is capped. `coverage.apfs_accounting` separately
reports ordinary statvfs headroom with unknown snapshot, clone and purgeable
bytes left null; `du` allocation is **never** unique recoverable APFS space.

`level_1_candidate_register` contains only positive-sized, exact-path
allowlisted classes already previewed by existing `local-maintain`. These are
evidence records, **not automatically approved candidates**. Each retains
producer-lane, allocated size, candidate fingerprint and regeneration/consumer/
protected-ancestry evidence gaps; overlaps are flagged and *all* have
`mutation_authority=NONE`, unknown unique APFS gain and required owner
approval. The register never includes historical three-build targets, E5,
CrossOver, Codex state, replay/financial records, MobileSync, recovery or user
archives.

`level_2_owner_review_register` contains the named REVIEW, PROJECT_REVIEW and REBUILDABLE_REVIEW paths, including discovered generated worktree `node_modules` symlinks explicitly held as `LEVEL_2_HOLD_SYMLINK_REFERENCE_NO_TRAVERSAL`. Neither symlink targets nor protected ancestry are traversed or counted. `level_2_register_coverage` reports displayed/observed rows and does not claim full inventory when capped. This register keeps named REVIEW paths and unknown sizes
separate; location, age, filename or a reversible Trash move prove no deletion
authority. `level_1_closure.status=HOLD_NOT_CERTIFIED` until two independent
owner-native cycles, consumer/rebuild/ancestry proof, exact owner authorization,
durable approved transaction receipts and independently observed APFS `df`
recovery are complete. Only Central Command can issue the final closure seal.
No new deletion, --apply mode, automated reclaim, or source-of-truth controller
is introduced by these diagnostic additions.

## Private visual Storage Command Center — read-only first stage (2026-10-28)

The authenticated admin entrypoint `/admin/storage-os` is linked from
`/admin/aoe2war-os`; it is not a public AoE2WAR website surface.
`GET /api/admin/storage-os` is guarded by the existing admin session and
projects already-published operator-bridge estate snapshots and the existing
strict three-plane signed Storage Atlas reader. It executes **no host scan,
shell command, cleanup, source deployment or remote write**. Foreground
browser refreshes read existing receipts only, at a bounded 15-second cadence.
The raw bridge store path, credentials, private file paths and arbitrary run
output are not exposed by this projection.

Every capacity gauge has a provenance and measured timestamp. Signed three-plane
evidence takes precedence, but the current signed contract deliberately reports
`admission=HOLD` and `live=false`; it is never silently promoted to live GO.
Unsigned operator estate snapshots may show historical root/volume ordinary
free space, clearly labeled as estate receipts, not signed collector readings.
Absent Mac evidence renders UNKNOWN, **not** the last operator-terminal number
copied into source. No trend or rate is invented when repeated samples are
unavailable. Source/remote/production parity uses existing release identities.

The Mac Level 1 cleanup meter remains unscored in this first UI until a
privately admitted, fresh, independently verified Mac closure receipt can
supply its exact completed gates and denominator. The owner-side narrative
baseline (2 of 8 engineering milestones) is deliberately **not hardcoded into
the frontend** as an apparently live fact. Neither the dashboard nor signed
Atlas public projection grants deletion or deployment authority.

Follow-up, separate source-owned implementation: reuse the already installed
VPSSentry Mac Pulse schedule and existing HEL1 observer/sentinel contracts to
publish bounded versioned observations, signed when eligible, with freshness,
prev-hash sequence and complete/partial classifications. Do not add a second
scan timer merely because a browser needs data. Add native live-feeds for
generated builds, rollback generations, dependency caches, code/worktree
consumers, APFS snapshot and clone uncertainties, and build/stage runway only
after the source owners establish evidence contracts and bounded cost.
The private page must display UNKNOWN for every unpublished measurement.

## Session D gigabyte-first generated-output ranking

The **existing** `aoe2war storage local-plan --json` command now carries a
`gigabyte_generated_ranked_plan` generated from the same bounded named Mac
census, not a separate scanner. The census observes only *existing* named
`.next`, `.turbo`, `dist`, `build`, `node_modules`, `.direnv` and
`.yarn-cache` children under at most 120 immediate `AoE2HDBets` project
directories and declared Git worktrees. It does **not** traverse arbitrary
source trees, protected user folders, or symlink targets. The display upper
bound rises to 1024 rows, with explicit truncation and unknown measurements.

Only exact named, complete, metadata-fingerprinted, nonsymlink rows of at
least **256 MiB** enter the descending ranking. Their original full paths
are the identity; repeated basename labels confer no equality. Project-root
`du` sizes overlap generated children and are never summed into reclaim
figures. Parent/child generated paths are flagged `PARENT_CHILD_GENERATED_OVERLAP`.
The nominal nonoverlapping, unprotected `du` sum is gross allocated
information, **not** unique physical APFS space.

For each row, `source_head`, build ID, regeneration, active consumer,
hardlink, mount, owner approval, and source cleanliness remain explicitly
unattested until independent owner-native evidence arrives. Protected paths
such as `.codex`, E5, `api-prodn`, Wolo/replay/finance, recovery,
CrossOver and Docker stay `PROTECTED_ANCESTRY_HOLD`. Symlinked dependency
roots are kept in `unknown_generated`, with null allocation; they are
never dereferenced or treated as space to recover.

The JSON verdict is `EVIDENCE_INSUFFICIENT`; certified unique reclaim
is zero, expected APFS unique gain and the shortfall to +20 GiB are **null**.
This is **not** permission to use `--apply`. Reuse existing
`storage local-reclaim-three-next` for a separate read-only exact
historical-target preflight; previously removed builds must stay STALE/HOLD.
Any new deletion authorization, if later independently qualified, requires
its own narrowly reviewed, receipt-backed existing-controller transaction
and owner approval. No new mutator or cleanup batch has been added here.

## Private Storage OS GET side-effect boundary

The authenticated `GET /api/admin/storage-os` uses the existing
`readAoe2OsStorageEvidence` read-only adapter, **not** the general dashboard
loader. It reads only the already-existing bridge and estate snapshot JSON
receipts. Missing files return null/UNKNOWN without creating state, runs,
or events directories, writing snapshots or initializing an operator store.
The existing general AoE2WAR OS dashboard and its run-controller behavior
are not changed by this adapter. Signed-Atlas verification remains separate;
no storage cleanup, remote command, release activation, extra collector or
new authorization is added.

## Session D protected-role correction for five owner-native generated candidates

The 2026-10-28 owner-native #971 generated rank had five >=256 MiB
named generated outputs totaling **4.392 GiB gross `du` allocation**,
**zero independently certified unique APFS recovery**. These rows are
source-proven measurements of allocations, **not** deletion eligibility.

The existing `generated_rank` now separates explicit source-owned policy
roles from historical generated **unqualified** review:
- `PROTECTED_E5_SEAL`: E5 `.next` (1.214 GiB gross);
- `PROTECTED_CANONICAL_ACTIVE_DEPENDENCIES`: canonical
  `app-prodn/node_modules` (0.830 GiB gross);
- `PROTECTED_CODEX_WORKTREE`: registered `.worktrees/codex-*`
  dependency roots, including `codex-final-satchel-qualification`
  (0.830 GiB gross), and `~/.codex` worktree paths;
- `PROTECTED_WATCHER_SIGNED_WEBSITE_DISTRIBUTION`:
  `aoe2-watcher/dist` (0.688 GiB gross in the accepted rank), known
  linked from the website download path; the signed/release-sensitive output
  is not an ordinary obsolete `dist`;
- `HISTORICAL_GENERATED_UNQUALIFIED`:
  `app-prodn-renaissance-phase1-20261020/node_modules` (0.830 GiB gross),
  **still HOLD** for rebuild, source cleanliness, consumers, owner, hardlink,
  mount and APFS unique recovery proof, not eligible Level 1.

Role classification uses exact structural path identity, including
`codex-*` only in the declared worktree namespace, rather than the
previous exact path-part check. It is a source-owned protection policy, **not**
live `lsof`/Git/owner/clone/rebuild attestation. Existing per-row unknowns,
HOLD reasons, null unique bytes and `mutation_authority=NONE` remain
unchanged. Duplicate exact paths now block even the *informational*
unprotected, nonoverlapping gross allocation estimate; nested generated
parent/child allocations continue not to add. Input claims about hardlinks
are never accepted as proof of exclusive physical extents.

Do not rescan, apply, remove, migrate, unlink aliases or treat any of the
five rows as an approved deletion. Central Gate 3 needs owner-native read-only
adoption of corrected roles; Gates 4-8 remain held for real independent
physical, source, consumer and approval evidence. +20 GiB is not established
from these allocations.

## Private Storage OS radial anatomy, hogs and activity (2026-10-28)

The private `/admin/storage-os` dashboard has a real-data two-ring storage
visualization: inner slices classify L1–L4 protection, outer slices show the
largest published storage consumers for the selected Mac, HEL1 root or HEL1
evidence-volume plane. Each drive card shows its two largest verified consumers
without drilldown. The ranked list has explicit gross allocated GiB and
HOLD/protection status. A separate activity view shows published generation,
prune-receipt, prune-HOLD, upcoming owner-review, collection and snapshot
events. No button launches a deletion, prune, file walk or build.

**Strict source and geometry boundaries:**
- The optional `lib/storageVisualPrivate.ts` reader accepts only an exact
  bounded `aoe2war.storage-visual.signed.v1` envelope, carrying a
  `aoe2war.storage-visual.private.v1` payload. It verifies HMAC-SHA256 over
  `AOE2WAR_STORAGE_VISUAL_V1\\0` followed by sorted-key, UTF-8 compact
  JSON (cross-language publishers must match this byte sequence), with an
  **independent**, owner-managed 32–64 byte signing key in
  `AOE2WAR_STORAGE_VISUAL_HMAC_KEY` (hex; never re-use the Mac Pulse key).
  Server reads a single existing `state/storage-visual.v1.json` file from
  the established `AOE2WAR_OS_STORE_DIR` only, no file creation or network
  fetch, with bounded size, regular-file/no-symlink checks and timestamps.
- Payload `generated_at` is ISO UTC and `planes` is an array of at most
  three objects. Each plane has `id`, `observed_at`, `coverage` of
  `PARTIAL` or `DISJOINT`, at most 32 `hogs`, and at most 64 `events`.
  A hog is `{key, gross_allocated_bytes, overlaps}`. Keys are restricted
  to source-owned `HOG_CATALOG`; server assigns L1–L4 policy, not publisher.
  An event is `{id, at, kind, category, bytes, transaction_digest}`.
  Kind is `GENERATED`, `PRUNE_RECEIPT`, `PRUNE_HOLD`, `NEXT_REVIEW`,
  `SNAPSHOT` or `COLLECTED`. A prune receipt requires an exact hex SHA-256
  transaction digest. All fields are bounded and audited; no raw personal
  paths, credentials, URLs, identifiers of people or financial ledger
  content pass into the browser.
- A valid HMAC is **private provenance**, not three-host Ed25519 Atlas
  admission, not an independently certified APFS recovery or financial
  authority. `gross_allocated_bytes` may overlap parents/children, clones,
  hardlinks and protected descendants. Pie segments are proportions of
  *reported gross category sizes only*, not fractions of physical disk usage;
  any `DISJOINT` claim is restricted to reported categories and rejected
  when overlapping rows are present. Never add the radial sum to an APFS
  free-space figure. A `PRUNE_RECEIPT` event displays the reported amount
  as a receipt datum, **not** verified unique physical gain.
- With no provisioned key or receipt, the visualization shows **NO VERIFIED
  HOG FEED**, empty rings and no invented history. Invalid signatures or
  malformed receipts fail closed. Underlying signed three-plane Atlas
  remains HOLD; its admission is never promoted by this separate optional
  private receipt.
- The collector teams must adapt **existing** VPSSentry Mac Pulse and HEL1
  observer sources. Do not install another timer, broad scan, new deletion
  controller, privileged daemon or unbounded high-frequency file watcher.
  Each publisher must supply source SHA, freshness, target mount identity,
  categories and valid transaction receipts **before** production receiver
  adoption and authenticated browser sign-off. No new collector has been
  installed as part of this UI-source PR.

Mac policy: CrossOver/Steam/Replay Lab, device MobileSync backups, recovery
vault, E5 seal, active canonical app dependencies, Codex worktrees and signed
Watcher release distribution are **L4 protected**. Historical Renaissance
dependencies and Download contents are **L2 review**, not L1 deleted.
HEL1 Traffic DB, active swap, evidence and finance restore systems remain
protected until independent source-owner proof. L1 is strictly guarded
generated artifacts after regeneration/source/consumer/mount/APFS proof.


## Session D: 500 GB Mac L1 policy-exhaustion campaign (read-only)

The separate owner-native **one-time opt-in** command is
`./bin/aoe2war storage local-plan --l1-campaign --json`. It reuses the
existing named `local-pressure` inventory, source `local-maintain` cache
previews and the same `local-plan` ranker. It adds one shallow, mount-aware
APFS Data and home metadata accounting pass through the **existing**
`aoe2_storage_mac_pressure.py --capacity-only --json` source, and derives
a fail-closed `l1_policy_exhaustion_decision`. It adds **no** automatic
deletion, authorization, timer, process, private-file-content reads, sudo,
snapshot change, indexing modification or new cleanup controller. Do not
run repeatedly merely to make the certificate green.

**Declared policy scope:** existing `HOME_BUCKETS` (including protected
recovery, iOS backups, CrossOver/Replay, Codex and Docker), at most 120
direct `AoE2HDBets` sibling project roots and their present immediate
generated basename children, at most 60 worktrees declared by canonical
`app-prodn`, and the existing source-allowlisted Yarn/Go/pnpm/Electron/
npm/Homebrew/pip cache modes. This is **not** all applications in the user's
`~/projects`, nested monorepos, other home accounts or the Mac's full
physical container. The named census now reports `scope_bounds` with
total/observed/omitted direct projects and declared worktrees separately.
The 1024 displayed-row bound remains and explicitly holds rather than
silently certifying omission. `ABSENT`, `SYMLINK_TARGET`, permission
failure, timeout and out-of-scope are different classes; none authorize
unlink. Parent and generated child allocations overlap. Existing cache
source proof and standalone guarded transaction rules remain binding.

**Capacity accounting:** native Mac only, using the preexisting source-owned
`aoe2_storage_probe.py --plane mac` APFS identity and `statvfs` counters.
A bounded `du -k -x -d 1` metadata-only traversal is performed once
for `/System/Volumes/Data` and once for the actual home root, with
per-boundary max 110 seconds, 1 MiB output limit and 8192 direct-entry
limit. Child `lstat` refuses symlink traversal and different devices.
Nonzero `du`, inaccessible paths, unmeasured mounts, output ambiguity,
missing rows and timeout are typed HOLDs, **not zero usage**. Data and
home summaries **overlap** and must not be added. `du` can account
hardlinks only within its scan and cannot prove exclusive physical APFS
extents, clone sharing or snapshot/other-volume usage. The unaccounted
physical/container residual remains **null** unless independently
measured on the owner Mac. `OBSERVED_SHALLOW` means shallow metadata
collected; it does **not** mean the APFS container is fully accounted for.
Neither free-space drift nor gross allocation is a physical reclaimed
byte transaction receipt. Only one native opt-in source run is proposed;
no ongoing disk-wide job is installed.

**Mandatory certificate:** until full named and project policy scope,
source cleanliness/BUILD_ID, pinned rebuild, consumer inactivity,
hardlinks, mount/owner, APFS clones/snapshots/unique extent, owner approval,
guarded transaction receipts (or externally authenticated zero-eligible
evidence), two independent native observations, protected-data nonmutation
and independent Central acceptance are demonstrably satisfied, the output
is `L1_POLICY_EXHAUSTED_NO`, never a misleading all-clean.
`certified_recovered_bytes=0` refers to this *new* campaign only.
`no_eligible_action_signed_receipt=null`: this source has no local
signing authority and does not counterfeit a signed receipt. Existing
8-gate baseline **2/8** remains an independent Central observation,
not a source-earned additional gate. No `--apply` mode exists in the
campaign. Never convert a failed physical scan into a full-capacity YES.

If the real owner-native campaign still finds only protected or unqualified
historical generated material, the defensible outcome is **NO** to the
present complete-policy certificate with an exact blocker register;
the +20 GiB new safe cleanup target is **not** demonstrated. Once Central
accepts that no in-scope *provably safe* actions remain, it may separately
decide a bounded **zero-eligible** policy disposition without claiming
that all 500 GB were independently inspected or automatically reclaimable.
No new broad inventory after the scope is conclusively classified.
