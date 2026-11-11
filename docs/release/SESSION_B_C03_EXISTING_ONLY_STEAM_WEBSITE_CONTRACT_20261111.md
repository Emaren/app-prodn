---
id: "aoe2war.app-prodn.session-b-c03-existing-only-steam-contract-20261111"
title: "Session B C03 existing-user-only Steam website contract"
type: "runbook"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["developers", "operators", "ai-agents"]
source_of_truth: "git"
authority: "nonfinancial source only, session A sole FINANCIAL writer, no production admission"
reviewed_at: "2026-11-11"
review_interval_days: 7
sensitivity: "restricted"
---

# Session B C03 existing-user-only Steam website contract

## Hard existing authentication boundary

Canonical A handoff: https://github.com/Emaren/app-prodn/issues/1212#issuecomment-6806314571.
The precise 21-field original reader body SHA is
53816fe020df6cdc5e5d969b74c1d0e16490203c5f078b24419ea8eb95e40d84.
B did not edit any FINANCIAL source.

A distinct source-only runtime profile `nonfinancial-c03-existing-only-v1`
now selects B's reader/nonce adapter BEFORE legacy getPrisma, without changing
the existing deployed profile. C03 source also branches session GET/POST,
user-me GET, and presence ping to avoid constructing the legacy protected
Prisma pool. PostgreSQL access now lives only in the C03 server-only API
adapter `lib/c03ProductionAuthServer.ts`, never imported by browser-shared
`lib/productionAuth.ts`. The legacy shared functions explicitly HOLD if
the restricted C03 profile reaches them instead of loading Node-only SQL
dependencies into the client browser graph. User-me POST explicitly returns 503 for account/profile edits.
C03 refuses a guest/preview/shadow profile, disabled finance runtime fence,
nonproduction mode or nonisolated web. Logout preserves existing signed
session-clearing and in-memory offline barrier. After the original provider check and exact
browser state cookie/nonce verification, B calls ONLY
`c03_auth_ro.resolve_existing_steam(verified Steam ID)`, then the
original 21-field `c03_auth_ro.read_user(existing UID)` projection through a
restricted **reader-only database login**. The returned UID/admin type must
match exactly. B consumes SHA256(verified OpenID response_nonce) via INSERT
into the DISTINCT NONFINANCIAL database, whose unique primary key rejects
replays; only after success may the existing secure session signer mint
a cookie. No write to protected `public.users` is allowed.

The independently scoped nonfinancial presence writer updates only
`c03_b_sidecar.user_presence`; never `public.users.last_seen`.
A requested email change in the restricted session maintenance path fails
closed instead of silently persisting a change in the old users table.
Provider persona updates remain unmodified/deferred until a separately
qualified nonfinancial persona sidecar; do not claim full feature parity.

**Behavior**:
- Existing verified linked Emaren admin: unchanged UID and admin=TRUE.
- Existing verified linked ordinary Scribe: unchanged UID and admin=FALSE.
- First-time Steam registration: fail closed; no new user and no signed cookie.
- Existing unlinked account: linking denied; no users sequence change.
- Existing logged-in DIFFERENT UID: no account switch/link, sign-in denied.
- Unknown/ambiguous/underverified Steam ID, replay/sidecar outage/stale or
  forged provider assertion: no signed cookie.
- Session/presence update: only nonfinancial sidecar with independently
  scoped credentials; no protected users UPDATE, touch_session or original
  SECURITY DEFINER fallback.
- Login READ user endpoint uses reviewed read_user projection; never include
  legacy token field, direct broad users SELECT, or financial table access.

**Not physically admitted:** this source requires installed reader facade with
all 21 exact field types, explicit reader HBA/ACL fencing, a **separate
nonfinancial database** with audited nonce-writer and presence-writer roles,
real sidecar schema and current A object/ACL baseline. The B-auth-sidecar SQL
is REVIEW_ONLY. The existing suite's other session, user-me, admin and ping
call sites still require exact deployed browser/SQL acceptance before
production C03 switch. Running source fixtures does not verify real OpenID,
Steam signatures, admin/nonadmin cookies, or data-plane permissions.

B must obtain independent A acceptance for new sidecar and read identities
and give A the exact source HEAD. **A alone** changes FINANCIAL grants,
definers, roles, sequences/HBA and refreshes the post-B premaintenance census.
Any release authorization must exclude simultaneous V22 source/timer install.

**Physical acceptance:** real Emaren admin and ordinary Scribe existing-user
Steam callbacks and session/user-me; no new Scribe account; unknown/linking
rejections; nonce collision; original protected users/sequence/lastSeen byte
and transaction counts unchanged; sidecar positive; exact 3032 rollback; all
protected finance ports closed. HOLD until all genuinely observed.
