---
id: "aoe2war.app-prodn.foundry-f11-one-shot-private-observer"
title: "Foundry F11 — Owner-private one-shot HOLD recorder and failure-recoverable dashboard"
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

# Foundry F11 — Owner-private one-shot HOLD recorder and failure-recoverable dashboard

## Exact source and PRODUCT-only ancestry

Reviewed implementation:
c03ce3e5e373ef3576c9e1e21f8a853e427f3950.
Source-only branch: session-c/foundry-f11-private-observer-20261110.
Owner C worktree: kingdom-foundry-f11.

Exact parent F10 draft App PR #1302:
d116a8ca8b8655540dd77842008f5375bae26a60.
Both GitHub independent workflows PASS on the corrected F10
source. F9 PR #1301 and earlier Foundry F0–F8 have separately
passed their independent source tests and remain draft/unmerged.
This source does not merge, reset or mutate Session B's app
checkout, current public R25, financial SQL, signer, reserves,
WOLO chain or Intel C06/C07 recovery files.

## Working F11 product

F11 connects three already tested boundaries:
1. F10 fixed read-only host probes (local statvfs or fixed systemctl
   status, never a general shell command or network collector);
2. F8 normalized LOCAL_HOST_READONLY_UNATTESTED envelope
   and F1 SQLite ingestion with source SHA "unknown"/HOLD;
3. F9 strict owner-private read-only F1 inspection and F7
   exclusive, 0600 static HTML export.

The new nightforge_private_observer.py is an explicit, manual
one-shot command (not a daemon, timer or agent). It requires:
- One exact approved local Git source commit, checked against
  current HEAD, canonical Emaren/app-prodn origin and an entirely
  CLEAN PRODUCT C worktree. Any untracked or modified code
  fails closed. **Local code pin is not remote attestation.**
- A separately existing 0700 owner-only directory that is a DIRECT
  child of the existing PRODUCT root and is named
  session-c-f11-...; no file creation inside a source worktree,
  Session B's checkout, FINANCIAL, custody, signer or recovery.
- One fixed, typed F10 source observation no larger than 4096
  bytes. No arbitrary report text, user-selected file path,
  command, SQL, account balance or F8 synthetic fixture accepted.
- A fixed output identity. HTML output must be new, private
  and have a safe filename; overwriting any existing snapshot
  is refused.

The source code's Git SHA may be verified locally but the observed
SYSTEMD/STORAGE truth remains unverified. Even an apparently
fresh timestamp and valid SHA256 content digest do NOT turn a
local status into authenticated remote telemetry. F1 permanently
stores source "unknown" as HOLD. F2 never receives a task.
No work can be dispatched, merged, deployed or executed.

F11's one-shot flow is:
- read and sanitize one fixed local F10 observation;
- check exact clean Git code, nonfinancial path and user-private dir;
- atomically commit one source-UNKNOWN/HOLD F1 event;
- close the writer, reopen F9 SQLite in true read-only mode and
  inspect ALL bounded F1 source records; refuse any authenticated
  row, F2 job, F6 audit or tampered event;
- generate a unique, scriptless/static owner-only 0600 HTML
  with explicit UNSEALED HOLD-ONLY warnings and output a compact
  no-path JSON SHA256/byte-count receipt.

### Failure/replay consistency, not imaginary durability

One F1 SQLite event is committed BEFORE writing HTML. If export
fails because an HTML filename exists, the caller sees a HOLD/error;
no successful export is claimed. Re-run with a NEW receipt ID.
The existing F1 event is then idempotently recognized without
creating a duplicate, while a distinct observation creates a new
HOLD event. An older forged/verified/tampered record, even outside
the visible page, blocks the entire new snapshot.

Source test coverage confirms this local crash-like *export failure*
and resumption. These tests do NOT establish power-loss durability,
externally anchored append-only integrity, production SIGKILL recovery,
host attestation or off-host backup. The F1/F9 SQLite WAL and local
SHA receipts are internal consistency checks only.

The script deliberately does NOT start or install a daemon, turn
on a systemd timer, monitor a broker, scrape Chrome, call an LLM,
open 3032/3030, change Nginx or alter private PAPER service 9447.

## Operator one-shot source-only rehearsal

Once the exact F11 source PR is independently green, an authorized
PRODUCT operator can create a separate 0700 dedicated state
directory inside PRODUCT and run a manual mac-storage observation.
Do not create this directory inside Session B or another
source checkout. Example shape:

    umask 077
    mkdir -m 700 "$HOME/projects/AoE2WAR-LANES/PRODUCT/session-c-f11-owner-private-20261110"
    python3 "$HOME/projects/AoE2WAR-LANES/PRODUCT/kingdom-foundry-f11/tools/kingdom-foundry/nightforge_private_observer.py" \
      --mac-storage \
      --product-root "$HOME/projects/AoE2WAR-LANES/PRODUCT" \
      --private-dir "$HOME/projects/AoE2WAR-LANES/PRODUCT/session-c-f11-owner-private-20261110" \
      --approved-source-sha "$(git -C "$HOME/projects/AoE2WAR-LANES/PRODUCT/kingdom-foundry-f11" rev-parse HEAD)" \
      --receipt-id f11-owner-m1-20261110

This illustrates a manual source-only M1 receipt. It is NOT
a proposal to run an observer on HEL1, schedule its execution,
enable PAPER trades, or grant F2/F5 task completion.

## Actual owner M1 receipt (not production deployment)

After the source was committed clean, Session C physically ran
the one-shot **--mac-storage** command on the owner's M1 from
exact source d127d002c49b9fdbe23325a34400b9fd1e16aea0.
The private state directory lives immediately under PRODUCT,
outside any Git worktree, with verified 0700 permissions.
The resulting 0600 SQLite journal contained exactly ONE event:
source_sha=unknown, trust=HOLD, no scheduled F2 job, no
F6 verification audit, no task execution and no finance/trading
approval. The corresponding new 0600 HTML has a prominent
UNSEALED HOLD-ONLY observation warning.

Actual HTML bytes: 4,398.
Actual SQLite journal bytes: 20,480.
HTML SHA256:
2f3862ce0cb1f643082986cd531bb5df032dcb844c6337ad2899e93f5b7f2a51.

The source checkout remained clean after physical execution,
and no HEL1 process, Nginx, Steam, website 3032 or PAPER 9447
service changed. The evidence remains owner-private; the digest
and metadata in this contract are an **internal** local source
consistency receipt, not remote signed production proof.

## Tests, resource budget and rollback

Owner-M1 offline tests:
- 17/17 focused F11 adversarial PASS.
- Full F0–F11 Python regression 151/151 PASS.
- Physical local temp 0600 SQLite and no-overwrite HTML receipt
  with source-UNKNOWN/HOLD, including genuine Mac statvfs via F10
  and separate F11 CLI process on M1.
- Dirty Git checkouts, wrong source SHA, unapproved remote origin,
  symlink/hardlink, world-readable folder, path traversal,
  private state inside B's checkout, duplicate report,
  browser or finance actions, tampered older F1 row, observed
  time and argument injection are denied.
- Dedicated independent GitHub F11 test step registered; full
  exact-head CI must pass before production source admission.

CPU/RAM/disk on HEL1: ZERO. Nothing has been deployed.
Storage footprint of an occasional local one-shot observation
is tiny, but owner Mac still has under 30GiB free. Do not
claim this permits the separate 24-hour Kraken capture,
market-source freshness admission or local large LLM weights.

Future real HEL1 installation requires a new Central-reviewed
source admission, dedicated unprivileged PRODUCT user,
credential-free filesystem sandbox, OS resource ceilings,
read-only selector integration, negative HTTP role tests and
physical rollback under Session B. Genuine website
401/403/503/200 are future acceptance cases, not current
App route measurements.

The 100 historical PAPER bot accounts and seven unpriced BTC
positions are never loaded by F11. Current market price,
exposure, equity, drawdown, liquidation and PnL are UNKNOWN.
Trading/wallet/WOLO and funding remain globally HALT.

Rollback now: do not merge/mount this additive F11 draft.
F10 and all public/financial runtime selectors remain unchanged.

**Status: local source tests PASS; independent GitHub CI PENDING.**
**FOUNDRY_EXECUTOR=DISABLED; HEL1_INFERENCE=HOLD;**
**NEW_PAPER_ORDERS=HALT; LIVE_TRADING=HALT; FINANCIAL=UNCHANGED.**
