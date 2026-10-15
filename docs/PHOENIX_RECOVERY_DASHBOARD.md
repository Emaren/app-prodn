---
id: "aoe2war.app-prodn.docs-phoenix-recovery-dashboard"
title: "Phoenix Recovery Dashboard"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn","api-prodn"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "research-presentation-contract"
reviewed_at: "2026-10-15"
review_interval_days: 30
sensitivity: "internal"
---

# Phoenix Recovery Dashboard

`/hd-replay-engine` presents two independently scoped sources: the existing
cached public Parser Observatory and a dated, immutable Phoenix research
snapshot. The Phoenix panel replaces the old static October 12 research cards.
It is available even when the live observatory cannot refresh.

## Research Chronicle — bounded historical memory, not a new truth authority

The existing `/hd-replay-engine` now includes a read-only **Phoenix Research
Chronicle** below the sealed Recovery panel. The panel remains the authoritative
October 15 snapshot of the corpus; the Chronicle is a **separate historical
excerpt**, sourced from draft API PR #46 and its pinned `research-memory.json`
and Phoenix XI evidence audit. The API research seal is
`e6093762fad055a1d8e8dc3b64df9e9acf36ccab` with observation
`2026-10-15T02:56:04.200Z`. No API PR merge or production activation is implied.

The Chronicle transcribes **13 unique experiment records**, keyed by their
own research IDs and game examples, plus all **25 original IDs** authenticated
in the bounded October 15 Phoenix XI audit. Those scopes overlap: they are
neither 38 distinct games nor a measured campaign-wide attempt count. The
previous cached public aggregate's 12 indexed/10 retired case numbers are a
different bounded source snapshot; do not silently overwrite or combine them.
The real *all-time count of Codex experiments*, labor hours, tokens, method
yield and cumulative winners added outside that audit remain **unmeasured**.
The measure `0 new winners` applies to the bound 25-case audit and the
documented latest research checkpoints, not to an invented total of all past
work.

Each public experiment tile has game ID, method, observed negative evidence,
retired/blocked/control disposition and the **new** information required before
retry. The compact dated milestone series differentiates known-result native
#32388 loading/performance records from the still-unproven completed-game winner
and side semantics. The exact 25 audit IDs are shown separately: two existing
full-summary parses and 23 header fallbacks; all frames reached EOF, but none
proved a new winner. Negative disconnect/partial evidence remains binding.
#25590 needs new independently associated final evidence, #25324 a finished-
versus-unfinished control pair, and #12284 is a **result-known structural
control**, not recovered unknown-winner debt.

The public projection is manually reviewed from these pinned sources:
`lib/phoenixResearchChronicle.ts` is bounded and typed;
`components/replay-engine/PhoenixResearchChronicle.tsx` only renders safe
source-reviewed fields. No raw API research-memory JSON, private paths, Steam
identity, private receipts, financial rows or artifact bytes are copied into
the app. No page load performs network searches, replay parsing, native
execution or result promotion. Source documentation is accessible in the
draft API [PR #46](https://github.com/Emaren/api-prodn/pull/46) and
[Phoenix XI proof report](https://github.com/Emaren/api-prodn/blob/e6093762fad055a1d8e8dc3b64df9e9acf36ccab/docs/replay-intelligence/phoenix-xi-recovery-2026-10-14.md).

**Refresh policy:** A newer API research method or commit does not silently
update this excerpt. First authenticate each source record, reconcile its
exact game ID, scope and receipt with new trusted evidence, review public-field
sensitivity, and rerun the 13-record / 25-case scope and privacy tests.
Publish under a new dated source seal; retain previous seals as history and
report all-time counts only if the experiment registry has a complete,
verified denominator. Longer-term conversion to a generated, hashed public
index must retain one API research-memory authority and its stop-retry gates.
Do not build a second replay-result engine or weaken existing betting checks.

## Evidence and denominators

The sealed Phoenix XI inventory has 5,984 logical battles, 4,328 trusted results,
1,656 unknowns, 5,514 complete Workshop rosters and 4,181 Full Battle Truth
records (69.869652%). These are historical measurements, not today's live
production counts. The application checkout was
`e4594e1fb1d5fabd37e9a04ca100db085b514efd`; this snapshot does not certify its
production activation. The source drawer exposes that distinction and the
API source, inventory digest and observation times.

The bound 25-original audit authenticated every original and framed each byte
stream to exact EOF. Two full summaries and 23 header fallbacks yielded zero
new verified winners. EOF proves byte consumption, not completed gameplay.
Zero truncated streams applies only to this audit. The 7-day/all-time winner
yield, full-corpus attempt/truncation totals, terminal-candidate total and
indexed external-candidate total remain unmeasured. Null displays as an
em dash with `Not measured`; it never becomes zero.

Recovery families reconcile to the unknown inventory. Their routing counts
measure evidence requirements, not the number of cases expected to yield a
winner. Example game links open existing read-only game pages. Research-history
and exhausted-retry counts cover only the bound ledger, not the full campaign.
Opportunity details do not submit Commissioner evidence or adjudications.
The cause chart separately partitions unknown logical battles by the actual
public result disposition: 1,074 disconnect/desync, 542 untrusted structured
team result, 38 missing winner and two noncanonical stored-team claims. These
metadata dispositions do not prove whether an external artifact exists or
whether a decoder can recover a result.

## Cache contract and refresh

`lib/phoenixRecoveryDashboard.ts` validates the strict public
`aoe2war.phoenix_dashboard.v1` schema, count reconciliation, audit scope,
authority separation and privacy constraints. Unknown fields are rejected.
`lib/phoenixRecoveryDashboardCache.ts` reads only the named checked-in
`data/phoenix-recovery.snapshot.json` and its `.sha256` sidecar, verifies exact
bytes, rejects symlinks and oversized files, then validates the schema. A
missing, malformed or mismatched cache shows unavailable; no fallback count
or remote source is invented. Page loads perform no Phoenix database query,
archive scan or parser execution.

The API's existing `scripts/phoenix_recovery.py` builds the recovery index and
sanitized public aggregate from pinned inventory, research-memory and optional
audit digests. To refresh, run that bounded command against reviewed evidence
in a clean API research checkout. Independently inspect its public output and
source bindings, copy the exact public JSON into the app's named cache, and
update the sidecar to the SHA-256 of those exact bytes. Commit both together.
Never copy the private recovery index or raw evidence into the public cache.
No database or result write is part of this process.

## Validation and presentation

Run the new `tests/phoenix-recovery-dashboard.test.mts` alongside the owning
HD Replay Engine/Replay Truth contracts, the active Node contract inventory,
TypeScript, changed-source ESLint, production build, Documentation OS and
tracked-secret/dependency checks. Test cache tampering, private/unknown fields,
denominator drift, unbound audit claims, negative counts and authority
escalation. Inspect desktop and narrow layouts, zero/null rendering and the
evidence/source disclosures. Timestamps reuse the existing browser-local
`WarGraphTime` component with deterministic UTC hydration fallback.

The view can neither verify a result nor promote, settle or change Wolo
authority. Its publication requires a separately certified app release; a
local build or draft PR is not a deployment.

## Resume checkpoint · October 15, 2026

The checked-in cache was generated by reviewed API implementation
`e09e830c339dc8c8181badab5f3eed0053b7c441`. Its exact file digest is
`c1341ad92edfafb99227d3475e02fc81eb4ec90d7c0fb27af6cc9e3d24405363`.
The bound inventory was observed at `2026-10-15T02:52:48.686Z`; its SHA-256 is
`60fb2077b8906a537d2459c05cf876bbbd8cc46ac654ba662116b6b5c48bb35c`.
No refresh of production or new replay parse was performed for this view.

The local validation checkpoint passed 52 owning/research/timezone contracts
and the full canonical 446-file Node inventory (2,908 passed, 24 skipped,
zero failures). TypeScript and changed-source ESLint passed. The standard
production build passed; `/hd-replay-engine` reports 13 kB route code and
121 kB first load in the local build. Existing dependencies were reused and
the generated Prisma client refreshed locally, without database mutation.
Tracked-secret and dependency-security checks passed; the dependency check
retained its existing braces waiver without changing it. No GitGuardian
finding or API PR #46 security requirement is waived by these local checks.

The actual component was inspected at desktop and 390 px mobile widths with
the live DB disconnected. The sealed panel remained available, unknown live
coverage stayed unavailable, the audit's zero remained visible, and source
and opportunity disclosures opened. Document width remained 390 px on mobile.
