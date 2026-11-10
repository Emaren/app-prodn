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
