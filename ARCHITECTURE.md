# app-prodn Architecture

## Purpose

`app-prodn` is the public product shell for AoE2HDBets.

It owns:
- community lobby and homepage presentation
- leaderboard, players, rivalries, live-games, tournaments, requests, `$WOLO`, profile, inbox, and admin pages
- same-origin browser API routes for auth/session-gated actions
- Prisma-backed user, inbox, badge, gift, request, and appearance state
- server-side proxying to `api-prodn` where game/replay data still lives there
- premium shell behavior, theme selection, and lobby-level presentation logic

It does not own:
- replay parsing truth
- `game_stats` ingestion
- watcher uploads
- chain infrastructure
- cross-project analytics ownership
- final authority over replay-derived match records

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

Important public surfaces include:
- `app/page.tsx`
- `app/lobby/page.tsx`
- `app/bets/page.tsx`
- `app/live-games/page.tsx`
- `app/game-stats/live/[sessionKey]/page.tsx`
- `app/players/page.tsx`
- `app/players/[uid]/page.tsx`
- `app/players/by-name/[name]/page.tsx`
- `app/rivalries/page.tsx`
- `app/contact-emaren/page.tsx`
- `app/requests/page.tsx`
- `app/war-chest/page.tsx`
- `app/tournaments/[slug]/page.tsx`
- `app/admin/user-list/page.tsx`
- `app/wolo/page.tsx`

The current public spine is no longer just a homepage plus a few leaf pages. The real first-impression product path is now the lobby/community shell and its linked destinations.

Live replay detail presentation is currently owned by `components/game-stats/LiveReplayDetail.tsx`. The Battle Matrix defaults to a two-column versus layout, with a header layout toggle that can switch to one full-width player lane per row. Inside each lane, keep the activity rail stacked above the pulse strip and metric labels wrap-safe so EAPM/history chips stay readable instead of squeezing into fixed-width micro-columns or overlapping their values.

### Same-origin API routes

Key browser-facing routes include:
- `app/api/lobby/route.ts`
- `app/api/lobby/stream/route.ts`
- `app/api/bets/route.ts`
- `app/api/bets/wager/route.ts`
- `app/api/contact-emaren/route.ts`
- `app/api/contact-emaren/attachments/[messageId]/route.ts`
- `app/api/admin/users/route.ts`
- `app/api/user/appearance/route.ts`
- `app/api/replay/upload/route.ts`

These routes enforce session/admin behavior and often proxy, merge, or reshape backend data for the browser.

### Product/domain libraries

Important ownership files include:
- `lib/lobby.ts`
- `lib/lobbySnapshot.ts`
- `lib/lobbyLeaderboard.ts`
- `lib/publicPlayerDirectory.ts`
- `lib/contactInbox.ts`
- `lib/contactInboxConfig.ts`
- `lib/challengeConfig.ts`
- `lib/communityHonors.ts`
- `lib/userExperience.ts`
- `lib/bets.ts`
- `lib/woloBetSettlement.ts`
- `lib/woloChain.ts`
- `lib/adminWoloClaims.ts`

These files form the app-level product contract for the lobby, leaderboard, player directory, inbox/honors flow, and related user-facing aggregation.

`lib/bets.ts` is now a bridge layer between scheduled Challenge runway matches, watcher-live sessions, and the public `/bets` book. Challenge-derived markets use `challenge-runway-{scheduledMatchId}` slugs, can become featured books before a watcher session appears, and are then settled/retired as replay proof lands. Fallback leaderboard/tournament books still exist as synthetic fill when no Challenge slate is active.

Challenge and bet settlement now have a real happy path:
- `scheduled_matches` stores `result_at`, `linked_session_key`, `linked_map_name`, `linked_winner`, and `linked_duration_seconds`
- `bet_markets.scheduled_match_id` links challenge-derived books to their source match row
- `bet_wagers` now persists `execution_mode`, `stake_tx_hash`, `stake_wallet_address`, `stake_escrowed_at`, `payout_wolo`, and settled status
- `pending_wolo_claims` now carries `payout_tx_hash`, `payout_attempted_at`, and `error_state` for operator truth
- `/bets` records an `onchain_escrow` wager only after the signed stake tx verifies against WOLO REST
- winning payouts can execute through `WOLO_SETTLEMENT_URL` or the configured fallback signer when the winner has a trusted identity and linked wallet

This repo still does not own chain truth. AoE2HDBets owns market seeding, user-facing lock/settle UX, and claim fallback rails. WoloChain still owns transfer semantics, chain identity, and final settlement execution truth.

### Presentation system

Lobby and premium shell behavior currently flow through:
- `components/lobby/lobbyPresentation.ts`
- `components/lobby/LobbyAppearanceContext.tsx`
- `app/AppShell.tsx`

Theme circles affect the overall shell, header, and major lobby surfaces.

The shipped product now depends much more heavily on lobby-specific presentation consistency than before. Visual hierarchy in the lobby matters because it now carries leaderboard, tournament, and live-product credibility in one place.

## Current product data model

### Lobby snapshot

The lobby is an aggregate product surface, not a single raw backend table.

Its snapshot contract is responsible for bringing together:
- leaderboard state
- tournament panel state
- live/recent match visibility
- online/readiness summary where available
- UI-facing counts and labels used by the lobby shell

`app/api/lobby/route.ts` is the browser-facing snapshot entrypoint. `lib/lobby.ts` and `lib/lobbySnapshot.ts` are the key app-level composition files.

### Homepage / lobby leaderboard

The lobby leaderboard is not just “ranked players.”

It now includes:
- replay-backed players with stored match history
- claimed profiles with zero matches as `Pending`

Important semantics:
- `trackedPlayers` should match rendered entry count
- `rankedPlayers` means players at or above the ranking threshold
- a claimed zero-match profile can appear with:
  - `primaryRatingLabel: Pending`
  - `primaryRatingSourceLabel: Profile`

The leaderboard is now part of the product spine, not decorative filler. Changes here affect first impression, credibility, and navigation quality.

### Players directory

`/players` is the broader network view.

Expected conceptual buckets:
- claimed entries
- active/live claimed subset
- replay-built public identities

The directory should remain broader than the leaderboard. The leaderboard answers who is on top; the directory answers who is in the ecosystem.

### Contact / honors / admin

The private inbox and community honors loop are owned here.

Current behavior includes:
- users can message Emaren directly
- existing peer direct threads can also exist for challenge-related inbox flow
- admins can award badges and gifts
- gifts/badges can appear in chat threads
- users can accept privately, accept publicly, or decline
- appearance choices and user activity are recorded for admin insight

Important runtime note:
- attachment rendering depends on `app/api/contact-emaren/attachments/[messageId]/route.ts`
- that route is session-protected and returns raw binary responses
- attachment failures may come from route/header generation, not the chat component

Composer UX and text-length rules are part of this contract:
- use `components/ui/AutoGrowTextarea.tsx` for multiline chat/challenge composers that should start at one line and grow naturally up to a capped height
- do not hardcode message limits in components when a shared config constant exists
- direct-thread text is capped by `DIRECT_MESSAGE_MAX_CHARS` in `lib/contactInboxConfig.ts`
- lobby chat text is capped by `LOBBY_MESSAGE_MAX_CHARS` in `lib/lobby.ts`
- challenge notes are capped by `CHALLENGE_NOTE_MAX_CHARS` in `lib/challengeConfig.ts`
- UI inputs should enforce the same caps and show live remaining/used count so users do not lose text to backend truncation

### Appearance / theme state

Appearance is app-owned state.

Current responsibilities include:
- storing user appearance preference
- exposing that preference to the app shell
- applying premium theme-circle presentation across lobby-oriented surfaces

This is product state, not just decoration, because the current lobby identity depends heavily on shell cohesion.

## Production services and dependencies

`app-prodn` depends on:
- Postgres through Prisma
- `api-prodn` through `AOE2_BACKEND_UPSTREAM`
- nginx for public routing
- `aoe2hdbets-web.service` for runtime
- `rpc.aoe2hdbets.com` / `rest.aoe2hdbets.com` for browser wallet reads and stake verification
- WoloChain settlement execution through `WOLO_SETTLEMENT_URL`

Canonical VPS truth:
- web env file: `/etc/aoe2hdbets/aoe2hdbets-web.env`
- web build output must exist at `.next/BUILD_ID`

## Current ownership boundaries

`app-prodn` should own:
- page hierarchy
- lobby composition
- leaderboard presentation
- player directory presentation
- inbox/admin/community UX
- session-gated browser actions
- theme and shell behavior

`app-prodn` should not become the owner of:
- replay parse rules
- raw replay ingest lifecycle
- backend `game_stats` truth
- chain settlement logic
- cross-project attribution truth

When something looks wrong in the browser, identify whether the problem starts in:
1. app composition / snapshot shaping
2. backend response shape
3. replay parse truth
4. auth/session behavior
5. presentation hierarchy

Do not assume every visible issue is a page bug.

## Known architecture debt

- `next-env.d.ts` still drifts on the VPS during builds/deploys
- VPS file ownership drift can block `git pull`, break rebuilds, or stop `.next/cache/images` writes
- individual player pages are behind the lobby and directory in polish
- leaderboard/ranking semantics are stronger than before but still deserve tighter long-term consistency
- tournament depth is improving, but still not the full “event gravity” version
- exact postgame achievement-table capture is still not part of the replay pipeline
- `$WOLO` is still an app-level product rail, not full settlement infrastructure
- signed-bet happy path is real now, but signed-but-unrecorded stake recovery is not yet reconciled automatically
- Ledger and older-browser signer behavior is improved but still needs tighter client telemetry and user guidance
- Challenge -> Bets scheduled/live bridging is healthier now, but very fast finishes and duplicate-looking settled history still deserve another pass
- watcher behavior now looks healthier end-to-end, but the app should still document the live/final replay contract truthfully as it evolves
