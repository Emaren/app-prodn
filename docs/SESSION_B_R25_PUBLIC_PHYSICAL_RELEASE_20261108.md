---
id: "aoe2war.app-prodn.session-b-r25-public-physical-release-20261108"
title: "Session B — R25 Nonfinancial Public Physical Release, 2026-11-08"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn", "traffic-api"]
audience: ["developers", "operators", "ai-agents"]
source_of_truth: "git"
authority: "physical-public-website-release-only-financial-gates-held"
reviewed_at: "2026-11-08"
review_interval_days: 7
sensitivity: "restricted"
---

# Session B — R25 Nonfinancial Public Physical Release, 2026-11-08

**Physical UTC date:** 2026-11-08. **Track:** application + public read models, not funded WOLO. **Authority:** Session B website-only. This is an installed production event, not a statement that C01–C09 financial gates are accepted.

## Exact immutable release identity

| Item | Physical value |
| --- | --- |
| Public HTTP origin | `https://aoe2war.com` |
| Activated Next.js port | `127.0.0.1:3032` |
| Exact application source commit | `e0586a7b7c355c3b29037d78c71fe26d528d2475` |
| Build ID | `bUr1xs_EMHgXFD-U-sZ4Z` |
| Public buildVersion | `20261108044653-2983e18532` |
| GitHub Actions artifact | `Emaren/app-prodn` Actions #13604946029 |
| Artifact ZIP SHA-256 | `086c0729a650ff75eb5e3cf93936591a8b7ea0cfa86797feaace02bf414b155e` |
| Protected runtime path | `/var/lib/aoe2war-web-prod-e0586a7b7c35` |
| New systemd working directory SHA-256 of unit file | `13958b7f63ed1342368e8ae9f4c8594268ae7725ad6910c757dd3b9b24c923a5` |
| Original restricted R25 unit SHA-256 | `1f2970c685e53d0f426b86baeb1910c4f73f346a6e18baf97b064ef1fae7bbe3` |

The runtime archive was verified by outer and inner hashes, full source/manifest/build-ID checks, archive-path and relative-symlink admission, and a protected source-stage receipt. Release used an **in-place replacement of the existing restricted 3032 service**, not a third process or an in-place resize of HEL1.

## Physical production acceptance

- 3032 loopback, HTTPS Nginx origin and public Cloudflare edge independently returned the **exact same new buildVersion**.
- Nine bounded loopback website probes passed: home, Betting Hall, staking, Traffic, players, AI Council, rivalries, battle archive and historical public bet API.
- Three distinct, already-public managed-avatar handles returned byte-identical image MIME, length and SHA-256 from original 3030 and new 3032. Image manifest SHA-256 `6592b10b0831b91f412ba0459c4c37a74f089ca881cf5ff9ee98c1b245c2605f`; no private handles exported in evidence.
- Unknown-avatar fallback passed source/build response headers, legitimate image MIME and bounded `public, max-age=60, must-revalidate` cache.
- Guest Documents OS HTML did **not** serialize the admin document registry; bare HTTP200 alone is **not** authorization or a leak. Physical guest page-body SHA-256 `71e0f92f98a9b5a25d41d7d73ffe72a60fd0fadc89d4bd57f0b5e39a00cffdff`.
- Public homepage, Betting Hall, Traffic, AI Council, historical bet API and deployment-version all subsequently returned HTTP200 through both Nginx origin and the public edge when probed with a browser-like user agent. Automated generic urllib user agents may be blocked at the edge and are not proof the site is down.
- At post-release checkpoint, protected R25 service PID **2856449**, zero restarts, ~800–840 MB cgroup memory, roughly 1.8–2.3 GB host available RAM; validator and 3030 PIDs unchanged. Funded 8094/8095 not activated. Nginx syntax PASS.
- **Root-private acceptance receipt SHA-256:** `47a748c75444f561f476a261e534462cd9959a2706362e4380856ff93f503fe0`.
- Controller SHA-256 `a03021dd5787a8b290584cfabdb73b1bb5af41aeacfdf7794e22c54c8a4a6793`, rollback program SHA-256 `074f926275c6fe9cfe53b9e276fe3255312e714d74df14c6ca4720351e2aa975`. These are exact **historical deployed** controller versions, stored root0600, not reusable general-purpose releases.

## Failures and recovery (not to be erased)

Trial 1: nine-second **full-response** check for streamed `/traffic` was shorter than its separate browser-insights rail's 16-second timeout. Controller withheld release and successfully restored old restricted 3032. The timing mismatch is a hypothesis consistent with code, not proof of full route health.

Trial 2: new source passed nine loopback surfaces, build identity, three-image byte parity and fallback cache. The old HTTP-status-only guest Documents OS check treated a nonleaking HTTP200 guest shell as failure. Automated rollback encountered systemd `start-limit-hit`; operator verified original unit SHA, reset only this website unit's failed state and physically restored old 3032 PID2854379. Both trials were **not** accepted.

Trial 3: documented streamed-response budget, content-level guest security check and safe systemd start-limit recovery. All physical gates passed, exact source accepted and timed watchdog disarmed. Previous restricted R25 runtime and original service unit remain available for operator-controlled rollback. Source-only CI green was never treated as a substitute for installed verification.

## Current limitations / critical boundaries

1. **No financial release is authorized.** Formal 10/19 application/finance tally does not increase. C01–C09 remain nine HARD HOLD gates. Legacy 3030 and API owner-connected database roles retain financial write exposure until Session A's independently reviewed C03 work. Do not start funded 8094/8095, switch to legacy 8092, change database permissions, or move WOLO.
2. **Steam authenticated owner-browser acceptance remains separately required.** HTTP200 route checks and GitHub Chrome checks do not prove a real new-process signed-in Steam session or owner-specific authorization. Steam egress authority may change with a PID transition.
3. **Long-duration heap stability remains open.** An earlier 3032 process aborted near V8 2 GB; the current nonfinancial HTTPS `/players/by-name/` Nginx bulkhead is live and source-enrolled in draft PR #1239. Immediate memory acceptance is not endurance certification.
4. **Traffic has separate freshness levels.** Physical Traffic ingest and daily rollups are current for November 8; provisional observed daily series covers October 20–November 8, observed browser insights through November 7. Public **certified** historical daily series still ends **October 19**; missing independent provenance prevents promoting later observed counts to certified human counts. No retroactive reconstruction without real evidence.
5. **Not every historical worktree is deployed or merged.** Older A05 published-only AI Council, A06 Documents authorization, A08 nonmutating dashboard and B2/B3/B4 are already incorporated in the actual R25 source. Other non-ancestor branches (including funded integrations and historical controller experiments) remain individually gated and must not be mass-merged.
6. **Avatar coverage:** the required three actual managed portrait byte-parity samples passed. Further public-edge asset variants may still fail and require separate evidence and repairs; three samples do not certify all profiles.
7. **Rollback:** the current root-private controller uses a source-acceptance marker. Future rollback of an *accepted* release requires a new operator-approved rollback procedure, including verified unit/source hashes, independent readiness and Steam scope review. Do not remove the acceptance marker or stop 3030 casually.

## Related protected receipts and infrastructure

- Root-only controller/receipt directory: `/root/aoe2war-session-b-inplace-promotion-20261108`.
- Previous verified six-extracted-runtime retirement aggregate SHA-256 `6497ffd761f2ded1d8f5e16d91fdcd4f70926bbb60d1dfebf6bd7f14c620e77d`; 9,480,089,600 bytes reclaimed while retaining individually verified compressed archives.
- M1 → FileVault-protected Intel October archive transfer receipt SHA-256 `8e0ab8674d29fcc563d4c5b955ef5c2c7448d274e7323f962ca11d8912362538` (758,254,211 bytes). Earlier 2.23 GB transfer retained.
- Canonical App physical gate register: `Emaren/app-prodn` issue #1108. Chain handoff: `Emaren/wolochain` issue #5. Session A owns all nine financial gates, independently of this website deployment.

**Operational meaning:** The specified nonfinancial R25 website source is **genuinely live on the public origin**. Remaining website auth/endurance/Traffic and Chain financial gates are **not implicitly closed**.
