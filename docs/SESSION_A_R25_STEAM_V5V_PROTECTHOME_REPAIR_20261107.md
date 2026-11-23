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
reviewed_at: "2026-11-23"
review_interval_days: 7
sensitivity: "restricted"
---

# R25 Steam v5v Root-Protected Evidence Under Strict ProtectHome

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

## 2026-11-15 substantive protected-source re-review — current Steam state

**Historical failure preserved.** The **2026-11-07 v5u** native one-shot's `ProtectHome=yes` permission denial, `HOLD_STEAM_REFRESH_V2`, rollback of the exact v5s service unit and unactivated proposed v5v root-preimage repair remain **historically failed physical acceptance**. The exact Nginx and root-only preimage hashes above are tied to that historic snapshot; they have **not** been freshly re-attested as current HEL1 root bytes. Original document blob independently read was `957f6fdba4994ca68223308e1934b141ed294f66`; current PRODUCT source baseline compared was WE2 `83d09e67ede8d502748d0a99b90a3ef8864fdfea`.

**Live systemd state, 2026-11-15 18:55:35 UTC.** The present native `aoe2war-steam-egress-refresh.service` on HEL1 instead executes `/usr/bin/python3 -I -B /usr/local/lib/aoe2war-web-prod/r25_steam_refresh_product_v27.py --phase refresh`. A fresh read-only `systemctl show` returned `Result=success`, `ExecMainStatus=0`, latest recorded invocation ending **18:55:04 UTC** with exit 0, `ProtectHome=yes`, `NoNewPrivileges=yes` and idle `ActiveState=inactive` for the completed one-shot. The `aoe2war-steam-egress-refresh.timer` and `aoe2war-product-steam-nft-boot.service` were both `active/enabled`. This is **present V27 acceptance evidence**, not proof that abandoned v5v was ever installed or successful.

**Physical and source boundary.** Read-only website unit inspection found `aoe2hdbets-web-prod.service` active/enabled, `MainPID=1742`, zero restarts, source working directory `/var/lib/aoe2war-web-prod-9c5fb786b066`; 3032 headers reported accepted source `9c5fb786b06636a813235bc13cb2cdffaf51ffc4` and BUILD_ID `tODeDszM3vE1kOKcQUQjZ`. The protected 3030/3033/9447 ports remained distinct and financial 8092–8095 absent. The earlier [accepted Factory/T10 and two reboot receipts in PR #1358](https://github.com/Emaren/app-prodn/pull/1358#issuecomment-6886458435) are separate signed/root evidence; this bounded readback **did not independently hash** the current root-owned V27 executable, replay the root permit, or audit the old protected 0600 Nginx preimages.

**Still not a FINANCIAL permit.** C08's subsequent governance closure is separate from November 7's historical gate state. C01/C02/C03/C05/C06/C07/C09 remain unclosed; C03 writer isolation, funded markets, WOLO transfer, backups/restores and canary authority are not established by either historic v5v or modern PRODUCT V27 Steam success. No systemd, nft, signer, database, or financial mutation was made by this review. Reviewer provenance: owner-directed independent WE1 source/host comparison via authenticated GitHub `Emaren` admin, not an additional human signature.

## 2026-11-23 substantive V5V ProtectHome fail-closed re-review

Reviewed full Nov7 exact failure at `ProtectHome=yes`, native permission denial, restored v5s preimage and *proposed-only* v5v root-owned substitute Nginx preimage path against unchanged tracked current PRODUCT V27 source blob **`d9bee82f972e8eba6cd219eda1f9e263ac0713a5`** at #1486 head. The v5v proposal's absolute root0400/0600 source-hash and no-capability-weakening requirements remain historical; v5v was never retroactively declared successfully installed. Current native Nov23 17:14:56 UTC `systemctl show` verifies `r25_steam_refresh_product_v27.py --phase refresh`, `Result=success`, `ExecMainStatus=0`, unchanged `ProtectHome` contract not independently re-audited, timer and NFT boot active/enabled. Current 3032 is `890d9dcc22d0`, not Nov15's `9c5fb786...` snapshot; financial ports 8092–8095 absent. These current service results do **not** replace original protected root-only source SHA/owner admission; this review neither runs a Steam firewall update nor issues root/financial authority, and old v5u/v5v attempts remain dated failures.
