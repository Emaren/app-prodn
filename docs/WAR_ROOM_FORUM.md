# War Room Forum

## Product contract

`/forum` is AoE2HDBets-owned community UX. It is not a generic infrastructure
forum and it does not redefine WoloChain truth.

The page should feel like an active AoE2 room even before community posting
volume arrives:

- Wolo Chronicles records the people, rituals, rivalries, and strange habits of
  the long AoE2 war.
- Strategy and replay writing should be specific enough to help a player.
- Humour should come from recognizable AoE2 situations, not generic fantasy
  filler.
- Claims that need evidence should point people toward replays, timestamps, or
  the relevant app route.
- Public reading stays open. Publishing, replies, and named reactions require a
  signed-in AoE2WAR citizen.

## View modes

Forum view is stored under the shared `forum` tile-view preference. Signed-in
users receive the existing account-backed appearance persistence; visitors use
the same local preference store.

- Basic: `65rem`. A disciplined, fast three-column index with the centered
  `FORUM / WAR ROOM` hero and compact thread cards. Its dedicated thread route
  becomes a clean single reading column with only the article, reactions, and
  replies.
- Advanced: `75rem`. Default. Adds the Wolo Chronicles lead, room signals,
  excerpts, field-manual context, and a premium dedicated thread page with an
  editorial article card, thread record, related-dispatch rail, and reply table.
- Extreme: `96rem`. A separate unfolded-edition information architecture. The
  index becomes a full-width newspaper/comic composition with a complete lead
  article, reply pull quote, dispatch wire, feature stories, illustrated middle,
  and back page. Article copy is visible without opening a thread. Dedicated
  Extreme thread routes use a large masthead, multi-column body, related-story
  strip, and conversation rail.

The B/A/E control belongs conspicuously in the forum hero. A user choice must
survive reloads and signed-in appearance hydration.

## Thread behavior

The editorial archive is defined in `lib/forum.ts` and seeds the shared ledger
when the forum tables are available.

Current reader interactions:

- tab and channel filtering
- full-text search across title, excerpt, body, author, and tag
- Featured, My Feed, Bookmarks, My Threads, Mentions, and Watched shelves
- local read state and Mark All Read
- local guest bookmarks
- dedicated, shareable thread routes at `/forum/thread/<slug>`
- copy-link control
- Chronicle replies and reaction totals
- clear empty states with a path back to the full room

Thread titles navigate through the Next.js client router to the dedicated route;
they never open a dialog, veil, quick reader, or grayscale layer. Browser Back
returns to the forum index, and Next.js route prefetching keeps the transition
fast. Legacy `?thread=<slug>` links redirect to the canonical dedicated route.

Basic, Advanced, and Extreme control information density and composition. They
do not change the meaning of a title click. A future Quick Peek may reuse an
in-flow primitive only behind a separately labeled, explicit control; it must
never become the default title action.

The new-thread composer remains an intentional modal because it is a bounded
creation task rather than a reading surface.

Do not replace the editorial archive with empty database state. The authored
threads are the permanent founding layer of the room.

## Shared ledger

Migration:

`prisma/migrations/20260701221500_add_war_room_forum/migration.sql`

Tables:

- `forum_threads`
- `forum_posts`
- `forum_thread_bookmarks`
- `forum_thread_reactions`

`GET /api/forum` is public. It seeds missing editorial rows, returns community
threads, and includes viewer bookmark/reaction state when a session exists.

`POST /api/forum` requires a signed session and supports:

- `create_thread`
- `reply`
- `toggle_bookmark`
- `toggle_reaction`

`PATCH /api/forum` records a thread view. Thread and reply inputs are bounded,
posting is rate-limited, and locked threads reject new replies.

## Missing-migration behavior

The page must degrade cleanly if the forum tables do not exist:

- `GET /api/forum` returns HTTP 200.
- The response contains the complete editorial archive.
- `ledgerAvailable` is `false`.
- The response header includes
  `X-AoE2WAR-Forum-Ledger: migration-required`.
- The page labels the room as an editorial/read-only archive.
- New-thread and reply surfaces explain that the shared ledger is unavailable.
- No local-only draft is described as published to the community.

This fallback keeps the public experience alive, but it is not the production
completion state.

## Deploy

Run the normal production sequence:

```bash
cd /var/www/AoE2HDBets/app-prodn
git pull --ff-only origin main
npx prisma migrate deploy
npm run build
sudo systemctl restart aoe2hdbets-web.service
systemctl is-active aoe2hdbets-web.service
```

Then verify:

```bash
curl -I https://aoe2war.com/forum
curl -s https://aoe2war.com/api/forum \
  | jq '{ledgerAvailable, threadCount: (.threads | length), firstThread: .threads[0].title}'
```

Expected production result:

- `/forum` returns a successful response.
- `ledgerAvailable` is `true`.
- the seeded archive contains twelve threads.
- the seeded archive includes `The Kingdom Has No Pause Button`.
- a signed-in user can publish, reply, react, and bookmark.

## Verification

Local code gate:

```bash
npx prisma generate
npx tsc --noEmit --pretty false
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/forum-war-room.test.mts
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/admin-tile-view-analytics.test.mts
npm run build
```

Browser verification should cover:

- Advanced as the untouched default
- Basic persistence after reload
- no horizontal overflow at a `390px` mobile viewport
- search result and empty-state behavior
- client-side navigation from index to `/forum/thread/<slug>`
- legacy `?thread=<slug>` redirect to the canonical route
- no reader dialog, page veil, body scroll lock, or grayscale treatment
- Basic single-column, Advanced editorial, and Extreme newspaper thread layouts
- Extreme index article copy visible before any thread click
- read-only copy when `ledgerAvailable=false`
- publishing, reply, bookmark, and reaction state after migration
