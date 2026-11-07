---
id: "aoe2war.app.session-a-r25-public-nonfinancial-recovery-v5u"
title: "Session A R25 Public Nonfinancial Recovery and Steam v5u Admission"
type: "reference"
status: "draft"
owner: "aoe2war-web"
systems: ["aoe2war"]
audience: ["developers", "operators", "ai-agents"]
source_of_truth: "git"
authority: "nonfinancial-emergency-website-recovery-source-only-no-funded-release"
reviewed_at: "2026-11-07"
review_interval_days: 7
sensitivity: "restricted"
---

# Session A R25 Public Nonfinancial Recovery and Steam v5u Admission

## Actual production failure

At 18:43 UTC Nov 7, 2026, screenshots established failed Clan Halls, missing managed avatars, account and Traffic 405/500, plus betting display failures. Running 3030 and 3032 both connect to local database aoe2hd_db; 3030 uses the broad historical DB role and 3032 uses an isolated web role that has SELECT on only 25 of 190 public tables. Raw Clan, users, trophies and replay projections are not granted. This is not a second or incorrect production database.

Legacy 3030 public/uploads is linked to the full managed-asset volume. R25 staging has no public/uploads and its systemd InaccessiblePaths isolates the whole volume. The current aoe2war clan row exists in that same HD database.

## Exact physical nonfinancial website bridge (HEL1)

Production Nginx site baseline SHA256 before repair:
35bbfcbe9e502bc59bc14e89014c0a20c01a272ff68743259e598dfbdec29c9f

First image/Clan HTML recovery config SHA256:
9571d6eda0c7bc717dc4a37beb7e978569994195e9355bc056e0c69556d0184b

Final guarded nonfinancial bridge active site SHA256:
9192a8e775b4e94e59701ba0f7ad6e5373a88aa97f5a7c0f3f633b4ea3bfabc7

Associated HTTPS Origin and image upstream map SHA256:
e6c598cb63bdfa6c5b84623494fe5d337cfea5ecd8abb574ee59071ba85af3ea

Root-only original and intermediate images retained at /root/aoe2war-public-recovery-20261107, each under 0600 file access and 0700 parent.

All six public selectors remain on R25 3032, with original 3030 PID2625090 preserved. Nginx adds GET/HEAD-only fallback for Clan Halls, Clan JSON, public uploaded assets, and missing original Next static chunks. Next image optimization is mapped to old 3030 only for managed /uploads paths. Exact reviewed nonfinancial user appearance/preferences, presence, Traffic speed telemetry and authenticated inbox reads are bridged to the existing 3030 app. Strict HTTPS Origin plus bounded body sizes are required for named nonfinancial mutations. All other mutating routes retain their original Nginx denial.

The original legacy GET /api/bets schedules background market ensure and may write financial database rows. It is expressly NOT bridged. Restricted R25 GET /api/bets remains HTTP500 until replaced by pure nonfinancial read models. No raw user/finance SELECT grant was issued.

Two guarded Nginx reloads and physical source-bound health checks passed: public home200, Clan Hall200 99469 bytes, managed WebP200 385118 bytes, belt PNG200 2797072 bytes, image optimizer200, old legacy Clan JS200, public Osmosis pool display200, protected anonymous reads401, foreign Origin mutation403, anonymous same-origin mutation401, bad telemetry400, continued GET/route refusal405. No fully authenticated positive browser mutation acceptance claimed. No web process restart; funded 8094/8095 inactive; no WOLO transfer.

## Steam security consequence

The previous Steam v5s root-only service correctly reported HOLD:R25_WEB_UNIT_OR_NGINX_CHANGED once website recovery altered the SHA-pinned Nginx site. Five-minute NFT Steam allowlist expired; no one should suppress this guard.

New distinct v5u source takes green v5t expiry-read retry and strict prior 300-second CA/SNI checks, with a fresh exact-current Nginx and image/Origin-map SHA plus both root-protected immutable site preimages. Original release receipt, original read-only approval, current R25 3032 runtime and UID990, 3030 rollback, C03 hourly systemd observer, NFT shape and held funded service units remain source-bound. It recognizes six original public R25 selectors plus one explicitly approved static-first bridge. It must use new root 0400 admission and new root 0400 policy, separate from v5s/v5t.

Source/test/CI success does not equal production Steam activation. Native restricted systemd cutover, exact public/runtime approval, mandatory live Steam TLS/SNI expiry refresh PASS and rollback receipts must be physically validated first.

## Hard HOLD

Formal funded C01-C09 all remain HOLD. No C03 global writer containment, no C06 coherent backup, no C07 recovery, no C08 ratified authority or C09 transaction permit was created. This is a public nonfinancial continuity repair, not a funded release or permission to switch databases.
