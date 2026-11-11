---
id: "aoe2war.app-prodn.session-b-3032-two-cycle-protected-release-and-rollback-20261111"
title: "Session B protected 3032 two-cycle release and rollback admission"
type: "runbook"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["developers", "operators", "ai-agents"]
source_of_truth: "git"
authority: "NONFINANCIAL source-only; no installation, service-control, finance or public cutover authority"
reviewed_at: "2026-11-11"
review_interval_days: 7
sensitivity: "restricted"
---

# Session B protected 3032 two-cycle release and rollback admission

**NO-GO for execution.** This procedure is conditional, not a command permit. Central offline Ed25519 signer is unenrolled; privileged source-install executable, physical C UID650 proof, A C03 permissions and fresh owner/Central ACTIVATE_ONLY approvals are not accepted. The old SOURCE_INSTALL nonce expired 2026-11-11T17:00:35Z and is never reusable. Never run any review-only B Python module as a production root installer.

## Phase 0: Original HEL1 protected baseline

Target only the EXISTING restricted web-prod systemd service on port 3032, with serialized stop/start and bounded downtime. NO additional Next.js process and NO Nginx selector changes. Preserve original rollback 3030, emergency 3033, PAPER 9447, validator, Nginx, SSH, Steam V20, frozen stage0003, both C04 masks, all 8092–8095 finance ports closed, and all six existing Nginx selectors.

Read-only physical witness on 2026-11-11T22:06:41Z: boot ID 6fdc01cb-8eb6-448d-9a5a-b62b66e0fe34; seven protected MainPIDs/restarts zero: public 3032=701398, original3030=2625090, emergency3033=4136606, PAPER9447=779129, validator=1009, Nginx=3727665, SSH=3727528. Original 3032 unit SHA256 f3b30861df399f0debcf702ed9ac60b7a00415f77700b5784b2b4496b6b5d56a. Steam unit SHA 44ad57ded3f26690eccf674297c4bc4aa00c0ae2ed563f631001ba6d2de1232a; Steam timer SHA d3f4ce6fbbf6b2aad826a57e10e62859b82ce6e175b0ac99e6c5aa6f776413fc. 3030 and 3032 /players=200; restricted 3032 /api/bets=503; emergency3033=503; both settlement units masked; no 8092–8095 listeners. Memory available ~1704 MiB; swap used ~6050 MiB; root free ~20 GiB. Freshly re-observe ALL of this before physical admission. The original 3030 /api/bets=200 is NOT finance-safe and cannot be a public restricted substitute. Do not test PAPER9447 using guessed web paths.

## Mainline convergence prerequisite

A trusted website release is always built from the *currently reconciled canonical App main* plus only explicitly accepted B source changes. Record GitHub main HEAD and accepted B HEAD, verify both are ancestors of the real source-pinned two-parent integration merge and prove the new Git tree/lockfile. Historic R25 ancestry must never be replayed or cherry-picked to fill an illusory gap. If main advances, reconcile the genuine incremental source delta in the SAME B integration worktree before seeking new CI. Keep new main's menu, featured-warrior, avatar privacy, Watcher and canonical Traffic behavior, then run merged source regressions and fresh full exact-head App CI. Every changed commit requires its own independently downloaded Linux x86-64 Node22.22.0 build: the previously accepted ea3b8... and 78d851... archives remain evidence for their old source only, not deployment artifacts for a different merged HEAD. This is a source admission rule, not permission to operate HEL1.

## B versus C source-policy review after mainline reconciliation

The canonical mainline imports C's strict PRODUCT boundary guard, which accepts only C PRODUCT branch source names or main and deliberately refuses broader executable/SQL source changes. **Do not widen that Python guard** to include a B release branch. The source-only PRODUCT-boundary CI workflow continues to run every original C adversarial test; its exact B same-repository branch instead runs an explicit B-only, default-deny source-diff scanner against the **current GitHub main** and refuses C security path changes, A FINANCIAL/Prisma namespaces, unreviewed executable workflows and unapproved API routes. A different fork or branch still receives the original C guard. B scope fixtures exercise both the approved real source and denied financial/auth/private paths.

The B Linux builder must independently verify GitHub's actual canonical main HEAD is an ancestor of its exact PR source before compilation, again at artifact export, and a third time on the second independent Linux download/byte-verification worker. An advancing mainline reopens reconciliation; it does NOT authorize reuse of an older exact-head artifact. This source-policy separation is not UID650 kernel segregation, root SOURCE_INSTALL approval, new C03 database authority or public deployment permission.

## Phase 1: C source proof versus B Linux proof

C separately installs a root-trusted restricted PRODUCT runner on M1 macOS ARM64/Node24, verifies a real UID650/GID650 process performing positive source edits and local builds, with genuine kernel EACCES/EPERM on FINANCIAL and private recovery, including ancestor/symlink traversal, and closed UID501 automation bypass. Require independently verified root-owned controls and source archive Git SHA/tree/Yarn lock SHA. A C-supplied Mac-built runtime cannot pass Linux admission through any label or manifest field.

B checks that exact Git SHA/tree independently, executes trusted Ubuntu24.04 Linux x86-64 Node22.22.0 frozen Yarn installation, Prisma, TypeScript and real Next production build, exports the original canonical runtime.tar.gz, and records exact GitHub run/job/artifact IDs. Independently check completed-success runner, real uname/Node proof, source SHA/tree, Yarn lock hash, runtime manifest and BUILD_ID; download and SHA256-stream GitHub artifact ZIP and inner archive, check bytes and metadata, reject path traversal, symlinks and unknown private material. Both CI runner and artifact metadata are untrusted until checked externally.

The earlier GitHub CI-produced (not independently downloaded/verified) example from PR #1331 HEAD ea3b8a39f944fa069055be755affa9104c8a348c is HISTORICAL only: tree f0e43f37ec4fb20fa3fc948050ddb6ce8ee2d19b, Yarn SHA f0ed0ce51ffac6d86db4fa22e342fc58f4a803013673e8d303241a64d837bf84, GitHub run 43107203957, artifact 13895152063, ZIP 614873076 bytes SHA 1b33ee4e03e47187fed4a50ab42e748bbc3c1789b597997879e035fd8356dac3, inner runtime 616134007 bytes SHA 12f2c1cc136a5a108e2b2629c74c8dded604db8471a61704cae25c4e1ddc82de, BUILD_ID TDksU6S_v6T7UL4BcnaPP. Those bytes are invalid for any later changed source head. Future current values require a fresh exact-head GitHub job and independent verification.

The new independent B Linux byte-verification job runs on a SECOND Ubuntu 24.04 Linux x86-64 GitHub Actions worker, only after the exact-head Linux builder succeeds. It fetches same-run artifact identity from the read-only GitHub Actions API, downloads GitHub's original artifact using download-artifact's native digest verification, separately streams and re-hashes the full inner runtime.tar.gz, then verifies every TAR member against the included source-pinned runtime manifest and source SHA. It checks source Git SHA/tree, frozen Yarn digest, actual Node 22.22.0 Linux platform, artifact ID, BUILD_ID and complete inner archive member digests. A separate second-worker receipt reports run/artifact/ZIP and runtime SHA, build ID and verified entry count without root, C UID650, signing or 3032 admission authority. Thus the CI builder's own receipt alone is NOT an independent verified release artifact.

## Phase 2: Root-private source installation and trusted signer

B's independently reviewed privileged installer must create a new immutable root-owned staged artifact file with mode0400, link-count-one and no writable/symlink ancestors, checking actual archive SHA/size, source tree, BUILD_ID, manifest, Linux runtime ABI, original 3032 inverse and nonfinancial-only path. Frozen stage0003 is never touched. A source receipt is NOT permission to activate.

The old V22 review source is inert, and the source-install proposal changes the Steam effective unit: it needs separate independent review of the exact five-module SHA set, root-controlled process, owner receipt and root/private paths. Central must register a genuinely independent OFFHOST Ed25519 signing identity, source-pin a public key fingerprint and sign exact original GitHub approval comment bytes. The shared owner GitHub account is not an independent signature. Root must independently fetch the exact comment, verify detached signature/owner receipt, module SHA set, host boot and seven PIDs, source SHA, fence contents, fixed stage0003, no finance, TTL <=30 minutes and unused nonce. Never manufacture Central signer, reuse an expired permit or execute reviewed source from UID501-writable PRODUCT.

## Phase 3: V22 SOURCE_INSTALL_ONLY (not public activation)

With a fresh one-use SOURCE_INSTALL_ONLY approval, acquire the real original V22 Steam flock, verify idle oneshot, original Steam source and V20 inverse, original exact 3032 source and protected host baseline. Install only the reviewed systemd negative guard at /etc/systemd/system/aoe2war-steam-egress-refresh.service.d/60-r25-source-install-guard.conf, containing a negative ConditionPathExists on /etc/aoe2war/web-prod-v22/.source-install-in-progress; fsync and daemon-reload, PROVE the native condition denies execution when sentinel exists. Create root-only durable sentinel BEFORE any V22 source swap. Stop only the Steam timer, verify quiescence under held lock, persist PREPARE intent, three original inverse copies and manifest, then perform exactly three SHA-pinned same-directory atomic swaps with fsync. Run new native V22 selftest, old rollback profile and seven protected host/finance postflight, seal source-only receipt, then and ONLY then remove own sentinel/guard, reload original effective service and restore timer. SOURCE_INSTALL never changes public 3032 or Nginx.

A power loss, mixed source version, PREPARE interruption, unknown staged hash or reboot after sentinel requires a persistent HOLD. Restarted systemd must still DENY Steam service while sentinel exists. Only an independently admitted root recovery under the same Steam lock verifies the original transaction ledger, inverse hashes and original V20 source, precisely reverses completed swaps or safe partial PREPARE residue, writes inverse receipt and checks original host/Steam state. Never blindly remove sentinel, unmask a finance service or invoke public cutover to recover V22.

## Phase 4: Exact candidate V22 enrollment

Before any 3032 stop, independently review and admit the ONE exact new source and Linux build ID into an explicit V22 dual-profile compatibility binding. Original two fixed source profiles do not authorize arbitrary C builds. Require a separate exact V22 enrollment approval; no wildcard source, fallback to V20, old auth definer, legacy settlement or source install permit reuse. Recheck Steam headroom >=180 seconds and real shared flock.

## Phase 5: ACTIVATE_ONLY cycle 1, fully serialized

Require separate B/Central/owner fresh one-use ACTIVATE_ONLY nonce pinned to exact new root stage, SHA/tree/lock/build/archive, SHA of original 3032 unit, unchanged six Nginx selectors, preserved 3030/3033/9447, current boot/host, finance denial and reviewed V22 candidate profile. Recheck all seven protected services, C04 masks, memory/swap/disk, Steam lease and original PID/port/version. Record durable SOURCE_ATTESTED -> ROOT_STAGED -> RELEASE_ADMITTED -> STOP_INTENT receipts BEFORE touching 3032.

Under the Steam lock stop ONLY aoe2hdbets-web-prod.service, prove original MainPID=0 and 3032 port released, replace only exact approved restricted 3032 unit/runtime, daemon-reload, start one and only one Next process on 3032 and verify restricted OS principal, new PID, exact build ID, HTTP /players and /api/deployment-version, no altered Nginx selector, no 3030/3033/9447 changes or 8092–8095 finance sockets. This is bounded downtime, never claimed zero downtime. Enroll the exact approved candidate V22 profile while lock protects Steam actions.

## Phase 6: Physical admin, ordinary, visual and C03 acceptance

Keep Emaren admin and existing ordinary Scribe separate in existing private Chrome profiles; no test-account registration, identity mixing, cookie export or replay of a real signed OpenID nonce. Observe two real valid Steam callbacks, unchanged stored UID, admin true/ordinary false, cookie signed, session GET/POST, user-me, admin identity read, session presence/heartbeat and logout. In C03 existing-only profile, prove A's exact 21-field restricted reader/HBA role, insert-only unique nonfinancial nonce DB, separate nonfinancial presence store, no public.users lastSeen/sequence/user-count writes. Explicitly deny unknown/new Steam registration, linking, cross-session switching, forged/replayed assertion and profile updates. Dynamic admin financial/data routes remain denied until separately admitted nonfinancial read facades. If A has not accepted roles, sidecar, financial ACL/HBA and NEW post-install full premaintenance baseline, C03 activation and login acceptance = HOLD.

Physically compare original Kingdom full dropdown/order, three managed portrait raw-byte hashes across admin and ordinary, original canonical Traffic graph history extended past Oct 19 (not replacement recent observations), featured warrior randomness (no fixed Zodiac -> Dil_Pascana -> Sniper -> Berserk War Eclipse), and error/HTTP behavior for /api/user/appearance, /api/bets, /api/page-change-notices. Finance-denied 3032 /api/bets must remain 503. Record private browser evidence, not passwords/cookies. Any user/account financial mutation = immediate HOLD and authorized rollback.

## Phase 7: Mandatory exact original 3032 rollback and inverse

Record durable ROLLBACK_INTENT, stop only the candidate 3032 and verify PID/socket gone. Restore exact original root-trusted 3032 unit SHA f3b30861..., original runtime and Next BUILD_ID, original V22 Steam source/profile and lease, systemd effective unit and original restricted SQL contract; daemon-reload, start exactly original 3032. Verify /players=200 and /api/bets=503, original 3030 /players=200, emergency 3033=503, PAPER PID, seven unchanged protected identities except legitimately replaced 3032, both C04 units still masked, zero finance listeners, unchanged Nginx selectors, source/byte digests and independent A financial zero-write witness. Seal ORIGINAL_3032_RESTORED -> STEAM_ORIGINAL_REENROLLED -> ROLLBACK_VERIFIED with exact SHA. An HTTP 200 alone is not a rollback proof. If an inverse is unprovable, leave restricted safely fenced and HOLD; do not switch Nginx to 3030 as a finance-safe substitute.

## Phase 8: Distinct second trial and eventual final release

Only after first exact ROLLBACK_VERIFIED and original 3032 SHA reproduced, require a second freshly approved ACTIVATE_ONLY packet with a DIFFERENT one-use nonce, fresh boot/host/Steam/capacity/source checks, same reviewed immutable artifact or independently reviewed new artifact. Repeat all STOP -> candidate -> real admin/ordinary/session/visual/API/finance-denial -> original Steam/3032 rollback checks and record a second independent ROLLBACK_VERIFIED. Any mismatch reopens gate and invalidates the second trial. Two successful release/rollback cycles do NOT authorize a lasting public promotion: that would require yet another specific new permit.

## Phase 9: Closure evidence and prohibitions

Retain root-private tamper-evident sequential receipts for actual C UID650 kernel/process denial, independent Linux runner/job/artifact ZIP and runtime SHA, source/tree/lock/build/manifest, root stage ownership/inode/mode, Central offline detached signature, exact owner approval/nonce ledger, guarded V22 original and new profiles, native sentinel and reboot recovery, original/candidate 3032 unit plus build and protected PID/HTTP snapshots, two signed existing account browser acceptances and 21-field reader evidence, unchanged financial users/sequence/lastSeen, image/Traffic/menu/featured/API checks and two independently signed original rollbacks. Redact before posting to GitHub. No private keys, tokens, database URLs or user cookies in PR evidence.

**FAIL-CLOSED:** absent signer, grant, C UID650 real witness, B streamed bytes, exact source SHA, original inverse, Steam readiness, real browser test, finance proof or distinct nonce => PRODUCT_DEPLOY_GO=HOLD. CI green and a created artifact are NEVER an install or financial release permit.
