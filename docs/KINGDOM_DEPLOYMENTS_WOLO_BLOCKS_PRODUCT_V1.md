---
id: "aoe2war.app-prodn.kingdom-deployments-wolo-blocks-v1"
title: "Kingdom Deployments and WoloChain Public Blocks V1"
type: "runbook"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "nonfinancial PRODUCT implementation pending CI and release"
reviewed_at: "2026-11-14"
review_interval_days: 14
sensitivity: "internal"
---

# Kingdom Deployments and WoloChain Public Blocks V1

## Scope and proof

This product patch builds on accepted F1 and the separately qualified UID650 Kingdom Traders 100-slot PAPER preview. It changes only nonfinancial public presentation: widen the Factory shell to fit the already-existing scrollable seven-stage rail, show verified public WoloChain blocks/transaction counts, and introduce a read-only Kingdom Deployments route.

The new /kingdom-deployments is featured in the Kingdom menu directly after Kingdom Progress and before Renaissance Campaign. It reads only the existing 24 KiB-bounded /factory/status.json sanitized public contract via the exact readFactoryPublicStatus validator, with 15-second polling while the tab is visible, one in-flight request and a six-second timeout. It shows the latest independently admitted deployment invocation, stopwatch measures from command to live and command to durable T10, the source SHA, GitHub run ID, stage proof, and expandable receipt details. UNKNOWN/STALE/FAIL never become success. No POST, signer, installer, local filesystem, SSH or rollout mutation is present. Real deployment history beyond the latest publisher receipt remains NOT PUBLISHED; no fabricated older cards, continuous push feed, false progress or ordinal release numbers. The GitHub run ID is displayed as a run ID, not invented as a deployment sequence.

WoloChain's WoloBlockRail uses only the existing public same-origin /rpc/status and /rpc/block?height= proxy. It requests at most six recent chain heights, bounds each response to a 750 kB accepted payload, constrains chain_id=wolo-1, height equality, SHA-256 block hash format, timestamp and transaction count, and calculates display-only transaction hashes in browser WebCrypto for up to eight bounded raw transactions per block. Zero chain transactions displays zero, not fake transfers; bad or unavailable reads display UNKNOWN/PARTIAL. This is NOT custody or settlement truth and no protected daemon logs, account details, keys, private endpoints, financial ports or wager controls are accessed.

## Width and visual boundaries

The shared AppShell /factory route receives an explicit 96rem maximum so the existing 1190px stage rail is not amputated by the default 6xl shell. The rail remains horizontally scrollable on narrow devices. The existing Basic / Advanced / Extreme width-preference system elsewhere is not replaced or silently reset. The new deployment page is capped at 96rem and uses responsive single-to-three-column cards, readable mobile typography, native accessible expandable details, reduced-motion-safe animations and a dark/cyan/violet/emerald palette. Do not introduce another site-wide width mode or a global CSS zoom rule.

## Admission and operations

Run focused parser/navigation tests, source typecheck after Prisma generation, Linux Node production build, CI, independent artifact verification and the existing signed/root F1 release factory. Regenerate DocsV2 with the implementation SHA after feature source commit. Do not manufacture reviewed_at updates for unrelated documents. The release is not live until independent public verification of /factory, /kingdom-deployments, /wolo, /kingdom-traders, protected financial ports, source SHA, rollback/T10 and authorized no-op replay.

## Next release-OS work

A separate guarded source-owned append-only bounded deployment-history publisher is needed before this page can legitimately show all past deployments or continuous sub-minute activation transitions. Do not deploy a page-only fake localStorage journal. Existing durable single-invocation publication remains authoritative. A later source-backed Basic/Advanced/Extreme page-width selector can be independently added without mutating user preference keys globally.
