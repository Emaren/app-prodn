---
id: "aoe2war.app-prodn.kingdom-foundry-f1-f5-source-handoff"
title: "Kingdom Foundry F1–F5 — Source-only engineering and Nightforge acceptance"
type: "working"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn", "kingdom-foundry", "kingdom-traders"]
audience: ["developers", "operators", "ai-agents"]
source_of_truth: "git"
authority: "product-only-session-c-source-review"
reviewed_at: "2026-11-10"
review_interval_days: 30
sensitivity: "internal"
---

# Kingdom Foundry F1–F5 — Source-only engineering and Nightforge acceptance

## Exact source and release boundaries

**PRODUCT-only branch**: session-c/foundry-f1-f3-20261110.
**Exact reviewed implementation**: f55ff910291d71e4cef86a07c465417d2d7007b3.
**Exact Foundry F0 parent**: a841d468f23d24ec67fd5ecc97bf3821f70ab3e3,
the docs-only repair of draft App PR #1291's original F0 source
6573ccb77b1001e3eecc0381cebf6ea7237d8cf8.
**Target review path**: a new DRAFT App pull request stacked on #1291,
never a merge into Session B's active 3032 source. Earlier App PR #1281
and #1288 are independent, fully green PRODUCT source packages; they
are not silently merged here.

**Owned paths only**: tools/kingdom-foundry/foundry_secure.py,
foundry_dispatch.py, nightforge.py, nightforge_benchmark.py,
foundry_checkpoint.py and their four new focused test files;
.github/workflows/session-c-foundry-offline.yml; this documentation,
existing Foundry README and the generated docs control-plane registry.
Existing F0 foundry.py, active App route/page, Steam, Traffic, Watcher,
media, Storage OS, SQL schema, financial service and Session B checkout
were not changed.

## F1 — Source-bound event journal

- Reuses the original F0 fixed JSON event allowlist and original
  14 refusal tests. F1 independently checks duplicate JSON keys,
  bounded 8192-byte events, unsafe report/URI text, typed locally
  SHA-sealed 4096-byte-or-smaller evidence, encoded path traversal,
  unknown and revoked source SHA, and private PRODUCT-only SQLite files.
- Fixed read-only Git subprocess arguments (shell=False, disabled hooks,
  no network and no arbitrary event-derived command) validate that the
  exact 40-hex source commit equals an operator-pinned hash in a trusted
  PRODUCT repository checkout with approved GitHub origin. An event's
  SHA string by itself is NOT a valid provenance receipt.
- Each original event receives an AUTOINCREMENT monotonic persisted
  record_id, exact SHA canonical body, and unique lane/source/kind/
  sourceSHA/evidence fingerprint. Duplicate event identity and changed
  payload reject a replay; a second event ID with the same source-bound
  evidence cannot duplicate a task. Insert occurs under BEGIN IMMEDIATE.
- Missing evidence, unknown, moved or untrusted Git SHA, or CRITICAL
  incident is recorded as HOLD, never admitted as a scheduling source.
- Owner-private SQLite WAL, 5000-event ceiling, 64 MiB database ceiling,
  frequent WAL checkpoints, no protected FINANCIAL, wallet, signer,
  custody or owner-authority path admission. This is NOT a security
  boundary against a compromised OS operator; deploy only under a
  separately restricted PRODUCT service identity after admission.

## F2 — Durable dispatcher, not a worker

- SQLite lane-specific PRODUCT_B/PRODUCT_C queue, unique event and PR
  branch target, ordered dependencies (up to eight), finite 500 pending
  jobs, per-lane paused-until and monotonic persisted clock highwater,
  bounded retries (three attempts), opaque SHA-only stored lease tokens,
  120-second maximum lease, heartbeats and expiry-based reclamation.
- Source PIN is revalidated at BOTH enqueue and claim. Source drift
  holds a queued task without launching it.
- Persistent daily per-lane cost ceiling, reservation reconciliation,
  and daily claim count; no money is spent by this scheduler.
- The simulated DONE acknowledgement is a deterministic scheduler
  test state, NOT external coding proof-of-work or deployed source
  acceptance. No agent, process runner, GitHub write command, network,
  shell or production action is connected.
- Crash test opens independent SQLite connections after an expired
  lease: a newer lease can be claimed once and the stale token can no
  longer acknowledge. This is transactional crash/reconnect acceptance,
  NOT a real HEL1 service SIGKILL or OS reboot test.

## F3 — Nightforge sanitized observations

Pure-function adapters ingest only exact typed, bounded fields for
systemd services/timers, GitHub draft PR checks, Steam admin/ordinary
authentication state, Watcher 1.6.5 heartbeat vs replay-monitoring
distinction, Traffic original certified gaps, Storage OS three-plane
capacity, private PAPER source CRC/freshness and HALT, missing managed
media groups, and nonfinancial API route status. Any additional raw
log, user/device identifier, SQL, token, cookie, command or path is
rejected rather than displayed. No source-adapter queries live HEL1:
all current tests use deterministic sanitized fixtures.

A fixed summary template and typed F0-schema event with SHA-addressed
synthetic evidence can be admitted through the F1 journal. Findings
only propose an investigation and expose severity/code grouping,
never commands. Missing Traffic history is UNKNOWN, not manufactured
zero. An observed Watcher connection does not certify replay monitoring.
Storage signed *visual* data cannot qualify C06 source HMAC, scheduled
backup cycles or C07 restore. A PAPER HALT breach emits critical HOLD.

## F4 — Offline baseline, not local LLM acceptance

The test harness contains 12 known-answer sanitized scenarios covering
Traffic, Watcher, Storage, GitHub CI, media, routes and PAPER.
It measures classification accuracy, false positive/negative rates,
per-observation latency and Python peak traced memory, and rejects
unknown model codes, missing cases or unbounded repetitions.

**Actual owner M1 deterministic baseline** (60 repetitions of 12):
720/720 classifications matched, 0 false positives, 0 false negatives,
median 0.0953 ms, peak Python traced memory 863327 bytes.
This is a rule-based engine, NOT a quantized model, actual GPU benchmark,
resident HEL1 service, or proof the original source data is authentic.
No model weight download, inference API or extra website runtime occurred.

Future optional local quantized-model admission must use separate small
offline sanitised JSON predictions, reproduce the benchmark with zero
critical false negatives, bound CPU/latency/RSS, and obtain fresh host
resource approval. HEL1 four vCPUs, 7.6 GiB installed RAM and heavy swap
mean **NO RESIDENT HEL1 INFERENCE** at present; on M1 the 16 GiB free disk
does not authorize weights or a 30 GiB native market-capture experiment.

## F5 — Future supported-agent continuation remains frozen

Foundry stores only SHA-digests of a future supported Codex SDK/OpenAI API
session reference and proof receipt, exact repo source SHA, explicit finite
model-budget and turn limits, and a durable HOLD state. It does NOT store
the raw session credential, invoke an API, connect an agent, verify an
owner approval or automatically resume a task. The local proof SHA is
not a signed external proof-of-work; the human approval field is
permanently false. Supported API continuation, external proof attestation,
owner/central authorization and a separately audited command broker
are FUTURE work. No ChatGPT Chrome scraping, auto-prompting, arbitrary
terminal text, tools-security bypass or quota circumvention is allowed.

## Acceptance, routes and rollback

Run:

    python3 -m unittest discover -s tools/kingdom-foundry/tests -v
    python3 scripts/docs_v2_check.py

The lightweight dedicated GitHub workflow repeats the entire Foundry
suite, a deterministic benchmark, documentation gate with full history,
and no-active-API-route assertions. Source baseline must point to the
exact implementation SHA above, not the latest generated registry
commit. Source tests and independent CI are NOT production deployment.

No Foundry or Nightforge website API/page exists. A future explicitly
admin-authorized, server-only integration would need actual anonymous
401, ordinary authenticated nonadmin 403, missing/unverified trusted
source 503 and successful admitted read-only 200 receipts before
public promotion. These are expected contracts, **not measured deployed
HTTP response codes**. Neither a model nor GitHub CI result can
automatically grant WEBSITE or FINANCIAL release approval.

Resource impact now: source checkout and tests only, no resident CPU,
RAM, periodic polling, HTTP listener, new storage database on HEL1,
No migrations to production or source-capture data. Python tests use
temporary owner-private SQLite in the isolated checkout and close it
afterward. Future resource caps require a distinct service admission.

Rollback of current source is omitting these additive modules and tests
and abandoning this unmerged DRAFT branch. No website selector, HEL1
service, systemd timer, private PAPER 9447, Nginx, Steam V20 or finance
operation was changed. Session B retains 3032/3030 source promotion and
real authenticated role tests. Codex retains all seven FINANCIAL gates
and Intel recovery proof.

**Status: SOURCE QUALIFICATION PENDING INDEPENDENT CI; EXECUTION DISABLED.**
