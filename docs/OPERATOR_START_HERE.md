---
id: "aoe2war.app-prodn.docs-operator-start-here"
title: "AoE2WAR Operator Start Here"
type: "runbook"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn","api-prodn","aoe2-watcher","wolochain"]
audience: ["operators","developers","ai-agents"]
source_of_truth: "git"
authority: "operational-procedure"
reviewed_at: "2026-08-22"
review_interval_days: 30
sensitivity: "internal"
---

# AoE2WAR Operator Start Here

## Purpose

This is the first repository-local document for a fresh operator, terminal, or
AI-assisted AoE2WAR session. It is deliberately short. It routes the reader to
current machine truth before historical prose and records the operational facts
that are expensive to rediscover.

Do not infer mutable production state from a dated seal, a previous chat, or a
commit mentioned in prose. Ask the operating system first.

## First 60 seconds

From Tony's Mac:

```bash
cd "$HOME/projects/AoE2HDBets/app-prodn"

aoe2war facts
aoe2war context
aoe2war status
aoe2war workspace status
git status --short
git log -3 --oneline
```

`aoe2war status` is the first authority for current web release state. Read the
Mac HEAD, GitHub main, Documentation Baseline, production source, active build,
public build-version parity, protected Wolo listeners and provenance together.

If more release history is needed:

```bash
aoe2war releases --limit 5
```

## Authority order

For mutable AoE2WAR operations, use this order:

1. fresh `aoe2war context` / `aoe2war status` and generated current-state maps;
2. current canonical Git and implementation;
3. release/runtime receipts and live service/build/version proof;
4. active repository-local contracts and runbooks;
5. dated seals, incident records and old conversation/context archives.

Historical evidence explains how the system got here. It does not override
fresh certified runtime truth.

## Development OS

Feature worktrees are first-class AoE2WAR development environments. The
ordinary workflow is:

```bash
aoe2war dev new feature-name
cd "$HOME/projects/AoE2HDBets/app-prodn-feature-name"

aoe2war dev prepare
aoe2war dev refresh
aoe2war dev serve
```

`aoe2war dev prepare` owns worktree dependency compatibility, the localhost-only
development environment, the runtime dependency contract, Prisma validation and
client generation. It may bridge `node_modules` only from an exact
`package.json` + `yarn.lock` fingerprint match; otherwise it materializes the
frozen dependency contract.

`aoe2war dev refresh` rebuilds the disposable `aoe2hdbets_shadow` database
through local PostgreSQL bootstrap authority while keeping the application role
least-privileged. `aoe2user` must remain non-superuser and `NOCREATEDB`.

The shadow is production-shaped but mutation-safe:

- production database credentials remain on the VPS;
- production application/chain mutation credentials do not enter the local app;
- application writes target localhost only;
- selected product state is streamed into the disposable shadow;
- foreign-key parent closure is discovered from the current schema instead of
  maintained as a hand-written table list;
- Direct/Nav Chat history, reactions and related dependencies are included;
- high-volume activity history is bounded by machine policy;
- production media/public read surfaces may remain available where explicitly
  supported.

For an interactive UI change, source tests are necessary but not always
sufficient. When browser event ordering, portals, focus, pointer handling,
optimistic state or persistence are material to the behavior, perform a real
browser smoke against the writable production-shaped shadow before release.

## Release command choice

Ordinary end-of-work closure is:

```bash
aoe2war finish -m "Ship the finished feature"
```

The command may be started from canonical `main` or from a registered
`app-prodn` feature worktree.

From a feature worktree, `finish` proves that canonical `main` is clean and
exact with GitHub, proves that the feature descends from that exact main,
commits the finished feature when necessary, refreshes and commits the governed
Documentation Baseline against that committed implementation, performs the full
digest-bound feature gate on the resulting documentation descendant,
fast-forwards canonical main only, transfers the validation evidence, then
re-enters canonical finish for publication, documentation, deployment and
certification. It never auto-merges or rebases a divergent feature history.

`finish` is the canonical human-facing transaction. It owns eligible commit /
publish reconciliation, documentation and context refresh, deployment when
needed, certification, estate audit and Doctor.

A deliberately scoped web release may use:

```bash
aoe2war deploy
```

`deploy` is the lower-level protected release engine. User implementation code
must already be committed and the worktree must be clean.

Do not manually `git pull`, build in the live tree, restart the service, or
advance production to a moving branch tip during an ordinary release.

## Implementation SHA versus release SHA

These are intentionally different identities when generated documentation
follows an implementation commit.

Example shape:

```text
implementation commit
  -> generated documentation-baseline commit
  -> release SHA
```

`aoe2war deploy` may create the generated documentation-only commit itself.
After that step, local `HEAD`, GitHub `main`, and eventually production source
correctly point at the release SHA, while the Documentation Baseline continues
to name the implementation SHA.

Never diagnose that expected relationship as drift.

## Interactive shell discipline

The `aoe2war` release tools are already fail-closed. In an interactive
AI-assisted terminal session:

- do **not** wrap the canonical release command in an outer
  `set -euo pipefail` transaction;
- prefer one observable lifecycle action at a time when diagnosing:
  commit -> push -> deploy -> finish;
- keep diagnostic commands non-mutating until state is understood;
- do not use a terminal disappearing, an SSH timeout, or a long quiet build as
  proof that deployment failed.

A normal application deploy runs the full gate, isolated build, activation and
bounded health soak and can take many minutes.

If a terminal/session disappears or the result is uncertain, open a fresh
terminal and run:

```bash
cd "$HOME/projects/AoE2HDBets/app-prodn"
aoe2war status
aoe2war releases --limit 5
```

Do not blindly retry a release. Source/build/version/provenance and durable
receipts decide whether the prior operation completed, staged, rolled back, or
never started.

Tony's global command is a normal executable wrapper at
`$HOME/bin/aoe2war`, delegating to the repository release command.

## Production web quick facts

- repository: `/var/www/AoE2HDBets/app-prodn`
- service: `aoe2hdbets-web.service`
- bind: `127.0.0.1:3030`
- public site: `https://aoe2war.com`
- protected Wolo listeners: `8092` and `8093`, observe-only for ordinary web
  release tooling
- durable deployment evidence:
  `/mnt/HC_Volume_105319120/aoe2war/deploy-receipts/`
- durable rollback evidence:
  `/mnt/HC_Volume_105319120/aoe2war/rollbacks/`

## PostgreSQL identity: do not auto-discover by schema similarity

The canonical AoE2WAR HD production database is:

```text
aoe2hd_db
```

The sister AoE2DE database is:

```text
aoe2de_db
```

`aoe2de_db` is never HD production evidence merely because the two databases
share tables or schema shape.

The current local writable development shadow is `aoe2hdbets_shadow`. Any
shadow/test database is development evidence, not production truth.

For an explicit read-only HD inspection on the VPS, prefer a named database and
a read-only transaction. Do not rely on bare `psql`, a shell-user peer default,
or generic first-schema-match discovery.

See [Player War Archive Operations](PLAYER_WAR_ARCHIVE_OPERATIONS.md) for the
canonical private-document verification procedure.

## Documentation rule

When an operator or AI loses time because a stable authority, topology fact or
recovery procedure was missing, capture the durable lesson in the owning
semantic runbook before closing the work. Do not paste the conversation itself
into documentation; encode the stable rule, exact authority and safe command.

Use:

```bash
aoe2war docs status
aoe2war docs impact
aoe2war docs audit
```

Generated indexes are machine-owned. Semantic contracts are edited only when
behavior, authority, architecture, policy or operating procedure actually
changes.

## Route deeper

- release/operator procedure: `DEPLOY.md`
- release automation contract: `docs/RELEASE_ENGINEERING.md`
- workspace boundaries: `WORKSPACE.md`
- app architecture: `ARCHITECTURE.md`
- documentation lifecycle: `docs/DOCUMENTATION_OS.md`
- private War Archive verification: `docs/PLAYER_WAR_ARCHIVE_OPERATIONS.md`
- Workshop/publication boundary: `docs/WORKSHOP_ARCHITECTURE.md`
