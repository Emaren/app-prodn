---
id: "aoe2war.app-prodn.foundry-f6-audit-concurrency-contract"
title: "Foundry F6 — Transactional audit, concurrent claim and crash recovery"
type: "working"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn","kingdom-foundry"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "product-only-session-c-source-review"
reviewed_at: "2026-11-10"
review_interval_days: 30
sensitivity: "internal"
---

# Foundry F6 — Transactional audit, concurrent claim and crash recovery

## Source, ownership, safety

Stacked F6 implementation SHA:
5866bdf53299a36f70ebadda6a2198cf56495e07.

Direct parent F0–F5 DRAFT App PR #1296:
781dc1cb37264d3a8f10c9ac8e1cf09556f9a333.
That is stacked on F0 DRAFT App PR #1291:
a841d468f23d24ec67fd5ecc97bf3821f70ab3e3.

No edits to Session B's app checkout, public 3032, rollback 3030,
Nginx, Steam V20, native FINANCIAL SQL, Intel recovery, installed PAPER
127.0.0.1:9447, or trading controls. No new market/PAPER orders.
All source belongs to a separate Session C PRODUCT worktree at
kingdom-foundry-f6, branch session-c/foundry-f6-audit-race-20261110.
No agent, command execution, network poll, production database or HEL1
observer has been started.

## Implemented queue audit

- Every supported F2 queue transition writes a deterministic fixed-schema
  audit event **inside the same IMMEDIATE SQLite WAL transaction** as
  the queue-state update.
- Hash chain: SHA256(previous SHA + newline + canonical event JSON);
  monotonically increasing audit sequence and 20,000-receipt ceiling.
- Additional direct SQLite UPDATE/DELETE triggers refuse edits to the
  local audit table. On scheduler initialization and before starting a new
  mutation, the integrity verifier checks exact sequence, hash linkage,
  known events/lanes, and a permanently false execution flag.
- Audit entries contain only lane, bounded simulated job ID, event type,
  bounded timestamp, nonfinancial modeled cost, state, and static DENIED
  finance markers. **No raw lease token, credentials or report text.**
- An invalid state-cost settlement rolls back without appending an audit
  receipt or changing the claimed job. Source-pin drift changes the job
  to HOLD and leaves a separate auditable reason.

**Important limitation:** The chain is *local tamper evidence*, NOT a
cryptographic external timestamp, immutable external repository, signed
proof, tamper-proof privileged-write defense, or evidence of true agent
execution. A database administrator able to replace the complete DB can
also replace the chain. Genuine off-host, signed digest anchoring would
need a separately approved deployment.

## Actual disposable physical tests

- The original F0–F5 suite and F6 tests: **72/72 local PASS**.
- Three independent subprocesses tried to claim three queued tasks
  concurrently. Each received exactly one distinct simulated job ID.
  Reconnected journal recorded three claims and six audit receipts
  (three enqueues and three claims). No actual work was executed.
- A disposable forked child claimed an F2 lease and intentionally
  self-SIGKILLed. The parent confirmed exit code -9. A separate
  SQLite connection reclaimed exactly the same job on attempt two after
  lease expiry. The stale dead-child token was rejected. The recovered
  lease reached simulated DONE once; no duplicate journal event was
  produced. No HEL1 service was killed or restarted.
- SQL mutation and deletion triggers both reject directly; forced
  tampering after removing the trigger makes the next F2 claim fail.
- F6 negative tests also reject wrong source head after enqueue,
  cross-lane audit entries, forged execution/audit states, unbounded
  cost, failed settlement and duplicate job ownership.
- Dedicated GitHub offline workflow runs the full suite AND explicitly
  runs the nine F6 concurrency/tamper tests, with no new resident service.

These are actual local disposable process tests, **not** an actual
public website browser acceptance, a HEL1 OS SIGKILL restart drill,
or proof of agent code completion.

## Resource budget and release handoff

F6 consumes a small additive Python module and one new test file.
The isolated checked-out App tree is approximately 287 MiB; the owner
Mac read-only disk census showed ~23 GiB free before F6. No weight
download, large archive, build tree, long-running process or heavy
Next.js preview was created. Runtime CPU/RAM and disk impact on HEL1
is **zero because the code is not deployed**.

Future service admission needs: unprivileged PRODUCT-only service
identity, isolated owner-private writable journal, 500-job/5,000-event/
20,000-audit caps, resident RSS/CPU cgroup budget, finite WAL growth,
read-only systemd and source adapters, exact Git source/head checks,
admin-only UI role acceptance, B/Central signed source/rollback plan,
and physical positive+401/403/503/200 negative receipts.

No public Foundry API/page was added, so these HTTP responses are
**future contract requirements, not measured route behavior**.

Rollback: leave F6 unmerged and the module unimported outside test
jobs. The prior F0–F5 branch remains unchanged and independently
qualified. No website or PAPER service rollback is necessary.

**Status: SOURCE QUALIFICATION PENDING exact-head independent CI;
execution disabled, finance denied, model inference HOLD.**
