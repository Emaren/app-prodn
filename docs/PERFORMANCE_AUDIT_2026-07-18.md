# AoE2WAR Production Performance Audit — 2026-07-18

## Outcome

The optimized build is live at `https://aoe2war.com`. The largest user-facing gains are on the media-rich home page, Champions, Rivalries, and War Chest. The home page retained high-quality imagery (`quality=95` for primary presentation assets) while its initial Lighthouse transfer weight fell from 29.67 MB to 4.92 MB.

The site now also publishes:

- `https://aoe2war.com/robots.txt`
- `https://aoe2war.com/sitemap.xml`

## Route inventory

The application currently owns 86 Next.js page templates:

| Kind | Count |
| --- | ---: |
| Static route templates | 71 |
| Dynamic route templates | 15 |
| Total page templates | 86 |
| Admin templates included above | 18 |
| Public canonical static URLs in the sitemap | 35 |

The production crawl covered all 71 static routes three times. All resolved to an HTTP 200 final response, including authenticated/admin aliases that redirect to a public destination. Twelve dynamic templates had a current production record that could be sampled. Three templates had no current backing record and correctly returned 404: live game statistics, tournament detail, and session-specific watch detail.

Rivalries contains 2,180 current rivalry boards: 567 player histories and 1,613 team histories. The public index now presents these across 31 pages instead of serializing every board into one response.

## Production results

Lighthouse was run against representative public production pages before and after deployment. Values below are single controlled lab runs and should be interpreted alongside the repeated route crawl.

| Page | Performance score | LCP | Speed Index | Transfer |
| --- | ---: | ---: | ---: | ---: |
| Home | 56 → 60 | 9.31s → 4.82s (48.2% faster) | 4.61s → 3.47s (24.7% faster) | 29.67 MB → 4.92 MB (83.4% less) |
| Rivalries | 54 → 89 | 2.4s → 1.4s (42.2% faster) | 3.3s → 2.1s | 1,543 KB → 750 KB |
| Champions | 67 → 84 | 3.0s → 1.5s (48.5% faster) | 3.5s → 2.7s | 12,152 KB → 1,761 KB (85.5% less) |
| Leaderboard | 88 → 93 | 1.4s → 1.1s (18.5% faster) | 2.2s → 1.9s | 713 KB → 713 KB |
| Players | 88 → 93 | 1.4s → 1.1s (21.4% faster) | 1.9s → 1.9s | 700 KB → 700 KB |
| Battle Archive | 85 → 92 | 1.7s → 1.3s (20.7% faster) | 2.0s → 1.6s | 744 KB → 743 KB |
| WOLO | 91 → 93 | 1.4s → 1.3s (7.9% faster) | — | — |
| Traffic | 92 → 95 | 1.2s → 1.1s (15.0% faster) | 1.7s → 1.5s | — |
| Forum | 80 → 94 | 2.1s → 1.1s (45.2% faster) | 2.0s → 1.5s | — |

The repeated HTTP crawl found two exceptional server/rendering bottlenecks:

| Page | Before | After | Gain |
| --- | ---: | ---: | ---: |
| Rivalries total time | 27.64s | 2.60s | 90.6% faster |
| Rivalries HTML | 16.42 MB | 0.79 MB | 95.2% smaller |
| War Chest total time | 13.17s | 2.35s | 82.2% faster |
| War Chest TTFB | 11.50s | 0.75s | 93.4% faster |

Across the 45 direct canonical static URLs, median total HTTP time remained effectively flat at 1.146s before and 1.144s after. The full 71-route result is skewed by 26 redirects/auth aliases and production network variance. The sampled dynamic-route median varied from 1.310s to 1.382s (5.5% slower), with no route-specific payload regression identified. These two neutral/noisy aggregates are retained here to avoid presenting selective gains as universal improvements.

## Changes shipped

- Added native Next.js sitemap and robots routes with 35 public canonical static entries and exclusions for private/admin/API surfaces.
- Removed the home page's blank client-only hydration gate so meaningful content renders immediately.
- Replaced eager loading of the entire Featured Warriors media pool with opening-lineup warming and next-rotation decoding.
- Deferred Shorts and fallback Watch video loading until the media is near the viewport.
- Kept primary home/hero imagery at high visual quality while using responsive Next.js image delivery.
- Added high-quality generated WebP card and thumbnail variants for uploaded media; originals remain available.
- Served Champion and homepage promotional art through responsive, quality-95 image variants instead of multi-megabyte originals.
- Paginated Rivalries at 72 boards per page while preserving global totals and chronology.
- Moved War Chest market reconciliation off the request-critical path and reused the shared background ensure queue.
- Deferred analytics execution until after initial page load.
- Removed the globally incorrect `/` canonical and added page-owned home metadata.
- Added an isolated Next.js release build directory so production can build without deleting the currently served asset tree, preventing stale-HTML/missing-chunk outages during deployment.

## Verification

The following gates passed:

- `npx prisma generate`
- `npx tsc --noEmit --pretty false`
- `npm run build`
- 8/8 final performance/discovery-focused tests
- Visual browser checks for Home, Champions, and Rivalries
- Production HTTP checks for core routes, sitemap, robots, and current hashed Next.js assets

The full repository suite passed 124 of 126 tests. The two failures are unrelated pre-existing brittle assertions: one stale forum voice expectation and one formatting-sensitive Kingdom source regex. Neither touches the deployed performance paths.

## Operational notes and remaining opportunities

- The first home request after a process restart can still pay a large database/cache warm-up cost; warm requests return to the normal sub-second TTFB range. A future pass should move that initialization out of the first public request.
- Player and staking dynamic-detail routes remain the best candidates for a query/cache profiling pass. Current measurements were variable rather than conclusively regressed.
- Preserve image quality settings on the main promotional surfaces. Further savings should come from delivery format, responsive sizing, preload discipline, and cache policy—not visibly lower source quality.

## Deployment

Application commits deployed in this pass:

- `39414bc` — Accelerate public pages and add discovery routes
- `e1ef1db` — Trim homepage media startup cost

Production was built into `.next-release`, swapped atomically with the prior `.next` output, and restarted through `aoe2hdbets-web.service`. Rollback build directories were retained on the server.
