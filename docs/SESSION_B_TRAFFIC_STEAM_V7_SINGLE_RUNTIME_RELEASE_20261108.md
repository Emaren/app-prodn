---
id: "aoe2war.app-prodn.session-b-traffic-steam-v7-single-runtime-release-20261108"
title: "Session B — Traffic Steam V7 Single-Runtime Release, 2026-11-08"
type: "runbook"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn", "traffic-api"]
audience: ["developers", "operators", "ai-agents"]
source_of_truth: "git"
authority: "two-pinned-nonfinancial-r25-sources-only-no-canonical-publisher-no-wolo-finance"
reviewed_at: "2026-11-08"
review_interval_days: 7
sensitivity: "restricted"
---

# Session B — Traffic Steam V7 Single-Runtime Release, 2026-11-08

## Exact source identities and scopes

The live public R25 source e0586a7b7c355c3b29037d78c71fe26d528d2475, build bUr1xs_EMHgXFD-U-sZ4Z, version 20261108044653-2983e18532, PID 2856449 is already admitted via the original Steam v6 guard.

The new exact GitHub CI source 0a7450f9c8c1d12cdf63e33d57e665ad1e3f5cb1, build AX78Oo6yfx4AmSCbDgemv, version 20261108140705-1d068e417c, archive SHA256 0d5dee5eef2ffde788dfd91219ba4811b0a44462042c20a332bb076373072bc8 and manifest SHA256 a7fd6903478b96fd24f055b73d9ba35d7f4bea6670a7e425620edeba0a523bad passed real HEL1 staging checks. Physical stage receipt SHA256 is 31d750fe72b6b6e1fdad492fec94d1a863fd5305360c400bc3b036167b6c9f27. The candidate has not yet been activated.

The candidate contains a browser-facing current-observed Traffic trend above the unchanged certified human-history chart and a bounded single retry of an OpenID verification transport timeout. Traffic issue #31 stays held: certified history ends October 19; observed IPs, GET counts and browser-beacon cohorts are never certified humans or sessions.

## Steam v7

Source: scripts/release/r25_steam_refresh_traffic_v7.py.

Accepts exactly two approved profiles, the existing e058 rollback source and the new 0a745 candidate source. Each profile pins the exact source, BUILD_ID, version, source stage, accepted root proof and systemd unit SHA. The source reuses byte-pinned immutable v5z SHA256 3e54151c10ad39889a6341f000ae36dc1a89f9a3278608c918e707bd068fbb07 and verifies approved v6 SHA256 88343a6405e263e2227c94744e058b53fa4d067c4fd53070d99c15f43b5546ce. The original safety controller SHA256 9799d8c9042dbd1875a2096ee1df6b8751347206cf8761d695aecf1e61894707 is preserved.

No new firewall logic, broad egress policy, database grants or finance/Chain changes. The old TLS/SNI-only Steam endpoints, 300s nft TTL, UID990 DROP, DNS diversity, exact NFT shape, root mode restrictions, CAP/NNP sandbox and system/finance snapshot remain bound. Protected financial topology SHA256 stays 6296fcf49fbc1d33f507c6a8339f87513f933948c0d86a7aa373cebe46071cfb; nft shape stays 985f32c16f3db3c843a196093977c2e2f61aeb11ce67d5cb1ebddaf66cd710af.

Root 0500 enrollment directory /etc/aoe2war/web-prod-v7 has exactly four root-only proof files: active-profile.json mode 0400, accepted-runtime.json mode 0600, runtime-restart-admission.json mode 0400 and steam-refresh-policy.json mode 0400. New readmission can only use the actual observed UID990 Next PID/kernel start ticks, original 3030 PID2625090, validator PID1009, exact stage and source build, unchanged financial snapshot, and closed 8094/8095.

The Steam check is a harmless GET-only OpenID initiation; only secure, HttpOnly state-cookie metadata and provider HTTPS domain are inspected. No Steam cookies, assertion contents or secrets are exported. The candidate also must render real current observed Traffic HTML before enrollment.

## Single-runtime deployment

Source: scripts/release/r25_traffic_single_runtime_release_v7.py.

Preflight requires the old working PID and source, exact old unit, pinned candidate unit (four working-directory substitutions only), physical CI receipt, memory/root reserves, original 3030 PID, Wolo validator, inactive funded ports, and already functioning V7 rollback-profile Steam refresh. A transient failure of the old-site Steam refresh before any candidate transition now returns HOLD with no web unit backup/write and no restart of the healthy existing site.

The host systemd oneshot operates with one Next runtime only: renew Steam on old site; back up the original web unit; replace the one web unit; restart only 3032; verify exact new build and Traffic HTML; enroll candidate PID; renew Steam; verify public HTTPS build parity and financial boundary; write a root0600 receipt.

Any failure triggers automatic restoration of the exact previous web unit and old source, then readmission of the newly launched rollback PID under V7, Steam refresh, public HTTPS parity and a root-only rollback receipt. A failed rollback must emit an explicit emergency HOLD, never PASS.

No new Nginx selector, 3030 restart, Wolo validator restart, database grants, payment movement, 8092 settlement fallback, legacy Traffic publisher activation, or additional parallel Next process is authorized. Session A retains C01–C09 financial gates.

Adversarial source tests cover exact profiles, immutable guard, root-only operation, invalid policy fields, financial flags, mismatched PID/start ticks, safe unit whitelist and rollback. Passing source or CI tests alone does not constitute public acceptance. A native host selftest, exact installed SHA, old-profile production refresh, bounded release and owner browser check are required.

Canonical references: https://github.com/Emaren/app-prodn/issues/1108 and https://github.com/Emaren/traffic-api/issues/31.
