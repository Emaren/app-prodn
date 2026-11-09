---
id: "aoe2war.app-prodn.c03-failclosed-emergency-3033-v1"
title: "C03 emergency-only finance-inert 3033 fallback"
type: "runbook"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["developers", "operators", "ai-agents"]
source_of_truth: "git"
authority: "session-b-emergency-only-no-c03-funding-or-authenticated-rollback"
reviewed_at: "2026-11-09"
review_interval_days: 7
sensitivity: "restricted"
---

# C03 emergency-only finance-inert 3033 fallback

This is a small, independently isolated HTTP listener intended only for fail-closed public maintenance, not a functional authenticated R25 rollback and NOT qualification for C03_APP_HANDOFF=YES. It does not retain admin, nonadmin or Scribe sessions and does not query any database; never present it as authenticated continuity.

The program binds only 127.0.0.1:3033, serves 200 to an internal health-check declaring finance/auth disabled, and returns 503 for all public/protected/mutation routes. No SQL, Steam, Satchel, wallets, C04, C08 or C09 code is imported. Every nonhealth response is no-store and disables active content. The systemd unit uses a **dedicated dynamic Linux identity**, aoe2war-c03-emergency (never UID 990), 64 MiB memory max, zero swap, no capabilities, strict filesystem, localhost-only network and 8-task ceiling.

The original native C03 guard enumerates protected systemd unit names starting with aoe2, wolo, tokenchain, traffic, radio and postgresql. The dedicated finance-inert emergency service uses the **r25-c03-emergency-3033.service** name so the immutable protected inventory does not change; the production guard itself remains unmodified. This exemption is permissible ONLY because no financial, chain, auth, SQL, or wallet code is imported by this isolated maintenance listener. The original UID 990 design was physically denied by the existing nft output guard (UID 990 allows localhost 3032 response only, then drops other traffic). A direct test under an unrelated unprivileged user returned 200 for health and 503 for admin using the SAME exact Python source. The deployment MUST NOT modify the preexisting nft UID 990 policy: a fresh DynamicUser=yes service identity is mandatory.

Pre-admission on HEL1: exact reviewed source+unit SHA, no previous listener, current 3030/3032 and validator PIDs, 8092/8093 masks and 8092–8095 closed. Do not add Nginx routes without separate approval. Verify live loopback status, 503 protected-route and mutating-route denial, systemd memory metrics, unchanged original web and validator PIDs and C03/C04 checksum. Do not route real traffic here unless a separate reviewed emergency policy explicitly approves public maintenance mode, measures cutover/restore time and declares loss of authentication and dynamic functionality.

The independent FULL R25 rollback remains required. This helper is only emergency fail-closed infrastructure under severe HEL1 memory pressure.
