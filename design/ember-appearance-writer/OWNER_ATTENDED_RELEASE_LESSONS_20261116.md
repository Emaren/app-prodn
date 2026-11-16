---
id: "aoe2war.ember-owner-attended-release-lessons-20261116"
title: "Ember Owner-Attended Release Lessons"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["developers", "operators", "ai-agents"]
source_of_truth: "git"
authority: "release-postmortem"
reviewed_at: "2026-11-16"
review_interval_days: 90
sensitivity: "internal"
---

# Ember Owner-Attended Release Lessons

Historical incident date: 2026-11-16.

**Nonfinancial PRODUCT only.** This is source-controlled engineering evidence, not a signed permit, a declaration of production activation, or permission to open any FINANCIAL gate. Keep the October campaign's history immutable.

## What went wrong

The November source, CI, Linux runtime and independently reviewed SQL/OS components were qualified, yet production stalled. The M1 signer was intentionally **V22 source-install-only**. No new C03 appearance-SQL issuer/executor had been enrolled. Source review, machine access, a one-use permit, a real database mutation and T10 were conflated. Opening more ChatGPT sessions cannot supply authentication authority.

On November 16, the owner opened an attended HEL1 `sudo -i` root terminal and explicitly authorized a **one-time, manual exception** for this nonfinancial release. This is not an Ed25519 permit and must never be represented as one. The missing cryptographic permit remains a real architectural gap to fix.

## Pinned evidence and bounded source

| Item | SHA / identity |
| --- | --- |
| PRODUCT PR #1377 | `f50ead889c6101115aaf678ebdfa70650b691552` |
| C03 SQL PR #1380 | `e69529c5b6e90e5b9e545c90b3f075ec49961b14` |
| B/OS PR #1381 | `c2ff9aa70618afef4128e778a5d77a79c66e61c5` |
| SQL apply SHA256 | `3adf4296436fcb4d20a2261c7a12f0894b4df8aceadcb6e0e5d6f3a967c151e3` |
| SQL inverse SHA256 | `65270456e8fd957019a84b617e5a86de901b1e69e61369272e260151358068ed` |
| Reviewed service unit SHA256 | `d231c8d0e3401717ea37991e93a63ec8394bfb6c4c8e56cd807c20fc1ed5e7b9` |
| GitHub Linux ZIP SHA256 | `d52c1dd1f966799e6073c06d7d409108483dec0e008fac5ae72588b96211272e` |
| Extracted runtime SHA256 | `3701674709ed759113445eb574882c00d41eeba79f5892f9f3bb0842feab53af` |
| Independent proof SHA256 | `0811a74e190d1d9dfc0df848eb1e167bf8d33f3622d10d6847c634bb0678b8f3` |
| BUILD_ID | `eyhY43hMRs2EZknN3Cht3` |

**Timestamped physical state:** At 2026-11-16 14:21 UTC, accepted old 3032 was HTTP200 (runtime `e31e1c053a3b`), betting was 503, 3030/3032/3033/PAPER9447 were listening, and 8092–8095 were closed. No new SQL grant, writer LOGIN, service activation or website cutover occurred at that point. This is historical evidence, not a statement about future state.

## Ten practical lessons

1. Do not re-review unchanged source. Bind source HEAD, SQL bytes, Linux ZIP, extracted archive and independent proof separately.
2. One coordinator may operate multiple trust domains; naming an AI session `WE1` is not an identity or signing key.
3. Enroll and test a purpose-bound issuer **before** blocking a launch on it. A signer limited to V22 is never a general C03 signer.
4. Owner root access, owner manual exception, signed permit, and T10 are **four different facts**. Never invent `approvedBy`, signatures or acceptance receipts.
5. Preserve effective web role zero table/column DML and zero sequence use; grant only reviewed appearance-column SELECT. The dedicated writer begins NOLOGIN, has fixed nonfinancial grants and exactly two allowed sequences. Never touch betting, wallets, or user writes.
6. Use the **existing** Factory's transport → verified `stage` (prepared/nonpublic runtime) → independent writer credential/service activation → website activate → rollback → reactivate → T10. No third Next runtime or parallel deployment engine.
7. A manual exception is a single dated, exact-host/source/SQL/inverse/unit/build event, never a reusable bypass. Restore genuine signed permits for future releases.
8. Garbage-reclaim profiles may prune backups. Never bulk-delete release artifacts, historical commits, protected data or encrypted retention without explicit individual safe-deletion proofs.
9. Status must follow physical truth. HTTP200 on old 3032 is not `SHIPPED_VERIFIED`. Require source+BUILD_ID readback, real Emaren/Scribe role tests, public campaign, exact rollback and T10.
10. Keep private SCRAM, session secrets, SSH material, sudo passwords and browser cookies out of Git, GitHub comments and ChatGPT.

## Future regression contract (not executable in this PR)

The incident establishes a **future schema-and-tests requirement**: a dated, exact-source/host/SQL/inverse/service/build evidence record must reject any claim of funding, financial authority, cryptographic signature or Factory admission. Its successful diagnostic classification should say `VALID_EVIDENCE_SHAPE_NOT_RELEASE_AUTHORITY`, not `APPROVED`.

No new executor, signer, validator, CI waiver or executable code is introduced by this documentation-only PR. The actual schema and adversarial tests belong in a separately reviewed implementation after the November candidate's independently reviewed documents and implementation baseline are merged into canonical main. No historical reviewed-at timestamps should be forged to force DocsV2 green.

## Follow-up engineering improvement

Build a genuine, independent C03 permit issuer and root executor for `SQL_STAGE_NOLOGIN`, `SERVICE_ACTIVATE`, `FACTORY_STAGE` and `FACTORY_ACTIVATE`; bind nonce, expiration, catalog preimage, exact apply/inverse/OS/artifact hashes, independent review, dedicated signing custody and one-use consumption. Keep the FINANCIAL fence closed and the existing Factory unchanged until separately reviewed. Add physical browser acceptance and reversible inverse tests. This is a source-review task, **not** retrospective proof of a deployment.

A release sheet should record each gate as PASS/HOLD/NOT_APPLICABLE with actual timestamp and evidence. Never let source qualification stand in for live admission.

## Native operator follow-up — 2026-11-16 14:46 UTC

This update supersedes the earlier timestamped source-only observation but **does not** claim public deployment. Under the explicitly declared manual owner-root exception, the exact reviewed SQL was applied to HEL1 using root-controlled standard input into `psql` (no broadened source-file permissions). The resulting `aoe2war_appearance_writer` role is **NOLOGIN / NOINHERIT / nonsuperuser**; the web role still has no table-write or sequence-write privileges. The original 3032 remains active HTTP200 on `e31e1c...`, and betting remains HTTP503.

The complete GitHub runtime ZIP and independent proof were SHA-verified on the owner Mac, transferred to HEL1, re-verified byte-for-byte, and admitted by the installed Factory's root manifest preparer. The **existing V3 Factory successfully staged** `f50ead889c61`, BUILD_ID `eyhY43hMRs2EZknN3Cht3`; durable root state is `phase=prepared`, with **no public cutover**. The separately scoped Linux `aoe2war-appearance` UID982/GID984 and exact reviewed systemd unit are installed but `inactive/static`. Native preinstall B/OS preflight passed 12/12.

**Current remaining block:** separate writer root-only environment/SCRAM credential provisioning and database LOGIN/service activation. The remote execution safety layer rejected the secret-handling operation; no secret was copied, no writer password was set, no socket exists, and no new session key was displayed or logged. The service must remain stopped and the role NOLOGIN until owner-local, independently accepted secret custody is established. Port 3030 rollback, 3033 emergency, 9447 PAPER and the financial 8092–8095 closure remain intact. No real T7/T8/T9/T10 has occurred.

**Additional actionable regression learned:** a `root:root 0600` SQL file under `/root` cannot be opened by the `postgres` account via `psql -f /root/...`. The first attempt failed with Permission denied **before any SQL execution**. Root may feed the already SHA-verified bytes via `psql -f -` on standard input, preserving file custody. The tool/installer must explicitly test this case and preserve both failed and successful attempt logs rather than weakening root directory permissions.

Avoid converting `prepared` into `SHIPPED_VERIFIED`: the writer service, authenticated Emaren/Scribe browser tests, actual public source readback, rollback/re-activation, and T10 are still outstanding.

## Performance and authorization engineering debt — measured, not estimated

The November artifact path exposed a clear speed bottleneck. On the owner Mac, the existing Factory's parallel range downloader retrieved and SHA-verified the **616,817,433-byte** GitHub release ZIP in **246.82 seconds** (4m 06.82s). A resumed SSH transfer of the independently verified **618,087,165-byte** runtime to HEL1 took **401.94 seconds** (6m 41.94s). The native root manifest preparer took **9.32 seconds**, and source-bound V3 `stage` took **22.23 seconds**. These are separate recorded operations, not a single end-to-end deploy timing.

**Engineering priority:** optimize cache hits and transport before rewriting the Factory controller. Preserve exact digest/proof checks and source-pinned root manifests; consider approved server-side artifact acquisition only after securely designing one-use authenticated transport that does not persist a GitHub OAuth token on HEL1. Reuse the verified artifact for rollback/reactivation; do not repeatedly rebuild or redownload. Record source/build and start→live→T10 timestamps from actual Factory receipts. Do not quote historical warm release timing as measured for this November release.

**Current native service-stage gate, 2026-11-16 15:01 UTC:** the independent B root preflight returned **17 PASS, 1 HOLD**; only `secret_file_custody` failed. Reviewed source runtime, source marker, node Git blob, OS UID/group, root-owned unit, disabled/static service, socket absent, healthy previous web, protected ports, and financial closures all passed. `systemd-analyze verify` produced no diagnostic. A search of the installed root commands found **no admitted purpose-bound appearance credential installer**; an otherwise capable remote execution route explicitly blocked handling the existing session key and new SCRAM password. That operation remains owner-local and outstanding. This report is a hold, not service acceptance.

**Next-time improvement:** before qualifying a production release, validate a genuine installed issuer/credential provisioner **using a synthetic test account**, and exercise an isolated staging service with secret-hygiene assertions (zero secret content in terminals, logs, PRs, CI or app environment). The root credential-install tool should prove exact UID/GID, SCRAM-only login and role negative privileges, root-only environment custody, writer socket ACL, restart/idempotence, inverse/revocation, and independent B confirmation. Its approval must be purpose-bound, one-use and specific to the target source. Never rename an older V22 signer or replace this with an owner ChatGPT acknowledgment.

