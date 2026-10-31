# CENTRAL Agent Ledger v1 — append-only, non-operational

This ledger is **not** a deployment admission, running-agent registry, credential store, or task runner. It does not claim that assignments correspond to active sessions. Central R25's six named lanes and five explicit source-backed decisions are seeded from [the owner dispatch](https://github.com/Emaren/app-prodn/issues/934#issuecomment-6544802773), timestamp **2026-10-31T14:37:15Z**. No historical decisions were overwritten or retrospectively invented.

- `r25-seed.json`: immutable first known baseline; exactly B/C/D/E/F/G assigned, all `ASSIGNED_NOT_CONFIRMED_ACTIVE`, evidence and CI unknown.
- `events.jsonl`: append-only SHA-256-linked event history, initially empty. New events must be source-backed and separately committed through normal Git review.
- `scripts/aoe2_central_agent_ledger.py`: validates the chain, appends safely under a file lock, refuses duplicate events/completed diagnostic reassignment, renders current agent queue and generates repeat-resistant prompts.

## Local usage — no SSH, production, autonomous execution, or cron

```bash
python3 scripts/aoe2_central_agent_ledger.py validate
python3 scripts/aoe2_central_agent_ledger.py status
python3 scripts/aoe2_central_agent_ledger.py prompt --lane G
python3 scripts/aoe2_central_agent_ledger.py append --event /path/to/reviewed-event.json --dry-run
python3 scripts/aoe2_central_agent_ledger.py append --event /path/to/reviewed-event.json
git diff -- docs/central-agent-ledger/events.jsonl
```

**Commit new entries only after review.** Entries require exactly these keys: `id,kind,lane,at,source,source_sha,ci,ci_url,evidence_at,assignment,priority,capability,dependency,next_operation,deploy_phase,result,diagnostic_key,details`. Valid kinds: `ASSIGN,EVIDENCE,DECISION,COMPLETE,FAIL,PHASE`. A claimed PASS or LIVE_VERIFIED must bind exact source SHA, CI PASS URL and timestamp. LIVE_VERIFIED additionally requires distinct physical HEL1 root, public HTTP, financial continuity and rollback evidence markers in the details; those strings still require *independent external verification*. Do not substitute a self-assertion for that review.

Future lanes are individually assigned via a new `ASSIGN` event, bounded to **1,000 total**. An assignment alone never means the session is alive. When a `COMPLETE` event closes a diagnostic key, another ASSIGN/COMPLETE with the same key is rejected; start a genuinely different new diagnostic with a new scope key instead. Prompt generation includes every recorded standing decision and completed diagnostic key, preventing the recurring generic-audit loops.

## Review boundaries

The SHA chain detects edits in the local log but is **not an independent cryptographic signature**. Repository Git commit review and source-linked independent evidence are the durable authority. The CLI never operates any external account, GitHub API, web process, signer, financial service, or HEL1 host. No secret values are stored. **P3 must never block F's P0 owner-approved website-only parallel release.**

## Canonical #1090 OS IDs and Kingdom Run-Up (#1089)

The additive [Central OS registry PR #1090](https://github.com/Emaren/app-prodn/pull/1090) supplies **14 subordinate source identities**, plus the AoE2WAR umbrella. The crosswalk `config/central-agent-os-bindings.v1.json` associates the six B–G assignments with existing OS *domains*, never active daemons. **Doctor** and **Shepherd** are existing supervisory UI roles; **Composer** is a proposed workflow-composition supervisory role. None is counted as a separate verified autonomous worker. Seven registered documentation titles are not an OS count.

The pure CLI `scripts/aoe2_r25_kingdom_runup_read_model.py` generates the bounded JSON projection for future public `/aoe2war-os/deployment` and authenticated admin `/admin/deployment-os`. The model does **not** create these routes or a new poller. A future UI reads the same existing materialized release observation feed and renders the eight issue #1089 stages with explicit UNKNOWN, STALE, HOLD, source/owner reported, host reported, public observed and certification-not-issued states. No fabricated progress percentages, status badges promoted from CI, active agent counts inferred from OS cards, or root/control operations from public requests.

```bash
python3 scripts/aoe2_r25_kingdom_runup_read_model.py --audience public
python3 scripts/aoe2_r25_kingdom_runup_read_model.py --audience admin
```

The current stage is **SOURCE_EXTRACTED, OWNER_REPORTED** from [issue #1089](https://github.com/Emaren/app-prodn/issues/1089), **not BUILD_STAGED, PARALLEL_RUNNING or LIVE_VERIFIED**. A supplied `LIVE_VERIFIED` receipt remains `AWAITING_INDEPENDENT_RELEASE_CERTIFICATION`; this reader cannot verify F's native signatures or public live identity. Future authenticated backend integrations, route access control, 375/768/1440 visual acceptance and independent F production approval must be reviewed separately.

One hierarchy, no duplicate mechanisms: Central sets priorities and owner-approved dispatch, Release OS executes, Deployment OS admits the scope, Orchestra/Composer plans approved DAGs, Agent OS may eventually run bounded workers, Recovery OS owns genuine rollback, and Kingdom Run-Up only **reads** receipts. P3 never holds P0.
