---
id: "aoe2war.app-prodn.session-b-r25-steam-postcutover-repair-20261108"
title: "Session B — R25 Steam OpenID Postcutover Repair, 2026-11-08"
type: "runbook"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["developers", "operators", "ai-agents"]
source_of_truth: "git"
authority: "steam-only-uid990-outbound-recovery-no-funded-release"
reviewed_at: "2026-11-08"
review_interval_days: 7
sensitivity: "restricted"
---

# Session B — R25 Steam OpenID Postcutover Repair, 2026-11-08

## Incident and impact

Four independent real production Steam callbacks at **2026-11-08 12:55–12:57 UTC** failed with the **same** bounded diagnosis:

- `AOE2WAR_NONFINANCIAL_OPENID_HOLD_STAGE:provider_post`
- `AOE2WAR_NONFINANCIAL_OPENID_HOLD_CLASS:FETCH_TIMEOUT`
- `AOE2WAR_NONFINANCIAL_STEAM_CALLBACK_HOLD_STAGE:openid_verification`

No OpenID assertion, user identity, Steam cookies, passwords or account tokens were exported. A user observed Steam Community **“Incorrect login”** and the AoE2WAR `auth=steam-error` callback after trying two legitimate accounts; this is direct evidence of a production login failure, **not evidence that either Steam account's password is wrong**.

The R25 exact-source public app release on 3032 (source `e0586a7b7c355c3b29037d78c71fe26d528d2475`, PID **2856449**, buildVersion `20261108044653-2983e18532`) had replaced the previous verified restricted website unit. The separate Steam-only egress refresh controller was still pinned to the prior **unit SHA, source SHA, build ID, buildVersion, PID, runtime restart admission and physical release receipt**.

The independently audited timer ran each minute but returned `HOLD:R25_WEB_UNIT_CHANGED`, refusing to populate `inet aoe2war_web_prod` `steam4` and `steam6`. Both 300-second sets eventually contained **zero entries**. Production Node OpenID verification HTTPS POST then timed out. The root cause is a **missing Steam-controller release enrollment in the website cutover**, not a need for unrestricted outbound egress or additional financial database privileges.

## Authorized repair: Steam-only exact-source v6 adapter

Installed source: `/usr/local/lib/aoe2war-web-prod/r25_steam_refresh_inplace_r25_v6.py`.

Byte-identical tracked source: `scripts/release/r25_steam_refresh_inplace_r25_v6.py`.

**SHA-256 (source):** `88343a6405e263e2227c94744e058b53fa4d067c4fd53070d99c15f43b5546ce`.

**Crucial properties:**

- Uses the preexisting immutable audited v5z implementation, pinned SHA-256 `3e54151c10ad39889a6341f000ae36dc1a89f9a3278608c918e707bd068fbb07` and original production safety controller SHA-256 `9799d8c9042dbd1875a2096ee1df6b8751347206cf8761d695aecf1e61894707`. No duplicated/improvised network ACL logic.
- Verifies the original 3032 unit SHA `1f2970c685e53d0f426b86baeb1910c4f73f346a6e18baf97b064ef1fae7bbe3` and deployed SHA `13958b7f63ed1342368e8ae9f4c8594268ae7725ad6910c757dd3b9b24c923a5` differ by **exactly four substitutions of the reviewed runtime path**.
- Binds Git source `e0586a7b7c355c3b29037d78c71fe26d528d2475`, BUILD_ID `bUr1xs_EMHgXFD-U-sZ4Z`, exact public version and root0600 original physical promotion receipt SHA `47a748c75444f561f476a261e534462cd9959a2706362e4380856ff93f503fe0`.
- The protected financial/system unit snapshot fingerprint remained **exactly** `6296fcf49fbc1d33f507c6a8339f87513f933948c0d86a7aa373cebe46071cfb`, matching the prior reviewed v5z policy despite the website replacement. The web egress nft shape remained `985f32c16f3db3c843a196093977c2e2f61aeb11ce67d5cb1ebddaf66cd710af`. The previously approved root-only production policy was not changed.
- Retains uid **990**, gid **984**, `NoNewPrivileges`, three exact bounded capabilities, unmodified UID990 final DROP rule, finite **300-second Steam-only** nft set elements, TLS/CA/SNI validation of each selected destination, independent root/unprivileged DNS samples and bounded address count.
- Does **not** alter PostgreSQL roles/grants, financial services, custody, keys, Wolo consensus, 3030, funded 8094/8095 or financial transactions. All financial release gates remain HARD HOLD.

**Root-protected v6 enrollment:**

`/etc/aoe2war/web-prod-v6/runtime-restart-admission.json` (0400; SHA-256 `4d081c701d59d58d15fc43b98a700c91eaad6d4294d6bef12c8c3ce1a89d0d4f`) binds PID, kernel start ticks, exact source and immutable financial snapshot.

`/etc/aoe2war/web-prod-v6/steam-refresh-policy.json` (0400; SHA-256 `9acb8cf2d91c43af8b05217cdf5e82054fc885d4ce3ffb1e89bfafb3a37a9f0d`) binds new adapter SHA, old guard, unchanged nft shape, exact Nginx site SHA, reviewed rollback PID, release receipt and financial snapshot.

Original physical receipt and unit remain untouched under `/root/aoe2war-session-b-inplace-promotion-20261108/`. The systemd refresh service uses `ProtectHome=yes`; root0600 byte-identical *copies* of those same two sealed proof files were installed at `/etc/aoe2war/web-prod-v6/`. An initial sandbox-inaccessible `/root` proof attempt properly failed with `PermissionError` **before** any nft mutation.

The refresh unit change was **only one ExecStart controller path**, from v5z to v6; original refresh unit SHA-256 `89991b952bf1588640299bcef2b4f48810596f947c4ec0f7020d93eb17de5c36`, current SHA-256 `c7a7731e30bb7887e58764dcbddda98128dee1ac83be826314e766c99f716605`. The original service is preserved in the root-only v6 policy directory. No web service restart was required for this egress repair.

## Physical acceptance

- Static source/policy selftest and exact-bound source verification PASS.
- Read-only protected snapshot and approved nft-shape parity PASS.
- Live native `aoe2war-steam-egress-refresh.service` returned **`PASS_STEAM_ONLY_REFRESH`** with 3 individually validated Steam destinations, 3 bounded nft entries, 300-second lifetime and `finance_authorized=false`.
- `aoe2war-steam-egress-refresh.timer` is enabled and active; **three consecutive successful refreshes** were independently observed by 13:15 UTC.
- A *harmless, deliberately unsigned/invalid* verification POST issued from actual confined UID990/GID984 to `https://steamcommunity.com/openid/login` returned **HTTP200**, TLS established in ~33ms, total response ~253ms. This demonstrates live outbound connectivity; it does **not** authenticate a person or prove a complete browser return.
- Modern R25 website stayed PID **2856449**, original 3030 stayed PID **2625090**, validator stayed PID **1009**; all zero new restarts.
- Negative security condition remains: nft Steam sets permit only certified destinations; arbitrary egress remains denied. No 8092 fallback and no funded 8094/8095 activation.

## Outstanding operational acceptance and failure policy

The user must complete an actual sign-in for each Steam account and verify the return-to-AoE2WAR cookie/session, admin privileges only on authorized admin identity, and no cross-account linking. **Until this succeeds, auth is infrastructure-repaired but end-to-end account acceptance remains HOLD.**

Steam Community displaying *“Incorrect login”* independently of the AoE2WAR callback may indicate a stale Steam browser account session. The owner can sign in afresh at Steam Community and then initiate a **new** OpenID transaction. Do not use old callback URLs. Never request or paste Steam passwords, cookies, OpenID assertions or provider tokens in debugging records.

The v6 adapter is intentionally pinned to this exact build, PID, unit and protected snapshot. Any future website restart or deployment must **re-enroll a new bounded admission** rather than editing this policy ad hoc, extending Steam TTLs, or weakening the financial fence. The rollout controller must add Steam egress re-admission as a *prerequisite* for signed-in browser cutover, not an optional follow-up.

Canonical cross-lane register: `Emaren/app-prodn` #1108. Financial work remains under Session A's `Emaren/wolochain` #5.

## Follow-up: Scribe account callback timeout after infrastructure repair

At **13:23:23 UTC, 2026-11-08**, a new real production callback failed again at `openid_verification:provider_post` with `FETCH_TIMEOUT`. The owner reported **admin Steam login succeeded**, while the separately intended **AoE2WAR Scribe** account still returned `auth=steam-error&detail=STEAM_SIGN_IN_FAILED`. That means this specific attempt failed **before** scoped account lookup, user creation and session cookie signing. Do not attribute this failure to missing Scribe database identity, a wrong password or incorrect admin privileges without independent evidence.

The bounded timer usually succeeded, but its **13:22:34 UTC** run was held by `STEAM_REFRESH_ALTERED_NON_STEAM_STATE` and the **13:23:36 UTC** run succeeded. The 300-second Steam allowlists retained entries, and currently sampled Steam DNS answers were present in them. The correlation does **not** prove the failed callback selected an allowed IP or prove an exact CDN/root cause.

A harmless *invalid* Steam OpenID verification POST was executed with the real production process's strict `NODE_OPTIONS`, exact guard and environment (never exporting, writing or displaying secrets), uid990/gid984, from the root-sealed R25 working directory. **7/7 isolated calls succeeded with HTTP200 in 172–327 ms**. This verifies transport at that moment, not actual signed OpenID verification success or long-lived Next.js connection pooling.

To mitigate observed intermittent *transport* failures without changing identity/security decisions, Session B prepared a separate source fix in `lib/steamAuth.ts`: the already validated, browser-bound OpenID `check_authentication` POST may retry **once only** on enumerated network timeout/reset classes; each attempt independently has an 8-second ceiling, the body and destination remain identical, and actual `is_valid:true` is still required. No retry is allowed after Steam rejects the assertion, returns `is_valid:false`, or the production guard refuses the request. The second attempt does not update users or create sessions unless Steam actually verifies the assertion. No assertion, Steam ID or account credential is written to logs.

The fixture-level regression suite now includes successful single-retry, exhausted double-timeout and negative guard/provider rejection cases. These source tests **do not certify deployment**. Until a CI-qualified new runtime is physically promoted and the owner signs in successfully, the current public build remains `e0586a7b7c355c3b29037d78c71fe26d528d2475` and Scribe end-to-end login acceptance remains **HOLD**.
