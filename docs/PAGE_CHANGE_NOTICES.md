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
reviewed_at: "2026-08-14"
review_interval_days: 90
sensitivity: "internal"
---

# Page Change Notices

AoE2WAR uses small muted navigation dots to tell a returning browser that a
Kingdom page has materially changed since that browser last visited that version.

## Ownership

- `lib/pageChangeNotices.ts` is the canonical version registry and persistence
  contract.
- `app/AppShell.tsx` renders the aggregate dot on the `🏰` control and the
  per-page dot inside the Kingdom menu.
- Persistence is browser-local under
  `aoe2war:page-change-notices:v1`.

## Product contract

A page notice represents meaningful UI, content, or product-surface change. It
is deliberately separate from chat unread counts, Workshop live state, requests,
chain state, and financial state.

Opening the Kingdom menu does **not** clear a notice.

A notice clears only when the browser actually visits that route or one of its
child routes. The stored value is the page's current version token, so a later
material update can surface the dot again by bumping that route's version.

The `🏰` header control carries one muted grey dot whenever at least one Kingdom
page has an unseen version. Each unseen page carries its own muted grey dot in
the upper-right of its menu row.

This is intentionally a lightweight per-browser orientation feature. It does
not require authentication, database state, WOLO state, or a server write.

## Current release notice

The first registered notice is:

```text
/round-chamber = 2026-08-14-senate-v2
```

It corresponds to the Roman/Spartan Senate presentation overhaul of the Round
Chamber.

## Adding a future notice

For a meaningful page update, add the route to `PAGE_CHANGE_NOTICES` or bump its
existing version token.

```ts
{
  href: "/workshop",
  version: "2026-08-20-forge-stream-v3",
}
```

Do not create notice churn for typo fixes or invisible implementation-only
changes.

## Verification

1. Clear `aoe2war:page-change-notices:v1` in local storage.
2. Open any route other than the changed page.
3. Confirm a muted dot appears on `🏰`.
4. Open the Kingdom menu and confirm the changed row has the muted upper-right
   dot.
5. Close and reopen the menu; the dot must remain.
6. Visit the changed page.
7. Reopen the Kingdom menu; that page's dot must be gone.
8. Reload; the visited state must persist.
