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
reviewed_at: "2026-08-16"
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

`lib/clanHallFeatures.ts` is the explicit capability registry. Baseline Halls
keep the existing behavior unless a capability is enabled. The AoE2WAR Hall
currently enables realtime Hall invalidation, optimistic message presentation
with visible retry on failure, and the on-site Invite Door.

Presence, typing, delegated recruiting, Hall Scribe, replies, pins, search,
media, and replay cards remain explicit later capabilities rather than implied
global behavior.

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

1. Hall leadership searches existing AoE2WAR users.
2. Sending an invitation creates a normal direct conversation/message.
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

The AoE2WAR flagship Hall enables `hallScribe`; baseline Halls do not. Hall
Scribe has the reserved system UID `aoe2hd_ai_clan_aoe2war_hall_scribe` and
agent slug `aoe2war-hall-scribe`. It is excluded from human/competitive counts
and is not inserted into the Clan roster.

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
