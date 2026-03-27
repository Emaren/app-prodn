# app-prodn Architecture

## Purpose

`app-prodn` is the public product shell for AoE2HDBets.

It owns:
- homepage / lobby presentation
- players, rivalries, tournaments, `$WOLO`, profile, and admin pages
- same-origin browser API routes for auth/session-gated actions
- Prisma-backed user, inbox, badge, gift, and appearance state
- server-side proxying to `api-prodn` where game/replay data still lives there

It does not own:
- replay parsing truth
- `game_stats` ingestion
- watcher uploads
- chain infrastructure
- cross-project analytics ownership

## Runtime shape

- framework: Next.js App Router
- local dev entrypoint: `npm run dev`
- production start command: `npm run start`
- production bind: `127.0.0.1:3030`
- production service: `aoe2hdbets-web.service`
- server repo path on VPS: `/var/www/AoE2HDBets/app-prodn`

## Major layers

### Page routes

Primary pages live under `app/`.

High-traffic surfaces:
- `app/page.tsx` and `app/HomePageClient.tsx`
- `app/players/page.tsx`
- `app/players/[uid]/page.tsx`
- `app/players/by-name/[name]/page.tsx`
- `app/contact-emaren/page.tsx`
- `app/admin/user-list/page.tsx`
- `app/wolo/page.tsx`

### Same-origin API routes

Key browser-facing routes:
- `app/api/lobby/route.ts`
- `app/api/lobby/stream/route.ts`
- `app/api/contact-emaren/route.ts`
- `app/api/admin/users/route.ts`
- `app/api/user/appearance/route.ts`
- `app/api/replay/upload/route.ts`

These routes enforce session/admin behavior and often proxy or merge with backend data.

### Product/domain libraries

Important ownership files:
- `lib/lobbySnapshot.ts`
- `lib/lobbyLeaderboard.ts`
- `lib/publicPlayerDirectory.ts`
- `lib/contactInbox.ts`
- `lib/communityHonors.ts`
- `lib/userExperience.ts`

### Presentation system

Homepage and shared premium shell behavior currently flow through:
- `components/lobby/lobbyPresentation.ts`
- `components/lobby/LobbyAppearanceContext.tsx`
- `app/AppShell.tsx`

Theme circles currently affect the overall page shell, header, and major lobby surfaces.

## Current product data model

### Homepage leaderboard

The homepage leaderboard is not just “ranked players.”

It now includes:
- replay-backed players with stored match history
- claimed profiles with zero matches as `Pending`

Important semantics:
- `trackedPlayers` should match `entries.length`
- `rankedPlayers` means players at or above the minimum-match threshold
- a claimed zero-match profile can appear with:
  - `primaryRatingLabel: Pending`
  - `primaryRatingSourceLabel: Profile`

### Players directory

`/players` is the broader network view:
- `claimedEntries` contains all claimed profiles
- `activeClaimed` contains the currently live subset
- `replayEntries` contains replay-built public identities

### Contact / honors / admin

The private inbox and community honors loop are owned here.

Current behavior:
- users can message Emaren directly
- admins can award badges and gifts
- gifts/badges appear in chat threads
- users can accept privately, accept publicly, or decline
- appearance choices and user activity are recorded for admin insight

## Production services and dependencies

`app-prodn` depends on:
- Postgres through Prisma
- `api-prodn` through `AOE2_BACKEND_UPSTREAM`
- nginx for public routing
- `aoe2hdbets-web.service` for runtime

Canonical VPS truth:
- web env file: `/etc/aoe2hdbets/aoe2hdbets-web.env`
- web build output must exist at `.next/BUILD_ID`

## Known architecture debt

- `next-env.d.ts` still drifts on the VPS during builds/deploys
- individual player pages are behind the homepage and directory in polish
- exact postgame achievement-table capture is still not part of the replay pipeline
- `$WOLO` is still an app-level product rail, not full settlement infrastructure
