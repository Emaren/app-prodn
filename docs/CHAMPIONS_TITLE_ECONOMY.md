# Championship Title Economy

Last updated: 2026-06-15

AoE2HDBets owns the app-side championship presentation, eligibility settings,
challenge entry points, and operator scaffolding for titles. This is not a
chain custody layer, NFT layer, or WoloChain source of truth.

## Public routes

- `/champions` is the title-economy hub.
- `/champions/[...slug]` renders detail pages for belts, national titles, ELO
  titles, tag titles, and designations.
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

Title copy should use `Artifact Bonus` across belts, national titles, ELO
titles, tag titles, and special designations.

Do not bring back older labels such as `Monthly Reward`, `Daily Purse`,
`Reign Tribute`, `Holder Bonus`, `Winner Bonus`, or `Champion Payment`.

## Visual assets

Champion art assets live under `public/champions`.

- Belt art: `public/champions/belts`.
- Designation art: `public/champions/designations`.
- Holder and silhouette backplates: `public/champions/players`.

These PNGs must contain a real alpha channel. Do not ship checkerboard, white,
gray, or matte backgrounds baked into title art. The page layers holder avatars
or the generic silhouette behind the belt art at low opacity; the belt/item
itself remains the primary visual.

## Data and state

- `lib/champions/titleState.ts` builds the current app-side title view model.
- Real leaderboard data is used where the app already has it, especially for
  world, ELO, and designation contender rails.
- Current holders are separate from contender boards. A title model is one
  holder panel plus ten contender slots; holders must not be counted as part of
  the top 10 list.
- Unimplemented title holders should render as honest vacant/open states rather
  than fabricated champions.
- `lib/champions/evaluation.ts` contains future parser/result hooks for title
  transfers and artifact awards. The current ship does not automatically mutate
  persistent title state.

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

`/admin` includes an operator scaffold for future title assignment, vacation,
top-10 ranking, and record/event capture work.

The scaffold is intentionally non-persistent for this slice. It should stay
visibly disabled until the backing storage/API rail exists. Do not imply that a
disabled admin form has changed title custody or WoloChain state.

## Ownership boundary

AoE2HDBets may present title economics, WOLO tribute labels, challenge links,
and app-side eligibility.

AoE2HDBets must not redefine:

- WoloChain denom truth.
- WoloChain supply or scarcity truth.
- Signed wallet movement.
- Bet-time escrow or chain custody.
- Any settlement state that conflicts with WoloChain or the settlement rail.

If a future title claim spends, locks, or settles real WOLO, that path must use
the existing signed wallet and settlement verification rules before copy calls
it chain-backed.
