---
id: "aoe2war.app-prodn.docs-local-development"
title: "Local Development"
type: "runbook"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "operator-contract"
reviewed_at: "2026-10-03"
review_interval_days: 60
sensitivity: "internal"
---

# Local Development

AoE2WAR has two legitimate local-development lanes. They share the same local
source code and hot reload, but intentionally provide different data guarantees.

The lanes are complementary, not interchangeable.

## Golden rule

- Use `npm run dev:prod` when the task needs exact current production truth and
  does not need database writes.
- Use `npm run dev:shadow` when the task needs safe writable application state.
- Use `npm run dev:shadow:fresh` only when an existing shadow must be destroyed
  and rebuilt from fresh production truth.
- Do not use plain `yarn dev` / `npm run dev` for production-parity work. It
  uses the ordinary local database and may contain stale, empty, or test data.

Local source changes are ordinary Git working-tree changes in every lane. Local
database contents are never deployment inputs.

## Lane A — live production data, hard read-only

Command:

```bash
npm run dev:prod
```

This is the default lane for frontend work, page layout, rendering, read paths,
queries, navigation, performance inspection, and any feature that does not need
to persist a database mutation.

It runs local Next.js source with hot reload while reading the live production
PostgreSQL database through an SSH tunnel.

Safety is enforced independently at multiple layers:

- PostgreSQL sessions require `transaction_read_only=on`;
- PostgreSQL sessions require `default_transaction_read_only=on`;
- Prisma adds the read-only startup options;
- production `INTERNAL_API_KEY` and `ADMIN_TOKEN` are not imported;
- production database credentials remain memory-only;
- backend read surfaces use the production public origin where required.

Properties:

| Property | `dev:prod` |
| --- | --- |
| Source code | Local, hot reload |
| Database data | Live production |
| Freshness | Current production truth |
| DB writes | Impossible by contract |
| Production mutation credentials | Absent |
| Local DB copy required | No |
| Startup cost | Normal dev-server compile |
| Best use | Most UI/read-only development |

A normal server restart reconnects to current production truth. There is no
snapshot to preserve or refresh.

## Lane B — writable local production mirror

Fresh rebuild and launch:

```bash
npm run dev:shadow:fresh
```

Restart an already-built shadow without refreshing it:

```bash
npm run dev:shadow
```

The shadow database is `aoe2hdbets_shadow` on localhost. A fresh refresh builds
the current Prisma schema and mirrors every current production table represented
by that schema. Production managed media remains available through the explicit
read-only preview fallback when a file is not local.

Production remains read-only during acquisition. The running application then
writes only to the local shadow.

Properties:

| Property | `dev:shadow` |
| --- | --- |
| Source code | Local, hot reload |
| Database data | Point-in-time production mirror |
| Freshness | Snapshot time plus local mutations |
| DB writes | Allowed locally |
| Production DB writes | None |
| Production mutation credentials | Absent |
| Local mutations survive server restart | Yes |
| Local mutations survive shadow refresh | No |
| Best use | Forms, admin actions, writes, workflow/state testing |

### Persistence semantics

A normal `npm run dev:shadow` restart does **not** reset the database. Local
test mutations remain in `aoe2hdbets_shadow` so an operator can continue a
multi-step test across server restarts.

`npm run dev:shadow:fresh` is destructive by design. It rebuilds the shadow
from fresh production truth and therefore discards all prior local database
mutations.

This is intentional:

```text
production truth at refresh T0
          |
          v
aoe2hdbets_shadow
          |
          +-- local test mutation A
          +-- local test mutation B
          |
          +-- server restart -> mutations remain
          |
          +-- shadow:fresh -> mutations discarded; mirror returns to new production truth
```

## Deployment boundary

Neither `dev:prod` nor `dev:shadow` deploys database contents.

The production release lane consumes committed source, governed documentation,
validated migrations, and release artifacts. It does not copy the local
`aoe2hdbets_shadow` database and does not replay arbitrary local test
mutations into production.

A local test action such as assigning a belt, creating a message, editing a
profile, or changing an admin setting in shadow mode remains local unless the
operator separately implements that behavior as source/migration/seed logic and
ships that code through the governed release process.

## Which lane should I use?

For the normal AoE2WAR workflow, start with `dev:prod`.

It is the superior default for the majority of UI work because it has:

- exact current production data;
- no multi-gigabyte refresh delay;
- no local state drift;
- hot reload;
- hard write protection.

Switch to `dev:shadow` only when the feature must exercise writes or a
multi-step mutable workflow.

Examples:

| Task | Lane |
| --- | --- |
| Resize Champions portraits | `dev:prod` |
| Change layout / CSS / copy | `dev:prod` |
| Inspect current players, games, bets, belts | `dev:prod` |
| Test a new read-only page | `dev:prod` |
| Test assigning a championship | `dev:shadow` |
| Test a form that persists data | `dev:shadow` |
| Test admin actions | `dev:shadow` |
| Test chat/message creation | `dev:shadow` |
| Test settlement/write workflow without production impact | `dev:shadow` |

## Consistency rules

"Production parity" has two precise meanings:

1. **Live parity** — `dev:prod` reads current production truth continuously.
2. **Snapshot parity** — a freshly rebuilt shadow equals production at the
   refresh boundary, then may intentionally diverge because of local writes or
   later production changes.

Do not call a mutated shadow "current production truth." It is a safe local test
world descended from a known production snapshot.

Before investigating whether a page differs from production:

1. identify the active lane;
2. for `dev:prod`, treat a difference as a rendering/runtime/read-path issue;
3. for `dev:shadow`, determine whether the shadow has local mutations or is
   older than the production change being compared;
4. refresh the shadow only when fresh production parity is actually required.

## Current full-shadow cost

As of 2026-10-03, the first full production mirror was roughly 9 GiB and took
about 3.5 hours over the current transfer path. Therefore:

- never run `dev:shadow:fresh` merely to restart the server;
- never make full shadow refresh an automatic startup action;
- preserve the existing shadow with `npm run dev:shadow` during a work session;
- prefer `dev:prod` whenever writes are not required.

Future Development OS work may optimize full-shadow refresh, but must preserve
the same safety and lifecycle semantics.

## Managed media and auxiliary read surfaces

Both sanctioned lanes support production read surfaces needed for realistic
local rendering. Shadow mode uses an explicit production preview origin as a
read-only fallback for managed media that is not stored locally. The production
preview lane also reads the public production backend where server-side
game/parser data is required.

Neither mechanism grants production application mutation authority.

## Operator quick reference

```bash
# Default: local code + exact live production data + hard DB read-only
npm run dev:prod

# Reuse existing writable local production snapshot
npm run dev:shadow

# Destructive: rebuild writable shadow from fresh production truth, then serve
npm run dev:shadow:fresh
```

If the purpose is simply "make many code changes locally and deploy them
together later," use `dev:prod` unless one of those changes specifically needs
a write-path test.

If a write-path test is needed, use the existing shadow. Refresh it only when the
test requires a newer clean production baseline.
