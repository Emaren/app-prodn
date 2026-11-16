---
id: "aoe2war.app-prodn.session-b-ai-system-persona-steam-badge-truth-20261108"
title: "Session B — AI System Persona Steam Badge Truth, 2026-11-08"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["developers", "operators", "ai-agents"]
source_of_truth: "git"
authority: "system-persona-identity-and-authenticated-human-badges"
reviewed_at: "2026-11-16"
review_interval_days: 7
sensitivity: "restricted"
---

# Session B — AI System Persona Steam Badge Truth, 2026-11-08

The owner observed the player directory claiming that The AI Scribe, Grimer, Hall Scribe and Challenge Protocol were "Steam linked" and "Replay verified". The current source rendered SteamLinkedBadge unconditionally for any claimed player, regardless of whether the entry had a Steam ID. A second profile page incorrectly equated verificationLevel greater than zero with Steam-linked evidence.

The read-only production HD PostgreSQL census verified that all four exact reserved system UIDs exist, none has a linked Steam ID, and none is an administrator. A separate non-admin Steam login cannot be linked to the AI Scribe merely from the Steam account email: Steam OpenID does not return email addresses, and no application user record matches the supplied second-account email. A human second Steam identity must never be merged into a reserved internal AI UID.

The source fix uses lib/internalSystemAccounts.ts exact UID classification in both the claimed player directory and basic claimed profile: system UIDs show Automated persona / Internal system profile and no false Steam Linked badge. Genuine profiles only show Steam Linked when a Steam ID is present and the UID is not reserved; the directory's Replay verified badge now additionally requires actual replay evidence. This is a read-only presentation fix, with no user/auth/Steam record, privilege or financial change.

The separate owner-desired human test operator pairing remains HOLD in App issue #1245. That must be server-verified from the second Steam-authenticated session and independently authorized, preserving both UIDs, permissions and explicit attribution.

Source regression: 37 targeted UI/Traffic tests PASS. Source change requires fresh exact-head CI and a new Steam-safe website admission before public acceptance.

## 2026-11-16 — B source-backed historical re-review

Review basis: the retained original document and the current canonical App main `d36e9f98e44b0a4de438c5cc623706873c333ca5`, compared to source anchors: `lib/internalSystemAccounts.ts` Git blob `19a25ce90640ccc51fc0b7f0dda2479c7e2d2019`; `lib/publicPlayerDirectory.ts` Git blob `725896cc7b1b1264a9a7ee762049a007fdd14e31`.

The reserved-system UID classification helper and public directory read model are present. A claimed automated account must not inherit an authenticated human Steam badge by presentation alone. This is not a new Steam authentication, replay verification or FINANCIAL proof.

Disposition: **B-owned nonfinancial/source-history review only.** Original dated release and CI evidence remains historic; this review is not a new physical acceptance, privileged B release permit, protected Steam/FINANCIAL admission, or authorization for the pending Ember Reign campaign singleton. Preserve the source/receipt distinction.
