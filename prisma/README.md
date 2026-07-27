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
reviewed_at: "2026-07-26"
review_interval_days: 60
sensitivity: "internal"
---

# Prisma Schema and Migration Reference

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
