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
reviewed_at: "2026-09-05"
review_interval_days: 30
sensitivity: "internal"
---

# Kingdom Intelligence

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
- the latest persisted Speed OS campaign;
- the latest persisted Replay Truth certainty closure;
- explicit invariant status;
- ranked Council recommendations and one best next action.

The command does not mutate source, runtime, database, Wolo, storage, packages
or host state.

## Freshness is part of truth

Persisted evidence is never presented as silently current.

Replay certainty includes receipt age and becomes stale after 24 hours.
Performance campaign evidence includes age and becomes stale after seven days.
Source/release state is collected live through the existing release collector.

A stale receipt remains valid historical evidence; it is not current-state
authority.

Performance evidence has an additional identity rule: a campaign is current only
when its recorded release SHA matches the currently certified production source.
A recent campaign for an older release is explicitly marked non-current.

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

## Relationship to the public Kingdom Intelligence page

The future `/kingdom-intelligence` page is a presentation consumer of KI, not
a second source of truth.

The public page must use a deliberately sanitized projection. It must never
publish:

- chain-of-thought;
- private prompts;
- raw unrestricted shell/stdout;
- secrets or tokens;
- private filesystem paths;
- sensitive operator evidence.

Presentation may have multiple skins or density modes. Truth logic, provenance,
invariants and mission state may not fork by visual variant.

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

## Non-goals

Kingdom Intelligence does not:

- train a private AoE2WAR language model;
- guess unknown production truth;
- manufacture replay winners;
- bypass release or Recovery OS safety;
- turn arbitrary shell access into a website feature;
- make presentation styling part of the self-knowledge contract.

The Brain should remain useful even if no external model is available.
