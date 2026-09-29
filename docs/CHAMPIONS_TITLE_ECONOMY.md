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
reviewed_at: "2026-09-27"
review_interval_days: 90
sensitivity: "internal"
---

# Championship Title Economy

Last updated: 2026-09-27

AoE2HDBets owns the app-side championship presentation, eligibility settings,
challenge entry points, Trophy Command workflow, and app-side custody ledger.
This is not WoloChain custody truth. NFT and chain actions remain explicit
operator intents until a future Warbound chain module exists.

## Public routes

- `/champions` is the default Champions E2 title-economy hall. E2 separates
  RM and DM rating authority, derives Chaos contenders from linked Watcher
  activity, presents each 2v2/3v3/4v4 crown on its own row with one persisted
  RM/DM preference, and renders the national catalog as a horizontal belt hall.
  The preserved pre-E2 Basic / Advanced / Extreme presentation remains reachable
  through the thin B / A / E display rail at the bottom of the page; hovering
  or focusing E reveals E1 (preserved) and E2 (current). E2 remains the public
  default.
- `/champions/[...slug]` renders detail pages for belts, national titles, ELO
  titles, tag titles, and designations.
- `/national-champions` is the cinematic national-title projection. It must
  derive current holders, Tribute, projected bounty, and reign age from the
  same `loadChampionTitleEconomyState()` / persistent Trophy authority as the
  main Champions surface; it must not maintain a second handwritten holder
  table.
- `/olympia` is the between-Games national presentation hall. Its opening
  delegation is Canada, United States, and Mexico only; Chaos is excluded
  because it is not a national title. Holder identity and live player stats
  remain projections of the same title/player authorities, never a second
  handwritten custody table.
- `/chaosium` is the belt-lineage projection for Chaos, Canada, United States,
  and Mexico. Current custody comes from Champion/Trophy authority. Historical
  reigns come from holder-changing `TrophyEvent` rows, preserving repeated
  reigns when a warrior later regains the same title. The belt's persisted
  `createdAt` is the origin marker.
- The world map may also show explicit planned-country placeholders before a
  Trophy definition or belt asset exists. Those placeholders are roadmap
  visualization only: they have no holder, Tribute, bounty, challenge right, or
  live Trophy route until the corresponding national title is created.
- Legacy public spine links should point to `/champions`, not `/belts`, unless
  preserving an intentional redirect.

## Title classes

The title config lives in `lib/champions/titles.ts`.

- Podium belts: AoE2WAR World Champion, Chaos Champion, Women's Champion.
- Mode crowns: Random Map Champion and Death Match Champion, each with its own
  top-ten rating lane.
- Team crowns: 2v2, 3v3, and 4v4, each with RM and DM presentations. Their
  public holder seats remain vacant until custody is explicitly created.
- National titles: Canada, United States, Mexico, United Kingdom, plus the
  managed-media national roadmap catalog represented by the public horizontal
  belt hall.
- ELO titles: Rising, Challenger, Veteran, Elite, Legend, each rendered against
  either the RM or DM rating lane without mixed-primary-rating fallbacks.
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

Current-season public policy lives in
`lib/champions/championshipPolicy.ts`.

- The live public summary is **4 active / 18 vacant / 45 WOLO per day**.
- The four current paying reigns are Chaos, Canada, USA, and Mexico.
- World and United Kingdom are explicitly vacant public titles. Historical
  Trophy rows may remain auditable, but they do not grant current public
  custody or future daily Tribute.
- Pending/future daily Tribute execution is bounded to the four explicit
  current-season trophy ids. This prevents an obsolete seeded title from
  silently creating new money obligations.
- Champions belt artwork is managed through Media Armory targets. National crowns use `national-<slug>`; Norse and Southeast Asia use `regional-norse` / `regional-southeast-asia`; the main RM/DM crowns retain `random-map-champion` / `deathmatch-champion`; shared team bytes bind independently to `2v2-rm` + `2v2-dm`, `3v3-rm` + `3v3-dm`, and `4v4-rm` + `4v4-dm`; RM ELO art uses the imported canonical title ids `elo-rising`, `elo-challenger`, `elo-veteran`, `elo-elite`, and `elo-legend`; DM ELO art uses `dm-rising`, the retained import alias `dm-contender` for the displayed Challenger division, `dm-veteran`, `dm-elite`, and `dm-legend`.
- Saudi Arabia and Taiwan intentionally retain cinematic full-frame source artwork, but E2 bounds that art inside a controlled focal window instead of allowing it to take over the whole crown card. Ordinary belt assets remain transparent foreground art.
- E2 retains the premium hero tile but strips it to identity plus live state:
  the only hero copy is `AoE2WAR title economy`, alongside Active / Vacant /
  Tribute. The large `CHAMPIONSHIP BELTS` headline, tagline, and explanatory
  paragraph are intentionally absent.
- E2 removes explanatory/marketing prose between championship sections. Only
  compact structural labels remain: `AoE2WAR Champions`, `RM / DM`,
  `War parties`, `National & regional standards`, `ELO Belts`, and
  `Artifacts` when present.
- RM / DM champion presentation defaults to the stacked avatar-above-contenders
  composition; the muted `RM / DM` kicker remains a hidden layout toggle for
  the preserved side-by-side alternative.
- RM/DM lane switches use a muted graphite/steel active treatment rather than a
  pale-gold control state.
- Podium and national-card actions are bottom-anchored within their card family
  so cards with fewer contenders remain visually symmetrical with fuller cards.
- Team holder stages deliberately taper in vertical scale from 2v2 to 3v3 to
  4v4 while remaining materially taller than the earlier compressed layout.
- RM and DM ELO crown cards include an avatar/holder stage above the belt.
  Vacant crowns use the neutral male silhouette; when title custody is present,
  the current title holder avatar/name is projected into that stage.
- `lib/champions/championsV2.ts` owns the Champions E2 contender projection:
  World alternates explicit RM/DM leaders; RM and DM crowns use their own
  rating columns; Chaos ranks signed-up Kingdom users by linked Watcher
  presence and replay-bearing activity; ELO divisions use lane-specific
  ratings. National and regional contender rails now read the user's persisted
  `representedCountry` through `lib/publicPlayerDirectory.ts`, with explicit
  country aliases for USA / United States and UK / United Kingdom. Manual
  contender overrides remain additive rather than exclusive. The Southeast
  Asia regional crown explicitly treats Pakistan as eligible product policy,
  so a Pakistan-representing warrior can surface there without inventing a
  second national identity.
- Team crowns deliberately do not fabricate RM/DM team rankings from solo ELO.
  Until an authoritative lane-specific team-rating source exists, E2 presents
  the Commissioner's explicit contender combinations as a curated queue and
  labels that lane accordingly. The current queue is:
  - 2v2: Jim + Scavanger_Ab; Emaren + Tekki; Zodiac + MouldyBoars39381;
    Julio Alvarez + Sniper.
  - 3v3: Jim + Scavanger_Ab + Tekki; Emaren + Zodiac + MouldyBoars39381.
  - 4v4: Jim + Scavanger_Ab + Tekki + Zodiac; Emaren + Julio Alvarez +
    MouldyBoars39381 + Sniper.
  Remaining positions stay visibly open. Exact replay-backed team rivalry
  evidence remains available elsewhere but is not mislabeled as a rated team
  leaderboard.
- Women's Champion is vacant and currently presents Moose as the invited #1
  contender only; no AoE2WAR identity is fabricated for her.
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
- Normal `/challenge` requests inspect both participants for currently held,
  app-only ELO belts that are not already committed to an active title defense.
  Those belts are attached as `TrophyChallenge` rows automatically. A held title
  defense does not re-run vacant-belt ELO admission rules: once the Commissioner
  places a belt on a holder, a direct opponent may take that belt by beating the
  holder in the matching game mode.
- RM and DM ELO custody are distinct. Historical generic ELO definitions default
  to RM for backward compatibility; new Trophy Command definitions record an
  explicit RM/DM lane and are canonicalized to lane-specific custody identities.
  The public E2 projection reads live Trophy custody for each lane instead of
  sharing one generic holder across both rows.
- A verified watcher/replay result can automatically settle a linked `app_only`
  ELO belt only when both players' Watchers provide dual coverage, the replay's
  authoritative game type matches the belt lane, title custody is unchanged,
  desync authority permits title movement, and the projected dethrone bounty is
  zero. The opposite RM/DM belt is closed as
  `mode_not_contested` and does not move. Any non-zero bounty remains
  commissioner-reviewed so automatic custody never invents or executes a WOLO
  financial disposition. Chain-backed titles remain explicit chain intents.
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

Initial app-side custody seeds currently retained by source:

- Canada Champion: Emaren
- USA Champion: Jim
- Mexico Champion: Julio Alvarez
- UK Champion: vacant
- Elite Championship: vacant

Older databases may still retain historical UK/Sniper or Elite/Emaren seed
evidence. Public title projection and the live Tribute rail treat obsolete seed
evidence as non-current rather than rewriting historical custody evidence on
read. Read-only production preview skips seed reconciliation entirely, so local
parity sessions can never manufacture custody while reading production truth.

Seed names remain visible even when a matching app user does not exist. In that
case the display custody is retained while the user relation and wallet address
remain null.

The public registry is `GET /api/trophies`. NFT-shaped metadata is available at
`GET /api/trophies/[trophyId]/metadata`.

Projected bounty is display math: stored bounty plus whole elapsed days times
the configured bounty growth. It is not a chain balance and must not be called
paid or escrowed.

Daily Tribute obligations follow current-holder truth until money moves. If a
belt changes hands during a UTC payout day and that day's prior-holder payout
has no transaction hash and has not been paid, the old row is marked
`superseded` and a new dry-run obligation is queued for the current holder.
The trophy/day queue is serialized so the timer and Trophy Command cannot
create duplicate obligations concurrently. Once any same-day payout is paid or
tx-backed, it is immutable chain truth and no second daily tribute is created
for that trophy/day. An operator-cancelled payout for the current holder is
also preserved and is not silently recreated.

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

### Manual Commissioner holder transfers

A manual holder reassignment is a title-money transition, not a display edit.
The action serializes on the Trophy row, re-reads current custody inside the
transaction, and derives payout obligations from that locked state.

For a real holder change:

- freeze the outgoing reign's projected championship bounty at the transfer
  instant and queue one `dethrone_bounty` obligation for the incoming holder;
- reset the stored bounty base to zero and begin the incoming reign at the
  transfer instant;
- reconcile same-UTC-day Champion Tribute rows through the same
  `reconcileDailyTrophyTribute()` policy used by the daily queue;
- never replace a paid or tx-backed same-day tribute;
- supersede only unexecuted former-holder tribute rows;
- create a new same-day tribute only for titles currently admitted by
  `ACTIVE_REIGN_TRIBUTE_TROPHY_IDS`;
- treat reassignment to the already-current holder as a metadata refresh, not
  a new reign or a second bounty obligation.

Both `daily_tribute` and real `dethrone_bounty` obligations execute through
the existing Founder Rewards settlement authority. A challenge dry-run bounty
row is preview evidence only: it cannot execute, retry into an executable
status, or receive a payable state merely through the generic payout controls.
Championship bounty money is separate from Bet Escrow and from the public
numbered Bounty Pool.

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
