---
id: "aoe2war.app-prodn.prisma-readme"
title: "Prisma Schema and Migration Reference"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "schema-reference"
reviewed_at: "2026-11-22"
review_interval_days: 60
sensitivity: "internal"
---

> Held #898 provenance: the primary body below is the actual reviewed App main document at `9eca0d03fb8d7238a42e1f9363214b68907656ce`, retaining its genuine dated review. It describes that review scope, not current held-source/runtime parity. The previous held document at `a96c2720952cd16380ad3c649185d9890bf53a41` is retained in Git; its removed or replaced lines are preserved in the historical appendix below. Earlier operational instructions, listeners, source IDs and numerical observations do not authorize any current mutation. Use the current owner ledger and exact protected admission, never this historical text, for financial, deployment or recovery decisions.

# Prisma Schema and Migration Reference

## Source authority and limits

`prisma/schema.prisma` is the **committed Prisma model and relation definition**, not an independently certified inventory of objects installed in a particular PostgreSQL database. As inspected on November 22, 2026, the canonical source defines **193 Prisma model declarations** spanning accounts, games, replays, tournaments, community features and other application domains. This count describes **repository source only**. It must not be mistaken for 193 tables installed in production, a complete database census, matching schemas in HD and DE, or approval to introduce new tables, grants or writers.

The schema declares a PostgreSQL datasource. `prisma.config.ts` selects `prisma/schema.prisma`, points migrations at `prisma/migrations`, and reads `DATABASE_URL` from the approved environment (including development dotenv loading). The application uses Prisma 7 and `@prisma/adapter-pg` on server-side connections. A source declaration never certifies that an environment's database or connector role has the same physical tables, ownership, constraints, triggers, permissions or data.

## Non-mutating source validation

In a **local, approved development checkout**, with the necessary development-only Prisma configuration already set, validate the *source schema* using:

```bash
npx prisma validate
```

This validates Prisma's schema/configuration. It **does not verify or modify** a live database, certify deployed migration history, establish HD/DE parity, or authorize finance access. Do not put production or financial database credentials into a convenience validation shell.

To regenerate the **local Prisma client code**, when development work requires it:

```bash
yarn prisma:generate
```

The package maps this command to `prisma generate`; the build prehook also generates client code. Client generation is not database migration and does not confer production authorization.

## Database-changing commands — separate authority required

**`yarn prisma:push` invokes `prisma db push`. It can change database schema. It must NEVER be described or used as a non-mutating validation command.** It is not an acceptable way to compare source and production schemas or certify migrations.

`yarn prisma:migrate:dev` invokes `prisma migrate dev` and is intended only for explicitly approved local development databases. Any `prisma db push`, migration deployment, destructive drift repair, schema reconciliation, table/sequence change, or permission update against a shared/production database requires its **own approved database-owner and protected release process**, independent preflight and rollback evidence, and verified postimage. Nothing in this README is a permit to run those commands.

## Financial writer fences and environment separation

HD and DE must be reviewed as **separate real database environments**; matching Prisma types alone cannot prove matching DDL, ownership, active triggers, grants or foreign-key side effects. Protected financial writers and financial recovery remain governed by the separate WE1 source, role, access-control and gate process. The current application source and documentation may contain financial-domain models without admitting financial SQL writes, custody, funding, settlement, payout or additional services.

The November 16 reviewed `docs/BET_STAKE_TICKETS.md` records financial funding **DENIED**, C04/C08 **CLOSED** and seven remaining gates OPEN at that dated review. Do not treat this dated state as a fresh live check; always obtain the actual WE1 signed admission before proposing any financial operation.

## Review provenance (November 22, 2026)

This is a C/WE1 **documentation-only correction**, based on direct review of:
- `prisma/schema.prisma` Git blob `ba6f8ab975dd2a13cdce02b09a294b593a818006` (193 source model declarations);
- `prisma.config.ts` Git blob `fc7b0c373f6d26e38d3dbffe4055678d9e6400f4` (PostgreSQL Prisma config and dotenv behavior);
- `package.json` (Prisma 7, adapter-pg, actual `prisma:push`/`prisma:generate`/`prisma:migrate:dev` definitions);
- `docs/BET_STAKE_TICKETS.md` Git blob `f7a3187731d92ffb4cf8dfac0c40eca64e626dcb` (dated financial-source denial contract).

This review **did not connect to a database, run Prisma commands, change schemas, mint credentials, authorize a release or close any financial gate**. Changes to `prisma/` are a protected C-source boundary: a reviewed document commit is not automatically a PRODUCT admission or permission to bypass that boundary. The DocsV2 registry/baseline must be regenerated and verified under the legitimate source owner **after** the final authorized product-source integration.


## Historical held-source appendix — NOT operating instructions

Original source: [exact prior document](https://github.com/Emaren/app-prodn/blob/a96c2720952cd16380ad3c649185d9890bf53a41/prisma/README.md). The following displaced lines preserve earlier source obligations and evidence; they do not supersede the reviewed primary document, certify current behavior, or permit a command to be run.

Original body lines 4–4:

> This schema maps the existing Postgres tables currently used by the backend:

Original body lines 6–7:

> - `users`
> - `game_stats`

Original body lines 9–10:

> Quick start
> -----------

Original body lines 12–13:

> 1. Set `DATABASE_URL` for the target environment.
> 2. Generate client:

Original body lines 19–19:

> 3. Validate schema against DB without creating migrations:

Original body lines 21–23:

> ```bash
> yarn prisma:push
> ```

Original body lines 25–26:

> Notes
> -----

Original body lines 28–31:

> - This repo uses Prisma 7 with `@prisma/adapter-pg` in server routes.
> - `yarn build` now runs `prisma generate` automatically (`prebuild` hook).
> - `yarn prisma:migrate:dev` is for local/dev only.
> - For production, treat migration rollout as a separate controlled step after review.
