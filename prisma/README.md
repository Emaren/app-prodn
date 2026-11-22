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

# Prisma Schema and Migration Reference

## November 22, 2026 — scoped schema-boundary review

The current source includes `User` and `GameStats` models and still declares
Prisma 7 (`@prisma/client`, `@prisma/adapter-pg`, `prisma`) in
`package.json`. WE3's BAE Storage Explorer modes change React presentation,
not Prisma schema, authorization or migrations. No `prisma db push` or schema
migration was run during this review. This scope is **not** an assertion that
all production tables or migrations were independently revalidated.


This schema maps the existing Postgres tables currently used by the backend:

- `users`
- `game_stats`

Quick start
-----------

1. Set `DATABASE_URL` for the target environment.
2. Generate client:

```bash
yarn prisma:generate
```

3. Validate schema against DB without creating migrations:

```bash
yarn prisma:push
```

Notes
-----

- This repo uses Prisma 7 with `@prisma/adapter-pg` in server routes.
- `yarn build` now runs `prisma generate` automatically (`prebuild` hook).
- `yarn prisma:migrate:dev` is for local/dev only.
- For production, treat migration rollout as a separate controlled step after review.
