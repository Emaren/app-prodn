---
id: "aoe2war.app-prodn.central-command-os"
title: "Private Central Command OS"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn","vpssentry","wolochain"]
audience: ["operators","developers","ai-agents"]
source_of_truth: "git"
authority: "private-source-dispatch-contract"
reviewed_at: "2026-10-28"
review_interval_days: 30
sensitivity: "internal"
---

# Private Central Command OS

Wave 1 is a single nonfinancial production application activation, never a
shortcut around Wolo/finance, Doctor, independent restore, stage and owner permits.

- `/admin/central-command` requires the existing authenticated server admin
  session and reads `GET /api/admin/central-command` with `private, no-store`.
- The API reads the merged source-owned `config/central-command-lanes.json`,
  bounds GitHub issue/PR metadata to six allowlisted lanes (three concurrent
  requests, each 2.5 seconds) and **never** accepts a user-controlled URL.
  A missing GitHub credential/network leaves evidence UNKNOWN.
- The six progress bars have the **registered ASSIGNED** gate only (1/6).
  Verified source review, exact CI, merge, native host acceptance and LIVE_VERIFIED
  are NOT inferred from a PR's existence or GitHub issue state.
- The W1 target SHA, build ID, stage and production activation stay UNKNOWN
  until F's independently witnessed candidate/release proofs. R0 is explicitly
  a frozen audit reference, not a claim of currently installed source.
- Copy handoff produces inert plain text for the operator to paste into a separate
  ChatGPT session. No ChatGPT tab control, background agent, remote-exec,
  release-controller or financial/cleanup mutation is created.
- The owner dashboard keeps original issue/PR links, source read timestamps,
  named blockers, and UNKNOWN on partial/stale GitHub failure. Do not interpret
  that metadata as current health or per-file/physical capacity.
- Independent native acceptance must show anonymous 401, authenticated
  non-admin 403, genuine admin 200, no-store, POST 405, no public data leak,
  Chrome keyboard/375px/768px/1440px/empty-source and host-loss behavior.
  CI source tests or a public 88-route browser sweep alone do not qualify this.
- The existing `/admin/ai` Council, `/admin/aoe2war-os` controller,
  `/admin/storage-os` gauges and source-owned Mac/HEL1 observers are untouched
  except for an ordinary link from AoE2WAR OS.
- Finder Recents remains separately capacity-gated; never use an owner UI
  decision as blanket deletion or reindex authorization.

Release authority remains with Central and F; source merge is not deployment.
