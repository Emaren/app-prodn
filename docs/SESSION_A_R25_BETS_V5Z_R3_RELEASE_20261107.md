---
id: "aoe2war.app.r25-bets-v5z-r3-stop-window"
title: "R25 Betting Hall v5z R3: Native Web Stop Window and Exact Steam PID HOLD"
type: "reference"
status: "draft"
owner: "aoe2war-web"
systems: ["aoe2war"]
audience: ["developers", "operators", "ai-agents"]
source_of_truth: "git"
authority: "source-only-nonfinancial-runroot-release-not-yet-admitted"
reviewed_at: "2026-11-07"
review_interval_days: 7
sensitivity: "restricted"
---

# R25 Betting Hall v5z R3: Native Web Stop Window and Exact Steam PID HOLD

## Two failed R25 cutovers — do not replay their source admission

The original v5x attempt (2026-11-07 22:06 UTC) found Steam still processing a legitimate native oneshot, and returned HOLD without switching either web or Steam unit. R2 then fixed graceful Steam quiescence, passed GitHub exact-head CI and root native preflight. R2 physical cutover at approximately 22:27 UTC returned HOLD: its old Next process did not stop within 28 seconds, while systemd's actual native TimeoutStopSec was 90 seconds. The independent rollback protected both original service units, but did not finish restarting the already-deactivating Node process within its own 42-second timeout. The original 3032 web recovered under the same original systemd unit and original R25 source at PID2188495; original 3030 stayed PID2625090 and original six public 3032 Nginx selectors were untouched.

Root-private R2 rollback receipt SHA256 f38a37da040d73a6fc39e466905ca7a9c543c1021554dc7625e21b53ccad8a8f. The Steam timer was deliberately restored to its original active/installed state. Its old v5w admission still binds the pre-stop PID2120006; the new 2188495 process correctly causes a source-audited HOLD:R25_PUBLIC_RUNTIME_CHANGED, Result=exit-code and status2. NO authorization may reuse or rewrite old v5w or v5x admissions. C01-C09 all financial HOLD, funded 8094/8095 OFF, no WOLO moved.

## R3: minimal typed corrections, not a general bypass

The new root0700 release directory /root/aoe2war-r25-bets-history-v5z-r3-20261107 begins absent with new exact source, preimages and independent watchdog. It chains to the SAME original full-CI App #1225 Next runtime artifact: source 1a380cdf76ff773aa1d094abd161523500b32b4a; build 20261107204406-df999912fb; BUILD_ID XeiQIhm7XxQCOqcohCm_8; source-bound inert staging receipt SHA256 7b6b8ed79bfae63459ad922d390cf9a2fbaa954221c627dea9358c1a0ab14daf.

1. The native evidence shows the old Next server ignores SIGTERM until the 90-second systemd timeout, at which point the systemd stop job itself returns timeout. Replace the two inappropriate 28-second synchronous stop requests with stop_web_exact_native_window: verify the exact old or reviewed candidate web unit SHA, current MainPID, immutable uid990 node binary, actual next-server cmdline and systemd cgroup. Request systemd stop --no-block; if still in precisely stop-sigterm after 20 seconds, and the exact same PID/unit identity is rechecked immediately before escalation, allow a single systemctl kill --kill-whom=main --signal=SIGKILL against aoe2hdbets-web-prod.service alone. Never send a signal to original 3030, Steam, any Wolo process, database, unknown PID or other cgroup. Wait bounded for MainPID0, and treat unknown states, source mutation, timeout or PID reuse as HOLD. This avoids the 90-second unmanaged public 502 and leaves systemd's original service security/resource settings entirely unchanged. Both initial cutover and rollback use this identical narrowly scoped control. If shutdown or startup fails, independent rollback must restore the exact frozen unit preimages and keep funds locked.
2. Require the stale v5w Steam controller to be provably fail-closed: exact old root-only 0400 admission tied to prior PID2120006 with finance_authorized=false; old v5w source SHA and unchanged systemd unit; the actual current old web PID2188495; Steam MainPID0, ActiveState failed, Result exit-code, ExecMainStatus2; recent last source-bound journal object status HOLD_STEAM_REFRESH_V2 and reason exactly HOLD:R25_PUBLIC_RUNTIME_CHANGED. This is not accepted as a successful refresh. A different failure reason, unexpected unit/script, enabled finance, unknown source state or active writer must HARD HOLD. The old timer is stopped then quiesced without SIGTERM, and no old policy is rewritten.
3. The separately named v5z Steam root-only policy/admission accepts ONLY the new web PID and Linux kernel start ticks after successful new-build 3032 identity, original signed release chaining and exact whole-system protected snapshot. Steam stays UID990, current strict nft security, 300-second expiry, three CA/SNI verified destinations, finance_authorized=false. The new web unit differs only in four manifest-staged runtime path occurrences. The new Steam unit differs only in one pathname; all security properties remain unchanged.

## Acceptance required

Full exact-head App GitHub CI including new negative tests and docs registry must pass before R3 physical activation. On HEL1: source SHA compare, root-private preimage/stage review, read-only preflight, automatic 420-second rollback watchdog, guarded native systemd stop/start, actual new /api/bets/public-history responding with 1–48 eligible historical rows and five finance flags FALSE, public /bets and homepage HTTP200, Nginx-bridged Clan Hall and WOLO HTTP200, unchanged six Nginx selectors and original 3030 PID, source-bound v5z Steam plan and real restricted refresh PASS. Only a new root0600 receipt seals acceptance.

This is a read-only web display release; the original full /api/bets financial handler may still return HTTP500 under correct restricted DB privileges, and new historical labels are NOT authenticated on-chain payment certificates. Chain C01–C09 remain HARD HOLD. Never proxy old GET /api/bets to legacy 3030 because it may create or mutate market state.
