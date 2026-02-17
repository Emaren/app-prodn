# app-prodn

Production Next.js frontend for AoE2HDBets.

## Stack

- Next.js App Router
- Prisma 7 (`@prisma/client` + `@prisma/adapter-pg`) for user/profile APIs
- UI routes for replay upload, game stats, wallet, and admin pages

## Local development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run start
```

`prebuild` runs `prisma generate`.

## Environment

Required for Prisma API routes:

- `DATABASE_URL` (Postgres connection string)
- `SESSION_SECRET` (long random string for signing auth session cookies)

Common:

- `NEXT_PUBLIC_API_BASE_URL` (defaults to same-origin in `next.config.js`)
- `AOE2_BACKEND_UPSTREAM` (server-side upstream for rewrites, default `http://127.0.0.1:3330`)
- `ADMIN_TOKEN` (required for admin proxy routes)

Optional migration compatibility:

- `ALLOW_LEGACY_UID_HEADERS=true` to temporarily allow `x-user-uid`/body uid fallback for user routes.

## Replay upload flow

- Browser upload endpoint: `/api/replay/upload` (proxied to `api-prodn`)
- Watcher package: `public/downloads/aoe2-watcher-mac.zip`
- Replay parser page: `/replay-parser`
