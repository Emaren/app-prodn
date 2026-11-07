---
id: "aoe2war.app.r25-bets-v5x-guarded-release"
title: "R25 Betting Hall v5x Guarded Nonfinancial Cutover"
type: "reference"
status: "draft"
owner: "aoe2war-web"
systems: ["aoe2war"]
audience: ["developers", "operators", "ai-agents"]
source_of_truth: "git"
authority: "nonfinancial-source-qualified-physical-release-pending"
reviewed_at: "2026-11-07"
review_interval_days: 7
sensitivity: "restricted"
---

# R25 Betting Hall v5x Guarded Nonfinancial Cutover

## Scope and actual user-visible defect

As observed live on HEL1 2026-11-07T21:42:39Z, public R25 is still the former November 6 build on 3032, GET /api/bets returns HTTP 500 because isolated aoe2war_web_prod cannot directly SELECT broad financial tables, and GET /api/bets/public-history returns HTTP 404 because the new source is not yet deployed. The public homepage and Clan Hall return HTTP 200 with reviewed explicit Nginx bridges for managed media/legacy nonfinancial readers. There is NOT evidence of a wrong second database; do not alter the actual DB host or grant raw finance SELECT to make the errors disappear.

The new merged App PR #1224/#1225 historical archive source is independently built and tested. Its exact GitHub full-CI runtime artifact was verified and extracted to /var/lib/aoe2war-web-prod-1a380cdf76ff with per-file SHA checks, separate from the live R25 process. Its original source sha is 1a380cdf76ff773aa1d094abd161523500b32b4a, runtime build is 20261107204406-df999912fb, and BUILD_ID is XeiQIhm7XxQCOqcohCm_8. The sealed inert staging receipt SHA256 is 7b6b8ed79bfae63459ad922d390cf9a2fbaa954221c627dea9358c1a0ab14daf.

## Physical prerequisites and approved exact-shape deltas

The release source scripts/release/r25_bets_history_v5x_nonfinancial_cutover.py freezes:

- Original web systemd unit SHA256 9301389aaf545bb9f4273e183d1c0f1ddf6c6589cac84d79873124327f71e1ec, UID990 and profile. The new web unit SHA256 1f2970c685e53d0f426b86baeb1910c4f73f346a6e18baf97b064ef1fae7bbe3 changes exactly four occurrences of the old *runtime artifact pathname* in WorkingDirectory and read-only mounts, not privileges, environment, port, CPU, memory, login or DB identity.
- Previous physically accepted Steam v5w restricted unit SHA256 6cda0dd112fe6a0d47594220969ff1f806bfadacad7eb4d0150f33c4e7b1529f and root-owned acceptance SHA256 c975c5d442386f3e0b8693d6abe2e8d321c682567dd06e158efa77b98f8ab25a. New Steam v5x changes exactly its controller path and requires a separate root-only 0400 admission and root-only 0400 policy bound to the new public PID and start ticks.
- Separate preserved original 3030 web PID2625090, six original Nginx 3032 selectors and Nginx SHA256 9192a8e775b4e94e59701ba0f7ad6e5373a88aa97f5a7c0f3f633b4ea3bfabc7.
- Existing 8092/8093 C03 legacy writer-deny kernel rule for UID1000, including exact ip daddr, skuid and ports, with normalized packet counters only; this is still a **PARTIAL** fence, not global financial C03 acceptance.
- Exact web source and build, CI zip and manifest hashes, original public signed receipt and immutable original Steam agreement, actual 3032 process old PID2120006; if any PID or root source changes before preflight, HOLD.
- Root filesystem and RAM capacity must remain adequate. The old Node process failed at 2026-11-07 21:00:42 UTC from an actual V8 heap limit, so one timed HTTP 200 is not a long-run stability proof. The new unit retains the previously reviewed heap/memory cap, without silently widening host pressure.

Source code never changes Nginx, the original 3030 web, the WOLO signer, custody, financial systemd units, PostgreSQL grants, 8092/8093 enforcement, API cross-margin trading, or payment state.

## Bound admission and physical sequence

1. Full exact-head App CI (including GitGuardian, 111-document registry, Next build, and new v5x adversarial tests) must PASS before physical authority is assumed. Confirm merged source SHA and verify the exact v5x controller at its root-owned location.
2. Stage exact sealed old/new web and Steam unit bytes in a private root0700 directory; run the release controller preflight. Ensure real funding ports 8094/8095 remain inactive and private C03 deny still exists. Never overwrite the original production acceptance.
3. Start a separate, time-bounded root-owned automatic rollback watchdog. Temporarily stop only the Steam timer, quiesce its current oneshot and stop the 3032 service. Swap the two exact reviewed systemd unit files, reload systemd and start NEW 3032. At no point change six public Nginx selectors or the untouched rollback 3030.
4. Require new 3032 buildVersion, real public historical view JSON with 1–48 eligible historical market rows and all five finance-authority fields false, public /bets HTTP 200, public / and Nginx-bridged Clan Hall/WOLO HTTP 200. Any unknown finality remains unverified. This is a display, not a betting engine.
5. Seal a NEW root0600 public release receipt chained to old signed release and exact CI manifest. Enroll a NEW v5x 0400 Steam-only runtime/PID/snapshot admission, distinct root0400 policy. Run v5x plan, actual restricted native Steam refresh, prove three CA/SNI-validated Steam TLS destinations and original 300-second NFT expiry; restart its timer. Verify original Nginx and 3030, protect all C03 financial units and deny rule unchanged.
6. Only after success seal root0600 v5x physical acceptance. A watchdog exits only on a valid exact receipt; otherwise it restores both original systemd unit preimages (new 3032 app rolls back to old build and Steam fail-closes pending its next fresh PID-specific readmission). The watchdog must never move WOLO or falsify successful release.

Full login, real browser check, authenticated appearance editing and long-run Node memory observation are separate release and operational acceptance. Existing /api/bets full financial handler may intentionally remain HTTP 500, but the read-only historical UI fallback must no longer show fabricated zero balances or wager acceptance. Any repair to 42501 read-only trophies/chat, private financial raw tables or unrelated routes requires separate reviewed schemas and permissions.

## Status and financial separation

This is source planning only until actual HEL1 native start, authenticated history route response, Steam v5x admission and root physical acceptance exist. App formal gate register remains 10/10; Chain C01–C09 all HOLD. Global C03 writer isolation, C06 coordinated backup, C07 recovery, C04 historical finality, C05 independent common-height reserves, C08 authority and C09 owner-specific permit remain unresolved. New funded services 8094/8095 must stay inactive. No customer money may move.
