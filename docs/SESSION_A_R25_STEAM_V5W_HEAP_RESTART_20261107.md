---
id: "aoe2war.app.r25-steam-v5w-process-readmission"
title: "R25 Steam v5w: Source-Bound Recovery After Observed Node Heap Abort"
type: "reference"
status: "draft"
owner: "aoe2war-web"
systems: ["aoe2war"]
audience: ["developers", "operators", "ai-agents"]
source_of_truth: "git"
authority: "source-only-root-reviewed-runtime-admission-never-financial"
reviewed_at: "2026-11-07"
review_interval_days: 7
sensitivity: "restricted"
---

# R25 Steam v5w: a NEW root-only admission after a genuine Node heap abort

## Physical incident, observed not inferred

At November 7 2026 21:00:42 UTC, the original R25 process 1766058 failed with FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory, and systemd recorded status=6/ABRT, Result=core-dump. The native unit with Restart=on-failure started a new process at 21:00:50 UTC, PID 2120006 as initially observed, with no reported R25 source or public Nginx change. Original rollback 3030 was not restarted.

Steam v5v correctly returned HOLD:R25_PUBLIC_RUNTIME_CHANGED starting at 21:01 UTC because its root-owned 0400 admission binds the original post-cutover PID and Linux start ticks; it must never trust a replacement process simply because Next returns HTTP200.

## Scoped source repair

The new r25_steam_refresh_v5w.py is an exact semantic copy of reviewed v5v with ONLY six release-namespace literal changes: distinct root-only policy, distinct root-only restart admission, new version schema and controller pathname, static selftest label. Its unit fingerprint, old original-controller source SHA, immutable signed public release receipt, Nginx SHA, current build, old rollback identity, private C03 security observer inventory, process UID990, start ticks, unit cgroup, executable identity, runtime build, entire protected snapshot, nft firewall rule and maximum 300-second Steam TLS-only allowance all remain byte-pinned.

New v5w admission must be a genuinely separate root-only 0400 file with exact original pid3032 from the immutable release commit, current kernel PID and start_ticks, exact source/build, reviewed snapshot SHA256, original public-release receipt SHA256, no funding authority and a fresh one-use nonce. Existing v5v admission is NOT overwritten; original signed public acceptance is never rewritten. A restart again invalidates v5w and requires another distinct reviewed authorization. No automatic re-enrollment or public proxy change.

The root-only v5w policy is separate and must bind the same protected snapshot and new controller bytes. Exact-head GitHub tests, source admission, physical root owner verification, conservative preimage of the v5v systemd service, automatic rollback and a real restricted Steam oneshot PASS are mandatory before any physical service switch. Published site and legacy 3030 must remain live; no financial 8094/8095 service may start.

## Distinct website repair still outstanding

This Steam incident neither fixes the repeated unauthorized 42501 PostgreSQL reads nor eliminates the Node heap memory pressure. The reviewed /api/bets/public-history and PublishedBetHistoryFallback source train was merged at App PR #1224/#1225 and its exact GitHub CI artifact was inertly extracted on HEL1 with acceptance receipt SHA256 7b6b8ed79bfae63459ad922d390cf9a2fbaa954221c627dea9358c1a0ab14daf. It remains an inactive build: no live 3032 cutover has been authorized or carried out.

C03 global writer isolation and C01-C09 stay financial HARD HOLD. No settlement, payout, custody or transfer authority is granted by this recovery source.
