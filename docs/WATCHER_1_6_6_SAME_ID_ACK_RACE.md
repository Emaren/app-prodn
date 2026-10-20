# Watcher 1.6.6 — Same-ID coalescing receipt race (source candidate)

Earlier telemetry ingress coalesced a repeated monitoring event immediately, even while the first insert of its **same `telemetryEventId`** was still awaiting PostgreSQL. A second concurrent request could receive HTTP 200 `suppressed:1` before knowing whether the original write succeeded. If the first write then failed, that response was not a valid durability acknowledgment.

The bounded server coalescer now tracks the exact in-flight ID and lets overlapping requests of that **same ID** reach PostgreSQL. Database uniqueness/idempotency (app PR #722) remains the final arbiter, so one succeeds and the other becomes an acknowledged duplicate, or failures remain retryable. Unrelated monitoring-event IDs continue to coalesce and do not increase normal ingest traffic. Success/failure callbacks are generation-checked so stale completions cannot overwrite newer state.

Tests cover concurrent admission, cross-ID coalescing, failed first/second writes, retry reopening and stale success. A green source test does not replace real HTTP + PostgreSQL interleaving/fault-injection, which remains an explicit production release gate. No replay upload or betting admission policy changes.
