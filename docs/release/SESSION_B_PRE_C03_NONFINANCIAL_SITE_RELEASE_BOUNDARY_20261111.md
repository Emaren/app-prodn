---
id: "aoe2war.app-prodn.session-b-pre-c03-nonfinancial-site-release-boundary-20261111"
title: "Session B existing-profile website release before C03 finance quarantine"
type: "runbook"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["developers", "operators", "ai-agents"]
source_of_truth: "git"
authority: "SOURCE-ONLY decision; no HEL1 or FINANCIAL producer authority"
reviewed_at: "2026-11-11"
review_interval_days: 7
sensitivity: "restricted"
---

# Session B existing-profile website release before C03 finance quarantine

## Two exclusive authentication profiles

**Option L (existing production auth):** AOE2WAR_RUNTIME_PROFILE=nonfinancial-production-v1. This is the already-live website Steam contract with verifySteamCallback signed OpenID/browser state and aoe2war_auth_v1.complete_steam_login, touch_session and read_user. **It does write** existing public.users auth/presence fields and can consume original users_id_seq on new registration. Therefore it is **NOT compatible** with activated C03 finance writer quarantine. It must NOT be claimed to offer zero protected database mutations or use the broad aoe2war_r25_web_ro reader as a C03 replacement. A NORMAL website-only code release before C03 may preserve this exact already-live authentication profile with independently reviewed source, unchanged original auth DB roles/grants/functions and separately authorized HEL1 stage/activation, no funding/settlement activation, C04 masks, and distinct existing Emaren/Scribe browser acceptance. New account registration is not a release-acceptance test because it changes registered count and the original sequence. A is the only FINANCIAL source writer; any A C03_AUTH_PRESTAGE_ONLY step is separate and cannot run concurrently as an unreviewed implicit change.

**Option C (future C03 existing-only quarantine):** AOE2WAR_RUNTIME_PROFILE=nonfinancial-c03-existing-only-v1 is strict opt-in, never a silent fallback. A must independently install narrow c03_auth_ro.resolve_existing_steam(text) RETURNS TABLE(uid text,verification_level integer) and original exact 21-field read_user(text). B independently checks direct SQL session_user=current_user=c03_auth_reader in the protected read database and independent direct nonce/presence writer logins for a *distinct NONFINANCIAL sidecar database*, on every connection. Only cryptographically verified Steam OpenID+state/fresh signed nonce can resolve an existing linked UID; UNIQUE nonce digest INSERT rejects replay before cookie signing. Unknown/unlinked users, registration, account linking, and original public.users/sequence writes fail closed. This option needs A's exact real HBA/role/sequence and B sidecar prestage, real two-role authenticated browser/rollback acceptance, and refreshed protected object/ACL/sequence baseline AFTER installation. No C03 reader role, facade, HBA rejection or sidecar is presently physically installed on HEL1. DO NOT ACTIVATE OPTION C.

## Same-slot physical permission contract for either option

1. Actual current-main source-pinned Linux x86-64 Node22 runtime, independently verified SHA and immutable root-owned staging; original 3032 runtime unit, bytes, environment, Steam profile and inverse retained. NO third Next process; preserve rollback 3030, emergency 3033 and PAPER9447.
2. New independently enrolled HEL1 production signer and exact root-trusted V22 SOURCE_INSTALL+sentinel/inverse with fresh owner/Central one-use source, host, boot and nonce permit. C's owner-approved M1 LOCAL DEV-GO key does NOT authorize HEL1 installation. Never reuse historical expired permits.
3. Verify original protected Steam timer/lease, seven processes, C04 masked services, all financial ports 8092-8095 closed, no financial grants/DDL, source/BUILD_ID and Nginx protected selectors unchanged. Independent ACTIVATE_ONLY is mandatory, including same-slot bounded stop/start and rollback.
4. Genuine existing Emaren admin and ordinary Scribe Steam callback, two signed UIDs/roles, GET+POST session continuity, user-me/admin reads, 39-link Kingdom menu, actual avatar/media bytes, canonical Traffic UTC certified gaps and source archive, featured warriors and safe API 200/401/403/503/error messaging. No new registration or account linking.
5. One signed fresh activation, full real test, exact original 3032+Steam inverse, then a SECOND activation under distinct owner/Central nonce and second real test+inverse; source/host/user/rollback receipts. On any failure restore original 3032, never repoint Nginx to 3030.

## Source-only decision

B_NORMAL_NONFINANCIAL_SOURCE_RELEASE_BEFORE_C03=CONDITIONAL_SOURCE_ONLY. Website/Watcher/PWA/Renaissance/PAPER read-only improvements can be released before seven Chain gate closures **if** ordinary current production auth stays unchanged, financial entrypoints remain fail-closed, and an independent owner/Central B release permit is issued. This is not physical release authority and is not a SQL producer quarantine. Existing SECDEF auth and registration remain active until A's future C03 barrier.

B_C03_QUARANTINED_AUTH_RUNTIME=HOLD_A_ROLES_SIDECAR_HBA_AND_REAL_BROWSER

B_HEL1_SOURCE_INSTALL=HOLD_DISTINCT_PRODUCTION_SIGNER_AND_ROOT_AUTHORITY

B_PHYSICAL_TWO_ROLLBACKS=HOLD_NOT_PERFORMED

The last B HEL1 read-only witness had C04 settlement units masked, financial ports 8092–8095 closed, 3032 /players=200 and /api/bets=503. A later, independently admitted preflight MUST recheck these, not inherit them as truth.
