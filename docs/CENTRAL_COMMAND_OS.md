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

## Source-authenticated Storage OS bridge (app-side G contract)

The existing `POST /api/internal/aoe2war-os/bridge` has one separate
`op=storage_visual` branch, authenticated first by its existing bridge bearer.
It does NOT create an extra heartbeat, background timer or host scanner. The
relay forwards the source-owned C
`aoe2war.storage-visual.bridge-submission.v1` unchanged, up to 49,152 bytes.

The receiver checks the domain-separated Mac and HEL1 per-source 32-byte HMACs
with separate `AOE2WAR_STORAGE_VISUAL_MAC_HMAC_KEY` and
`AOE2WAR_STORAGE_VISUAL_HEL1_HMAC_KEY`; checks schema, exact ordered plane ID,
mount/collector role, source-digest, timestamp <=36h and <=60s future,
PARTIAL coverage, bounded allowlisted gross hogs, empty unproven event rows,
NO financial/deletion privilege and monotone source observation. No keys are
in source control or auto-created. A separate
`AOE2WAR_STORAGE_VISUAL_HMAC_KEY` signs the private visual read-side file.
A distinct `AOE2WAR_STORAGE_BRIDGE_ACK_HMAC_KEY` signs a durable,
independently read-back ACK. The existing bridge bearer must not reuse any
of those keys. Missing, malformed or reused environment keys HOLD.

Only private owner-controlled state directories (0700) and files (0600)
are accepted. A single exclusive writer lease, atomic fsync/rename,
durable 0600 acknowledgment ledger, bounded history and verified readback
precede signed `STORED_VERIFIED_READBACK` status. Replayed, stale,
tampered or unqualified source data HOLD; identical durable exact retries
are `IDEMPOTENT` only while the current stored bytes match the recorded
digest. Previously signed, still fresh planes are retained on a partial
source submission; missing/expired planes remain UNKNOWN. No source is
called physically reclaimed without separate APFS/witness receipts.

Source fixture tests cannot prove real HMAC/key provisioning, DynamicUser
permission behavior, natural scheduled measurements or remote delivery.
The C source-owner permit `C-ADOPT-PERMIT-01` and F protected W1 activation
remain separate explicit owner gates. No live website host operation,
credential installation, terminal command or financial write was performed
by implementing this source.
