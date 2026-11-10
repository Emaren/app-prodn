---
id: "aoe2war.app-prodn.foundry-f9-hold-only-private-observer"
title: "Foundry F9 — Unsealed HOLD-only private read-only SQLite and CLI preview"
type: "working"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn", "kingdom-foundry"]
audience: ["developers", "operators", "ai-agents"]
source_of_truth: "git"
authority: "product-only-session-c-source-review"
reviewed_at: "2026-11-10"
review_interval_days: 30
sensitivity: "internal"
---

# Foundry F9 — Unsealed HOLD-only private read-only SQLite and CLI preview

## Exact source and segregation

F9 reviewed implementation:
84c872fdddf57e65f6faf343b276969a9b7cc1de.

Direct source parent F8 draft App PR #1299:
ea0dc49551998c4c37e36f03b2543815e4a0318c.
F8 implementation ecb2bd51c3907c2f7ea8c1704113449a2c70aa35.
The previous independent Foundry F0 through F7 stack remains draft
and unmerged. F8 has distinct nonfinancial observation evidence and
permanent source-HOLD rules.

Session C branch: session-c/foundry-f9-hold-only-preview-20261110.
PRODUCT worktree: kingdom-foundry-f9.
No B checkout, public website release, financial keys/SQL, Intel
recovery, installed PAPER accounting, or native market feeds touched.

## Completed working code

F8 correctly records sanitized service reports as UNTRUSTED HOLD, not
an executable queue. F7 originally required at least one F6 scheduler
audit receipt to show anything. That would make an entirely correct,
new-only F8 HOLD journal invisible without fabricating a trusted job.

The new pure Python read-only module foundry_hold_only.py reads
a preexisting private F1 SQLite journal using SQLite URI mode=ro and
PRAGMA query_only=ON. No DDL, trigger creation, migration or command
executor. The existing source file must be 0600, single-link,
nonsymlink, inside an explicitly approved PRODUCT root, with its
immediate directory 0700; FINANCIAL, custody, signer and recovery
paths are categorically denied.

Before rendering the UI it checks the ENTIRE bounded F1 event
ledger, not merely visible page 1. Every event must have persisted
trust=HOLD and source_sha=unknown; every body must pass the original
F0 strict event schema and its canonical SHA256. It checks no
F2 scheduled jobs and no F6 audit entries exist. It explicitly
refuses a verified F1 event without an F6 audit, a forged pinned
Git event, any scheduled job or audit history, corrupted body
hashes, truncated/missing ledger, public source database,
hardlinked source file and symlink/path escapes.

The F7 HTML presenter gains one EXPLICIT alternative input contract:
NO_AUDIT_ALL_HOLDS, with every displayed source SHA=unknown and
HOLD_SOURCE_UNVERIFIED and with zero audit entries. It displays a
prominent UNSEALED HOLD-ONLY warning rather than inventing an
internally verified audit chain, external attestation, authenticated
service state or an executed task. Previously qualified F7 source
with a real F6 audit is still supported; no source admission is
loosened for scheduling.

private_hold_preview.py is an explicit manual offline CLI (not a
daemon). It accepts an already created private journal, PRODUCT
root and private output directory, calls the read-only preview,
and creates one new owner-only 0600 HTML snapshot via the existing
F7 exclusive/fsync/no-overwrite exporter. It outputs a minimal
JSON receipt with only count/byte SHA and all executor/trading/
finance controls disabled. Re-running against an existing filename
returns a generic HOLD without printing the input path or report
contents. There are no shell, GitHub-write, HTTP, LLM or trading
execution paths.

### Example manual, strictly offline only

    python3 tools/kingdom-foundry/private_hold_preview.py \
      --product-root "$HOME/projects/AoE2WAR-LANES/PRODUCT/kingdom-foundry-f9" \
      --journal "/path/to/preexisting/private/inside/PRODUCT/offline.sqlite" \
      --private-output-root "/path/to/preexisting/owner-only/inside/PRODUCT" \
      --output "/path/to/preexisting/owner-only/inside/PRODUCT/foundry-private-owner-hold.html"

This is a documented example, not a production admission command or
permission to copy private data into a source repository. The
operator must first have an actually existing owner-private PRODUCT
journal with ONLY source-UNKNOWN/HOLD events; never supply financial
records, raw GitHub/Steam cookies, market account keys or recovery
material. No live collection or HEL1 daemon start is authorized.

## Independent reproducibility and current test evidence

F9 owner-M1 focused tests: 16/16 PASS.
Full F0–F9 Python regression: **116/116 PASS**.

Physical test opened an actual owner-private temporary SQLite file
using the read-only connector, persisted two distinct F8 HOLD rows,
displayed the source and their evidence refs, and ran the CLI as an
actual separate process to create a 0600 HTML with SHA receipt.
The second invocation correctly refused overwriting the file;
there were no daemon/service starts. Tests additionally verified
that an older verified row hidden beyond a one-item page blocks
the entire preview, direct database tampering blocks source
admission, private file symlinks/hardlinks/world-readable parents
are denied, and no scheduler audit/job is forged.

Tests created only temporary owner-private research files that
were removed by test teardown. The verified SHA is a local
content-consistency receipt, not a signed or off-host audit.

## Release admission and rollback

Zero deployed CPU/RAM/disk/network on HEL1: nothing is installed.
Pure Python standard library, no additional Next build, no resident
ML/LLM and no watchdog/cron. GitHub source checks and local tests
are not website or native-source production acceptance.

The future public website integration still requires Session B's
signed-in role matrix with actual 401 anonymous, 403 ordinary
nonadmin, 503 unavailable source and 200 authorized read-only
acceptance, along with Central's exact source and rollback
admission. None is asserted here. The historical 100 PAPER
accounts and seven open unpriced BTC positions are preserved;
current market price, exposure, equity, PnL and drawdown remain
UNKNOWN and cannot be derived from these collector reports.
All new PAPER/real orders and WOLO movement remain HALT.

Rollback today: do not merge or deploy this additive branch.
F8's no-execution journal remains intact. No production service
or App 3032/3030 selector needs rolling back.

**Status: source tests PASS, independent exact-head GitHub CI pending.**
**Execution DISABLED; HEL1 inference HOLD; FINANCIAL unchanged.**
