---
id: "aoe2war.app-prodn.docs-watcher-http-pg-failure-proof"
title: "Watcher 1.6.6 — Real HTTP/Prisma/PostgreSQL Failure Injection"
type: "runbook"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn","aoe2-watcher"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "watcher-telemetry-release-proof"
reviewed_at: "2026-10-19"
review_interval_days: 30
sensitivity: "internal"
---

# Watcher 1.6.6 — Real HTTP/Prisma/PostgreSQL Failure Injection

The CI proof boots an actual **Next.js application server**, exercises its real POST /api/watcher/events endpoint, and persists through the actual Prisma PostgreSQL adapter to an **isolated PostgreSQL 16 service** with database name watcher_ci. This job does not connect to any production or user database, establish a real account, or touch replays, balances, wallets or settlements.

It checks exact-ID storage and duplicate acknowledgments; injects a real PostgreSQL trigger that sleeps for two seconds then raises an insert exception; waits for pg_stat_activity to confirm the first request is inside the database sleep; sends a second, different monitoring ID and requires a legitimate stored=1 receipt; checks the first request returns HTTP 503; removes the injected failure; retries the original ID successfully. It additionally tests malformed batches and the 64 KiB body cap over HTTP.

The Next route is exercised with no API key so it uses its unresolved identity branch. Consequently **authenticated user-pairing behavior is not certified by this test**. CI network/local database observations do not replace production release-control approval, physical Watcher client CPU/heap/replay canaries, or Mac updater safety tests. The fixture is disposable and has no finance schema.
