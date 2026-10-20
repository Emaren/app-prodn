---
id: "aoe2war.app-prodn.docs-watcher-telemetry-batch-completeness"
title: "Watcher telemetry batch completeness invariant"
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

# Watcher telemetry batch completeness invariant

The server had treated `{events:[valid,null]}` as `[valid]` by filtering malformed entries before processing, then could return a success receipt despite never accounting for the second event. This is particularly unsafe for any future Watcher batched telemetry transport.

The pure `toWatcherEventArray` validator preserves valid legacy single-event and batch envelopes and refuses an entire malformed batch with HTTP 400 rather than acknowledging only the valid fraction. This is diagnostics only. The 25-event batch ceiling, 64 KiB streamed body limit, duplicate event-ID database authority, replay uploads and media routes remain unchanged. No actual game upload is rejected by this change.

The new unit tests exercise valid single/batch requests, null/primitive/array malformed rows and top-level non-event bodies. Broader end-to-end HTTP fault injection and protected release approval remain outstanding.
