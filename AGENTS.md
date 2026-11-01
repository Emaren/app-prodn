---
id: "aoe2war.app-prodn.agents"
title: "AoE2WAR AI Engineering Entry Point"
type: "reference"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn","api-prodn","wolochain","aoe2-watcher"]
audience: ["ai-agents","developers","operators"]
source_of_truth: "git"
authority: "repository-entrypoint"
reviewed_at: "2026-11-01"
review_interval_days: 60
sensitivity: "internal"
---

# AoE2WAR AI Engineering Entry Point

This document is a **pointer and operating contract**, not a second release
register, source map or authorization mechanism. Never turn a historical SHA,
screenshot or chat summary into current deployment evidence.

## Ownership and source of truth

- **App/web UI and app-side HD wagers:** this repo, `Emaren/app-prodn`.
  Replay/API implementation is separately owned by `api-prodn`; Watcher
  owns replay-observation evidence, not a guessed result from an app page.
- **WOLO chain, real wallet/denom, custody and settlement:** `Emaren/wolochain`.
  The old 8092/8093 settlement rail is not proof that new 8094/8095 financial
  custody is authorized.
- **Live VPS, storage, Nginx and systemd:** actual authorized host readings and
  immutable release receipts, not a source checkout. Cross-project topology
  belongs to the existing canonical system maps and AoE2WAR-docs federation.
- **Release and blockers:** [app #1108](https://github.com/Emaren/app-prodn/issues/1108)
  for A01–A10/C01–C09; [central #934](https://github.com/Emaren/app-prodn/issues/934)
  for release coordination; [Wolo #5](https://github.com/Emaren/wolochain/issues/5)
  for protected financial HOLD. These links contain *mutable* status.
- **Durable lessons:** [Engineering Memory](docs/ENGINEERING_MEMORY.md);
  **document lifecycle and federation:** [Documentation OS](docs/DOCUMENTATION_OS.md),
  generated [Documentation Control Plane](docs/DOCUMENTATION_CONTROL_PLANE.md)
  and [document registry](docs/document-registry.json).
  Keep one canonical ownership map. Record lifecycle decisions at the owning
  issue or PR, not in an independently edited branch-status ledger.

## First five questions at every engineering handoff

1. **What exists?** Read the owning issue and its references. Discover current,
   merged, draft, closed/superseded PRs, worktrees, local branches (including
   detached, dirty and untracked), remote branches, commits and artifacts.
2. **What's running?** Verify *current* service PID/BUILD_ID, health, listeners,
   source/binary identity, storage and relevant financial roles using authorized
   read-only evidence. Production is never inferred from CI or merged source.
3. **Already solved?** Compare Git ancestry, exact source hash, implementation,
   tests and CI of candidates. Reuse the most complete independently qualified
   implementation. Do not implement a feature just because it is absent from
   the current checkout.
4. **What's missing?** Classify each existing A/C blocker as `SOURCE MISSING`,
   `SOURCE READY`, `REVIEW MISSING`, `PHYSICAL PROOF MISSING`,
   `OWNER AUTHORIZATION` or `EXTERNAL EVIDENCE MISSING`. Unclassified
   branch ownership remains **UNKNOWN**, not abandoned.
5. **What happens next?** Choose the smallest action closing the next actual
   production gate. Source qualification, merged source, physically deployed
   binary and LIVE_VERIFIED are four **different** states.

## Reproducible read-only source reuse inventory

From a canonical local app or Wolo checkout, run:

```bash
python3 -B scripts/ai_branch_inventory.py --repo . --target origin/main
```

The script prints JSON to stdout only. It uses existing `git` and `gh`
reads, without `fetch`, `reset`, `clean`, `checkout`, deletes or writes.
Run it separately in each owning repo (copying the script to another repo
is **not** required; use `--repo`). Pass the **actual integration ref** as
`--target`, not automatically `main`. Its recorded remote references
can be stale: verify exact fresh GitHub PR/CI and target SHA before decisions.
`UNKNOWN` means *needs verification*, not disposable. The output includes
worktree/branch/HEAD/dirty/tracking/PR/commit-ancestry indicators; checks on
unique source changes and PR acceptance must still be reviewed independently.

For a specific candidate, verify actual content using read-only Git:

```bash
git merge-base --is-ancestor <candidate-sha> <target-sha>
git rev-list --count <target-sha>..<candidate-sha>
git diff --stat <target-sha>...<candidate-sha>
git status --porcelain=v1 --untracked-files=normal
gh pr view <number> --repo Emaren/app-prodn --json headRefOid,baseRefOid,state,isDraft,reviews,statusCheckRollup
```

The `merge-base` command exits nonzero when unmerged; this is evidence,
not a reason to reset a worktree. Treat all uncommitted, untracked and
orphaned changes as **preserved**. No destructive cleanup, branch deletion,
force-push or worktree retirement without explicit owner approval.
When a branch is intentionally merged, closed or superseded, record the
*actual* disposition, successor SHA and uniqueness evidence on its existing
PR/issue. Never classify a branch by age alone.

## Active production-release discipline

**DISCOVER → REUSE → INTEGRATE → VERIFY → DEPLOY → RECORD.**

During the nineteen-gate release, A01's independently reviewed one-use
START and A02–A06 physical R25 proof precede the existing B2/B3/B4
successors. Funded WOLO requires separate custody, reserves, producer
fencing, recovery and authentic authorized mainnet evidence. A source test,
a prepared plan, a GitHub approval request or a previous receipt cannot
fabricate independent acceptance. Preserve the original production services,
consumed journals, dirty work and financial UNKNOWNs. Do not add
documentation infrastructure to the production critical path.
