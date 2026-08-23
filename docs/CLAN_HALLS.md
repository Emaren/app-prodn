---
id: "aoe2war.app-prodn.docs-clan-halls"
title: "Clan Halls"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "product-contract"
reviewed_at: "2026-08-22"
review_interval_days: 90
sensitivity: "internal"
---

# Clan Halls

Clan Halls are persistent house rooms built on the `Clan`, `ClanMember`,
`ClanMessage`, `ClanMessageAttachment`, and `ClanMessageReaction` models.
`/clans/aoe2war` remains the proving ground for new Hall capabilities, but Clan
Social V1 graduates the proven social baseline to every active Hall.

## Role language and authority

Database and authorization semantics remain intentionally conventional:
`owner`, `admin`, and `member`. Presentation is separate. The user-facing label
for the `owner` role is **The King**. This is copy only; permission checks,
queries, seed data, and storage continue to use `owner`.

Global AoE2WAR site administrators may administer a Clan Hall without being
silently treated as clan members. Membership truth and site-admin authority are
separate contracts.

## Social V1 feature profile

`lib/clanHallFeatures.ts` is the explicit capability registry. Every active V1
Hall now inherits the same proven social baseline: realtime invalidation,
optimistic message presentation with visible retry, ephemeral Hall presence,
the on-site Invite Door, one Hall-local Scribe, and bounded rich media. Per-Hall
overrides remain available for future experiments without making AoE2WAR-only
behavior the permanent product contract.

Typing, delegated recruiting, replies, pins, search, and replay cards remain
explicit later capabilities rather than implied global behavior.

## Realtime contract

`lib/clanHallEvents.ts` owns the process-wide event bus and
`/api/clans/[slug]/events` exposes the stream for the Social V1 Hall baseline.
Events are content-free invalidations: message bodies and private audience
content never ride the event stream. The permission-aware Hall GET remains the
source of truth. Every Hall keeps a 60-second recovery poll behind SSE. Targeted
reaction/edit invalidations refresh only the affected message, while new-message,
policy, and roster invalidations refresh the latest page.

## Invite Door V1

The first production Invite Door deliberately requires no database migration.
It reuses the mature pairwise Direct Chat tables:

1. Hall leadership may hover/focus the Invite Door to browse every eligible
   human AoE2WAR user immediately; typing narrows that roster but is not required.
   The viewer, active clan members, and reserved internal/system identities are
   excluded from the invitation candidate set.
2. Sending an invitation creates a normal direct conversation/message. A second
   still-pending invitation from the same manager to the same warrior is rejected
   rather than creating duplicate invitation spam.
3. The message contains a human-readable Hall link carrying the DirectMessage
   id as the invitation handle.
4. The recipient opens the Hall and explicitly accepts or declines.
5. Accept performs an idempotent `ClanMember` upsert as ordinary `member`.
6. The invitation text is updated from Pending to Accepted/Declined and Direct
   Chat receives a live message-update event.
7. Accept also publishes a Hall roster invalidation.

The DirectMessage id is not treated as a secret. Authorization is always
re-proven server-side: the signed-in recipient must participate in that exact
conversation, the message must match the exact Clan invitation shape, and the
sender must still have Hall-management authority.

External transports remain a later delivery layer over the same Hall-link
concept. The production V1 proves the full on-site invitation and membership
loop first.

Direct Chat recognizes the canonical invitation body and renders it as a
dedicated Hall-invitation artifact rather than an ordinary speech bubble.
Recipients can decline or accept directly from that artifact; acceptance joins
the clan and enters the Hall. Sender and recipient still see the same persisted
DirectMessage state.

## Hall chat presentation V1

Hall presentation deliberately separates **page layout** from **chat renderer**.
The existing B/A/E layout modes remain available. Independently, every viewer
may choose one of five permanent Hall chat versions:

1. **V1 — War Cards**: the original spacious AoE2WAR Hall rows.
2. **V2 — Discord Dense**: grouped community chat with compact repeated messages.
3. **V3 — Steam Tight**: a lean utilitarian transcript with minimal chrome.
4. **V4 — AoE2HD Classic**: line-by-line heritage lobby chat with restrained
   AoE2 warmth.
5. **V5 — Balloons**: conversational left/right speech bubbles.

`components/clans/clanChatViewPreference.ts` owns the stable version registry and
the viewer preference. Version numbers are durable product identities: new
renderers may be added, but an existing version is not silently repurposed or
removed. The five variants consume the same Hall message, authorization,
reaction, edit/delete, realtime and Hall Scribe business logic; only presentation
changes.

Each Hall persists an administrator-owned `defaultChatView` (`v1`-`v5`) in
the dedicated one-to-one `clan_hall_settings` child table. This keeps Social V1
inside the protected additive release contract without mutating the pre-existing
`clans` table and gives future Hall policy its own bounded home. The King/clan
admins can set the default from Profile Clan Administration or from the
admin-only control in that Hall's bottom Display rail. Viewer overrides are
stored locally per Clan rather than globally. Resolution is: per-Clan viewer
override, then Clan admin default, then V1. Ordinary viewers never see the
admin-default control.

The bottom Hall display rail therefore exposes B/A/E as the layout dimension and
one compact version control for chat. During the V1 discovery period, the same
chat-version control is also shown beside the Hall header so users learn that
multiple renderers exist. Clicking either compact control advances immediately
to the next version without refetching messages; hover/focus exposes the full
V1-V5 fan for direct selection. The preference is shared by both controls.

### Viewport and Hall presence

The message viewport is monitor-responsive rather than a fixed 31rem box.
Desktop and mobile clamps use viewport height so the chat surface shows more
conversation when the user is focused on the Hall while retaining the right
auxiliary rail on wide screens. The viewport allows native scroll chaining: at
the newest boundary continued downward wheel/trackpad motion scrolls the page,
and once the full retained history boundary is reached upward motion chains back
to the page as well. Older Hall messages are cursor-paged and prefetched roughly
900px before the top sentinel; prepends preserve the viewer's visual anchor so
history appears before the user reaches it.

Signed-in users maintain a short-lived in-memory Hall heartbeat through
`/api/clans/[slug]/presence`. This distinguishes **in this Hall now** from the
canonical site-wide online signal without adding database writes. The Hall
presence TTL is intentionally ephemeral; leaving or losing a tab naturally
expires the user.

Clan membership history is already durable: `ClanMember.joinedAt` is populated
at membership creation and `ClanHallSnapshot.roster[].joinedAt` already exposes
that timestamp. V1.1 surfaces the timestamp beside each roster member together
with `In Hall`, `Online`, or `Offline` state. No Prisma migration is required.

### Message tools and translation

Normal Hall messages expose one deliberately muted `Message tools` launcher
instead of separate edit, delete, and reaction controls. Hover/focus or click
opens a viewport-fixed portaled tray, so opening the full reaction surface never
changes transcript geometry or scroll extent. The tray contains translation, the
universal reaction picker, and only the edit/delete actions the current viewer
is authorized to use. Existing reaction summaries remain attached to the message
only when reactions exist.

The universal picker accepts any single Unicode emoji grapheme, provides search,
categories, and a site-wide recently-used list, and exposes a future custom
reaction affordance without pretending custom image emoji are wired today. The
same component is shared with Direct Chat: Full Chat uses the full picker while
Nav Chat uses its compact presentation. Existing legacy `GG` Direct Chat
reactions remain valid.

Translation is message-by-message and follows the Universal Translator target:
an explicit AoE2WAR site language wins; Auto resolves the supported browser
language. Translation re-proves that the signed-in viewer can see the source
Hall message before using the existing AI gateway. The original message remains
authoritative and is never overwritten. A bounded in-memory cache is keyed by
message id, message `updatedAt`, and target language, so edited messages cannot
reuse stale translations. This requires no Prisma migration and performs no
production database write.

The V2 renderer intentionally follows Discord's visual grammar more closely:
neutral room background, grouped same-author sequences, avatar/name metadata
only when needed, and essentially no permanent card borders. V3 and V4 likewise
keep action chrome out of the transcript so Steam-tight and AoE2HD-classic
layouts remain genuinely dense.


### Social media and viewer density

Every Social V1 Clan Hall reuses the proven Direct Chat attachment storage
boundary rather than inventing a second writable media root. A message may carry up to four
bounded attachments: PNG/JPEG/WebP/GIF images, MP4/WebM video, or
MP3/M4A/OGG/WAV/WebM audio. Files are stored under the existing private chat
attachment root in a `clan-hall/` namespace; the database stores only immutable
attachment metadata and the private storage reference. Clan media also fails closed
before a write would push that filesystem below a 4 GiB safety reserve. Attachment
reads re-prove the Hall policy, message audience, authentication, and active Clan membership as
required. Deleting a message cascades attachment metadata and removes its stored
files.

The composer accepts the same social gestures users expect from mature chat:
picker selection, drag/drop, and clipboard image paste. Text is optional when a
message contains media. Ordinary URLs are rendered safely as links, and the first
YouTube URL in a message receives a privacy-enhanced inline player without an API
call or persisted embed state.

Viewer density remains presentation-only. Font size and line spacing are local
preferences shared by the header controls and bottom Display rail; they do not
change message truth or any V1-V5 renderer identity.

`Wanna Bet` is intentionally present only as a dormant WOLO message-tool affordance.
This social pass creates no wager, custody, escrow, settlement, dispute, or WoloChain
mutation path. A later financial feature must open that boundary explicitly.

### Scribe invocation

The AoE2WAR Hall Scribe has two explicit invocation paths. Typing `@Scribe`
in a Hall message requests a reply. The composer also exposes one muted `S`
control; lighting it arms the Scribe for the next message only, after which the
control resets. The explicit UI path sends a transient `scribe: true` request
flag and does not rewrite or decorate the human message stored in the Hall.

The server still re-proves that the AoE2WAR Hall has the Scribe feature enabled,
keeps the triggering audience unchanged, and catches model failure after the
human message has already been persisted. The legacy `@Hall Scribe` spelling
remains accepted for historical compatibility, but new UI copy uses `@Scribe`.

### Local Hall Scribe verification

`npm run dev:prod` is deliberately a read-only production-data preview. It
cannot persist a Hall message, and it does not import the production OpenAI
credential by default, so it cannot be used as a functional Hall Scribe write
test.

Use `npm run dev:shadow:fresh` for a safe writable production-shaped local
clone. Shadow mode writes only to the disposable local `aoe2hdbets_shadow`
database and may mirror the OpenAI provider credential ephemerally in process
memory while production application/chain mutation credentials remain absent.
That is the canonical local path for proving both typed `@Scribe` and the lit
`S` composer control before production deployment.

### Chat viewport and renderer polish

The primary Hall chat tile has a bounded responsive height and all five chat
renderers scroll inside that tile. V1 metadata chips are intentionally
low-contrast. V2 uses one continuous room surface with transparent message
rows. V3 applies the existing five-minute same-author grouping rule so immediate
follow-up messages omit repeated avatar/name/time metadata. V4 reserves a fixed
author column so every message body begins on the same vertical line.

## Clan Social V1 graduation — 2026-08-22

The AoE2WAR proving Hall validated image-only posts, drag/drop and clipboard
media, animated browser-origin GIF import, inline YouTube, viewer font/spacing
controls, arbitrary Unicode reactions, and the dormant `Wanna Bet` affordance in
a writable production-shaped shadow. Social V1 promotes those proven chat
capabilities to all active Clan Halls.

This graduation also makes reaction presentation a shared chat primitive. Clan
Hall and Full Chat use the full universal picker; Nav Chat uses the compact
variant. Reaction panels are portaled fixed overlays so they never reflow their
transcript. Direct Chat's mature cursor history remains authoritative and now
prefetches 900px ahead on the full page; Clan Hall adds the equivalent
permission-aware cursor history and anchor-preserving prepend behavior.

Custom image reactions, typing, Hall replies, pins/search, and replay cards are
not silently included in this release. They remain explicit later boundaries.

## Writable development shadow

`npm run dev:shadow:fresh` rebuilds a local disposable PostgreSQL database from
the current Prisma schema and imports only the production social slice needed
for Hall development. Heavy replay/parser/game history is intentionally not
cloned. Application database writes in shadow mode target localhost only;
production internal mutation credentials are stripped. The social shadow exists
to make invitation, chat, roster, and future Scribe work safely writable while
preserving production-shaped identities and Clan truth.

The production release lane never deploys or migrates the shadow database.


## Hall Scribe V1

Every active V1 Hall may use `hallScribe`. Each Hall Scribe has a distinct
reserved system UID derived from the Clan slug, remains excluded from
human/competitive counts, and is not inserted into the Clan roster. AoE2WAR
keeps the canonical `aoe2war-hall-scribe` agent configuration; other V1 Halls
may inherit that proven configuration until an operator gives the Hall a
dedicated agent configuration.

V1 is direct-mention only. The human message is persisted first. The model then
receives audience-filtered Hall context. If the AI call fails, the human message
remains posted. A successful reply is persisted at the same audience and emits
the normal Hall realtime invalidation.

Hall managers may edit Hall Scribe copy using existing Hall authority. Database
`updated_at` remains truthful, while the public Hall suppresses the visible
edited scar for Hall Scribe messages.

## 2026-08-17 Hall Scribe release boundary

AoE2WAR Hall Scribe is explicit-mention only. The triggering message persists
first; an AI failure cannot erase the human message. The reply uses the same
audience as the trigger, and Hall history never widens that audience.

Public site facts come from the Kingdom Knowledge Router. Hall-specific context
is additive roster and audience-filtered Hall history. Viewer wallets, wagers,
claims, staking-private state, private AI/direct history, sessions and secrets
are not Hall grounding.

A production-shaped read-only provider canary completed successfully through
the real GPT-4.1 Hall Scribe provider. For the Zodiac/somniosator question the
agent returned five meetings, Zodiac 2-0 when opposed, and 1-2 together as
teammates. The validation-only provider-preview route is not part of the
production release.


## 2026-08-21 multi-Hall V1 baseline

The V1 baseline intentionally changes as little Hall presentation as possible.
Existing Hall layout, colors, cards, roster presentation, B/A/E layout choices,
and the five-version chat renderer remain unchanged. The shared chat-view picker
already applies to every Hall.

The minimum operator-ready Hall now adds:

- Invite Door for Hall leadership;
- the existing shared Clan-invitation background with a Clan-specific crest
  target in Direct Chat;
- one Hall-local Scribe using the shared public Kingdom Knowledge Router plus
  only that Hall's roster and audience-filtered history.

Current summon labels are:

- AoE2WAR: `@Scribe` (`@Hall Scribe` remains a compatibility alias);
- Mystikal Clan: `@Mscribe`;
- Jim's Clan: `@Jscribe`;
- Legend Clan: `@Lscribe`;
- Julio/Alvarez Hall: `@JAscribe`.

The lit `S` composer control remains a one-message explicit invocation path and
uses the same Hall-local Scribe profile. A Hall Scribe can never receive another
Hall's roster/history merely because the public KKR is shared.


## Media Ingest V1.1

Clan Hall media is social-first rather than constrained by
the original conservative V1 limits. Hall posts accept up to
four media items, with images/GIFs and audio accepted up to
96 MB, video up to 192 MB, and 230 MB total per post. These
are extreme safety guards rather than normal product limits.

Remote media remains HTTPS-only, public-host/DNS guarded,
redirect bounded, timeout bounded, and stream bounded before
buffering. Large GIFs are silently converted to animated WebP
when Sharp can save at least 10 percent; otherwise the
original animation is preserved.

New chat attachment writes prefer the mounted managed-media
volume. Existing file:v1 attachments remain readable from the
legacy app-root directory, so no attachment data migration is
required before release. Storage headroom is evaluated on the
filesystem that will actually receive new writes.
