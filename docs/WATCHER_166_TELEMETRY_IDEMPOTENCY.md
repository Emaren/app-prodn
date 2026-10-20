---
id: "aoe2war.app-prodn.docs-watcher-166-telemetry-idempotency"
title: "Watcher 1.6.6 — Server-side telemetry retry idempotency"
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

# Watcher 1.6.6 — Server-side telemetry retry idempotency

**Draft schema/API change. No production migration or release is authorized.**

## Problem

A successfully stored event whose HTTP response is lost will be retried using the same `telemetryEventId`. ACK validation alone does not prevent duplicate rows and inflated analytical event counts. The prior coalescer patch handles failed writes for a particular monitoring-ignore event, not general database idempotency.

## New authority

An additive nullable indexed `telemetry_event_id` column uniquely identifies client-generated telemetry. Legacy clients without this ID remain unaffected. On a confirmed Prisma P2002 collision *specifically for this key*, return `stored:0, suppressed:1, failed:0`. This is an acknowledged duplicate, not a new event. All other database errors remain failures and 503 for a failed single-event write.

The server's database uniqueness fence, not an in-process coalescer, arbitrates concurrent duplicate deliveries. Optional stream logging uses the same event recorder and may omit IDs.

## Qualification gates

- Prisma generate/typecheck, schema migration and rollback review
- Concurrent identical-ID inserts against actual PostgreSQL, with only one row
- Cross-user collision handling and unauthorized event ingress checks
- Lost-ACK/retry on 1.6.5 and 1.6.6 clients; old clients unchanged
- No change to game replay upload, terminal adjudication, bets, WoloChain or custody
- Protected release controller must deploy database migration before relying on the field in a server build

Source tests simulate Prisma unique collisions but are not substitutes for physical DB concurrency proof.
