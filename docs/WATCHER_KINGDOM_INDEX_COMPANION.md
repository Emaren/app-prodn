---
id: "aoe2war.app-prodn.docs-watcher-kingdom-index-companion"
title: "The Watcher — Kingdom Index Desktop Companion Certification"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn","aoe2-watcher"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "watcher-desktop-companion-assurance"
reviewed_at: "2026-10-20"
review_interval_days: 30
sensitivity: "internal"
---

# The Watcher — Kingdom Index Desktop Companion Certification

The Watcher is a separately versioned **Electron desktop companion**, not a Next.js route. The public Kingdom Index must display it in a dedicated companion section and must **not** count it as one of the current 88 web routes. Its release baseline is the published **1.6.5** source commit `b49f31bb69fea629378072faa22220cdfcc2f1ef`. The 1.6.6 integration candidate is an unmerged draft and is not a published release.

The independent `config/kingdom-index-companions.json` catalogue lists nine mandatory assurance gates: source/artifact drift; replay ingress and finality; measured idle CPU/RSS/wakeups; failure and recovery; streaming arbitration; privacy and financial separation; update and rollback; dependency and dead-code health; and real-client release regression qualification.

`lib/kingdomIndex.ts` projects the companion separately from website-route quality. Its assessment is `status: "unmeasured"` and `score: null`. This is **not a numeric score of zero or 100**: there is no independently authenticated installed-binary, source, and physical-platform evidence sufficient to assign one.

## Certification evidence required

A future certificate must bind the exact tagged Watcher source, reproducible release artifact digest, downloaded binary, installed version, and platform. It must include frozen 1.6.4–1.6.5 replay corpus comparisons, successful physical Watcher upload and recovery canaries on Windows/macOS/Linux, actual idle/monitor/upload/streaming CPU-memory-wakeup cohorts, and failures injected through server acknowledgments and disk writes. The Mac update helper must prove secure archive extraction, authentic process exit, rollback and Gatekeeper behavior without assuming root write permissions.

Financial services remain independent: Watcher never gains wallet custody, betting signer, balance transfer, or settlement authority. Server-side reporting and read-only Kingdom Index display are not a substitute for these controls.

Until all relevant evidence is available and separately approved, the companion must remain **unmeasured** and cannot be promoted to 100/100. This document defines the qualification contract; it does not issue a certificate, authorize an update, or enable any financial feature.
