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
the other candidate workflows executed the exact source.

Changed admin closures use authenticated reads; changed Kingdom/Intelligence
closures use bounded file reads, process-local state and pure projections.
Unchanged startup bytes alone are insufficient: production instrumentation
starts WarGraph workers immediately. The dispatcher requires both current
process and explicit effective systemd `WARGRAPH_RUNTIME_DISABLED=true`, plus
unchanged protected configuration digests. Absence/false/unknown means
`WEB_RELEASE_HOLD`; this controller never toggles the flag. The narrow source
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
the real challenge. No signatures are issued by automation. Challenge validity
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
root public-only enrollment/private journal provisioning (HEL1 enrollment must
be remeasured, never overwritten); effective disabled startup-writer evidence;
exact published main/remote-main; original protected source/transport/storage/
rollback checks; separate physical owner signatures. Any unknown remains HOLD.
No website permit enables custody, SQL migrations, financial transfers, Wolo
binary changes, settlement restarts or consensus changes.
