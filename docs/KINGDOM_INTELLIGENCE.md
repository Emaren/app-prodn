---
id: "aoe2war.app-prodn.kingdom-intelligence"
title: "Kingdom Intelligence"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "self-knowledge-contract"
reviewed_at: "2026-10-06"
review_interval_days: 30
sensitivity: "internal"
---

# Kingdom Intelligence

## 2026-10-16 — Fail closed when public evidence streams describe different releases

Kingdom Agents combines General Inspections (full certified production release SHA)
with Kingdom Intelligence (public 12-hex release prefix). Both can be fresh but
refer to different deployed generations. A separate age check did not prove
shared identity and could project a healthy system sentinel from stale-release
facts alongside a different inspections score.

A pure, unit-tested identity arbiter now requires a valid full 40-hex inspection
SHA and exactly 12 hex KI prefix characters. Only a matching prefix permits
KI-derived system agent states, Doctor score, directive and activity to be
reported as current together with inspection watchposts. A conflicting pair
reports `releaseAlignment=mismatch`, shows `SOURCE DRIFT`, masks mixed release
identity and leaves KI system states unknown. Missing/invalid evidence reports
`releaseAlignment=unknown`, not healthy; independently observed inspection
checks are still labeled with their own source.

This is an evidence-presentation correction, **not** a 100/100 score change,
source refresh, actual agent process, reauthentication of GitHub, production
release or Wolo financial action. No live deployment or external observation
was performed. Separate public routes still collect independently; consistent
source IDs allow coherent interpretation, not atomic multi-source sampling.


## 2026-10-16 — One General Inspections evidence scan per public OS refresh

The public AoE2WAR OS endpoint combines General Inspections and Kingdom
Agents. Previously it invoked `buildGeneralInspectionsSnapshot()` directly
and `buildKingdomAgentsPublicSnapshot()` invoked the same scanner a second
time, potentially scanning all local receipts, filesystem volumes and
release evidence twice within a single 45-second dashboard refresh.

The OS aggregator now creates **one promise** for this snapshot and
shares the identical outcome with the agent projection. Standalone
Kingdom Agents routes retain their independent scanner as before.
A rejected inspection promise remains unavailable in both consumers
instead of silently running a second check or falsely reporting 100.

This is an objective reduction from two independent inspection scans
to one per OS snapshot. It does not claim a measured latency gain:
those metrics require fresh production profiling. No visual components,
links, player-facing scoring weights, deployment control, persistence,
funds, finance or operator permissions were changed.

## 2026-10-15 — Public AoE2WAR OS command deck and evidence-based 100 contracts

The public route `/aoe2war-os` is a **read-only** visual command deck, separate from
the authenticated operator bridge at `/admin/aoe2war-os`. Both castle
navigation dropdowns offer AoE2WAR OS and Television WOLO; the primary
player-navigation chips are otherwise unchanged.

The deck shows an independently captured source census (exact capture SHA,
time and CI receipt); an exact 193-name schema-derived Prisma model atlas;
test pass/skip counts; modularity/cycle and storage source metrics; the
existing public General Inspections readiness categories; existing Kingdom
Agents states; and current GitHub commit/PR/Actions events.

**Authority never gets merged into a decorative light:**
- GitHub push/PR/Actions CI proves source activity, not VPS activation.
- Certified production source/build comes from General Inspections; absent
  or stale sources must visibly say UNKNOWN/UNVERIFIED, never fabricate 0.
- A release-operation beacon uses only a recent Operator Bridge heartbeat
  plus exact allowlisted queued/claimed/running deploy/finish/rollback action.
  It is **release control in progress**, not a certified successful deploy.
- "Last deployed at" is shown only when a bounded, local Finish
  receipt records `production_deployed=true`, a certified outcome, the
  exact matching live production source SHA and an explicit
  `release_certified_at` timestamp. Otherwise it says NOT PROVEN.
  Commit time, CI completion, file mtime and inspection timestamps
  are NOT substitutes.
- Operational 100/100 is defined by each owned, explicitly versioned check
  having current appropriate proof at its source/runtime generation. The
  engineering maturity estimate (74/100 at October 15) is a separate
  subjective planning rubric and never rendered as a measured production
  certification. No scores are reweighted simply to look green.
- Source benchmarks are historical until renewed by a source-bound census;
  a newly merged GitHub commit does not retroactively update the old source
  sample or the currently deployed site's schema.

The local public-status receipt reader opens with `O_NOFOLLOW`, checks a regular-file descriptor and its <=128 KiB length, and reads exactly that bounded snapshot through the same descriptor. It cannot trust a first-path `lstat()` followed by a second-path open because a symlink swap could circumvent the original size check. Missing/invalid evidence remains unavailable, not success. Protected Finish receipts also use this same no-follow descriptor policy with an independent 750 KiB cap, so a path swap cannot counterfeit last-deployment evidence.

Public traffic never accesses authenticated OS control commands, operator
identities, raw run logs, wallet addresses, secret paths, or arbitrary
filename selectors. It reads allowlisted, bounded and safely projected
status only; GitHub URLs are verified to the official app repository.
Public polling is bounded to 45 seconds while the tab is visible, stops on
unmount, and displays interrupted signals rather than preserving fake
"live" state. Initial server rendering does not wait on external GitHub:
the activity feed hydrates after first paint. Server GitHub reads use
45-second cache and short timeout.
Animations respect reduced motion and never claim a job is running based
only on a decorative animation.

The command deck is registered as the **25th** tracked Kingdom page in the source-hashed page-change manifest. Source edition is generated from the exact public page's three route files, and tests independently recompute the hash so player change notices cannot silently drift. This extends existing infrastructure without changing tiny castle dots or primary player nav chips.

Improvement gates: source-accurate Prisma enumeration; actual verified
production/source separation; no write methods or privilege bypass on
the public endpoint; safe unknown/outage projection; GitHub source origin;
Node/TS, Python/docs and production build CI. Future improvements must
deliver **measured** faster signals, correct last-deploy receipts, more
reliable agent actions, or reduced maintenance cost rather than merely
more lights, manufactured 100s, or background polling.


Kingdom Intelligence (KI), also called **the Brain**, is AoE2WAR's durable
self-knowledge layer. It is not an LLM and must not require an LLM to explain
the operating state of the project.

The project supplies deterministic facts, provenance, invariants, freshness,
ranked next actions, receipts and protected commands. External AI systems may
consume that structure, but the authoritative state belongs to AoE2WAR.

## Constitutional lens

Every KI answer is organized around three questions:

1. **Truth** — what is true now?
2. **Provenance** — which source, receipt or observation proves it?
3. **Invariants** — what must not be allowed to break?

AI-generated interpretation may add context, but it never replaces those three
layers.

## Operator entry point

The canonical read-only operator snapshot is:

```bash
aoe2war brain
aoe2war brain --json
```

The human view is deliberately compact. The JSON form is the preferred handoff
for ChatGPT, Codex, future agents and automated operator surfaces.

V1 combines:

- local, GitHub, production and certified release identity;
- latest Finish transaction status, including a certified runtime whose later closure phase failed;
- generated control-state status and exact blocker/reason;
- Audit/Doctor severity;
- Storage, Host, Recovery and Workspace state;
- the active durable Storage Campaign OS mission, when one exists;
- the latest persisted Speed OS campaign;
- the latest persisted Replay Truth certainty closure;
- bounded 24-hour source-motion and Finish activity counts;
- explicit invariant status;
- ranked Council recommendations and one best next action.

The command does not mutate source, runtime, database, Wolo, storage, packages
or host state.

## Read-only Git index discipline

Estate source checks perform branch, HEAD, porcelain-status and remote-reference
observations without mutating worktrees. The audit's Git helper invokes these
commands with `git --no-optional-locks`, preventing opportunistic
`.git/index.lock` creation for index-stat refreshes during routine Doctor /
Brain snapshots. Full protected Git operations (fetch, fast-forward, Finish)
retain normal Git lock semantics; this change does not remove a pre-existing
lock, bypass ownership checks or certify a dirty repository.

## Collection concurrency and failure containment

Scheduled Operator Bridge refreshes and manually requested Brain refreshes are
**one collection lane**, not independent authorization to launch redundant
full estate audits. The Brain process holds a kernel-backed, nonblocking
`.aoe2war-release/brain-collection.lock` while collecting. A second caller
gets a truthful error ("already running") and must retry rather than spawning
another heavyweight Doctor, Estate, documentation build or parallel probe.
The empty local lock file does not contain operational evidence; the kernel
releases its ownership automatically if the collector crashes. The protected
Finish lock is separate and still defers periodic publication.

Council runs each full Doctor, Storage and Workspace collection under its
existing bounded deadlines. Doctor can spawn a tree of estate and
documentation jobs; **on Council timeout**, Doctor is started as a fresh
owned process group and Council signals that group, then escalates after a
two-second grace period if necessary. This prevents Council timeouts from
leaving its descendant `make`/Node/Python/Git probes as abandoned workers;
it does not signal independently owned Codex, Steam, or bridge processes.

These safeguards **do not bypass** the full Doctor, strict documentation
validation, Estate audits, score thresholds, source parity or Wolo boundaries.
A collection that fails or cannot acquire the lane never publishes a
replacement healthy snapshot. The periodic bridge retries after failures;
successful snapshots must still pass exact source and freshness validation.

To avoid repeating strict documentation builds every five minutes,
**only explicit `--monitor` observations**, including Brain's Council-owned
Doctor and the Operator Bridge's automatic Estate publication, may reuse a prior
complete strict-build result from a `CERTIFIED` protected Finish. That deterministic
result is valid only when all three original central quality targets passed,
the Finish's full Estate audit was P0=0/P1=0, the local app source exactly
matches the certified release and each of the five core sources **plus**
`AoE2WAR-docs` remains on the same clean branch and exact Git commit. The
underlying certified receipt must be no older than **seven days**, with the
original receipt name, SHA-256, completion time, observation time and six
current source SHA values disclosed in `central_quality_proof`. If the proof is
missing, expired, incomplete, dirty or source-divergent, the full Make gates
run again. Standalone Doctor, human-triggered Full Estate Audit and protected
Finish **never request `--monitor`** and run the exhaustive checks regardless
of inherited environment variables. The reused proof is an earlier certified build,
not a claim that a fresh build ran. Dynamic production, recovery, service,
supply-chain and host probes still execute on each Doctor collection.

## Freshness is part of truth

Persisted evidence is never presented as silently current.

The public KI view uses the older age of the original `payload.generated_at` Brain
collection and the server's `receivedAt` delivery envelope. A retransmitted old
collection cannot appear newly healthy merely because the bridge delivered it again.
If the Brain capture timestamp is missing, the public result is explicitly stale,
even when the envelope receipt is fresh. General Inspections applies the same
two-clock rule to bridge-dependent weighted checks; separately certified activation
and live VPS filesystem receipts remain independent authorities.

Replay certainty includes receipt age and becomes stale after 24 hours.
Performance campaign evidence includes age and becomes stale after seven days.
Source/release state is collected live through the existing release collector.

A stale receipt remains valid historical evidence; it is not current-state
authority.

Performance evidence has an additional identity rule: a campaign is current only
when its recorded release SHA matches the currently certified production source.
A recent campaign for an older release is explicitly marked non-current.

Replay Truth certainty uses the same provenance rule. A closure receipt may be
complete and still be historical if its recorded production source differs from
the currently certified source. Refresh certainty before calling that evidence
current.

Finish truth is split deliberately. Runtime certification remains authoritative
when activation has passed, even if Workshop, documentation, audit, Doctor or
another later Finish phase fails. The Brain must expose both facts rather than
collapsing them into one misleading green/red status.

## War Date

War Date is a deterministic presentation of UTC time:

```text
YYYY.DDD.HHMMZ
```

For example, `2026.248.2107Z` is UTC year 2026, ordinal day 248, 21:07 UTC.
The underlying ISO-8601 timestamp remains present in machine output.

War Date is presentation, not a replacement chronology.

## Invariants

V1 projects runtime evidence for these invariants:

- source authority is exact across local, GitHub, production and certification;
- Estate P0 is zero;
- Estate P1 is zero or explicitly visible as attention;
- protected Wolo listeners remain exactly one on 8092 and 8093;
- off-host Recovery OS proof is verified or explicitly incomplete;
- Replay Truth certainty closure accounts for every final battle without
  manufacturing winner authority.

The invariant list will grow, but new invariants must be deterministic and
evidence-backed.

## Relationship to Council

`aoe2war council` remains the ranked recommendation engine.

`aoe2war brain` is the larger self-knowledge envelope. It includes Council
recommendations while also binding them to source authority, certification,
Replay Truth, Speed OS and invariant state.

Council answers **what should we do next?**

The Brain answers **what is the state of the kingdom, why, what cannot break,
and what should we do next?**

## Public and operator surfaces

Kingdom Intelligence has two presentation surfaces over one authority.

### Public: `/kingdom-intelligence`

The public page is the visible nervous system of the kingdom. It presents the
current operating state, War Date, bounded 24-hour source/release activity,
sanitized Release/Storage/Replay Truth/Speed/Workspace/Council modules, active
long-running mission progress, and a whitelist of invariant names/statuses.

The public page is deliberately theatrical in presentation and conservative in
truth. Its "ancient kingdom discovering computation" visual language may be
dramatic; the numbers and statuses still come only from the deterministic Brain.

The public API at `/api/kingdom-intelligence` is a bounded projection. It never
returns the raw Brain payload.

The public `/workshop` surface also carries a compact **Kingdom Intelligence ·
The Brain** panel in Basic, Advanced and Extreme views. That panel consumes only
the existing sanitized public projection and reduces it again to War Date,
operating state, certified source identity, Doctor/P0/P1, invariant/system counts
and the ranked next directive. It links to the full Brain instead of creating a
second telemetry loop, truth model or operator surface. Raw evidence, private
reasoning and unrestricted operator detail remain withheld.

### Operator: `/admin/aoe2war-os`

The existing AoE2WAR OS War Room is the private operator home for KI. It exposes
the full Brain snapshot alongside estate/release evidence and protected commands,
including:

- exact War Date and operating state;
- deterministic Council directive, reason and protected CLI action;
- current Storage Campaign OS lifecycle and generation progress;
- Replay Truth and Speed release-freshness;
- Workspace OS agent/worktree state;
- invariant evidence;
- an explicit read-only **Refresh Kingdom Intelligence** action;
- a protected **Refresh Kingdom State** action that runs the certified control
  refresh and regenerates the coherent AoE2HDBets/aoe2-watcher/WoloChain/
  VPSSentry/AoE2WAR-docs/MBP/VPS context camera set;
- direct read-only **Storage Status**, **Storage Plan**, and **Storage Campaign**
  controls so capacity health, the next bounded archival candidate, and detached
  campaign lifecycle can be inspected without opening a terminal;
- separate documentation planning/synchronization controls so a documentation
  maintenance operation is not confused with a full kingdom-state refresh.

Successful state-changing bridge actions immediately republish both the estate
audit and Kingdom Intelligence snapshots. The dashboard therefore catches up
after a control refresh, documentation sync, deploy, Finish, or rollback instead
of waiting for the periodic Brain interval.

This is intentionally not a second admin dashboard. Release OS, Workspace OS,
Storage OS, Council and the Brain belong in one operating command center. The
separate AI Command Center remains responsible for user-facing AI agents,
persona/prompt configuration and request telemetry; it does not own system truth.

### Publication path

The Mac Operator Bridge executes `aoe2war brain --json` and publishes the result
through its existing outbound-only authenticated channel. AoE2WAR stores that
snapshot atomically in the OS control store. The bridge publishes a snapshot at
startup, after an explicit Brain action, and periodically (five minutes by
default, bounded to no faster than two minutes). The public page then reads only
the sanitized server projection.

Bridge process liveness is not Intelligence freshness. A direct `aoe2war finish`
may reload the persistent bridge while the Finish transaction lock is still held.
In that case the bridge must defer the startup Intelligence observation, retry
promptly once the lock clears, and then resume the ordinary periodic cadence.
Brain command failures, malformed JSON output, and publication failures are
operator-visible warnings and receive bounded fast retries; they may never be
silently converted into a successful-but-stale bridge.

The raw Brain snapshot must never be exposed publicly. The public projection must
never publish:

- chain-of-thought;
- private prompts;
- raw unrestricted shell/stdout;
- secrets or tokens;
- private filesystem paths;
- raw receipt/evidence paths;
- process identifiers or private campaign logs;
- sensitive operator reasons/commands.

Presentation may have multiple skins or density modes. Truth logic, provenance,
invariants and mission state may not fork by visual variant.

## Dependency-aware next action

When the latest Finish receipt specifically fails at `capacity_preflight`, the
Brain treats that failure phase as the first actionable root-filesystem blocker,
even when the attached volume is merely in WATCH. It must not recommend an
identical volume triage or another Finish attempt before verified new root
headroom exists. It instead exposes the externally blocked root-capacity task
and requires a fresh protected headroom check before retry. This recommendation
is **not** permission to prune fast rollback generations, resize a live disk,
or waive the release controller's headroom or financial gates. No source of
record is changed by updating a recommendation.

Kingdom Intelligence must recommend the prerequisite that can actually clear the
current blocker, not merely repeat the failed outer transaction.

If Finish is incomplete because final Doctor is blocked by Storage OS, storage
headroom outranks `aoe2war finish`. The Brain points first to a read-only
`aoe2war storage plan --json`; only after the storage blocker is cleared should
Finish closure be retried.

Likewise, when a frozen analyzed Speed campaign belongs to the previous release
and production has advanced, that state means **verify the open before/after
campaign**. It does not mean create another baseline. The Brain should say
`aoe2war speed campaign verify`.

After verification, current performance truth belongs to the verification's
After release/build, while the frozen Before release remains historical
comparison evidence. A verified campaign must therefore satisfy current-release
freshness when its After release matches certified production; it must not ask
for a redundant new baseline merely because the baseline SHA is older.

The optimization target queue follows the same temporal rule. Before
verification, `performance.targets` may come from the frozen baseline analysis.
Once a verification receipt exists and is readable, Brain re-analyzes that exact
After benchmark receipt, using the verification's After source inventory when
available. Current targets then carry
`target_basis=verification_after` and the verification release SHA. The
frozen baseline target list remains separately available as
`baseline_targets`; it is historical comparison evidence, not the current
optimization queue.

If the verification receipt cannot be read, Brain does not invent After-state
targets. It retains the baseline analysis and labels the basis accordingly.
Freshness, target basis, baseline identity, and verification identity are
separate facts and must not be collapsed into one ambiguous current flag.

Storage recommendations are also phase-aware. Storage pressure may block a
Finish retry only while Finish closure is incomplete. Once the latest Finish is
CERTIFIED, the same storage state remains maintenance/Doctor attention but is no
longer described as a prerequisite to rerunning an already-complete release.

## OS agent constellation and chronicle

Kingdom Intelligence presents the operating estate as **eight OS agents plus one
System Doctor**:

1. Release OS;
2. Documentation OS;
3. Storage OS;
4. Host OS;
5. Recovery OS;
6. Workspace OS;
7. Speed OS;
8. Replay Truth OS;
9. System Doctor.

The Brain and Council sit above that array as coordinator/recommendation layers;
they are not counted as a ninth operating-system agent.

Each OS agent publishes one compact state line: label, evidence-backed state,
current summary, and a progress measure only when a deterministic denominator
exists. Presentation uses one shared beacon language:

- cyan pulse — proven active work;
- green solid — operationally healthy, complete or certified;
- amber pulse — stale, degraded, approaching/over a governed operating threshold,
  or otherwise requiring attention;
- red solid — failed, blocked or unsafe;
- slate — unavailable or lacking enough current evidence to classify safely.

The beacon color represents **operational health**, not whether the subsystem has
literally no future work scheduled. In particular:

- Documentation OS remains HEALTHY when its control state, checker, taxonomy and
  central federation are current and no reviews are overdue. Reviews due within
  the next seven days remain visible in the summary as scheduled maintenance;
  they do not by themselves make documentation unhealthy.
- Workspace OS is HEALTHY when canonical source has no drift and no registered
  agent workstream is active. A registered workstream is ACTIVE; canonical drift
  is ATTENTION. Intentionally preserved unique/unmerged review work remains
  visible as debt without turning a clean canonical workspace into a false
  failure.
- Replay Truth OS is HEALTHY when the current-release certainty closure is
  complete, every final battle is explicitly accounted for, and the unclassified
  count is zero. Its progress bar may remain below 100% because that bar measures
  resolved winner authority, not accounting integrity. Explicitly evidence-bounded
  unresolved battles are truthful classified outcomes, not missing rows.

The public page must never animate an agent merely because an AI model is
connected. Activity requires a deterministic receipt, registered Workspace OS
workstream, active bounded campaign, bridge run, or other explicit provenance.

External workers such as ChatGPT and Codex are distinct from the OS agents.
Workspace OS may expose an external worker name, purpose and activity state when
that workstream was explicitly registered. Future authenticated agent heartbeat
sources may extend this, but absence of a heartbeat must render as idle or
unavailable rather than fabricated activity.

### War Pulse

The public **War Pulse** is a sanitized chronicle that merges:

- active/recent allow-listed Operator Bridge runs;
- recent sealed app-prodn source changes;
- current OS-agent state and campaign progress.

It exposes no raw stdout, filesystem path, process ID, private prompt, secret,
unrestricted command, or chain-of-thought.

### Victory ledger and memory vault

The **Victory Ledger** presents recent sealed source changes with a short Git SHA
and deterministic OS-domain classification. A commit proves that source work was
sealed; it does not by itself prove production deployment or runtime success.

The **Memory Vault** presents recent commits that sealed changes to
'docs/ENGINEERING_MEMORY.md'. These are provenance pointers to machine memory,
not a replacement for the living contract itself.

Failures are never rewritten out of history. An individual failed attempt remains
failed forever. A parent campaign or workstream may later become COMPLETE when a
subsequent attempt closes the problem. The UI may visually collapse resolved
failures beneath the successful campaign, but provenance remains immutable.

This distinction is constitutional: the kingdom may celebrate a win without
erasing the road that produced it.

## Agent efficiency contract

A capable agent should not spend most of its context rediscovering the project.

Before a large task, an operator or agent should be able to obtain one bounded
KI snapshot and immediately know:

- which source is authoritative;
- whether production is certified;
- what is unhealthy or approaching a threshold;
- which evidence is stale;
- which replay frontier remains;
- which performance campaign is current;
- which invariants govern the next action;
- which action the deterministic Council ranks first.

When an AI discovers a recurring diagnostic fact that required expensive
repository excavation, the preferred response is to teach KI to expose that
fact deterministically for the next session.

Independent read-only probes should execute concurrently when their safety and
truth semantics permit it. KI latency is itself an operating metric: the Brain
should not make an operator wait for the sum of unrelated SSH probes.

Any invariant reported as ATTENTION prevents a READY operating state. A green
Doctor score cannot override an explicit incomplete Finish, stale control state,
wrong-release Speed/Replay evidence, or incomplete recovery proof.

Workspace truth is part of KI. Canonical source drift, preserved legacy dirty
work, unmerged work and registered agent work are distinct states. A dirty
registered agent worktree is expected active engineering and must not be counted
as canonical source corruption merely because it contains WIP. Unique or
unclassified dirty work remains preserved review debt and is never silently
collapsed into housekeeping or automatic cleanup.

The bounded 24-hour activity counters are evidence of source/release motion, not
a claim that a language model was continuously generating code every second.
The public presentation may celebrate sustained automated engineering, but it
must not overstate what the deterministic evidence proves.

## Non-goals

Kingdom Intelligence does not:

- train a private AoE2WAR language model;
- guess unknown production truth;
- manufacture replay winners;
- bypass release or Recovery OS safety;
- turn arbitrary shell access into a website feature;
- make presentation styling part of the self-knowledge contract.

The Brain should remain useful even if no external model is available.
