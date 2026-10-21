---
id: "aoe2war.app-prodn.docs-watcher-monitoring-durable-ack"
title: "Watcher Monitoring Telemetry — Durable Acknowledgment During Database Writes"
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

# Watcher Monitoring Telemetry — Durable Acknowledgment During Database Writes

## Finding

Concurrent monitoring-ignore events for the same replay could receive a successful coalescer-only response even while the earliest PostgreSQL insert was unresolved. Suppressing a different event ID before any durable write succeeded creates an acknowledgment gap if that first write fails. The previously added exact-ID protection was not sufficient for different IDs.

## Candidate implementation

`lib/watcherTelemetryCoalescer.ts` now requires a completed database write or confirmed database duplicate before suppressing other monitoring events within the coalescing window. Concurrent requests are admitted while any accepted write is unresolved. Independently failed event IDs remain retryable, even if another ID succeeded. Each completion is matched to its own generation rather than assuming the latest request represents all earlier writes.

Proof sets are capped at 64 per replay key; saturation favors additional database writes over returning unverified suppression. The overall coalescer key count is capped at 4096. This protects responsiveness without redefining replay or betting authority.

## Qualification boundaries

- The replay uploader, parser, media ingestion and Wolo settlement remain unchanged.
- Ordinary successful monitoring coalescing continues **after a durable event exists**.
- Admitting additional monitoring-only events during transient database latency is an intentional correctness tradeoff.
- Tests are source-level concurrency simulations. True HTTP-to-PostgreSQL failure injection, protected documentation baseline refresh, and real release-controller approval remain prerequisites for deployment.
