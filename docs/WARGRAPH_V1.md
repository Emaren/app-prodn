---
id: "aoe2war.app-prodn.docs-wargraph-v1"
title: "AoE2WAR WarGraph V1"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn","api-prodn","aoe2-watcher"]
audience: ["developers","operators","auditors","ai-agents"]
source_of_truth: "git"
authority: "architecture-contract"
reviewed_at: "2026-08-25"
review_interval_days: 30
sensitivity: "internal"
---

# AoE2WAR WarGraph V1

## Purpose

WarGraph is AoE2WAR's permanent competitive territorial board for verified
Age of Empires II HD activity. V1 launches the basic living-board dynamics,
Watcher-backed qualification, deterministic deadline handling and durable
movement/event history.

The graph is permanent. It does not reset between nights.

## Constitutional topology

The living board contains:

- one Crown seat;
- two Ring I seats;
- six Ring II seats;
- an elastic Frontier containing all remaining eligible warriors.

Competitive movement is adjacent-ring only. The outer warrior is the
Aggressor and the inner warrior is the Defender.

A verified Aggressor victory takes the challenged inner seat. An interior
competitive loser falls to the Frontier. A Frontier loser remains on the
Frontier.

Each warrior may participate in at most two resolved WarGraph contests per
WarGraph night.

## WarGraph night

The authoritative time zone is `America/Edmonton`.

Prime Window is 5:00 PM inclusive through 11:00 PM exclusive. New advances
and organic battle qualification begin in Prime.

An already-bound contest may continue through Afterburn using its full
authoritative response and launch deadlines. Static State preserves the board
between active windows.

Server time and stored deadlines are authoritative.

## Verified battle truth

Only live organic DOUBLE-WATCHER evidence may create competitive WarGraph
movement.

Batch, manual and historical replay ingestion may preserve evidence, but they
do not independently move the board.

Qualification requires exact participant-bound Watcher provenance and trusted
final replay truth. Technical uncertainty fails closed.

Administrative resolutions never fabricate a battle winner, battle loser or
competitive result.

## Ready Now and Watcher Live

These are separate facts.

**Ready Now** is the foreground WarGraph matchmaking signal.

**Watcher Live** requires current healthy Watcher evidence, including an
attached HD monitor, a valid HD replay folder, a fresh heartbeat and an
authenticated Watcher identity.

Pairing READY requires qualifying Watcher evidence. A generic site heartbeat
does not satisfy it.

## Pairing deadline law

At launch deadline, when no exact qualifying game has commenced:

| Aggressor | Defender | Resolution | Punitive effects |
| --- | --- | --- | --- |
| READY | READY | `TECHNICAL_VOID` | none |
| READY | not READY | `DEFENDER_NO_START_DEFAULT` | accountable default |
| not READY | READY | `CHALLENGER_ABANDONMENT` | challenger action charge |
| not READY | not READY | `MUTUAL_NO_START` | none |
| uncertain system state | any | `SYSTEM_VOID` | none |

Technical/system voids and mutual no-start cannot move territory, consume
punitive actions or create WOLO rewards.

A defender no-start default may create the administrative seat claim and
catastrophic fall defined by the movement contract, but it remains
`no_battle`.

## Economic boundary

WOLO rewards belong only to verified battle truth according to the active
WarGraph reward contract.

Administrative defaults, Gravity and voids award zero battle WOLO.

WarGraph may create pending application-side reward entitlement records.
WoloChain remains independent settlement truth. Normal AoE2WAR release and
WarGraph runtime must not rebuild, restart or normalize Wolo.

## Durable runtime

WarGraph persists:

- graph/ruleset/night state;
- memberships and occupancies;
- presence and Watcher evidence;
- ADVANCE requests and defense obligations;
- pairings and engagements;
- contests and action charges;
- movements;
- rewards;
- immutable event history;
- bounded background jobs.

Deadline and settlement workers use durable leasing/CAS behavior and graph
advisory locks so concurrent workers cannot settle one domain event twice.

An accepted ADVANCE with an already-bound pairing may retire its response job
without producing duplicate domain effects.

## Runtime ownership

Production Node instrumentation owns WarGraph background startup.

`WARGRAPH_RUNTIME_DISABLED=true` disables background WarGraph execution for
isolated build/test/smoke environments.

The runtime coordinates bounded correlation, deadline, settlement and
maintenance work. Technical uncertainty must prefer retry or `SYSTEM_VOID`
over punitive inference.

## Migration

Foundation migration:

`20260824050000_add_wargraph_foundation`

Pre-release proof recreated the exact 22-table WarGraph schema on a disposable
copy of the proven 146-table predecessor estate.

Migration SHA-256:

`9ef6d3e2c94761470967bc5ddda2d0ab48f87e269217bb49f03e6811eabb2e0c`

Freshly migrated and runtime-proven WarGraph schema signatures matched exactly:
747 lines versus 747 lines.

## V1 implementation commits

- app-prodn: `8f047e0a21b8803428b878e73f3325f1b2e4c2d4`
- api-prodn: `9513a6df8df4e49f29fc39f0651a09e5fafe2934`
- aoe2-watcher: `c00d6c20eea36128a75e990a90b1ca76813fb2aa`

## Pre-release verification

The V1 implementation was sealed before deployment with:

- app WarGraph tests: 93 passed, 0 failed;
- API WarGraph attestation tests: 10 passed, 0 failed;
- Watcher lint: passed;
- Watcher tests: 33 passed, 0 failed;
- production Next.js build: passed;
- local production `/wargraph`: HTTP 200;
- local production `/api/wargraph`: HTTP 200;
- API projection health: `healthy`, "Living board online";
- migration parity: exact;
- application rewards during administrative runtime proof: zero;
- production and Wolo: untouched during pre-release proof.

These receipts establish launch readiness for the basic V1 dynamics. Additional
hardening may proceed from real production use without weakening the fail-closed
identity, Watcher, deadline, movement or WOLO boundaries.

## Operator launch checks

Before and after normal AoE2WAR deployment:

1. verify the expected app source/build version;
2. verify `/wargraph` renders successfully;
3. verify `/api/wargraph` returns `wargraph-public/v1` and healthy projection;
4. verify the WarGraph production runtime starts once;
5. verify no unexpected deadline, settlement or migration errors;
6. preserve the normal Wolo observe-only boundary;
7. verify production Wolo ports 8092 and 8093 each retain exactly one listener.

If WarGraph encounters uncertain participant, Watcher, timing, roster, frozen
state or result truth, it must fail closed rather than punish a warrior or
fabricate territorial/battle truth.
