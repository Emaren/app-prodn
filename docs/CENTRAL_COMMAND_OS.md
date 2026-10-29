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

## Post-W1 signed observer evidence freshness (isolated G source)

The private Central Command now projects three **read-only signed storage
observation clocks** by reusing `readPrivateStorageVisual()`, the existing
authenticated local receiver/readback. It does not read GitHub timestamps as
host evidence or trigger a publisher. The pure
`lib/centralSignedPulse.ts` policy binds the three fixed source plane IDs
(`mac`, `hel1-root`, `hel1-volume-105319120`) to:

- **FRESH** only when that plane occurs in a valid authenticated private visual
  receipt, its status agrees with the observation clock, and the signed
  observation is no older than 36h (existing C v1 maximum age).
- **STALE** when an authenticated plane observation is older than 36h and its
  reader status is independently STALE; no new wrapper `generated_at` can renew it.
- **UNKNOWN** on missing keys/receipt/plane, unverifiable or unreadable store,
  invalid/future-dated clock, or contradictory authenticated status.

The private API keeps existing admin authorization, no-store and GET-only
semantics. A failure returns an explicit `RECEIPT_INVALID_OR_UNREADABLE`
UNKNOWN without leaking signature or filesystem details or retaining prior
FRESH results. The browser presents observation freshness, **NOT an actual
healthy systemd agent, live service, full L1 scan, independent signed ACK
delivery or deployment permit**. Gross-only C v1 transport and permanent L5
NEVER DELETE are untouched. This incremental projection creates no timer,
daemon, scanner, agent tab controller, auto-repair, financial or deletion
authority. A future approved original publisher may reuse the existing
observer schedule and signed C ingress; only authenticated durable readback is
eligible to change these states. CI's disposable no-key Chrome must show all
three planes UNKNOWN.

This post-W1 branch is explicitly excluded from the frozen W1 deployment
candidate until a separate independent source review/merge and future release.
The held #933 public inspection evidence expiry fix is **not copied**:
inspection scores alone lack source-signed agent receipts, and the existing
private Central Command previously had no GREEN agent-health claim.

