---
id: "aoe2war.app-prodn.docs-hero-studio"
title: "Hero Studio"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["developers","ai-agents"]
source_of_truth: "git"
authority: "product-contract"
reviewed_at: "2026-07-26"
review_interval_days: 90
sensitivity: "internal"
---

# Hero Studio

## Purpose

Hero Studio owns the reusable, ordered Main Stage shown on `/` and `/lobby`.
It composes AoE2WAR-owned content into one public carousel without collapsing
the underlying domain models into a generic page-builder table.

The operator surface is:

- `/admin/hero-studio` for screen library, ordering, scheduling, transitions,
  per-screen duration, preview, publication history, and rollback
- `/admin/events` for the live Featured Event: copy, warriors, trophy,
  Commissioner, timing, artwork, and CTA
- `/admin/media-assets` for reusable still and motion assets

## Data model

`HeroPlaylist` stores the draft carousel-wide behavior:

- autoplay
- default display duration
- transition duration
- transition style
- pause-on-hover/focus
- arrow, dot, and progress visibility

`HeroScreen` is a reusable typed screen definition. Its stable `type` selects a
trusted renderer and configuration validator:

- `featured_event`
- `chronicle_cover`
- `warrior_quote`
- `media_takeover`

`HeroPlaylistItem` places a saved screen into the draft chain with:

- position
- enabled state
- optional start/end schedule
- optional display-duration override
- optional safe link override for non-Featured-Event screens

`HeroPlaylistPublication` stores an immutable ordered snapshot. Public routes
read the newest publication, while Admin may continue editing the draft. A
rollback creates a new live version from an older snapshot rather than mutating
history.

The schema seed is sealed as revision 1 by
`20260703_200000_publish_hero_bootstrap`; production should not remain in the
temporary `draft-bootstrap` compatibility state after migrations complete.

## Source ownership

Typed Hero screens use real app-domain sources:

- Featured Event -> the single published + active `EventTile`
- Wolo Chronicle -> an explicitly selected `ForumThread`
- optional managed art or motion -> `ManagedMediaAsset`

The Featured Event is deliberately different from the other source types. A
Featured Event Hero screen does **not** pin an EventTile ID. At render time it
always resolves the current published + active EventTile, including that
event's CTA. Clicking **Make live** in Event Foundry therefore changes the
Featured Event everywhere without editing or republishing the Hero chain. Hero
Studio owns only whether the Featured Event screen is present, where it sits,
and how long it is shown.

The publication snapshot owns composition and screen configuration. Chronicle
and media sources remain explicit editorial choices. EventTile and ForumThread
content is hydrated from its current app record so the owning editor remains
authoritative.

Do not add arbitrary HTML, JSX, scripts, or database-authored React code.
Genuinely new visual templates require a trusted renderer plus validator in the
Hero registry. Operators may then create unlimited screen instances from that
type without another template-specific database migration.

## Public behavior

`components/hero/HeroCarousel.tsx` owns:

- autoplay and per-screen dwell time
- previous/next, dots, progress, pause, swipe, and keyboard-focus pause
- tab-visibility pause
- reduced-motion fallback
- stable responsive stage height
- the five transition presets

The transition keys are:

- `crossfade`
- `banner_wipe`
- `siege_push`
- `ember_dissolve`
- `cut`

If Hero persistence is unavailable, the public routes retain the permanent
Featured Event fallback. A failed migration must never remove the Main Stage.

## Chronicle date and link truth

Chronicle covers bind to an explicitly selected `ForumThread`. The cover date
is formatted from that thread's `createdAt` timestamp in the AoE2WAR site
timezone. It is not recalculated as the viewer's current day, because an older
edition must not silently acquire a false date.

The canonical link is `/forum/thread/[slug]`. Hero Studio may override it with a
safe internal path or credential-free HTTPS URL.

Do not automatically promote the newest community thread. Selecting the thread
and publishing the Hero chain is the editorial approval boundary.

## Motion assets

Media Armory accepts:

- normal managed images up to 7 MB
- `motion` MP4/WEBM assets up to 48 MB
- GIF or still fallbacks in the motion category

The managed upload route supports byte-range responses for browser video
playback. Hero videos must remain muted, looping, inline background media and
should provide a poster image.

Production should set:

```bash
MANAGED_MEDIA_UPLOAD_DIR=/mnt/HC_Volume_105319120/aoe2-managed-assets
MANAGED_MEDIA_PUBLIC_BASE_PATH=/uploads/managed-assets
```

The upload directory must be writable by the `tony` service user. The dynamic
`/uploads/managed-assets/[kind]/[file]` route reads the configured directory,
so no public-tree symlink is required.

## Publication workflow

### Featured Event

1. Keep one Featured Event screen in the Hero chain and publish the chain once.
2. Build or edit an event in `/admin/events`.
3. Click **Make live**.
4. The current Featured Event screen immediately resolves that event's content
   and CTA. No Hero Studio event selection or Hero republish is required.

### Other Hero screens

1. Create or select a typed screen.
2. Save it.
3. Add it to the transition chain.
4. Set ordering, schedules, duration, and optional link override.
5. Save the chain.
6. Preview desktop and mobile with the public renderer.
7. Publish Live.
8. Restore a prior revision if the live composition needs rollback.

## Verification

```bash
npx prisma generate
npx tsc --noEmit --pretty false
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/hero-studio.test.mts
npm run build
```

Schema-dependent deploys must run `npx prisma migrate deploy` and verify the
four `hero_*` tables before the service restart.
