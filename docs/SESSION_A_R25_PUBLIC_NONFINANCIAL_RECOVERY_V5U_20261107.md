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
reviewed_at: "2026-11-23"
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

The original six-selector public routing is preserved as an explicit 3032/3030 topology: the existing Kingdom-presence SSE selector moves to 3030 and a static-first fallback selector uses 3032, leaving six direct 3032 proxy lines. Original 3030 PID2625090 is preserved. Nginx adds GET/HEAD-only fallback for Clan Halls, Clan JSON, public uploaded assets, and missing original Next static chunks. Next image optimization is mapped to old 3030 only for managed /uploads paths. Exact reviewed nonfinancial user appearance/preferences, presence, Traffic speed telemetry and authenticated inbox reads are bridged to the existing 3030 app. Strict HTTPS Origin plus bounded body sizes are required for named nonfinancial mutations. All other mutating routes retain their original Nginx denial.

The original legacy GET /api/bets schedules background market ensure and may write financial database rows. It is expressly NOT bridged. Restricted R25 GET /api/bets remains HTTP500 until replaced by pure nonfinancial read models. No raw user/finance SELECT grant was issued.

Two guarded Nginx reloads and physical source-bound health checks passed: public home200, Clan Hall200 99469 bytes, managed WebP200 385118 bytes, belt PNG200 2797072 bytes, image optimizer200, old legacy Clan JS200, public Osmosis pool display200, protected anonymous reads401, foreign Origin mutation403, anonymous same-origin mutation401, bad telemetry400, continued GET/route refusal405. No fully authenticated positive browser mutation acceptance claimed. No web process restart; funded 8094/8095 inactive; no WOLO transfer.

## Steam security consequence

The previous Steam v5s root-only service correctly reported HOLD:R25_WEB_UNIT_OR_NGINX_CHANGED once website recovery altered the SHA-pinned Nginx site. Five-minute NFT Steam allowlist expired; no one should suppress this guard.

New distinct v5u source takes green v5t expiry-read retry and strict prior 300-second CA/SNI checks, with a fresh exact-current Nginx and image/Origin-map SHA plus both root-protected immutable site preimages. Original release receipt, original read-only approval, current R25 3032 runtime and UID990, 3030 rollback, C03 hourly systemd observer, NFT shape and held funded service units remain source-bound. It recognizes exactly six 3032 proxy lines after the reviewed one-for-one SSE/static routing changes, not seven; the whole Nginx site remains SHA-pinned. It must use new root 0400 admission and new root 0400 policy, separate from v5s/v5t.

Source/test/CI success does not equal production Steam activation. Native restricted systemd cutover, exact public/runtime approval, mandatory live Steam TLS/SNI expiry refresh PASS and rollback receipts must be physically validated first.

## Hard HOLD

Formal funded C01-C09 all remain HOLD. No C03 global writer containment, no C06 coherent backup, no C07 recovery, no C08 ratified authority or C09 transaction permit was created. This is a public nonfinancial continuity repair, not a funded release or permission to switch databases.

## 2026-11-15 substantive protected-source re-review — superseding production context

**Review scope and provenance (2026-11-15, 18:53–18:55 UTC).** The preceding Nginx configuration hashes, selectors, November 7 legacy PID, `/root/aoe2war-public-recovery-20261107` preimages, observed HTTP 500, and v5u cutover design are **dated November 7 historical evidence**. They were not freshly hashed or re-admitted as November 15 root preimages. This review inspected the original unchanged document blob `626b15a2e6e584f9b47fa8c9c25fbd155cc883c9`, the current integrated website source at `83d09e67ede8d502748d0a99b90a3ef8864fdfea`, and the later accepted [PR #1358 signed/root Factory and reboot receipts](https://github.com/Emaren/app-prodn/pull/1358#issuecomment-6886458435). Owner-directed WE1 source-only review through GitHub `Emaren` admin does **not** constitute a new signer, root-file, or financial certificate.

**Now accepted on public 3032, not v5u.** At **2026-11-15 18:53–18:55 UTC**, fresh read-only HEL1 `systemctl show aoe2hdbets-web-prod.service` returned `ActiveState=active`, `UnitFileState=enabled`, `MainPID=1742`, `NRestarts=0`, and `WorkingDirectory=/var/lib/aoe2war-web-prod-9c5fb786b066`. HTTP response headers from 127.0.0.1:3032 positively identify accepted release source `9c5fb786b06636a813235bc13cb2cdffaf51ffc4` and BUILD_ID `tODeDszM3vE1kOKcQUQjZ`, **not** the earlier v5u recovery/source admission. The separately held 3030 rollback, 3033 emergency, and 9447 PAPER listeners remain present; **8092–8095 are absent**. A fresh local GET of `/api/bets` was **503 guarded** (not the old 500); `/api/bets/public-history` was **200**.

**Accepted Factory evidence is later and separate.** [PR #1358 comment #6886458435](https://github.com/Emaren/app-prodn/pull/1358#issuecomment-6886458435) records the prior exact-source physical activation/T10, signed root seal `e06a62bfbcf59af21760ce4a1e7382893c98d84d1cf7347a4eaedcda7c4ef90b`, two real reboot witnesses and a subsequent successful no-op. The accepted old-source warm stopwatch is first verified HTTPS **86.996 s** and durable T10 **154.418 s**; those timings are **not** acceptance timings for held PR #1370. These prior root receipts are referenced as historical signed evidence, not freshly reverified here.

**Steam is now V27, not v5u.** A fresh 18:55 UTC read-only `systemctl show aoe2war-steam-egress-refresh.service` observed `ExecStart=/usr/bin/python3 -I -B /usr/local/lib/aoe2war-web-prod/r25_steam_refresh_product_v27.py --phase refresh`, `Result=success`, `ExecMainStatus=0`; the Steam refresh timer and PRODUCT nft boot unit were each `active/enabled`. The original November 7 v5s/v5u FAIL-CLOSED transition and distinct v5u design stay historical; there is no claim that v5u itself was later admitted. Root-owned V27 executable bytes and original Nginx preimages were **not** freshly hashed in this source review.

**Governance-date correction.** The original final paragraph's `no C08 ratified authority` describes **November 7**. C08 governance subsequently closed, but that closure did **not** approve funding, permit transactions, unlock C01/C02/C03/C05/C06/C07/C09, establish global C03 writer containment or complete C06/C07 backup/restore. Financial service masks, private custody and the separate chain remain outside this nonfinancial public website review. No host, database, signer or production settings were changed.

## 2026-11-23 substantive V5U historical-recovery and current-source review

Re-read both the complete original 2026-11-07 protected Nginx rescue, six-selector topology, legacy 3030 `GET /api/bets` financial writer exception, v5s HOLD on site hash change and later Nov15 V27 supersession. The historical Nov7 Nginx SHA, root-private preimages, PIDs, old HTTP500 and v5u plans remain events of **that date**, not current Nginx source or permission to replay recovery. Current tracked V27 `docs/release/artifacts/r25_steam_refresh_product_v27.py` is unchanged blob **`d9bee82f972e8eba6cd219eda1f9e263ac0713a5`** from Nov15 source `f436d6f3c1...` to PR #1486. Native read-only HEL1 on **Nov23 17:14:56 UTC** confirms actual V27 `ExecStart` source path, one-shot Result=success/ExecMainStatus=0, active/enabled Steam timer and NFT boot, live app on protected 3032 source `890d9dcc22d0`/BUILD `0NEGtfP0ieSzETh1JHGhE`, 3030/3033/9447 active and 8092–8095 closed. We have **not** rehashed the root-only preimages, ratified v5u installation, widened service permissions or newly approved a 3030 write fallback. C08's later closure never negates the November 7 historical HOLD nor activates remaining financial gates. The original November 7/15 notes above are unchanged historical evidence.
