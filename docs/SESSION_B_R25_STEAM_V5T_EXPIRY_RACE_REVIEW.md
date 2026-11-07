---
id: "aoe2war.app.session-b-r25-steam-v5t-expiry-review"
title: "Session B R25 Steam v5t nft Expiry-Boundary Fail-Closed Review"
type: "reference"
status: "draft"
owner: "app-ops"
systems: ["aoe2war"]
audience: ["developers", "operators", "ai-agents"]
source_of_truth: "git"
authority: "steam-only-source-review-no-funded-release-or-direct-root-approval"
reviewed_at: "2026-11-07"
review_interval_days: 7
sensitivity: "restricted"
---

# Session B R25 Steam v5t nft Expiry-Boundary Fail-Closed Review

## Physical regression observed

The existing isolated R25 v5s Steam refresh on HEL1 recorded two timer failures **2026-11-07 18:12:54Z and 18:18:54Z** with `HOLD_STEAM_REFRESH_V2: STEAM_SET_UNBOUNDED_OR_EXPIRED`. Subsequent runs returned `PASS_STEAM_ONLY_REFRESH` with three TLS/SNI-validated destinations and 300-second nft TTL. Source `scripts/r25_c_start_root.py` has a strict read-only nft parser: an element with `expires <= 0` or `expires > 300000` is forbidden. Time correlation suggests a kernel nft stale expiry/GC boundary but **does not prove** the failing JSON element's exact expiration value. Never remove this check or claim the liveness issue is fixed until physical acceptance.

## New source guard

`scripts/release/r25_steam_refresh_v5t.py` is derived from the reviewed v5s Steam-only wrapper, with a new **separate v5t admission/policy and root source**. It leaves the immutable production controller unchanged. The *only* admission-path change is `observe_strict_steam_set_with_bounded_retry`, invoked before or after the existing additive nft update. It uses the **original untouched validator** (Steam set names, public IP scope, 300s timeout, <=16 total addresses and exact chain/rules shape) and retries **only** the specific `STEAM_SET_UNBOUNDED_OR_EXPIRED` exception, with at most **four reads and three 350ms sleeps**. All other exceptions stop immediately. Persistent zero/unbounded TTL fails closed, without a pass or firewall update. The helper performs no direct nft write, no flush, no TTL extension and no allowlist expansion.

`tests/test_session_b_steam_v5t_expiry_race.py` covers normal read, transient expiry, persistent expiry, disallowed malformed set, false/extra error names, retry bound, immutable-policy binding, unchanged 3030/3032 release, and absence of financial authority. The original v5s tests remain mandatory. The source guard is **not sufficient by itself** for production acceptance. Evidence that v5t works against a genuine expiry-edge JSON reading remains outstanding.

## Physical deployment prerequisites — no shortcuts

Before any switch, require exact-head GitHub CI green, a root-0400 v5t policy and per-runtime admission bound to the current protected 57-unit snapshot, the current 3032 process/start ticks, old 3030 PID, unchanged Nginx six selectors, immutable original controller and R25 public receipt. Root-controlled rollout must preserve the current v5s unit as an exact SHA-pinned rollback, use its existing sandbox/capability restrictions, and test multiple automatic timer cycles across an actual nft 300-second expiry boundary. Persist a root0600 receipt only after sustained PASS, with negative tests confirming malformed or unbounded entries still HOLD. Roll back on failure.

**Until then: v5t SOURCE HOLD (not deployed), v5s remains live, C01–C09 funded HOLD.** Session A exclusively owns C03/C06/C07; no changes to live PG roles/ACL, financial systemd, SSH, native Wolo validator or recovery.
