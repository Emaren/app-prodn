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
reviewed_at: "2026-08-21"
review_interval_days: 90
sensitivity: "internal"
---

# Clan Halls

Clan Halls are persistent house rooms built on the `Clan`, `ClanMember`,
`ClanMessage`, and `ClanMessageReaction` models. The generic Hall remains the
small baseline; `/clans/aoe2war` is the flagship laboratory where capabilities
are proven before other houses opt in.

## Role language and authority

Database and authorization semantics remain intentionally conventional:
`owner`, `admin`, and `member`. Presentation is separate. The user-facing label
for the `owner` role is **The King**. This is copy only; permission checks,
queries, seed data, and storage continue to use `owner`.

Global AoE2WAR site administrators may administer a Clan Hall without being
silently treated as clan members. Membership truth and site-admin authority are
separate contracts.

## Flagship feature profile

`lib/clanHallFeatures.ts` is the explicit capability registry. V1 Halls keep
their existing visual presentation while receiving the common minimum operating
layer: the on-site Invite Door and one Hall-local Scribe. The AoE2WAR Hall
remains the flagship laboratory and additionally enables realtime invalidation
and optimistic message presentation with visible retry on failure.

Presence, typing, delegated recruiting, replies, pins, search, media, and replay
cards remain explicit later capabilities rather than implied global behavior.

## Realtime contract

`lib/clanHallEvents.ts` owns the process-wide event bus and
`/api/clans/[slug]/events` exposes the stream only for enabled Halls. Events are
content-free invalidations: message bodies and private audience content never
ride the event stream. The normal permission-aware Hall GET remains the source
of truth. Baseline Halls retain their existing poll; realtime Halls keep a
60-second recovery poll behind SSE.

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
auxiliary rail on wide screens.

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
opens one compact tray containing translation, the reaction palette, and only
the edit/delete actions the current viewer is authorized to use. Existing
reaction summaries remain attached to the message only when reactions exist.

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
