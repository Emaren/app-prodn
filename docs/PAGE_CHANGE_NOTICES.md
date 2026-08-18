---
id: "aoe2war.app-prodn.docs-page-change-notices"
title: "Page Change Notices"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "product-contract"
reviewed_at: "2026-08-18"
review_interval_days: 60
sensitivity: "internal"
---

# Page Change Notices

## Gray Dot V2

AoE2WAR uses small muted gray navigation dots to tell a returning user that a
Kingdom page has materially changed since that user last saw the current
edition.

Gray Dot V2 is durable for authenticated users and lightweight for anonymous
visitors. It is separate from chat unread counts, financial alerts, chain
alerts, and transient live activity.

## Canonical implementation

- `lib/pageChangeManifest.generated.ts` is the generated source-change manifest.
- `lib/pageChangeNotices.ts` exposes the client notice contract and anonymous
  `localStorage` fallback under `aoe2war:page-change-notices:v2`.
- `lib/pageChangeServer.ts` owns authenticated persistence and curated
  content-revision bumps.
- Prisma `PageChangeRevision` stores the current source/content edition.
- Prisma `UserPageChangeSeen` stores each authenticated user's exact seen
  edition and `seenAt`.
- `app/AppShell.tsx` renders the aggregate castle dot and per-route menu dots.
- Command Tower/admin surfaces may expose seen/unseen history for operators.

## Covered Kingdom routes

Gray Dot V2 covers 19 routes:

`/kingdom`, `/oracle`, `/leaderboard`, `/champions`,
`/national-champions`, `/clans`, `/academy`, `/market`, `/ai`,
`/bounties`, `/forum`, `/radio`, `/workshop`, `/game-stats`, `/traffic`,
`/kingdom-forge`, `/round-chamber`, `/statistics`, and `/speed`.

`scripts/generate_page_change_manifest.py` owns the source fingerprints.
Do not hand-edit `pageChangeManifest.generated.ts`.

## Two change rails

### Source/UI change

A meaningful page-specific source change changes the route's generated
`sourceVersion`. `syncPageChangeReleaseManifest()` persists the new edition and
its change time/reason.

### Curated content change

Meaningful DB/editorial publication that does not require source code changes
uses `bumpPageChangeContentRevision(prisma, href, reason)`. This increments the
server-side content revision.

Volatile counters, transient rows, and ordinary runtime activity must not create
notice churn merely because values changed.

## Seen semantics

For an authenticated user, a route is unseen when stored
`UserPageChangeSeen.sourceVersion` or `contentRevision` differs from the current
`PageChangeRevision`.

Visiting the route marks only that current edition seen. A later source or
content revision can surface the dot again.

Brand-new accounts are initialized to the current release baseline so they do
not inherit every historical gray dot.

For signed-out visitors the client retains the V2 browser-local fallback.
Opening the Kingdom menu does not clear a notice.

## Presentation contract

- `🏰` carries one restrained aggregate gray dot when at least one Kingdom route
  is unseen.
- Each unseen route may carry its own muted dot inside the Kingdom menu.
- The public meaning is only: **this place changed**.
- Internal reason/fingerprint text stays out of the normal player UI.

## Release verification

When changing the V2 contract:

1. update implementation/tests;
2. regenerate source fingerprints where applicable;
3. preserve authenticated seen receipts unless an intentional migration says
   otherwise;
4. keep new-account baseline behavior;
5. keep anonymous fallback non-blocking;
6. run Page Change V2 tests and the normal protected release gate.

The August 2026 V2 migration intentionally preserved the existing Round Chamber
notice rather than silently clearing it.
