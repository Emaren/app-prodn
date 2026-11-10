---
id: "aoe2war.app-prodn.foundry-f7-private-command-readmodel"
title: "Foundry F7 — Owner-private Central Command source and HOLD dashboard"
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

# Foundry F7 — Owner-private Central Command source and HOLD dashboard

## Exact source / branch

F7 implementation commit: 4ccd049ac0f43b2bd0fb2ea0861ae8fcdefb46f4.
Stacked directly onto reviewed F6 draft PR #1297, source:
491a92b824309731edb7a4bb97b28129ae099d3e.
F6 stacked on F1-F5 PR #1296, which stacked on F0 PR #1291.
All parent F0-F6 GitHub exact-head checks were green at F7 creation.

Branch: session-c/foundry-f7-private-readmodel-20261110
Worktree: ~/projects/AoE2WAR-LANES/PRODUCT/kingdom-foundry-f7/

### Actual implemented PRODUCT code

The pure read model at tools/kingdom-foundry/foundry_dashboard.py
accepts ONLY an existing owner-controlled F1 SecureJournal and exposes
up to 160 bounded records from F1/F2/F6. It displays:

- Monotonic F1 evidence ID, assigned PRODUCT_B/PRODUCT_C lane, severity,
  event type and source repository;
- Exact locally inspected Git commit, whether the current pinned source
  remains admitted, and a sanitized evidence reference;
- Queued simulated status, critical/unknown source HOLD, and a fixed
  next *permitted manual step* string;
- Separate internal F6 chain integrity status and visible queue totals;
- Explicit no market price, no historical position mark, no PnL,
  no PAPER/real orders, no wallet/WOLO, no external financial approval.

Before reading data the projection opens a SINGLE SQLite READ
TRANSACTION and validates the full internal F6 audit chain without
running any CREATE TABLE/TRIGGER statements. The source SHA is
checked again against the exact approved PRODUCT Git checkout.
Changed/unknown Git heads show HOLD, even if the source had previously
been admitted. This is a local Git proof, NOT external attestation.

### Private export isolation

The HTML is accessible, responsive, high-contrast and static.
It has inline styling only; strict CSP denies scripts, network fetches,
frames, images and fonts. No browser-side data requests or credentials.
Any injected HTML/JS in report strings is escaped. Evidence URLs are
rendered as inert text, NOT hyperlinks or executable instructions.

The export writes only into an already existing restricted 0700
owner-private folder. It creates a new 0600 HTML file with a strict
filename allowlist; O_EXCL temporary creation, fsync and atomic
hardlink prevent overwriting a previous receipt or following a
symlink. It refuses unprivate directories and paths outside the
selected owner-private PRODUCT directory. A local failure may leave
an owner-private unlinked temporary file, not a public exposure;
future cleanup still needs explicit ownership review.

The tests actually generated a private HTML file and verified its
byte SHA, mode 0600, absence of external scripts and overwrite
refusal. Test-owned temporary files are removed by test teardown.
The owner-private production observation dashboard has NOT been
installed, launched or mounted into a website.

### Adversarial acceptance and service limits

New F7 test suite: 12/12 local PASS. Full F0-F7 Python suite:
84/84 PASS. Exact source and docs registry are checked independently.

Negative tests: source-head drift after queue admission, critical/
unknown source, missing or tampered audit, corrupted report schema,
unauthorized order/funding fields, hostile HTML, wrong destination
directory, world-readable directory, symlink, duplicate output,
bad evidence source and nonexistent external route.

This module has NO HTTP server. Therefore any future website
401 anonymous / 403 ordinary nonadmin / 503 missing authenticated
backing service / 200 admin read-only responses are EXPECTED
acceptance requirements, NOT measured production results.
No public App route/page or server-only machine credential is mounted.

Runtime impact on HEL1 = ZERO: no daemon, listener, cron,
service user, network collector, model inference or periodic work.
Pure Python stdlib source and bounded temporary tests on M1 only.
Website 3032/3030, Steam, Nginx, private PAPER 9447, finance,
Intel C06/C07 and existing PR branches were not modified.

## B/Central handoff and rollback

The source may be reviewed by B on its OWN worktree after an exact
Central authorization. Do not rebase/mix with the live 3032 branch,
automatically cherry-pick conflicting histories or expose an owner
0600 HTML receipt to browser users. Before installing an actual
observer, validate unprivileged service identity, resource ceilings,
source pin, lease audit HMAC/off-host proof requirements, signed
website admin/nonadmin role matrix, negative HTTP codes and rollback.

Rollback = leave this draft branch and code unmounted. F6 remains
independently qualified, active public App stays unchanged.

**Status: SOURCE TEST PASS, independent exact-head CI pending;**
**FOUNDRY EXECUTOR DISABLED, NIGHTFORGE HEL1 INFERENCE HOLD;**
**LIVE TRADING HALT; FINANCIAL UNCHANGED.**
