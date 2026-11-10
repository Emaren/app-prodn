---
id: "aoe2war.app-prodn.session-b-c03-steam-v20-sandbox-readonly-20261110"
title: "C03 Steam V20 read-only Nginx source guard and distinct one-use recovery"
type: "runbook"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["operators", "developers", "ai-agents"]
source_of_truth: "git"
authority: "source-qualified Steam-only recovery; no web switch or financial release"
reviewed_at: "2026-11-10"
review_interval_days: 7
sensitivity: "restricted"
---

# C03 Steam V20 read-only Nginx source guard and distinct one-use recovery

## Exact V19 production failure and reversible recovery

V19 CI was green at head c1a54811064b443cc0140c72f946b662d437714d and root-only preflight passed. First one-use V19 installation on HEL1 on November 10, 2026 returned HOLD. Source SHA256 76f48e21de2bc504af121f1c0ae91a8353b72b51bac360ddb7d3f7a24468ba1c, unit SHA256 99df0015a6eeb8ad218ab703fd2b1db5daba3ff4b9bbabb87211d3f042ae1892. Protected read-only check, selftest and candidate PID465815 V19 enrollment all passed; first systemd refresh failed with HOLD:NATIVE_READONLY_COMMAND_FAILED. One-use immutable negative receipt SHA256 c8b828cf30c9e8df1562a87ba7a061b87faca8dc8aa4e105c49b994e94682a69 seals HOLD_V19_INSTALL_NOT_ACCEPTED and PASS_EXACT_V18_FAIL_CLOSED_UNIT_RESTORED. Original V18 effective unit sha 8dae3ac8f4f9ac0d01fed6ddde4a82bb0e6de28ced2553eba9c24349533c3032 restored, Steam timer active, original R25 public PID465815 and 3030 rollback PID2625090 retained, no financial listener opened. Never rerun the V19 one-use installer.

## Confirmed read-only sandbox failure mechanism

A true transient systemd sandbox with the actual effective V19 oneshot properties (NoNewPrivileges=yes, ProtectHome=yes, PrivateTmp=yes, ProtectSystem=strict, CapabilityBoundingSet=CAP_NET_ADMIN CAP_SETUID CAP_SETGID, RestrictAddressFamilies=AF_INET AF_INET6 AF_NETLINK AF_UNIX) proves nginx -T tries to open /run/nginx.pid for writing and is denied read-only filesystem. Attempting -g 'pid /dev/null;' does not help because /etc/nginx/nginx.conf already defines pid and causes a duplicate-pid config error. Granting writable PID scope would be a poor expansion. A source-only alternative uses the already pinned NGINX site SHA256 811cb9f1d4152a8573bc83ba27002206dcd5db1b2272b796c2c6dd919436425f, a bounded read of nginx.conf, sites-available, sites-enabled and all *.conf files under /etc/nginx, with explicit no :3031 selector and bounded file-count/size. It never executes nginx or writes a PID.

HEL1 actual source census on November 10: 125 files, 279124 bytes, zero :3031 references, main config and canonical site present. A **real read-only test run in the exact systemd sandbox** (using an unprefixed diagnostic service so the original C03 protected unit census is not itself altered) confirmed PASS_V20_SANDBOX_READONLY_SOURCE_AND_FULL_C01_C03_C04_SNAPSHOT, protected post-C01 SHA256 3a24b53d356d6ac406999fbabed66c5144d74e538503840d407feb4d5f365f15 and exact nft shape 985f32c16f3db3c843a196093977c2e2f61aeb11ce67d5cb1ebddaf66cd710af. No nft or production service mutation during the probe.

## Source-qualified one-use V20 recovery

New V20 Steam source and effective V20 unit are versioned separately from the failed V19. Separate one-use root installer requires the original failed V19 SHA-correct negative receipt, exact original V18 source restored, V19 historical source still intact, prior protected release R25 PID465815 zero restarts and unchanged MemoryMax, original 3030/validator IDs, finance ports closed, root-only source files and 3031 retired. It creates a new, root-private V20 policy directory and V20 Steam source/oneshot service, runs exact selftest/inspect and candidate re-enrollment, performs first genuine Steam refresh, then returns timer to active. Negative path restores the original V18 effective service and seals a **new** immutable HOLD receipt; the previous V19 receipt is never overwritten. No website systemd unit change, Nginx reload, role grant, financial DDL, C01/8094 activation or funded permission.

A green first refresh does not prove repeated 300-second lease rotations, role-authenticated Chrome identities or reversible real 3032 rollback and return. **C03_APP_HANDOFF_ACCEPTED=HOLD** until those physical checks separately pass; **C02_APP_TRANSPORT=HOLD** for separate financial-owner journal acceptance. The 3033 Python fail-closed listener is not a replacement authenticated website.
