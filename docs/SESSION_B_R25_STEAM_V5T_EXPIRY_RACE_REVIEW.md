---
id: "aoe2war.app.session-b-r25-steam-v5t-expiry-review"
title: "Session B R25 Steam v5t nft Expiry-Boundary Fail-Closed Review"
type: "reference"
status: "draft"
owner: "aoe2war-web"
systems: ["aoe2war"]
audience: ["developers", "operators", "ai-agents"]
source_of_truth: "git"
authority: "steam-only-source-review-no-funded-release-or-direct-root-approval"
reviewed_at: "2026-11-23"
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

## November 15, 2026 — B-owner revalidation against current V27 and host

The above November 7 expiry-edge failures, proposed v5t source and historical conclusion that v5t was on SOURCE HOLD while v5s was then live remain true at their recorded date; they are not the current installed-source claim. The failing nft JSON element was not captured, and later successful V27 runs do not retroactively prove its exact expiry value.

Reviewed current app main at f436d6f3c1a04308e33b17db4a69c25a2d925fcf, docs/release/artifacts/r25_steam_refresh_product_v27.py, its negative tests and [B's final Factory/reboot evidence](https://github.com/Emaren/app-prodn/pull/1358#issuecomment-6886458435). Current V27 source retries only STEAM_SET_UNBOUNDED_OR_EXPIRED (at most three reads and two 250ms sleeps), preserves the original validator, at most 16 TLS-verified public addresses, 300-second timeout, single NFT transaction for the same UID990 Steam sets, pinned seven-rule shape and protected financial masks. All other exceptions fail closed. This is not expanded firewall authorization or a claim that the old v5t candidate was deployed.

At 2026-11-15 15:44 UTC, read-only HEL1 systemd identified the installed Steam refresh ExecStart as the V27 path, last Result=success and ExecMainStatus=0, and active/enabled one-minute timer. PRODUCT NFT boot prerequisite was active/enabled and successful. Live 3032 source/build matched accepted 9c5fb786... / tODeDszM3vE1kOKcQUQjZ; 3030/3032/3033/9447 listened, 8092–8095 did not, and six financial units remained masked. The root-owned V27 code could not be independently hashed by this non-root check; accepted B root receipts remain separate evidence, not reissued here.

Review verdict: the original expiry race is preserved as historical. Current V27 service is observed running successfully. Future expiry-boundary failures still must HOLD; any source, timer or nft-policy change requires fresh root acceptance. No financial admission or new website deployment follows from this review.

## 2026-11-23 substantive V5T expiry failure and current V27 comparison

Re-read the exact Nov7 **18:12:54Z and 18:18:54Z** fail-closed nft expiry observations and v5t four-read/three-sleep proposed retry, including the fact that the *precise failing nft JSON element was never captured*. The 2026-11-07 v5t SOURCE HOLD/v5s live statement is historical only. Unchanged PR #1486 current `docs/release/artifacts/r25_steam_refresh_product_v27.py` blob **`d9bee82f972e8eba6cd219eda1f9e263ac0713a5`** continues to use its distinct strict three-read/two-250ms-sleep retry only for the expiry exception, preserving 300-second TTL, maximum 16 addresses, UID990-only Steam sets, unchanged exact nft policy and nonfinancial site/finance fences. The native Nov23 17:14 UTC systemd readback shows actual V27 `Result=success`/`ExecMainStatus=0` and enabled timer; it does **not** prove the old failed nft expiry element's value, no future expiry race, or deployment of v5t. Source re-review did not edit nft, systemd, protected 57-unit C03 snapshot, signer or PostgreSQL financial ACL; 8092–8095 remain closed. Historical event dates are untouched.
