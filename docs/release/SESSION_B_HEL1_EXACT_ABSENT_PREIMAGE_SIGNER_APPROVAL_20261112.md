---
id: "aoe2war.app-prodn.session-b-hel1-absent-v22-signing-approval-20261112"
title: "Session B HEL1 real absent-preimage recovery and owner-root signer approval packet"
type: "runbook"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["developers", "operators", "ai-agents"]
source_of_truth: "git"
authority: "review of exact-source ONLY; no owner sudo, no HEL1 installer or public cutover permit"
reviewed_at: "2026-11-12"
review_interval_days: 7
sensitivity: "restricted"
---

# Session B HEL1 real absent-preimage recovery and owner-root signer approval packet

**EXACT-SOURCE REVIEW ONLY.** This is an independent Central/sole-owner source
review request, NOT a root, source-install or public-activation command.
Previously accepted Linux runtime artifact 13901844118, review artifact
13903226173 and source c7d3f5faacd82b7679d37a03456a85b23a093729 are
historically correct but cannot be promoted as if they were the new source HEAD.

## Actual HEL1 source preimage (read-only November 12, 00:40 UTC)

The original root:root 0755 /usr/local/lib/aoe2war-web-prod host directory
has EXACTLY ONE of the three historically expected source files present:

| Fixed source basename | Actual ORIGINAL HEL1 preimage | Required NEW SHA256 |
|---|---|---|
| r25_steam_refresh_two_web_builds_v22.py | PRESENT root0644 nlink1; c6e633538fc17dad6fe887452516cb2ba1095855a0aab6f4bdda47f5985f6edc | cd6ec295573329e26227109707b2a33104453f76ca57b5ee4d027906fd3d54df |
| r25_public_player_one_use_cutover_v1.py | **ABSENT** (no installed original) | 9e2262b0d1f1e428cdd18e2f1d7b1aab84247aadd01b88dbcfbc430aa3f85350 |
| r25_public_player_same_slot_preflight_v1.py | **ABSENT** (no installed original) | 87314320dd4aee0730d619a512d3625ac45a67d2030d6a0930d22ecbb4396de2 |

Historical controller OLD Git blob f2d4f5f6c3551ea90bbcea33b53d734c573eb0f2
(commit 71ffc6599651cf2d5f58e35c807067cb57826db8, source SHA
dbbaab81dc964352670b24b23eea482f1af52d319015969ebb2d48cd59d171b8)
and guard OLD blob ce1ff5563719e19691c18d7b6697926289bcbfd1
(commit 3f670bbd50e6720206cf0818f31375963a59c168, source SHA
70e5331d9920e5675f815ceb333f19236956f940adae4d106b0864fef60bd17c)
remain provenance ONLY, not authority to preseed fake original files.

The EXACT new root packet and signed GitHub Central comment must bind:
{"v22":"c6e633538fc17dad6fe887452516cb2ba1095855a0aab6f4bdda47f5985f6edc","controller":null,"guard":null}.
Historical original SHA fields may appear in legacy source history, but the
actual observed preimage requires TWO absent values. Both old source being
present and broken symlinks at the new-only target paths are denied.

## One reversible source transaction: OLD + ABSENT + ABSENT

1. Independently qualified root-only packet, owner receipt, separate signer,
   boot, host, seven PIDs, stage0003, timer/lock and financial-denial state
   precede all mutation. Acquire original V22 Steam flock, quiesce service,
   install persistent exact negative systemd source-install guard and prove it,
   then durably create root0600 sentinel BEFORE any source replacement.
2. With Steam timer stopped under the same lock, require root-owned original
   V22 exact byte SHA and strict lstat ABSENCE for the controller and guard,
   including no broken symlinks or group-writable parent. Persist O_EXCL
   PREPARE intent, original V22 root0400 inverse byte file and two distinct
   root0400 ABSENT markers. Stage exactly three SHA-pinned root0644 NEW files
   in their final same-filesystem destination parent.
3. Atomic/fsynced replace only those fixed three paths. Native new V22
   selftest, unchanged V20, old rollback profile, C04 masks, financial ports,
   seven protected PIDs and HTTP protections must pass before sentinel
   release. This SOURCE_INSTALL never restarts 3032 or changes Nginx.
4. Independently admitted reboot/interruption inverse under persistent fence
   and same Steam lock: remove controller and guard ONLY if their actual
   root0644 single-link bytes match pinned NEW SHA; fsync source parent and
   verify they truly return to ABSENT. Restore original V22 OLD via atomic
   root inverse stage. An unknown source, symlink, tampered ABSENT marker,
   unexpected mode or competing writer must HOLD rather than overwrite.
5. A crash before PREPARED allows only original-present V22, two absent
   targets, no swap intent and deletion of only exact known new-stage
   residue. Never recursively delete worktrees, root journals or stage0003.

The root recovery policy separately verifies reboot-safe host state:
after a reboot the owner-root journal and effective negative Steam condition
remain mandatory; seven currently live PIDs may differ from the original
pre-reboot permit but must remain stable throughout recovery. Their exact
service names, both C04 masks, no financial sockets, original protected
unit bytes, Nginx/HTTP protections and source inverse remain mandatory.
Fresh SOURCE_INSTALL *never* accepts a new boot ID or changed original PIDs.

The absent-mode fixture proves interruption after each source swap; before
and after absent-file unlink; repeat inverse after power-loss; forged
original-present source, broken symlink, changed NEW source, wrong mode,
tampered root marker, group-writable parent, unknown competing writer, and
original byte restoration. These are **source-level fixtures**, not HEL1
physical kernel/boot acceptance.

## Exact HEL1 executable source to immutable root map

The six root source candidates shall be independently reviewed and copied
only after approval into new root:root 0700 directory
/usr/local/libexec/aoe2war-b-v22-source-install-v1/
under the **same names**, each root0500 regular single-link, no
group-writable or symlink ancestor.

| Reviewed B source filename (in scripts/release) | SHA256 |
|---|---|
| r25_b_v22_linux_host_adapter_REVIEW_ONLY.py | 6c8a04437fc387caa779b4dea449646409ab95fcd035d7090e20e0086dea521c |
| r25_b_v22_source_install_coordinator_REVIEW_ONLY.py | 19218563af52ea1cfe40aad0d5791206355d75d7196b82e1bca313d32be53e4c |
| r25_v22_root_install_admission_REVIEW_ONLY.py | c7131d99877be3a7b2282ce89b717240767a95a9fe65b562cce92795838d254a |
| r25_b_v22_central_signature_REVIEW_ONLY.py | 2aa68f4a4eda8deda9f8da1351e96d7e364b4625f7b19debbf638ecebed7b6db |
| r25_v22_three_source_transaction_REVIEW_ONLY.py | a3f5e93410853b0be1ced1447307d5b7a879e48f6477b38cb183d5b8127d8ea1 |
| r25_b_hel1_source_install_entrypoint_REVIEW_ONLY.py | f052e5265c6643d40053189c4c32ef64a3eecc32bcdedc52067ee1ed431cd719 |

These are actual Python file SHA256, not Git blob hashes. The owner packet,
root-installed source checks and independently signed Central comment bind
the exact six-file map and root entrypoint. Only the **ROOT-INSTALLED**
reviewed entrypoint may accept exactly source-install or
recover-exact-original; calling the same program from UID501-writable
PRODUCT returns status 3 HOLD. No arbitrary root shell or general sudo
command is admitted. The root-only transaction directory is
/root/aoe2war-b-v22-three-source-install-v1 (0700) with 0600 packet and
owner receipt, private 0700 transaction state and three 0400 NEW candidates
under reviewed/. Original old state includes stage0003 SHA
0be22cb597993307ab855443ae89e87dae25d542354e70474c98d5d673f87a45,
V20 SHA 7d432066f370b9eeb7f931f2143a12f2695177e6c174775b4400617e00909c4c,
and original 3032 unit SHA
f3b30861df399f0debcf702ed9ac60b7a00415f77700b5784b2b4496b6b5d56a.
The persistent negative guard body SHA is
28cd77f240edc9f4a66823f3f1b1b9366519798dfc3df306543da71e1f79a485.
No old expired nonce or permit may be reused; TTL <=30 minutes.

## B-only M1 root signing custody, never C's development key

**Central accepted this owner-custody POLICY in principle, not new source
bytes or sudo authority.** Proposed new B source
scripts/release/r25_b_hel1_m1_owner_signer_ENROLL_REVIEW_ONLY.py
SHA256 896a390114a7265db5996e1521cc75383aa71acb3de588663dafaf8fcbc479c7
must be independently accepted for a separately approved root-only copy
at /private/var/root/.aoe2war-b-hel1-prod-sign-v1/
r25_b_hel1_m1_owner_signer_ENROLL_REVIEW_ONLY.py (one actual path, no space),
root0600 under root0700 with protected ancestor. Native owner physical
Terminal is mandatory: macOS EUID0, exact original SUDO_UID501,
SUDO_USER=tonyblum and TTY. The restricted enroll-public-only phase uses
M1 OpenSSL Ed25519 to create a DISTINCT root0400 PRIVATE and root0400
PUBLIC key, prints ONLY the PUBLIC PEM SHA256, and fails shut if either
path exists or enrollment partly succeeded. Private key never reaches
GitHub, HEL1, Intel, UID501/UID650 agents or remote command tools.
This is **not C's signer** with public SHA
567d4d198159c9d3021dcad7d074eb43b53d8c40039b769f1bb8d27d0e4a5968.

The owner physically executed the previously bounded enroll-public-only
action and supplied exactly:
PASS:B_HEL1_SEPARATE_OWNER_ROOT_PUBLIC_SHA256=e9c5b0375d8457b69a3e69e12a7d190ed55ad754c89384348cb0feebeb41512f
HOLD:B_HEL1_PUBLIC_KEY_NOT_CENTRAL_PINNED_NOT_HEL1_INSTALLED
The enrollment helper emitted only the PUBLIC PEM SHA256. This is direct
owner-supplied physical evidence, NOT B's own root-only file readback, and
does not authorize transmission of the private PEM. The fingerprint differs
from C's local DEV-GO signer.

The B HEL1 verifier and future M1 signing helper have now pinned this exact
PUBLIC SHA256 as **source candidates**, not installed root trust. Their Python
file hashes have accordingly changed in the source map above; Central must
independently review the new bytes. The root-owned M1 enrollment helper
remains at its original reviewed source SHA until the owner separately
installs the new approved helper as a controlled root-only replacement.
The later sign-exact-central-comment
phase accepts only canonical exact SOURCE_INSTALL_ONLY approval body,
same six SHA modules, expected actual absent host preimage, current boot,
owner packet/nonce and no finance/public activation. It emits a one-use
root0400 signature, never private material. HEL1 receives only independently
installed root0400 PUBLIC material and exact root0400 message/signature:
 /etc/aoe2war/central-admission-v1/source-install-ed25519.pub.pem.
M1 is network-connected, not air-gapped. A GitHub owner comment alone is
not the independent signature; Central source approval is procedural
review distinct from the sole human owner.

**The first native owner Terminal enrollment was completed and reported PASS.**
No other owner sudo action or HEL1 source install is authorized.
Next, Central independently inspects the exact B source-pinned public SHA
and both changed file SHA256 values. Following that review a separate
one-use owner-controlled readback may check root0400 public PEM metadata,
SHA and Ed25519 type and supply only the public PEM to the HEL1 root
trust installer. The PRIVATE PEM stays M1 root-only. No generic sudo
or old signer/activation permit is transferable.

## Future public release remains independently gated

On physically admitted root signer/three-source transition and fresh
separate ACTIVATE_ONLY permits, stage the independently byte-verified Linux
x86-64/Node22 artifact into new root-only mode0400 slot (never stage0003),
then serialized stop/start ONLY existing 3032. No third Next runtime,
no fallback to finance-unsafe 3030; preserve emergency3033, PAPER9447,
C04 masks, original V20/Steam lock, Nginx selectors and 8092–8095 closed.
Before C03, normal Option L keeps real existing Steam login and its
historic original public.users presence/auth writes; it does NOT claim C03
writer quarantine. Real existing Emaren admin and ordinary Scribe, no new
registration, sessions, menu, portrait bytes, canonical Traffic, featured
warriors, PWA/Watcher/chat and correct API errors require physical
acceptance. Two separately authorized true 3032 original-runtime rollbacks
must use two different fresh signed nonces. C03 strict option stays
uninstalled until Session A approves its own reader/HBA and sidecar.

**CURRENT SOURCE REVIEW, NOT PRODUCTION STATE:**

HEL1_SOURCE_PREIMAGE_REPAIRED=HOLD_SOURCE_READY_HOST_UNCHANGED

HEL1_SIGNER_SOURCE_APPROVED=HOLD_NEW_PUBLIC_PIN_SOURCE_REVIEW

HEL1_SIGNER_PHYSICAL=PASS_OWNER_ATTESTED_M1_ONLY_HEL1_TRUST_HOLD

NONFINANCIAL_DEPLOYMENT=HOLD_NO_ROOT_SOURCE_INSTALL_PERMIT

TWO_REAL_RELEASE_ROLLBACKS=HOLD_NOT_PERFORMED

PRODUCT_DEPLOY_GO=HOLD
