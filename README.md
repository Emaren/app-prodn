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

Start from `.env.production.example` and create your local `.env.production`.

Required for Prisma API routes:

- `DATABASE_URL` (Postgres connection string)
- `SESSION_SECRET` (long random string for signing auth session cookies)

Common:

- `NEXT_PUBLIC_API_BASE_URL` (keep this as `"."` / same-origin)
- `AOE2_BACKEND_UPSTREAM` (server-side upstream for rewrites, default `http://127.0.0.1:3330`)
- `ADMIN_TOKEN` (required for admin proxy routes)
- `INTERNAL_API_KEY` (optional; forwarded on replay upload when backend enforces API keys)

Optional migration compatibility:

- `ALLOW_LEGACY_UID_HEADERS=true` to temporarily allow `x-user-uid`/body uid fallback for user routes.

## Replay upload flow

- Browser upload endpoint: `/api/replay/upload` (proxied to `api-prodn`)
- Admin traffic endpoint: `/api/traffic` (session + admin-gated proxy to `api-prodn`)
- Watcher package: `public/downloads/aoe2-watcher-mac.zip`
- Replay parser page: `/replay-parser`

## Admin bootstrap

- If there are zero users in DB, the first successful user registration becomes admin.
- You can promote/demote explicitly from backend with:
  - `python /var/www/AoE2HDBets/api-prodn/scripts/set_admin.py --list`
  - `python /var/www/AoE2HDBets/api-prodn/scripts/set_admin.py --email you@example.com`

## Production routing

- `aoe2hdbets.com/*` should proxy to `app-prodn` (Next.js on `127.0.0.1:3004`)
- Keep browser calls same-origin (`/api/...`) so Next local API handlers enforce session/admin checks
- Next rewrites selected API paths to backend using `AOE2_BACKEND_UPSTREAM`
- `api-prodn.aoe2hdbets.com/*` should proxy directly to `api-prodn` (`127.0.0.1:3330`) for watcher/automation uploads
- Reference nginx template: `deploy/nginx.conf.example`
