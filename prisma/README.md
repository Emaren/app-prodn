Prisma status
=============

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
