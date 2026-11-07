---
id: "aoe2war.app.r25-bets-v5x-r2-natural-steam"
title: "R25 Betting Hall v5x R2 Natural Steam Quiescence"
type: "reference"
status: "draft"
owner: "aoe2war-web"
systems: ["aoe2war"]
audience: ["developers", "operators", "ai-agents"]
source_of_truth: "git"
authority: "nonfinancial-source-qualified-physical-release-pending"
reviewed_at: "2026-11-07"
review_interval_days: 7
sensitivity: "restricted"
---

# R25 Betting Hall v5x R2 Natural Steam Quiescence

## Actual first native physical cutover HOLD

On 2026-11-07 at approximately 22:06 UTC the first real guarded web/Steam v5x cutover was attempted from exact CI-green App PR #1227 release controller. All read-only source/manifest/role/3030/finance/C03 preflight checks passed. The independent rollback watchdog armed, then the controller stopped the hourly Steam timer and erroneously issued systemctl stop on the already-running restricted Steam oneshot. Systemd killed that active oneshot with status=15/TERM and Result=signal. The strict STEAM_REFRESH_NOT_QUIESCED guard correctly rejected continuing to the web unit switch.

The source controller safely sealed root-only rollback receipt SHA256 ec36a43ba230a7544d3fbbfe7788e82816ba33e653bded2f3692823063ac4834. Subsequent independent HEL1 checks verified original 3032 PID2120006 remained running, previous web unit SHA 9301389aaf545bb9f4273e183d1c0f1ddf6c6589cac84d79873124327f71e1ec unchanged, original Steam v5w unit SHA 6cda0dd112fe6a0d47594220969ff1f806bfadacad7eb4d0150f33c4e7b1529f unchanged, untouched original 3030 rollback PID2625090, closed funded ports 8094/8095, original /api/bets still 500 and newer history endpoint 404. The hourly Steam timer completed later cycles successfully and returned native PASS_STEAM_ONLY_REFRESH, 3 TLS destinations, TTL300s, finance false.

The previous independent rollback watchdog was verified as the exact root-owned expected process and disarmed only after the exact rollback receipt and preimage hashes were checked; it is not allowed to interfere with a subsequent release.

## Narrow versioned R2 correction

Keep the verified candidate CI artifact, old/new web unit, old/new Steam unit, old/new source/build/DB, Nginx, NFT, C03, 3030 and finance ports all EXACTLY the same as App PR #1227.

Only script changes in scripts/release/r25_bets_history_v5x_nonfinancial_cutover.py:

- Allocate a DISTINCT, root-owned directory /root/aoe2war-r25-bets-history-v5x-r2-20261107 for new 0400 preimages, independent watchdog, new rollback and physical acceptance. Never overwrite or erase the first attempt's receipt or source.
- After disabling the Steam timer, **do not send SIGTERM or systemctl stop to an active Steam oneshot**. Instead wait for the exact existing restricted oneshot to reach ActiveState=inactive AND Result=success. At most 36 observed checks with 35 seconds of sleep; only activating/active/deactivating with Result=success are temporary allowed states. Result=signal/exit-code, failed, unrecognized state or excessive runtime produce a hard HOLD before restarting the website. The source-negative tests check this directly.
- Only after genuine native Steam success can the existing exact reviewed 3032 web+Steam unit switch, root new public receipt, v5x PID-specific 0400 policy/admission and genuine restricted Steam refresh proceed. The root independent watchdog still has authority to restore the exact old two unit bytes and resume the Steam timer if anything fails.

This R2 source is not a bypass of the old reviewed protected snapshot, checksum-pinned artifact, restricted DB view or financial guard. It adds no paid endpoint and grants no money permission.

## Release boundary

Before a new release, require complete exact-head App GitHub CI, source SHA checks and original CI artifact receipt SHA256 7b6b8ed79bfae63459ad922d390cf9a2fbaa954221c627dea9358c1a0ab14daf, protected C03 kernel UID1000 deny, original 3030 Nginx selectors, the restricted HD read-only view, no write authority, healthy existing Steam, untouched current web PID2120006 and inactive funded 8094/8095. A previously-consumed root private release directory is NOT an acceptable replacement for a new one-use rollout.

If native cutover succeeds, postcheck the source-bound /api/bets/public-history GET, nonwagerable Betting Hall fallback, public Clan Hall/media/WOLO, the new v5x Steam root admission with 3 verified TLS destinations and independent rollback receipt. Authenticate actual browser login separately. If it fails, leave the existing public R25 deployed, revert both unit files and report the remaining operational HOLD.

This nonfinancial release does not accept Chain C01-C09, C03 full financial writer isolation, C04 payment finality, C05 solvency, C06 coordinated snapshot, C07 recovery, C08 custody roles or C09 fresh owner transaction permit; WOLO funds remain unmoved.
