---
id: "aoe2war.app-prodn.docs-watcher-166-telemetry-body-limit"
title: "Watcher diagnostic request bounded-read proof"
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

# Watcher diagnostic request bounded-read proof

The server previously checked the HTTP Content-Length header but then used request.json(), which buffers whatever body the client actually sends. Diagnostic callers may use chunked encoding or supply no reliable size header.

The route now streams the diagnostic body and stops when the *received* byte count exceeds the established 64 KiB limit. JSON, event normalization, authorization, acknowledgement and database authority are otherwise unchanged. Invalid JSON remains a 400 response; oversized bodies receive the existing 413 response. This does not affect replay upload or video routes.

Test cases cover normal event payloads, exact byte boundary, chunked oversized bodies, malformed JSON, and split Unicode. Passing source tests does not certify physical ingress load, nor authorize merging the draft server PR while its documentation and protected release gates are red.
