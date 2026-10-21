---
id: "aoe2war.app-prodn.docs-watcher-monitoring-epoch-fence"
title: "Watcher Monitoring Telemetry — Cross-window Database Completion Fence"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn","aoe2-watcher"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "watcher-telemetry-contract"
reviewed_at: "2026-10-19"
review_interval_days: 30
sensitivity: "internal"
---

# Watcher Monitoring Telemetry — Cross-window Database Completion Fence

In a 30-second monitoring-coalescing epoch, only writes admitted during that epoch may authorize suppression. An earlier epoch could have stored successfully, but that receipt cannot make a later failed write look durable. This change records the first accepted generation in each new window and resets its in-memory committed marker. Late completions from previous epochs are tracked for their own retry status but cannot certify the new window.

Source tests cover a failed fresh-window write following an earlier success and a delayed database completion from an older window. Ordinary stored monitoring events retain their bounded suppression behavior; game upload and meaningful telemetry transitions are never coalesced. This does not replace end-to-end HTTP/PG fault injection or approved release-controller deployment.
