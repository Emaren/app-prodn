---
id: "aoe2war.app-prodn.docs-champions-title-economy"
title: "Championship Title Economy"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn","wolochain"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "product-contract"
reviewed_at: "2026-09-05"
review_interval_days: 90
sensitivity: "internal"
---

# Championship Title Economy

Last updated: 2026-09-05

AoE2HDBets owns the app-side championship presentation, eligibility settings,
challenge entry points, Trophy Command workflow, and app-side custody ledger.
This is not WoloChain custody truth. NFT and chain actions remain explicit
operator intents until a future Warbound chain module exists.

## Public routes

- `/champions` is the title-economy hub.
- `/champions/[...slug]` renders detail pages for belts, national titles, ELO
  titles, tag titles, and designations.
- `/national-champions` is the cinematic national-title projection. It must
  derive current holders, Tribute, projected bounty, and reign age from the
  same `loadChampionTitleEconomyState()` / persistent Trophy authority as the
  main Champions surface; it must not maintain a second handwritten holder
  table.
- The world map may also show explicit planned-country placeholders before a
  Trophy definition or belt asset exists. Those placeholders are roadmap
  visualization only: they have no holder, Tribute, bounty, challenge right, or
  live Trophy route until the corresponding national title is created.
- Legacy public spine links should point to `/champions`, not `/belts`, unless
  preserving an intentional redirect.

## Title classes

The title config lives in `lib/champions/titles.ts`.

- Podium belts: AoE2WAR World Champion, Chaos Champion, Women's Champion.
- Tag titles: Tag Team Champions.
- National titles: Canada, United States, Mexico, United Kingdom.
- ELO titles: Rising, Challenger, Veteran, Elite, Legend.
- Special designations: Giant Killer, Comeback King, Siege Lord, Silent Killer,
  Untouchable, Raid Demon, Boom Lord, Slayer King, Relic Baron, Blitz Lord,
  Wololo Lord, Iron Wall.

Title copy should use `Reward Tribute` for belts, national titles, ELO
titles, and tag titles. Special designations are artifacts and should use
`Artifact Bonus`.

Do not bring back older labels such as `Monthly Reward`, `Daily Purse`,
`Holder Bonus`, `Winner Bonus`, or `Champion Payment`. Do not call a belt
payout an `Artifact Bonus`; belts are not artifacts.

## Visual assets

Champion art assets live under `public/champions`.

- Belt art: `public/champions/belts`.
- Designation art: `public/champions/designations`.
- Holder and silhouette backplates: `public/champions/players`.

These PNGs must contain a real alpha channel. Do not ship checkerboard, white,
gray, or matte backgrounds baked into title art. The page layers holder avatars
or the generic silhouette behind the belt art, then overlays the belt near waist
height so the holder reads as wearing/holding the title.

The admin media armory at `/admin/media-assets` can override these static
fallbacks without a code deploy. Managed assets are served through
`/api/media-assets/[kind]/[target]` and fall back to the static files above when
no active upload exists.
Uploaded files are also served from `/uploads/managed-assets/[kind]/[file]`
by a dynamic app route so production previews do not depend on a separate
static-file deploy step.

Common managed targets:

- `kind=avatar`: `emaren`, `jim`, `julio`, `julio-alvarez`, `sniper`,
  `silhouette`, or `user-{uid}` for uploaded profile avatars.
- `kind=belt`: title ids from `lib/champions/titles.ts`, such as `world`,
  `chaos`, `womens`, `tag-team`, national title ids, and ELO title ids.
- `kind=artifact`: designation ids from `lib/champions/titles.ts`.
- `kind=logo`: `footer-wolo`.

The managed media table migration is:

`prisma/migrations/20260615_103000_add_managed_media_assets/migration.sql`

Run `npx prisma migrate deploy` before restarting production when shipping the
media armory.

## Data and state

- `lib/champions/titleState.ts` builds the current app-side title view model.
- `lib/trophies/service.ts` owns seeded trophy definitions, projected bounty
  display, holder eligibility, profile holdings, and nationality-change audit.
- `lib/trophies/actions.ts` owns operator mutations, economics versioning,
  challenge verification, dry-run settlement, payout retry, and NFT intent
  logging.
- Real leaderboard data is used where the app already has it, especially for
  world, ELO, and designation contender rails.
- Current holders are separate from contender boards. A title model is one
  holder panel plus ten contender slots; holders must not be counted as part of
  the top 10 list.
- Unimplemented title holders should render as honest vacant/open states rather
  than fabricated champions.
- Public `/challenge` requests for seeded titles create both the existing
  `ScheduledMatch` and a linked `TrophyChallenge`. The challenger must satisfy
  the configured national/ELO rule and must schedule against the current holder
  or Commissioner Guardian.
- Normal `/challenge` requests now inspect both participants automatically. Any
  eligible, currently held belt or artifact that is not already committed to an
  active title defense is attached as a `TrophyChallenge`; users do not manually
  pick registry ids in the scheduling form.
- A verified watcher/replay result automatically settles `app_only` belts in the
  app custody ledger. Stale challenges are blocked if title custody changed before
  their result settled. Chain-backed titles remain explicit chain intents.
- Artifacts remain metric-bound. Replay proof is attached automatically, but the
  artifact does not move until its record/metric rule is verified.
- Watcher/replay evidence remains the verification boundary. A linked challenge
  is not settled merely because it was scheduled or funded.

## Persistent War Trophy foundation

The migration is:

`prisma/migrations/20260619_210000_add_war_trophy_foundation/migration.sql`

It creates:

- `trophies`
- `trophy_economics_versions`
- `trophy_challenges`
- `trophy_events`
- `trophy_payouts`
- `trophy_settings`

Initial app-side custody seeds:

- Canada Champion: Emaren
- USA Champion: Jim
- Mexico Champion: Julio Alvarez
- UK Champion: Sniper
- Elite Championship: Commissioner Guardian custody with Emaren

Seed names remain visible even when a matching app user does not exist. In that
case the display custody is retained while the user relation and wallet address
remain null.

The public registry is `GET /api/trophies`. NFT-shaped metadata is available at
`GET /api/trophies/[trophyId]/metadata`.

Projected bounty is display math: stored bounty plus whole elapsed days times
the configured bounty growth. It is not a chain balance and must not be called
paid or escrowed.

## Profile eligibility settings

The user profile owns two title-identity settings:

- `represented_country`
- `gender_division`

The migration is:

`prisma/migrations/20260615_090000_add_title_identity_settings/migration.sql`

Run `npx prisma migrate deploy` before restarting production for this feature.
The `/profile` Title Identity panel saves these settings through
`/api/user/me`.

## Admin state

`/admin/trophies` is the persistent War Trophy command center. Its operator
tabs are:

- Overview
- Belts
- Artifacts
- Challenges
- Payouts
- Chain Events
- Settings
- Audit Log

Operators can create/edit definitions, assign holders or the Commissioner
Guardian, record explicit eligibility overrides, version economics, attach
replays, select verified winners, dry-run settlement, inspect/retry payout
failures, edit Representing Country with a forfeiture audit, and log NFT
mint/reassign/retire/burn intents.

`dry_run_only` defaults to `true`, `app_only_fallback_enabled` defaults to
`true`, and `chain_backed_trophies_enabled` defaults to `false`.

Changing a national belt holder's Representing Country does not silently move
or vacate the belt. It raises `forfeiture_needed` and records
`NATIONAL_ELIGIBILITY_FORFEITURE_NEEDED` for explicit operator resolution.

## Ownership boundary

AoE2HDBets may present title economics, WOLO tribute labels, challenge links,
and app-side eligibility.

AoE2HDBets must not redefine:

- WoloChain denom truth.
- WoloChain supply or scarcity truth.
- Signed wallet movement.
- Bet-time escrow or chain custody.
- Any settlement state that conflicts with WoloChain or the settlement rail.
- NFT ownership merely because an app-side mint/reassignment intent exists.

If a future title claim spends, locks, or settles real WOLO, that path must use
the existing signed wallet and settlement verification rules before copy calls
it chain-backed.
