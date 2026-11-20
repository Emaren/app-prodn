---
id: aoe2war.we2.factory-retention-lifecycle-20261120
title: Factory post-T10 retention and disposable-cache admission
type: runbook
status: source-proposal-not-installed
owner: we2-protected-production
systems: [app-prodn, vpssentry, hel1]
authority: nonfinancial-source-review-only
reviewed_at: 2026-11-20
---

# Factory retention lifecycle — WE2 protected source

The original live product release remains source
`dbceb5df20f98ff783a2af1a83d79cf17abae035`,
BUILD_ID `RHE-s_XmtI5heC0JuZP7r` and its source-specific T10 seal.
**This proposal is not an installation permit and must not change that release.**

## Existing physical retention action

On November 20 WE2 independently verified historical transport archives
for source `f9d82fe9169d2cada1c98cee4c766896dec695c8` and
`5339a981acbf15ea8d3c4393cb1fc75bc300ea45` by exact SHA-256,
complete TAR listing, root T10 seals and no open source file handles.
Both archives remain recoverable on the separate mounted data volume, at
`/mnt/HC_Volume_105319120/WE2-factory-transport-retention-20261120/`.
Only redundant root transport archive files were unlinked; **neither original
installed runtime, release receipt nor live service was removed**.
The durable retention completion receipt SHA-256 is
`e4c22a5e20d1f07caf6a59730551487bea0e5a051960e0730097e08968421d21`.
Actual root recovery was **1,218,285,568 bytes**, measured by filesystem
available blocks. This is a same-host different-volume retention, **not**
an independent off-host Intel recovery certification.

## Source-only implementation

`scripts/we2_factory_retention_lifecycle.py` provides:

- A strict T10 seal/ledger/summary hash verifier, preserving source and
  BUILD_ID and denying a missing or tampered T10.
- Protected runtime classification: ACTIVE, ROLLBACK, EMERGENCY, RETAINED,
  and evidence-qualified RETIRABLE. Even RETIRABLE never means automatic
  deletion of an installed runtime or sealed receipt.
- A capacity planner honoring the existing Factory's warm/cold headroom
  calculation with an **additional 512 MiB reservation margin**.
- An optional **separate** short-lived HMAC-authorized disposable-cache
  cleanup policy. This applies exclusively to an operator-owned mode-0700
  directory containing old mode-0600, single-link regular `.part` objects
  from an explicitly enrolled rebuildable cache class. It rejects
  symlinks, hardlinks, scope expansion, signature drift, staleness,
  nonmatching bytes, spoofed timestamps, and unapproved authority.

**No unattended cleanup timer or root installation is included.**
Source tests use only synthetic temporary fixtures, never live HEL1 paths.
A source-governed operator installer, separate root policy enrollment,
exact current installed Factory pins, recovery witness and immutable audit
must be accepted before these functions can run against production.

## Required follow-up root adoption (separate authority)

1. Obtain current public source/build and immutable root T10 identity,
   previous actual source, protected 3030/3033/9447 identity and emergency
   references; do not infer from directory names.
2. Produce a root-owned read-only inventory after each T10, including
   source, build, GitHub artifact/proof IDs and digests, rollback provenance,
   T10 receipt hashes, stage class and observed free-bytes watermarks.
3. Verify exact recoverability of each protected candidate through an
   independently checked Intel restore or equivalent protected failure
   domain and exact one-use permit. Distinguish logical archive duplication
   from physical filesystem blocks.
4. For a separately enrolled rebuildable scratch class only, install the
   HMAC policy key, dedicated UID-owned mode-0700 cache root, audit/journal,
   exclusive lock and noninteractive bounded lifecycle. Never point it at
   Factory's root transport archives or `/var/lib/aoe2war-web-prod-*`.
5. Require source review, negative security tests and an authorized
   protected WE2 installation transaction; preserve rollback before any
   change. The current P0 site should not be rebuilt or redeployed.

## Hard exclusions

Never automatically unlink under `/var/lib/aoe2war-product-release-v1`,
`/var/lib/aoe2war-web-prod-*`, PostgreSQL, `/var/log`, wallet, custody,
`/etc`, evidence, or active/rollback/emergency Factory stages. Historical
T10 receipts are immutable and remain even if separate bulky transport
bytes are independently retained elsewhere.

The current post-release HEL1 root free space is below the preflight
required for another fresh release. A future release must HOLD until
capacity is genuinely recovered and remeasured; this document does not
authorize a second website release.
