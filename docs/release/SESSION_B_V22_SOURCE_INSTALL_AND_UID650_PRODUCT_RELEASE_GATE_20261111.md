---
id: "aoe2war.app-prodn.session-b-v22-root-install-uid650-product-release-20261111"
title: "Session B — V22 root SOURCE_INSTALL and UID650→3032 release engine"
type: "runbook"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["developers", "operators", "ai-agents"]
source_of_truth: "git"
authority: "source-only review; B exclusive HEL1 install and 3032 cutover, no finance authority"
reviewed_at: "2026-11-11"
review_interval_days: 7
sensitivity: "restricted"
---

# Session B — V22 root SOURCE_INSTALL and UID650→3032 release engine

**Control:** B exclusively owns HEL1 source install, 3032 production replacement, authenticated acceptance and restricted same-slot rollback. C owns PRODUCT development/build under future UID650. A owns FINANCIAL and the C03 mutation authority. No new root/worktree architecture.

**Current verdict:** SOURCE REVIEW ONLY. No root installation, owner command, new permit or production mutation. The SOURCE_INSTALL packet that expired 2026-11-11T17:00:35Z is permanently invalid. Stage0003, original rollback3030, emergency3033, PAPER9447, protected services and financial quarantine remain unchanged.

## 1. Source install: reboot-safe admission rather than three loose copies

The exactly reviewed PR #1330 source pair set is immutable: V22 c6e633→cd6ec295; player controller dbbaab81→9e2262b0; same-slot guard 70e5331d→87314320. The new separate root-owned source-install adapter and new persistent systemd guard must be independently source-reviewed and approved: this adds a deliberate, narrowly scoped ConditionPathExists negative condition to the Steam service, and the old three-file source-only request DID NOT authorize it.

The exact execution contract: fresh one-use root 0600 packet with Central independent source/install comment and owner root receipt, SHA-pinned all four imported modules, same boot ID, seven PIDs, C04 masks and financial-port denial; acquire the existing real Steam V22 flock inode and require idle refresh; install the specific systemd guard and prove effective, then durably write root-only sentinel BEFORE any source swap. Stop only the Steam timer; prepare old-byte immutable inverses, fresh journal and same-directory staging. Replace three exact files one by one using atomic rename plus fsync. While files are mixed, a Steam service launch must be physically denied by the persisted condition, even after reboot.

Native V22 exact new-source selftest, exact original rollback profile inspection, unchanged V20 source and the seven service/finance postflight must pass before removing sentinel; after the new source set is fully consistent, remove only the exact own drop-in, reload original effective unit, restore original timer state and verify protected services. Any interruption after marker creation HOLDS with persistent fail-closed source fence. Only a separately approved, root-trusted recovery that checks the earlier exact packet/sentinel/inverse may restore original source bytes; no optimistic startup or arbitrary cleanup.

The new review files deliberately have no production CLI entry point. A second, independent authorization trust boundary is mandatory: a GitHub comment by the shared owner account is NOT sufficient to prove Central independence. The root adapter additionally requires a detached Ed25519 signature over the exact unmodified GitHub comment body, verified by OpenSSL against a source-pinned, root-only public-key fingerprint. The private signer must remain outside HEL1 and all automated UID501/UID650/B PRODUCT reach. No Central offline signing public key has yet been owner-registered or source-pinned (the verifier's production constant is intentionally NONE, therefore INSTALL unconditionally HOLDS). Synthetic tests generate disposable temporary keys only, not a real signer. No owner command/key generation request is justified until Central independently reviews signing-key custody and the exact registered fingerprint, immutable root executable, physical fence/inverse and fresh owner/Central permit. Directly running reviewed source from UID501-writable PRODUCT is prohibited.

## 2. C→B immutable source and independent Linux release-build contract

**Architecture correction:** C develops on macOS ARM64, Node24 under UID650;
its output is a SOURCE archive plus exact App Git commit/tree and lockfile
digest, not a production runtime archive. The old v1 function accepting a
purported C-owned Linux runtime is now denied unless paired with a distinct
B independently verified Linux build proof. Future deployment uses the
explicit v2 contract.

B's exact Linux x86-64 Node22.22.0 Ubuntu CI job builds that SAME source
commit/tree with locked npm dependencies and exports real runtime.tar.gz
with the existing canonical build exporter. A separate v2 receipt includes
GitHub run ID, source/tree, lockfile, original manifest and archive SHA/size,
Build ID and ABI. B must independently fetch the actual GitHub run/job
identity, confirm the job succeeded and Linux runner identity, and stream
the ZIP/inner runtime bytes before accepting the root stage. The emitted
receipt does NOT certify UID650 source provenance on its own, and a
self-reported GitHub run ID does NOT certify an independent release.
Manifest assertions by themselves are NOT sufficient. B must independently verify the Git tree and CI, stream/check the artifact hash and obtain a physical root-attested actual UID650/GID650 restricted process receipt with kernel FINANCIAL/private recovery denial and closed UID501 automation bypass. B copies approved output to a new root-only mode0400 stage (single link, no symlink), distinct from forever-frozen STAGE0003. C obtains no HEL1 deployment key, systemctl, Nginx, Steam, finance, or root permit.

A distinct exact C source/build must be explicitly supported by the live Steam V22 exact dual-profile guard. The current two source profiles do not authorize arbitrary new future C builds; wildcard identity is forbidden. B must revise/admit exact compatibility before a new C source/build can activate.

## 3. No-extra-runtime serial same-slot release

Under a *separate* central ACTIVATE_ONLY approval (never SOURCE_INSTALL authority): exact artifact/unique stage/reversible original 3032 unit + fresh nonce; protected PID/headroom/Steam lease >=180 seconds; shared Steam flock and durable STOP_INTENT; stop only existing restricted 3032 and verify PID=0 and port release; substitute one exact reviewed unit; daemon reload; start one restricted 3032; V22 exact candidate enrollment under inherited lock; authenticated admin and ordinary Scribe browser acceptance; verify menu, portraits, canonical Traffic, featured warriors and finance-denied responses; DURABLE rollback intent and restore original exact restricted 3032 unit/build, V22 original Steam profile, protected HTTP and image/session evidence. Repeat under a new nonce and separately bound immutable artifact. Keep old rollback 3030, emergency3033, PAPER9447 and Nginx selectors unchanged. This is stop/start downtime, NOT zero-downtime.

Existing PR #1316 implements the historical fixed-source same-slot controller. The new B artifact interface and two-cycle evidence state machine are prepared for restricted PRODUCT outputs but do not create a generalized live V22 admission or browser proof. Browser cookies remain in the user's two distinct Chrome sessions; don't add/register Scribe, leak cookies, imitate roles or alter Steam/C03 SECURITY DEFINER behavior without A's consent.

## 4. Independent physical gates

Central must independently review these new root modules, strict external-comment binding, kernel-effective systemd ConditionPathExists and crash/boot inverse including failure during prepare, after each of the three swaps and after fence removal. Only THEN can a fresh root-owned single-use SOURCE_INSTALL packet and owner terminal receipt be requested. Host requires unchanged seven protected PIDs, both C04 settlement units masked, no 8092–8095, preserved stage0003, original V20 and original 3032 source, identical Nginx selectors, adequate RAM/swap/disk, and genuine lease headroom. C must deliver actual restricted build and root-checked immutable artifact; B must physically complete BOTH authenticated role test cycles and their original 3032 inverse with independent A financial pre/post witness.

**Any unmet physical admission = PRODUCT_DEPLOY_GO: HOLD. Source CI is not production approval.**
