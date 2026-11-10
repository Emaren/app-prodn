---
id: "aoe2war.app-prodn.kingdom-foundry-f0-readme"
title: "Kingdom Foundry — Phase 0 (source-only)"
type: "working"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn", "kingdom-foundry"]
audience: ["developers", "operators", "ai-agents"]
source_of_truth: "git"
authority: "product-only-source-review"
reviewed_at: "2026-11-10"
review_interval_days: 30
sensitivity: "internal"
---

# Kingdom Foundry — Phase 0 (source-only)

Tracked in [App #1290](https://github.com/Emaren/app-prodn/issues/1290).

**Two cooperating engines under the PRODUCT root:** **Kingdom Foreman** (engineer queue/orchestration) and **Nightforge** (read-only, local telemetry triage). One shared central dashboard and strict source/permission controls. Phase 0 is deliberately **NOT AN ENGINE** yet: a minimal deterministic SQLite WAL journal and offline schema acceptance only.

## Acceptance boundary

- Only `PRODUCT_B` and `PRODUCT_C` tasks; **FINANCIAL and owner-private paths denied**.
- Source SHA, fixed provenance, event identity, bounded JSON, nonsecret references, duplicate ID rejection, critical/unknown HOLD.
- **No shell execution, daemon, LLM inference, network call, wallet, PostgreSQL finance role, service restart or release authority.**
- Keyword-based sensitive-content checks are not a substitute for upstream sanitation, least-privilege OS identity, file-system isolation, or DLP.
- Never install as a production service until separate signed acceptance and resource gates.
- The currently deployed HEL1 has tight CPU/RAM/swap; no resident LLM is admitted.

## Offline reproduction

```bash
python3 -m unittest discover -s tools/kingdom-foundry/tests -v
python3 tools/kingdom-foundry/foundry.py --db /tmp/foundry-v0.sqlite3 init
python3 tools/kingdom-foundry/foundry.py --db /tmp/foundry-v0.sqlite3 status
```

The prototype's 14/14 tests were verified by Central before staging to this new GitHub-only review branch. Re-run on the exact pushed head under independent CI before accepting. The temporary sample example holds when the source hash is unknown.

## Next source gates

F0 isolated PRODUCT source / no B/C collisions; F1 schema and input security; F2 bounded retries and durable lane locks; F3 deterministic Traffic/Watcher/Storage/PAPER anomaly triage; F4 two automatically continued PRODUCT-only turns through a supported agent API; F5 separately approved command broker (all shell auto-execution disabled initially); F6 tiny local-model benchmark on M1 and strict HEL1 host admission; F7 source-pinned nonfinancial product release with actual role/HTTP/rollback checks; F8 durable crash recovery and budgets.

**Important:** This is a separate source branch for Session C to inspect, test and improve without modifying the existing live B or C worktrees. Not merged, not deployed.

## Source lineage and governance

Central created the initial files using the owner-requested Phase 0 prototype and test contract in ChatGPT; code is not financial or privileged and it must be independently reviewed. See [App #1280](https://github.com/Emaren/app-prodn/issues/1280) for two-workspace owner boundaries and [Chain #239](https://github.com/Emaren/wolochain/issues/239) for the seven held finance gates.

## Session C F1–F5 source-only expansion

The separately reviewed Session C branch adds a monotonic source-pinned F1
event ledger, durable F2 scheduler with crash/retry and budget holds, strict
F3 Nightforge normalized observation adapters, F4 offline deterministic
benchmark and permanently frozen F5 future agent checkpoints. Nothing is
connected to a coding model, shell command broker, public website, live
exchange, financing service, or the installed HEL1 PAPER source. All
execution flags remain false; this code is not a daemon or deployment.

Full source controls: [F1–F5 handoff](../../docs/SESSION_C_KINGDOM_FOUNDRY_F1_F5_HANDOFF.md).

Reproduce offline with the standard library test runner:

    python3 -m unittest discover -s tools/kingdom-foundry/tests -v
    python3 scripts/docs_v2_check.py

## F6 audited nonexecuting source and physical disposable race tests

The stacked F6 source adds append-only internal audit checks and actual
PRODUCT-only disposable subprocess concurrency/SIGKILL tests. No real
worker, LLM, command broker or HEL1 service is connected. Its internal
hash chain is NOT externally anchored or immutable against a privileged
DB rewrite. Read [F6 audit and recovery handoff](../../docs/SESSION_C_FOUNDRY_F6_AUDIT_CONCURRENCY.md)
and the [read-only workspace inventory](../../docs/SESSION_C_PRODUCT_INVENTORY_20261110.md).

F6 local test command:

    python3 -m unittest discover -s tools/kingdom-foundry/tests -v

## F7 owner-private read-only Central Command surface

Foundry F7 adds a bounded SQLite snapshot projection with local Git source,
current HOLDs, severity, assigned PRODUCT lane, evidence and fixed permitted
operator steps. Static responsive HTML is created only as a 0600 file in an
existing owner-private PRODUCT directory. No public website route, server,
LLM or execution permission is involved. See
[F7 private dashboard handoff](../../docs/SESSION_C_FOUNDRY_F7_PRIVATE_COMMAND_READMODEL.md).

Run offline:

    python3 -m unittest discover -s tools/kingdom-foundry/tests -v

## F8 sanitized, research-only offline observation adapters

The F8 source implements strict nine-family fixed-schema offline
collector adapters, content seals and F1 v2 SHA-distinct evidence.
All source authority remains UNKNOWN/HOLD; no collector contacts
systemd, GitHub, Steam, Traffic, Watcher, Storage, PAPER, managed
media or any production API. No runner/agent, public route or LLM.
See [F8 source and hold contract](../../docs/SESSION_C_FOUNDRY_F8_SANITIZED_COLLECTORS.md).

Full offline regression:

    python3 -m unittest discover -s tools/kingdom-foundry/tests -v

## F9 genuine private HOLD-only snapshot without invented audit history

F9 provides a pure read-only SQLite connection and an explicitly
owner-triggered offline 0600 static HTML exporter for journals containing
ONLY F8 unverified/HOLD source observations and zero scheduler jobs.
It verifies the entire bounded F1 journal even if the display shows
only its newest page. The original F6 audited-queue path still requires
a real F6 audit; no work is executed and no HEL1 service is installed.
See [F9 private HOLD-only source contract](../../docs/SESSION_C_FOUNDRY_F9_HOLD_ONLY_PREVIEW.md).

    python3 -m unittest discover -s tools/kingdom-foundry/tests -v

## F10 fixed allowlisted host read-only observations

F10 adds one-shot, bounded systemd-status and pinned local-storage
probes with source SHA ALWAYS unknown. These local readings cannot
attest remote host identity, timer reliability, backup integrity,
PAPER market prices, browser acceptance or any trading/finance
permission; F1/F2/F9 HOLD boundaries remain intact. The implementation
has **no service, timer, agent executor or HTTP route**. See
[F10 fixed host source and release HOLD](../../docs/SESSION_C_FOUNDRY_F10_READONLY_HOST_ADMISSION.md).

Manual M1 observation (source UNTRUSTED/HOLD):

    python3 tools/kingdom-foundry/nightforge_readonly_probe_cli.py --mac-storage

Full regression:

    python3 -m unittest discover -s tools/kingdom-foundry/tests -v
