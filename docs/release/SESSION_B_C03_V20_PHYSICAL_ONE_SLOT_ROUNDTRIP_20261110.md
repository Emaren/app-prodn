---
id: "aoe2war.app-prodn.session-b-c03-v20-physical-one-slot-roundtrip-20261110"
title: "C03 V20 source-qualified reversible single-slot R25 rollback-and-return"
type: "runbook"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["operators", "developers", "ai-agents"]
source_of_truth: "git"
authority: "nonfinancial same-slot 3032 rollback and return gated by physical V20 enrollment"
reviewed_at: "2026-11-10"
review_interval_days: 7
sensitivity: "restricted"
---

# C03 V20 source-qualified reversible single-slot R25 rollback-and-return

## Purpose and strict boundary

This Session B code is a **separate** guarded physical controller, not the Steam V20 installer. The reviewed CI-built public candidate at App source b1ef050b954be734c9f34147361e0d02d7c89b19, build ID QVzgMJiQwhFvwrRbY9oZW, build version 20261109194837-9ac998896a, occupies the existing port 3032 systemd service, exact unit SHA256 f3b30861df399f0debcf702ed9ac60b7a00415f77700b5784b2b4496b6b5d56a. The original restricted R25 is retained at source 4ab96cc7c1c0ba43a0403795485d3f410a6ba07f, exact unit SHA256 42bcd2f3833b3e8db5dddaf3be8058f7b265de0fb388e3e9508149de59e72621. Legacy 3030 PID2625090 remains independently preserved. Only 3032 may change within this controller; no third Next runtime, no change to port3030, 3031 is retired, port3033 is Python-only fail-closed, all financial ports 8092–8095 remain closed.

V20 Steam source 7d432066f370b9eeb7f931f2143a12f2695177e6c174775b4400617e00909c4c and exact unit SHA256 b976a10d5cc8b3c199974f1b85a912a67323e8b57b4f69325a1061428d20deb2 were installed independently by the exact one-use V20 controller, physical positive receipt SHA256 eb9da5ca2dd0ef08a657ff13fcfe299230111bb5a00f6f0471129d643c593a6f. The controller must independently authenticate this sealed V20 root receipt and actual V20 source and protect C01/C03/C04 source identities before any website transition.

## Implementation constraints

The immutable original V18 reversible core is reused byte-for-byte, sha256 31d98b68da903922ccc49e75c595e58f0ebbfbc2b5338f4011c65b1deacf677d, with exactly three expected globals rebound to the source-qualified V20 unit/source and authentic retired-R24 protected finance snapshot 3a24b53d356d6ac406999fbabed66c5144d74e538503840d407feb4d5f365f15. The old V17 trial helper is explicitly **not** used for its obsolete Steam unit finance preflight; the V20 native_snapshot() independently reconstructs protected C01 inert units, C03/C04 protected listener/source/UID policy and nft shape 985f32c16f3db3c843a196093977c2e2f61aeb11ce67d5cb1ebddaf66cd710af. The restricted web role, 3355443200-byte MemoryMax, zero restarts, separate validator PID1009 and finance-port closure are repeatedly verified. Never unmask legacy financial services or alter SQL ownership.

The reversible state machine stops the Steam timer, stops the existing 3032 website, then and only then changes exact systemd unit bytes and starts the one reviewed alternative. It verifies build source, HTTP functionality, Steam OpenID initiation and restricted public Betting Hall, enrolls V20 against **that new actual PID**, runs the genuine systemd Steam refresh, resumes the timer, and checks exact active-profile/current PID/start-ticks source receipt, nft shape and financial restrictions. It runs candidate → original restricted R25 → original candidate on the **same** 3032 socket. Failed preflight before a web stop leaves the good candidate running; failure after mutation recovers exact candidate when possible, otherwise the original authenticated-capable restricted R25. Negative receipts never claim success; a successful loop still never substitutes for real owner/nonadmin/AI-Scribe browser authentication.

## Acceptance and risks

Source tests check full original state-machine positive cycle and injected failures, original unit fallback, v20 exact hashes, denial of financial listeners, memory/UID guards and no implicit production command. The exact reviewed controller must pass CI, root-only source admission, read-only --inspect, and a usable actual return path **before** a single opt-in --physical operation. The physical one-use receipt must prove actual PID changes, functional API and Steam behavior, and retained final exact candidate. One successful systemd refresh is not a 300-second lease-window durability test: collect independent multi-refresh nft observations before and after. C03_APP_HANDOFF_ACCEPTED remains HOLD until actual existing Steam identities can be verified through authenticated browser, including persisted admin and ordinary user roles. C02_APP_TRANSPORT independently stays HOLD until finance-owner journal and 8094/8095 native wire acceptance under Session A. No financial production authorization.
