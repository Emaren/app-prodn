# Watcher 1.6.4 download artwork and CTA contract

Scope: `/download` extreme presentation only, October 10, 2026
release artwork refresh. Do not change the watcher release manifest,
tracked download endpoints, signing claims or actual binary artifacts.

## Artwork and provenance

- Desktop: `public/watcher/watcher-v164-desktop.webp` — 1672×941,
  289,088 bytes, Git blob `fb7a85789b5c3dcb9104878fa28a56be6add321e`.
- Mobile: `public/watcher/watcher-v164-mobile.webp` — 1024×1536,
  321,518 bytes, Git blob `b06b60c379a50d2fe0050fb7375a135623419664`.
- Both are lossily optimized WebP renditions of the user-approved
  Watcher 1.6.4 generated artwork, shipped as real static assets rather
  than image CDN references or Git LFS pointers. Git hashes were checked
  against the original uploaded WebP files before the tree was committed.
- `/download` selects the portrait asset below 768 CSS pixels and the
  landscape asset otherwise. The `<source>` declares the portrait
  intrinsic size to reduce layout shift. Original v1.5.10 assets remain
  for history / rollback.

## Painted artwork interaction

The two buttons are *text inside the raster artwork*. Semantic, transparent
HTML anchors overlay their measured image coordinates and must remain
keyboard focusable and screen-reader labeled. Their source authority:

- `Download Windows Installer` → `primaryArtifact.trackedHref`,
  resolved from `lib/watcherRelease.ts`, currently the
  `/download/watcher/windows-installer` tracked route. Never hard-code
  a binary filename in the art overlay.
- `Open Profile Pairing` → `/profile?watcher_pair=1`.

Percentage-space geometry is relative to the **full intrinsic artwork**:

| Layout | Download rectangle (left/top/width/height) | Pair rectangle |
| --- | --- | --- |
| Desktop 1672×941 | 2.1 / 35.45 / 19.0 / 6.1 % | 21.55 / 35.45 / 16.15 / 6.1 % |
| Portrait 1024×1536 | 4.1 / 41.15 / 58.4 / 4.25 % | 4.1 / 46.1 / 58.4 / 3.55 % |

These are **not** the old 1.5.10 coordinates, especially on portrait;
reusing those would create dead or misplaced clickable controls.
Focus rings, `aria-label` and descriptive titles remain on actual DOM
anchors, not the image bitmap. Avoid embedding personal profile credentials
or static download URLs into any asset.

## Verification / rollback

`node --experimental-strip-types --test tests/watcher-164-download-hero.test.mts`
checks the files and real WebP frame dimensions, image selection, tracked
download/pairing paths, and responsive click regions. Live QA must verify:

1. Desktop ~1440px, tablet 768px, narrow iPhone 390px — hero is visible
   and no mobile portrait cropping is introduced.
2. Mouse/touch **and keyboard** activation of both painted CTAs land on
   the same tracked installer / pairing routes as the platform cards.
3. 1.6.4 date/version is correct and other view modes still work.
4. Actual installer route returns the correct immutable artifact; this
   artwork-only change cannot certify or replace release binary bytes.
5. Protected docs baseline, CI, and Finish/Deploy receipts green before
   calling it production.

Rollback is a page-source revert to `watcher-v1510-*.png` and their old
hotspot geometry; versioned 1.6.4 files can remain until normal asset
retention. Do not delete historical watcher packages or alter WOLO,
replay settlement, video stream authority, or player profile data.
