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
reviewed_at: "2026-10-29"
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

## Durable six-lane W1 source registry (owner policy 2026-10-29)

The source-owned `config/central-command-lanes.json` retains the six
original lane IDs **D, G, C, E, F, B**, their original GitHub issue numbers and
read-only dispatch authority. That registry is the reusable handoff contract,
not an agent controller or a claim that ChatGPT tabs run automatically.

G covers **L1–L5** five-level Storage OS governance and separately capacity-
gated Finder Recents; its source enters the coordinated nonfinancial W1 only
after independent review and normal integration of Storage PR #977. The
current C v1 exact HMAC schema verifies gross hogs only: individual
review/approval remains **UNAVAILABLE** and L1 scope/physical gain **UNKNOWN**,
not a promise of a live per-item transport.

E owns the **W1_HARD_GATE** capacity and independent restore criteria. F owns
the single **W1_RELEASE_OWNER** website-only stage/rollback and separately
authorized activation. This supersedes obsolete registry labels `R1_ONLY`,
`R0_HARD_GATE` and `R0_OWNER` for *current work only*; frozen R0 source
and signed historical release receipts are not rewritten. Financial B remains
`FUNDED_ONLY` under hard hold. None of these source labels grants deletion,
provider purchase, Mac indexing, production installation or financial custody.



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

## Q09-A1 — private GitHub source-event window (post-W1, not deployed)

The separate authenticated `GET /api/admin/central-command/events` uses the same
`requireAdmin` database-backed session guard (anonymous 401, non-admin 403,
GET admin-only, POST 405). The browser never receives `GITHUB_TOKEN`, source
comment bodies, review content or arbitrary upstream links. Only code-owned
allowlisted GitHub issues, PRs, commit and review pages, and approved workflow
paths are queried with a bounded request budget, 2.4-second per-source deadlines,
55-second process cache, concurrent batches of seven and 90-second rate-limit
backoff. For comments the bounded latest Link-header page is read, not blindly
the oldest first page. Returned data is versioned, deduplicated and timestamped
from real GitHub provider fields, with each event linked to its provider ID.
Unknown, partial and stale source coverage is explicit.

The event strip on `/admin/central-command` revalidates only while the
document is visible (75-second cadence), cancels on unmount and preserves six
original lane cards. An issued GitHub command is NOT a wake/working receipt.
A successful GitHub workflow is source-only and NEVER a production-build
attestation. In-memory last-good is a bounded stale convenience, not the Q15
immutable ledger. No operational automation, job reservation, financial writer,
host probe or stage/activation approval is introduced.

## Q09-A2 — visual Job Exchange (post-W1, source preview only)

`/admin/central-command/job-board` uses the existing server-only
`requireServerAdmin` guard, the reviewed Q09-A1 private event feed, and
the six original source-owned lanes. The top rail depicts the stage taxonomy,
NOT that all stages completed; last per-lane GitHub source receipts light
read-only brain cards without implying a ChatGPT process is running.

Explicit Q09-A1 #997 and Q09-A2 #998 tickets remain source *specifications*.
No lane eligibility or owner wake is inferred from those issue bodies;
the bullpen reports UNKNOWN until an independent authority certifies it.
A GitHub merge is SOURCE_MERGED, not deployed. The release BUILD_ID,
finance/custody receipts and independently witnessed host state stay UNKNOWN.

The private page exposes direct GitHub original issue/event links, per-core
keyboard-accessible selection, strict no-overflow mobile layouts at
375/768/1440, and a separate Codex funded workstream. Motion is restrained,
static/reduced-motion safe; no fictitious neural computing heartbeat.
Session D exclusively owns AppShell/castle/global navigation. New local
Central Command deep-link only; no remote execution or new daemon.

## Q09-A3 — Work Board and Six-Lane Evidence Ledger (post-W1)

G-owned private routes: `/admin/central-command/work-board` and
`/admin/central-command/lanes`, protected server-side using the existing
`requireServerAdmin` session+DB guard. A separate API
`GET /api/admin/central-command/work-ledger` requires database-backed
`requireAdmin` (guest 401, non-admin 403; POST 405, private no-store).
No unapproved setter, task claiming, daemon, financial operation or release
activation is exposed. These remain isolated post-W1 source candidates.

`lib/centralWorkLedger.ts` projects the **same bounded cached original A1
GitHub EventFeed** without another external request. Source link/repo, immutable
event ID, UTC original timestamp, valid source SHA and vetted event kind are
rechecked before generating a six-lane read-only ledger and source PR cards.
CI receipt joins **only by exact full PR-head SHA**; a single successful
workflow does NOT certify every required check. Comments/dispatches are not
evidence an agent woke, a review was independent or a source return occurred.
A merge is source-only, never evidence of a HEL1-installed BUILD_ID. QUEUED
links only to canonical owner authority #984 and its eligibility remains
UNKNOWN until an authenticated structured queue read exists. Unclassified
SOURCE_RETURNED, native host, owner permits, restore, custody and deployment
remain UNKNOWN, not fictional zero-completion percentages.

The private UI has an 8-column readable source flow, lane neural cores with
original issue links, immutable source-event drilldowns, separate Codex rail,
three held release tracks, and strict 75-second visible-only refresh. It does
not show source issue comment bodies, private canonical-queue prose or browser
GitHub tokens. Standalone adversarial Node contracts and genuine isolated
PostgreSQL/Chrome 375/768/1440 auth/a11y screenshots cover these receipts.
D exclusively owns AppShell/HeaderMenu/Navigation Atlas/shared mobile dock;
G adds local private Job Exchange links only. Priority queue, release rails
and public-safe Kingdom Works require separate scoped acceptance.
