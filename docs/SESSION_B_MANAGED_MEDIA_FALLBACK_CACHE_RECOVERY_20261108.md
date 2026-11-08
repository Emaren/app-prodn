---
id: "aoe2war.app.session-b-managed-media-fallback-cache-recovery"
title: "Session B Managed Media Fallback Recovery — Source and Native Avatar HOLD"
type: "runbook"
status: "draft"
owner: "aoe2war-web"
systems: ["aoe2war"]
audience: ["developers", "operators", "ai-agents"]
source_of_truth: "git"
authority: "source-only-media-cache-no-db-owner-or-physical-release"
reviewed_at: "2026-11-08"
review_interval_days: 7
sensitivity: "restricted"
---

# Session B Managed Media Fallback Recovery — Source and Native Avatar HOLD

## Scope, ownership and source dependency

Session B owns website avatars, navigation, browser proof, release source and
Traffic UI. Session A exclusively owns C03 physical PostgreSQL owner/grant
changes, Wolo financial isolation, C04/C05 finality, signer and custody
permissions. This worktree is stacked on Session B App PR #1236 at
76d8027de6ddffdcd30e0c3a1710efdd7d61f148, itself stacked on the
R25 deployed-source ancestor and public presentation truth repair.

It does NOT modify previously hash-pinned 3bc9/3032 runtime bytes. Its code
does NOT grant any database permissions or start a candidate listener.

## Production defect proven by actual response headers and bytes

Read-only HEL1 origin GET at November 8, 2026, around 04:36 UTC:

| Target | Old 3030 image proxy | Modern 3032 image proxy | Modern 3032 behavior |
| --- | --- | --- | --- |
| avatar/sniper?size=card | direct-managed | direct-public | static portrait instead of assigned managed image |
| avatar/dil-pascana?size=card | direct-managed | direct-public | generic silhouette despite managed portrait existing in old app |
| avatar/missing-public-r25-test-avatar?size=card | direct-public | direct-public | correct generic silhouette as deliberately unassigned |

All six responses returned HTTP 200 and
Cache-Control: public, max-age=86400, stale-while-revalidate=604800.
The exact modern Dil_Pascana fallback and deliberately unknown avatar had
the same 59818-byte generic image hash prefix, rather than the old 3030
managed portrait. A 200 response is therefore not sufficient avatar
acceptance, and a fallback can remain cached for a full day with stale
revalidation for another seven days after managed-media access recovers.

The real missing-avatar permission on restricted R25 role is a separate
Session A physical PostgreSQL privacy/permission fence review. The
URL-only Prisma source projection from B PR #1232 alone cannot grant access.

## Changes and cache-policy truth

Code in lib/mediaFallbackCachePolicy.ts defines three explicitly separated
cases:

- Managed verified, versioned image: 24-hour max-age plus prior seven-day
  stale revalidation, preserving performance of correct image bytes.
- Normal unassigned fallback: public 60-second TTL with must-revalidate and
  **no stale-while-revalidate**. The browser quickly rechecks after a
  newly published assignment without requiring a manual cache clear.
- Managed lookup error (e.g. PostgreSQL permission denial): private
  no-store, so a temporary 200 silhouette is never cached as a permanent
  valid portrait. Unknown cache reasons also fail closed to no-store.

At the outer Next media GET handler, a resolved asset URL matching the
declared static fallback marks either the 200 direct-public response or
fallback 307 redirect accordingly. A thrown lookup marks either result
no-store. The response carries X-AoE2WAR-Media-Fallback: 1, independent
of image size, source file path or whether the image still happens to return
HTTP 200. Genuine assigned images preserve their versioned cache, and
their direct-managed proxy and byte delivery remain unchanged. Living
Kingdom presence-specific 300-second opaque/avatar policy stays separate;
its behavior is not falsely certified by this test.

The source makes zero SQL writes, no net transport changes, does not alter
image contents, notifies no signer and never makes WOLO claim authority.

## Review and acceptance

tests/managed-media-fallback-cache-recovery.test.mts validates the policy,
error fail-closed mode, normal/failure GET branches, redirect handling,
managed route headers and static path guard. Local Node 24 canonical
alias-loader run with the reviewed production source projection tests:
**25/25 PASS**, zero failures. Direct bare Node did not resolve the
existing @/lib alias dependency and was not accepted as a passing run;
the canonical repository alias loader was used to qualify it.

New CI must independently validate exact branch source, production compile,
managed-media resolver unit tests, docs registry, 88-route provenance
census, GitGuardian, and real browser images. Successful source CI alone
is NOT full-site acceptance.

### Physical acceptance gate — HOLD

1. Session A independently reviews source-safe managed-media read
   projection and verifies the live restricted role can read only
   approved public image URL data without private uploader fields, no
   raw gift or financial table privileges and negative DML proof.
2. Session B stages a new exact-source and exact-BUILD_ID immutable
   candidate using the reviewed R25 3033 admission procedure only
   after HEL1 headroom and rollback are sufficient. Never reuse an
   old 3bc9 SHA acceptance for this candidate.
3. Session B verifies at least three distinct real managed-avatar
   targets on BOTH original and candidate with matching SHA256
   image bytes, correct X-AoE2WAR-Media-Proxy: direct-managed,
   content type, size and negative generic-silhouette fallback.
4. Browser guest/auth acceptance separately verifies image paint,
   navigation and original 39 Kingdom dropdown links; response
   Cache-Control must be right for both managed and missing/errored
   assets, plus a real cache-revalidation test.
5. Nginx public selectors, Steam lease, role/host preimage, guarded
   one-time cutover and rollback require physical protected receipts;
   C03–C09 remain Session A exclusive, financially HARD HOLD.

Latest read-only host checkpoint around 04:34 UTC: existing 3030 and
3032 healthy, no 3033 or funded 8094/8095 listeners, HEL1 MemAvailable
approximately 1.58 GiB and used swap approximately 6.29 GiB. This does
not meet the existing conservative canary headroom requirements.

**Current status: source repair, no physical 3033 start, no production
cutover, no database change, no WOLO transfer.**
