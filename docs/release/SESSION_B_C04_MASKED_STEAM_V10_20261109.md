# Session B — Versioned C04-Masked Steam V10

Scope: nonfinancial R25 website Steam-only egress admission. Not a C03/C04/C09 approval.

## Source of the failure

On November 9, Chain C04 PR #227 merged at b250461c45b3d74d5202e14d74df8a345e484add and the two historic financial services (8092 and 8093) were persistently masked and stopped. C04 receipt cae4f19416436a0fd5598cc1a08ae011d458ed97e562b23e2154c2b2ef5298b4. V9 legitimately returned HOLD:PROTECTED_LISTENER_NOT_UNIQUE: original V1 production_protected insists that 3030, 8092, and 8093 each have one socket. These financial listeners must never be resurrected to satisfy Steam.

## Accepted topology transition

The original V1 source, original C03 V1 service/timer/command and pinned C03 completed-oneshot normalization remain untouched and fully attested. A separate root-owned V10 helper enforces:

- Both historical settlement units are LoadState=masked, UnitFileState=masked, ActiveState=inactive, MainPID=0, NeedDaemonReload=no, and exact /dev/null masks.
- Both original unit definitions are preserved within the root 0700 C04 quarantine, with 0644 original file permissions and SHA-256 pins.
- There are zero listening TCP sockets on 8092, 8093, 8094 and 8095.
- 3030 and 3032 each have one listener, the original web PID and Wolo validator PID are checked, and PostgreSQL listens on loopback 5432. The unchanged V1 source continues validating protected socket inode/cgroup identities and all other protected units.
- V1's immutable production_protected() is executed in full, temporarily accepting exactly two otherwise-fatal PROTECTED_LISTENER_NOT_UNIQUE outcomes. Any third exception, additional mutated service, added protected socket, changed C03 command, absent completion, checksum drift, or before/after socket change fails closed. The original error handler is restored on both success and failure.
- V10 has its own source, enrollment profile and policy root. It does not overwrite V9's trusted snapshot or source. The expected pre-switch C04 masked topology SHA-256 is 064a16dde48c64a3001621902b4ae7a028ec4975183fd4c24b8a16338c1a226c as observed on HEL1 with V9's currently installed Steam unit.
- Any proposed Steam unit/timer transition from V9 to V10 is a separate controlled config change, with an exact precomputed post-switch topology fingerprint and explicit backout; never reuse the pre-switch hash as a dynamic approval or rotate it blindly.

## Physical proof on HEL1

- V9 on HEL1: HOLD:PROTECTED_LISTENER_NOT_UNIQUE while both C04 services are masked and all four financial TCP ports closed.
- Isolated V10, byte-pinned, with the original V1/C03 guard loaded: three consecutive full HEL1 protected topology acquisitions PASS, same 064a16... SHA; each ~2.7–3.0 s.
- Python tests/test_r25_steam_c04_masked_v10.py: 12 positive/negative tests PASS. Includes third-listener bypass denial, original C03 command denial, TOCTOU denial, changed 3030 / resurrected 8092 denial and finally restored original need() function.
- No live timer, C03 observer, source-pinned V9, Chain financial service, custody, database ownership or funded listener changed by this preflight.

## Remaining acceptance

The new V10 must be deployed under a separately reviewed exact Steam unit/config SHA and source-bound post-transition fingerprint. Physical Steam refresh and negative test must pass with C04 masks intact. Then independently verify genuine owner and non-admin Chrome/Steam sessions and the finance-safe 3033 rollback before C03 live coordination.

C04/C08 CLOSED; C01/C02/C03/C05/C06/C07/C09 OPEN. No WOLO moved or authorized.
