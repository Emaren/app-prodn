---
id: "aoe2war.app-prodn.renaissance-owner-v4-dispatch"
title: "Renaissance owner-v4 protected dispatcher"
type: "runbook"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn", "wolochain"]
audience: ["developers", "operators", "ai-agents"]
source_of_truth: "git"
authority: "operational-procedure"
reviewed_at: "2026-10-26"
review_interval_days: 1
sensitivity: "internal"
---

# Renaissance owner-v4 protected dispatcher

This controller deploys only `6d2a78224e5a5c647345d6b5ffc91bf94dc84b59` from
rollback `6be434c00469afa4acb0623715c3bcf724f927f4`, BUILD_ID
`xqX6Oi-zV5gSKH1kIC4zC`. Review-only v4 and all v3 packets remain inert here.
The release signature domain is `aoe2war.renaissance.website.v4.release.v1`.
Source qualification and human authorization are separate requirements.

## Scope and financial HOLD

The frozen full diff has 128 paths (63 added, 65 modified), zero migrations,
three FINANCIAL, four WATCHER and one REPLAY_TRUTH paths. All actual content
hashes remain governed by the original frozen inventory. The source risk stays
FINANCIAL. Candidate Chrome coverage (88 routes) and Intelligence (246
assertions) are authenticated from original GitHub ZIP digests and raw receipt
hashes, never from a green job alone. Full CI used synthetic merge
`494e7a405532261b079134e5ccb6717045d99068`, whose tree equals the frozen tree;
the other candidate workflows executed the exact source. Evidence fetches the
reviewed attempt 1 explicitly; a later rerun cannot silently replace its
checkout identity or job outcomes.

Changed admin closures use authenticated reads; changed Kingdom/Intelligence
closures use bounded file reads, process-local state and pure projections.
Unchanged startup bytes alone are insufficient: production instrumentation
starts WarGraph workers immediately. This follow-up implements the explicit
`ACTIVE_WEB_WARGRAPH_CONTINUITY` policy without disabling the website's only
observed worker owner. The dispatcher requires a production Node process,
no effective `WARGRAPH_RUNTIME_DISABLED=true` process/restart override,
the exact original source and protected unit digests, and a fresh, bounded,
read-only local PostgreSQL census with **zero due jobs, zero running leases,
zero pending defense obligations, zero open advances and no queued work due
within ten minutes**. Ambiguous/overdue/leased work or unknown runtime state
means `WEB_RELEASE_HOLD`. No money, SQL rows, flags or services are changed.
This is an approved-source candidate **only**; current production release
authority still requires new exact-head CI, owner acceptance, source
publication, PRE_STAGE and artifact-bound PRE_ACTIVATE signatures. The narrow source
review covers newly introduced/deployment-induced financial writes, not all
live SQL: external users and existing timer/services continue independently.
Activation probes use only the passive version endpoint; `/api/lobby` and
`/api/bets` can enqueue writes and are excluded. Original rollback stays armed
through the original soak. Watcher distribution version must remain unchanged.

Wolo source P1 is preserved verbatim, not closed or waived by this packet.
8092/8093 PID, executable device/inode/hash, loopback socket ownership, consensus
identity, nineteen configured services/timers and configuration digests must
remain intact. Timer-fired oneshots use the existing conservative comparator.
These are same-owner SSH observations, not independent solvency/finality proof.
Issue #5, founder #889 and all historical obligations remain financial HOLD.

## Actual implementation

`aoe2_renaissance_v4_release.py` provides inspect, prepare, publication-plan,
publish-source, issue-stage, stage, issue-activation, activate, inspect-attempt,
reconcile and abort. CLI JSON failures return exit 2 and explicit HOLD.

Both dispatches acquire the original local lock and original remote physical
flock, with no environment-marker inheritance. Phase Bash inherits that flock;
its stage guardian retains the same descriptor if a systemd build/dependency
unit outlives Bash or SSH. It monitors only the two exact ephemeral units and
never stops a service. Unavailable unit state retains the lock for operator
reconciliation. Worktree/cache cleanup waits for proven quiescence. Neither
transport loss nor elapsed authorization permits lock takeover or redispatch.

The existing SQLite journal retains review history in `requests_v4`; release
requests use `release_requests_v1`. ISSUED → CONSUMED is durable before one
phase executes. COMPLETE requires actual engine output, immutable raw before/
after observations and postconditions. A protected CERTIFIED result followed
by outer verification failure is retained with CONSUMED/HOLD, never erased or
retried. Reconciliation is read-only. Abort can revoke only ISSUED authority.

Process binding combines protected socket PID, systemd PID, executable inode,
process cwd/start time, BUILD_ID existing before startup, and the passive
compiled build version. This is an OS/runtime observation, not remote
cryptographic attestation of arbitrary process memory. The build version is a
timestamp/random value, not an embedded Git SHA. Source identity is established
by the clean source tree and protected engine receipt; no SHA embedding is claimed.

## Owner protocol — not authorization to run these phases now

Use a clean, reviewed controller checkout and a separate clean exact candidate
checkout. No build runs on the Mac. Never replace either key or old receipts.
Commands below assume the operator has accepted the controller exact SHA and
publication plan, provisioned the existing public-only root trust and private
journal paths, and all runtime predicates pass. The private key remains in
`~/.config/aoe2war/website-owner-v4/owner-private.pem` on the owner's Mac.

First, read-only/local preparation from the controller checkout:

```sh
python3 scripts/aoe2_renaissance_v4_release.py inspect
python3 scripts/aoe2_renaissance_v4_release.py publication-plan
python3 scripts/aoe2_renaissance_v4_release.py prepare
```

Preparation seals a real generic engine manifest and gate, bound additionally
to exact controller commit/inventory, candidate content, candidate CI, DocsV2,
rollback and risk. This is not an owner permit. Main publication is separate:
`publish-source --accept-controller EXACT_REVIEWED_SHA --accept-publication-plan PLAN_SHA256`.
It is a normal non-force fast-forward, with pre-push comparison of advertised
old main to the baseline. It never stages or activates. If GitHub rules require
a merge/new SHA, stop and requalify; never bypass rules or relabel the frozen
candidate. Do not execute publication before owner accepts this concrete plan.
Actual issue/stage also require remote production origin main at the exact SHA.

Phase 1 (operator issues; owner personally signs; operator executes once):

```sh
umask 077
python3 scripts/aoe2_renaissance_v4_release.py issue-stage > /ABS/private/PRE_STAGE.json
python3 scripts/aoe2_renaissance_v4_owner_sign.py --release \
  --request /ABS/private/PRE_STAGE.json \
  --private-key "$HOME/.config/aoe2war/website-owner-v4/owner-private.pem" \
  --approve-phase PRE_STAGE --approve-candidate 6d2a78224e5a5c647345d6b5ffc91bf94dc84b59 \
  --approve-controller EXACT_REVIEWED_SHA --approve-manifest ACTUAL_MANIFEST_SHA256 \
  --approve-nonce ACTUAL_STAGE_NONCE > /ABS/private/PRE_STAGE.signed.json
python3 scripts/aoe2_renaissance_v4_release.py stage --packet /ABS/private/PRE_STAGE.signed.json
```

OpenSSL prompts the owner in their terminal. Do not pass a password in argv,
environment, chat or JSON. Every explicit value must be visually checked from
the real challenge. No signatures are issued by automation. Generic stage/activation entrypoints
reject an owner-v4 manifest without the signed dispatcher command channel;
ordinary `finish` cannot consume this sealed manifest as a shortcut. Challenge validity
is twenty minutes and is rechecked after I/O and immediately before dispatch.

Phase 2 starts only after verified STAGED and the actual on-disk stage receipt:

```sh
python3 scripts/aoe2_renaissance_v4_release.py issue-activation \
  --attempt-id ACTUAL_ATTEMPT --stage-receipt /ABS/actual-stage-receipt.json \
  > /ABS/private/PRE_ACTIVATE.json
```

Owner repeats the signing command with PRE_ACTIVATE, its new nonce and actual
challenge path. This binds exact artifact hash, raw stage receipt hash, Next
BUILD_ID, source/controller/manifest and rollback. Then operator executes:

```sh
python3 scripts/aoe2_renaissance_v4_release.py activate \
  --packet /ABS/private/PRE_ACTIVATE.signed.json \
  --stage-receipt /ABS/actual-stage-receipt.json
```

Never rerun a consumed phase. Inspect with `inspect-attempt --attempt-id ID
--phase PRE_ACTIVATE`. On ambiguity preserve the original engine receipt and
use `reconcile --packet /ABS/original-signed.json --protected-receipt
/ABS/original-receipt.json --receipt-sha256 ORIGINAL_SHA256`. This does not
repair nonce history, invent COMPLETE, retry activation or assert authorization.

## Genuine remaining prerequisites

Owner accepts exact reviewed controller and publication strategy; genuine Mac
root public-only trust/private journal parity (owner verified enrollment Oct 26,
but the CLI remeasures this); fresh source-bound active WarGraph owner and
read-only idle-job/deadline evidence immediately before phases; exact published
main/remote-main; original protected source/transport/storage/rollback checks;
separate physical owner signatures. Any unknown remains HOLD.
No website permit enables custody, SQL migrations, financial transfers, Wolo
binary changes, settlement restarts or consensus changes.

## October 26 source/host qualification receipt

Read-only HEL1 v4 capture SHA-256
`74d92e1e967298844ecb9ebaea8fad02030671925849311a84f9ee9a44c1e6ac`
verified expected 8092/8093 socket ownership and original website source/build.
Both `wargraph_runtime_disabled` and `restart_runtime_disabled` were **false**
at the original October 26 review; the **original strict-disabled controller**
correctly returned WEB_RELEASE_HOLD. Later read-only HEL1 evidence at 07:55 UTC
showed no active or due jobs and no pending deadlines, 232 historical dead
correlation jobs, and one fossilization job due at 23:00 UTC. This is a
historical checkpoint, **not** a live authorization or a guarantee that future
jobs stay idle. The new active-owner gate rechecks every protected phase and
must fail closed on fresh changes. No flag or production service was changed.
The private full observation is retained outside Git with owner-only mode.

Read-only publication plan digest:
`ce1f590bec1d0d700a9298978ea0b37df5d8cb0cfbb360e49f1cea245512fcf5`.
GitHub main was unprotected with no matching rules and remained the rollback
SHA, as did production origin main. A non-force fast-forward is possible after
explicit acceptance; no push to main occurred. Recompute the plan if rules or
main change. Mac public trust and journal roots were absent. Existing HEL1
public enrollment does not provision the Mac and must not be overwritten.

The next owner decision is whether to accept the new **single website process
owner**, its short controlled-restart risk, and the complete source/publication
plan after independent full CI. The controller cannot claim that an idle census
proves arbitrary Node process-memory execution; it binds exact startup source,
process and compiled BUILD_ID, read-only database idle predicates, unchanged
external Wolo writer identity, physical release lease and normal rollback.
If activation introduces due work, deadlines, ambiguous service ownership or
restarts outside the accepted cutover, hold and preserve original receipts.
No stage, activation, live financial transaction or owner release signature has
been issued by this patch. No PRE_STAGE/PRE_ACTIVATE was issued.
