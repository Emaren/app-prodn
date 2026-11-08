---
id: "aoe2war.app.session-b-e058-steam-v6-readmission"
title: "Session B R25 e058 Steam v6 Restricted Egress Readmission"
type: "reference"
status: "draft"
owner: "aoe2war-web"
systems: ["aoe2war"]
audience: ["developers", "operators", "ai-agents"]
source_of_truth: "git"
authority: "steam-only-source-review-no-live-write-or-financial-permit"
reviewed_at: "2026-11-08"
review_interval_days: 7
sensitivity: "restricted"
---

# Session B R25 e058 Steam v6 Restricted Egress Readmission

## Physical incident — exact new R25 public runtime
The R25 nonfinancial website commit `e0586a7b7c355c3b29037d78c71fe26d528d2475` reached public production on November 8, 2026, at 12:42 UTC, build `20261108044653-2983e18532`, current live PID 2856449, promotion-receipt SHA-256 `47a748c75444f561f476a261e534462cd9959a2706362e4380856ff93f503fe0`.

A real browser displayed `STEAM_SIGN_IN_FAILED`. Four nonidentifying runtime diagnostics at 12:55–12:57 UTC uniformly showed Steam verification `provider_post` / `FETCH_TIMEOUT`; no evidence identifies a password or database authentication failure. The existing restricted Steam refresh timer returns `HOLD:R25_WEB_UNIT_CHANGED`, and both UID990 nft `steam4` and `steam6` sets were empty (300 s expiry). Root host TLS connection succeeds, but the restricted web process cannot reach Steam until a new exact-source egress admission is approved. The current **DROP** rule is correct and must remain.

## New source-only v6 controller
`scripts/release/r25_steam_refresh_live_e058_v6.py` is a separately versioned copy of the installed 373-line v5z controller, not a mutation of the immutable original. It replaces obsolete public source, build, Nginx and systemd web-unit pins with the exact November 8 promoted release evidence, while keeping original controller hash `9799d8c9...`, original approved production policy, managed-media map SHA, original Nginx preimage, public relay configuration, 57-unit protected system fingerprint, 3030 PID 2625090, validator PID 1009, and the restricted UID990 nft rules unchanged.

The v6 source requires a root-owned mode 0400 per-runtime `runtime-restart-admission.json` and separate `steam-refresh-policy.json` in `/etc/aoe2war/web-prod-v6/`; both are **absent by default**. An independent reviewer must approve the exact current PID/start ticks, web systemd SHA, public release receipt SHA, source/build, original restricted R25 rollback directory and protected complete financial topology. A stale or unexplained changed finance snapshot remains HARD HOLD. **Never automatically enroll a new fingerprint simply to make Steam work.**

## Narrow scope — must not widen
Only the validated public TLS/SNI `steamcommunity.com` destinations may enter existing `steam4` and `steam6` nft sets, with the immutable original 300-second TTL and at most 16 entries. No broad outbound access, trusted proxy, custom CA, OpenID bypass, UID switch, PostgreSQL grants, new finance service, custody token, Wolo consensus change, or mutation of old v5z policies is authorized. The controller retains the bounded original NFT expiry validator; persistent malformed or expired entries return HOLD.

## Verified source prerequisites
1. Run isolated v6 `--phase selftest`, `python3 -B -m unittest discover -s tests -p test_session_b_steam_v6_e058.py -v`, and old v5t expiry regression. Require exact-head GitHub security/docs/source qualification before candidate rollout.
2. On HEL1, independently verify current public build, PID/start ticks, exact unit SHA, Nginx six public selectors, original 3030 + validator PID, current protected 57-unit fingerprint and original offline rollback archive. No finance grants may change.
3. Stage an **inactive root-sealed copy** with verified source SHA, run read-only diagnosis, evaluate the exact current-protected fingerprint separately with Session A. An unreviewed fingerprint cannot be declared accepted by a stale document.
4. Only after exact root0400 runtime and policy are reviewed, arm reversible App-only rollback, install versioned service ExecStart with unchanged systemd sandbox/capabilities, run `--phase plan` and guarded refresh. Confirm three or more genuine automatic timer PASS cycles, finite 300s TTL and unchanged guarded drop rules. Test an unauthenticated synthetic provider POST is rejected (no user data), then obtain a real signed-in Steam browser return.
5. Retain the old 3030 rollback and old approved v5z unit as root0600 preimages; rollback if any service, Steam or public-HTTPS acceptance fails. Do not disable the C03 observer to obtain a convenient snapshot.

## Release status
**SOURCE REVIEW ONLY / PHYSICAL STEAM HOLD** until exact current protected unit fingerprint and reviewed permit exist. Financial C01–C09 remain HOLD and ports 8094/8095 stay closed. The existing public R25 build remains deployed regardless of this Steam hold.
