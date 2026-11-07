---
id: "aoe2war.app.session-a-r25-steam-v5v-protecthome-repair"
title: "R25 Steam v5v Root-Protected Evidence Under Strict ProtectHome"
type: "reference"
status: "draft"
owner: "aoe2war-web"
systems: ["aoe2war"]
audience: ["developers", "operators", "ai-agents"]
source_of_truth: "git"
authority: "steam-only-sandbox-evidence-recovery-no-funded-release"
reviewed_at: "2026-11-07"
review_interval_days: 7
sensitivity: "restricted"
---

# R25 Steam v5v root-private evidence binding under ProtectHome

## Physical failure and exact safety outcome

On 2026-11-07 at about 19:36 UTC, R25 Steam v5u source passed 4/4 GitHub checks and source merged at App commit 1e0c8c6d598f6eaed35556152dc86e2f72f185fe. Its Nginx recovery checks passed in an unrestricted root preflight. However, the actual systemd service still has ProtectHome=yes and cannot access the root-only historical Nginx snapshot path /root/aoe2war-public-recovery-20261107/original-site.conf. The real native one-shot failed with Permission denied and returned fail-closed HOLD_STEAM_REFRESH_V2 with financial_authorized=false.

The guarded installer restored the exact previous v5s service unit SHA256 f12f374b86b38d9149f793ddf590eb9f6aeb9537fe60882ff7b9df54c7507a65, without restarting the website, changing 3030/3032 PIDs, activating 8094/8095, modifying financial data, or transferring WOLO. The independent rollback watchdog was stopped when exact preimage restoration was verified. This is a failed physical acceptance, not a completed Steam repair.

## Minimum technical correction

Instead of weakening ProtectHome=yes, the versioned v5v controller reads exact SHA-verified copies of the two private Nginx historical preimages from:
- /etc/aoe2war/web-prod-v5v/original-site.conf
- /etc/aoe2war/web-prod-v5v/stage1-site.conf

Those two files must be root-owned, 0600, nlink=1, not symlinks, and sha-identical to the protected original root-only preimages before physical admission. An independent root-only staged admission and policy, both 0400, live in that same 0700 directory. The systemd sandbox can access it without any change to ProtectHome, NoNewPrivileges, Capabilities or filesystem restrictions.

The controller remains restricted to Steam-only TLS/SNI-validated UID990 NFT sets with the original five-minute timeout and original strict NFT parser. Unchanged checks include the fully pinned active Nginx SHA256 9192a8e775b4e94e59701ba0f7ad6e5373a88aa97f5a7c0f3f633b4ea3bfabc7, public image/Origin map SHA256 e6c598cb63bdfa6c5b84623494fe5d337cfea5ecd8abb574ee59071ba85af3ea, R25 build and PID, 3030 rollback, protected systemd snapshot, financial hard HOLD, 300-second addresses and all named nonfinancial route checks.

## Required qualification

Versioned v5v source plus new local negative tests, original v5u source tests and original v5t expiry tests must pass exact-head GitHub CI. Before physical switch, root must install the two verified 0600 preimages, issue a completely new 0400 v5v restart admission with fresh nonce and an independently regenerated immutable policy, verify all exact hashes and current 3030/3032 health, and arm a bounded automatic rollback that does not perturb the protected 57-unit systemd inventory. Only then may the original service be switched to the new root-0400 v5v source path. Native one-shot PASS and timer-cycle acceptance with financial ports off are separately required.

Do not mark this accepted from source CI or a root preflight. No funds moved, no global C03 writer lock, no C06 coordinated backup or C09 permit.
