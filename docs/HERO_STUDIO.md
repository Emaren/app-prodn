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
reviewed_at: "2026-10-04"
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

## Media Armory batch packs

`/admin/media-assets` accepts a bounded ZIP pack through the **Batch asset pack** lane. A pack may include `asset-manifest.json` schema 1 to bind exact managed-media kinds and targets. Manifest-driven imports are preferred for production title/art packs because one uploaded byte object can be bound to multiple targets without duplicating the file (for example one 2v2 belt can feed both RM and DM presentation targets until separate art exists).

Safety and operator rules:

- admin authentication is required;
- ZIP payloads are capped at 64 MB compressed;
- a manifest is validated completely before writes begin;
- archive paths are normalized and parent traversal is rejected;
- supported entries are bounded to 120 assets / 300 target bindings;
- existing active target bindings are replaced only when the manifest permits it;
- ZIPs without a manifest fall back to deterministic filename slugs under the selected Armory category;
- imports report per-asset failures instead of hiding partial results.


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

Screen language is presentation metadata inside trusted `HeroScreen.config`:
`languageCode` is `en`, `fr`, or `es`, and translated screens carry a
`languageGroupKey` pointing at their canonical English counterpart. English
owns the editorial chain slot. French and Spanish are viewer-specific
presentation variants, not independent editorial positions.

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
- persistent two-slot render buffers: the visible Hero surface is never remounted at a slide boundary; the next screen is prepared in the inactive slot before the slots trade visibility
- lifecycle-free native CSS transitions between those persistent buffers; transition completion must not trigger a React state write or remount because the stable dwell is intentionally inert
- the five transition presets

The transition keys are:

- `crossfade`
- `banner_wipe`
- `siege_push`
- `ember_dissolve`
- `cut`

If Hero persistence is unavailable, the public routes retain the permanent
Featured Event fallback. A failed migration must never remove the Main Stage.

### Language variants

Language-image variants are opt-in through the existing Universal Translator.
Auto mode and English show the canonical English Hero only. A viewer who
explicitly chooses French or Spanish receives the English Hero followed
immediately by that Hero's matching French or Spanish version when one is
published. Other languages do not receive either translated image.

For a complete English + translated pair, the public carousel exposes a small
upper-right hover/focus control. The viewer may hide either the English image or
their selected-language image. The surviving image exposes the restore action,
so a player cannot hide both halves and strand the recovery control. The choice
persists locally and, for authenticated users, in
`user_appearance_preferences.hero_language_visibility`. This preference only
filters the viewer's presentation; it never mutates Hero publication order,
screen enablement, or another player's experience.

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

1. Uploading an image into Hero Studio creates its Media Takeover and
   immediately persists it at **#1** in the draft chain.
2. Saving screen treatment such as **Full Image + Bars** updates the screen
   definition without replacing the operator's current chain order.
3. Reorder by click-hold-drag on the numbered handle or with circular arrow
   controls. Up from #1 wraps to the bottom; down from the final item wraps to
   #1.
4. For translated newspaper/art versions, keep the English screen canonical and
   create or mark a French/Spanish screen with its English counterpart.
5. Set schedules, duration, enablement, and optional link override.
6. Save the chain, preview desktop/mobile, then Publish Live.
7. Restore a prior revision if the live composition needs rollback.

The additive migration
`20261004213000_add_hero_language_visibility` stores only per-user language
visibility state. Hero language identity itself remains inside the validated
screen config and therefore remains part of immutable publication snapshots.

## Verification

```bash
npx prisma generate
npx tsc --noEmit --pretty false
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/hero-studio.test.mts
npm run build
```

Schema-dependent deploys must run `npx prisma migrate deploy` and verify the
four `hero_*` tables before the service restart.
