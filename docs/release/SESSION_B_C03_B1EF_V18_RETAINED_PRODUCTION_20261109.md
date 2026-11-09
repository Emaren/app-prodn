---
id: "aoe2war.app-prodn.session-b-c03-b1ef-v18-retained-production-20261109"
title: "Steam V18 exact b1ef retained one-slot nonfunded production release"
type: "runbook"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["operators", "developers", "ai-agents"]
source_of_truth: "git"
authority: "source-bound App public-only R25 release with independent authenticated owner acceptance required"
reviewed_at: "2026-11-09"
review_interval_days: 7
sensitivity: "restricted"
---

# Steam V18 exact b1ef retained one-slot nonfunded production release

## Trigger and historical receipt

At 20:19 UTC November 9, HEL1 physically completed the reviewed App #1278 exact-CI R25 one-slot trial and its compulsory recovery. It started candidate PID 378443, returned HTTP200 from /api/bets/public-live (0 eligible markets), HTTP200 /api/bets/public-history (48 entries), HTTP503 HOLD_RESTRICTED_PUBLIC_BOARD_READ on private /api/bets, HTTP200 on seven public views, anonymous session401 and real Steam OpenID307, observed MemoryCurrent 1.42–1.61GB under the unchanged 3355443200-byte cap, and restored exact old service SHA42bcd2f with Steam V17 successfully re-enrolled on new original PID378804. Official physical trial receipt SHA-256 is 54adf14263c6859ee539873d96019c4d339bef88348475a063e1de008de7ceb0. Zero Chain funds or database roles changed.

## V18 scope and security

The Steam V17 installed source was pin-locked to two runtimes: original 4ab96cc7 and superseded dd00367a bounded heap. The exact-CI b1ef build is a third, separately reviewed release source and cannot be admitted by arbitrarily editing a receipt or copying a new Next process into 3032. This V18 policy restricts itself to ONLY two exact releases: (1) original restricted R25 on 3032, unchanged official origin SHA/version, and (2) CI b1ef050b954be734c9f34147361e0d02d7c89b19 with build ID QVzgMJiQwhFvwrRbY9oZW, build version 20261109194837-9ac998896a, exact official GitHub outer ZIP e4bb88e2a842f0ee3547a537083d9b32549b9642ac66ec110bd59cae2b782446, tar 0d897c82d935c73369b6499e23b2d9efefec20fe969f8e4760340e462468eccc, manifest a306aebc8643feb3ae0ae75249f3bf8b4c19b11a7f4957a8e882d0b845a1a58d and root stage receipt c7a3788a22cbaaa49356330f305c40c90d90232809bb0037236137ad819f64e7. Exact active systemd candidate unit SHA f3b30861df399f0debcf702ed9ac60b7a00415f77700b5784b2b4496b6b5d56a is derived from exactly four original restricted source paths; no envfile, UID990 role, Nginx or MaxHeap change.

V18 preserves unchanged v5z > C03 V1 > C04 masked-legacy listener guard, independently verified two inactive C01 service drop-in preimage SHA064a and post-C01 SHA6bef, nft shape sha985f, protected socket identities, UID990 final DROP, Steam TLS SNI, fail-closed nft GC lease expiry and systemd ProtectHome=yes, ProtectSystem=strict, 3355443200B MemoryMax and 2048MiB V8. No fund/credit/read grants or keys are installed. V18 finance path recognizes ONLY exact protected read SQLSTATE42501 503 with zero finance authority; public-only projection endpoints must each answer real HTTP200 with appropriate source-backed schema. Empty public markets remain truly empty, never fabricated.

## Exact one-use physical controller

The separate source-pinned root-only release controller has three phases: --inspect does read-only source/state preflight; --activate publishes exact protected nonsecret receipts under /etc/aoe2war/web-prod-v18 (mode0500 and inner0400), installs exact V18 source/service, proves original profile enrollment and first refresh, STOPS original Next before starting the CI-proven b1ef runtime on the sole port3032 and same UID, tests public endpoints, private finance503, Steam OpenID, eight memory samples, chain and financial listener safeguards; enrolls the new PID into V18 and resumes the scheduled timer. If any check fails it restores original R25 and re-enrolls it under V18 or falls back to unchanged V17. The controller seals actual PIDs, source, unit hashes and negative receipts. --rollback is independently one-use and only allowed against a verified exact current b1ef runtime, returning to the original restricted site with source-verified Steam re-enrollment.

A PASS of physical nonfunded App release is NOT C03_APP_HANDOFF=YES or Chain C03. Signed-in owner admin, ordinary and AI-Scribe browser sessions, role continuity, nonce expiry/replay, full native 8094 C02 and actual Session A legacy-writer SQL ownership still require independent acceptance. C02_APP_TRANSPORT=HOLD, C03_APP_HANDOFF=HOLD, no C09 funding approval and no WOLO moves.
