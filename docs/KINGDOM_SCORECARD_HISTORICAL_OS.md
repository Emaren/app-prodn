---
id: "aoe2war.app-prodn.kingdom-grading-history-source"
title: "Kingdom Scorecard and Historical OS Source Contracts"
type: "runbook"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn","aoe2war","vpssentry"]
audience: ["operators","developers","ai-agents"]
source_of_truth: "git"
authority: "source-only-read-only-operations"
reviewed_at: "2026-11-22"
review_interval_days: 30
sensitivity: "internal"
---

# Kingdom Scorecard and Historical OS Source Contracts

## Scope and source lineage

This is **source-only** WE1 work, stacked on original draft Scan OS V2 /
Organization OS [#1466](https://github.com/Emaren/app-prodn/pull/1466),
which itself extends **already merged #1455**. It does not alter the
original eight scan definitions, their six deduplicated producers,
seven-domain 35-gate maturity rubric, trusted ROOT signer, or Factory
production installation. All five #1466 exact-head CI workflows were
SUCCESS as observed 2026-11-22 before this source branch. Original
app-prodn main `f833d7e633cee4b36f1427fa45d76081fa0796ef`
remains frozen for Atlas T10.

Kingdom Scorecard/Grading is [issue #1467](https://github.com/Emaren/app-prodn/issues/1467),
including owner amendment 7082171302. Independent Historical OS is
[issue #1468](https://github.com/Emaren/app-prodn/issues/1468).
These source schema files are NOT a launched private Historical OS
page; the authenticated page awaits Atlas #1453 **real T10**.
No third Next.js service, new privileged daemon, whole-drive scan,
database write, financial service or deletion executor is proposed.

## Scorecard: what exactly is 100, and who may change it?

`config/kingdom-scorecard-standards.v1.json` sets nine independent
facets; each version has five independent 20-point evidence checks,
a dated meaning of 100, explicit direction and immutable version.
The nine are strength, necessity, relevance, redundancy **risk**,
storage efficiency, marginal cost/complexity **risk**, recovery
confidence, security and operator value.

**A HIGH redundancy-risk or cost-risk score is BAD.** A HIGH
necessity score indicates criticality, **not** software quality.
Do not average the nine values into a single goodness grade.
Security failure and missing rollback/independent restoration veto
GREEN and host mutation regardless of how nice a frontend appears.

`scripts/kingdom_scorecard_os.py` joins the existing validated
Organization OS graph; each registered object receives nine
independent named, dated records with exact standard version,
meaning of 100, directions, source object path/repo/owner,
evidence refs, missing-check reasons, current score or UNKNOWN,
supported bounds and owner improvement pointer. Grade arithmetic
can consume ONLY a separately source-admitted verifier callback;
a supplied JSON `verified=true` or `passed=true` never scores.
The shipped CLI exposes **no evidence injection path**, so unobserved
grades are NULL/UNKNOWN, not zero or an invented 100.
Even fully checked synthetic-test callbacks output
`production_certified:false` and `mutations_authorized:false`.

`config/kingdom-scorecard-grade-history.v1.json` preserves the
original Scan OS maturity rubric as a distinct prior standard. The
previous informal Central Command overall 54/100 remains
`PROVISIONAL_NOT_A_VERSIONED_RUBRIC_GRADE`, NOT an official
production score. The current version has **zero** scored
historical snapshots until original evidence is qualified.
Future snapshots must preserve source commit, complete standard
SHA256, effective date, grade, as-of and independent immutable
evidence. Functions `verify_standards_transition` and
`verify_grade_history_append` reject same-version redefinitions,
backdated standard transitions, and rewriting any previous grade.
Any new 100 definition requires **new version/date** and explicit
`standards_changed`; compare old and new without silently
regrading the old history.

Read-only commands:

```console
python3 -B scripts/kingdom_scorecard_os.py --feature-id FACTORY_RETENTION
python3 -B scripts/kingdom_scorecard_os.py --feature-id SCAN_OS
python3 -B scripts/scan_os_maturity.py --benchmark-dir "$HOME/.aoe2war-scan-os-source-v2"
```

The last command is the **older** source-local 35-gate benchmark,
not a nine-dimensional independently certified feature Scorecard.
The existing sixteen M1 observations remain in owner-only
`~/.aoe2war-scan-os-source-v2`. Do not rehash unchanged Factory
artifacts to feed a Scorecard.

## Historical OS: what is original and what is merely an alleged copy?

`config/historical-os-classification.v1.json` holds seventeen
historical object types, distinct source/copy roles,
provisional L1–L5 levels, original signed stages, confidence and
COPY vs independent RETIRE acceptance gates. It is intentionally
independent of Grade and Storage execution, while sharing
**Organization OS object identities** and original producer refs.
`config/historical-os-cohorts.v1.json` has fourteen *source-recorded*
cohorts, not fourteen live physical proofs: active BAE 890d, HOT1
9cf, HOT2 50b, former-HOT2-T8 predecessor `dbceb`,
4c14, two M1 Factory groups, Intel ciphertext, PG live/WAL,
Traffic SQLite, replay games, GitHub source, chain and personal
source. Some counts and sizes are from issue #1468's historical
snapshot and are explicitly labelled source-reported **gross**
bytes, never unique or physically reclaimed bytes.

`scripts/historical_os.py` emits a bounded read-only projection:
original organization identity, class, source/role/surface,
gross reported bytes, dependencies, why KEEP / HOT /
COLD-COPY-REVIEW / UNKNOWN, all retirement blockers,
independent restore UNKNOWN, and ZERO **authorized** deletion
paths. All original copies are UNKNOWN rather than an empty list
asserting there are no copies. Exact current filesystem UUID/device,
inode, exclusive physical allocation, signed COPY nonce, receiver
ACK and independent restore are **NULL** without an independent
native original receipt. A GitHub commit cannot replace a live
PostgreSQL WAL, uploads, replay index, installer or rollback.
Filesystem hardlinks, clones and APFS snapshots prevent summing
gross files into unique physical reclaim.

```console
python3 -B scripts/historical_os.py
python3 -B scripts/historical_os.py --object-id DBCEB_T5_T8_PREDECESSOR
```

`dbceb` original archive source `dbceb5df20f98ff783a2af1a83d79cf17abae035`,
BUILD_ID `RHE-s_XmtI5heC0JuZP7r`, reported gross
618,553,344 B remains protected. Its being earlier than HOT2
`50b` does **not** prove it is safe to retire. Historical 4c14
is L4 human-only. Current/hot 890d/9cf/50b, financial data,
personal and unique source remain protected. Intel ACK/receipt
alone cannot substitute for an isolated restore.

## Actual current owner crypto and ROOT headroom checkpoint

At native owner-UID501 read-only check on **2026-11-22 16:38:57 UTC**:

- HEL1 ROOT normal ordinary available: **6,520,344,576 B**.
- HEL1 DATA normal ordinary available: **26,203,914,240 B**.
- Atlas original hard minimum (unchanged #1453 artifact):
  **7,061,463,905 B** free on ROOT, leaving **541,119,329 B**
  hard deficit, before recommended 512MiB margin.
- ROOT directory `/var/lib/aoe2war-storage-owner-session-v1`:
  **ABSENT**. That is not proof that all other original issuer
  systems are absent; it is **not** an installed V6 verifier
  qualification.
- M1 UID501 session present, but the original
  `config/storage-owner-session-retirement.v1.json` source
  states issuer `NOT_ENROLLED`, encrypted V6 private key **not
  automatically unlocked** and original spent-nonce ledger pending.
  Mac login alone is not an Ed25519 signature.
- Original #1462 is source-only COPY proposal, #1464 universal
  fail-closed boolean guard; both DRAFT, neither can issue an
  authentic permit or delete an original. Actual new copied/
  reclaimed bytes from WE1: **0**.

## Original Factory authority: one precise next action

**WE2/owner controls original root signer and Factory source.**
Keep existing original nonfinancial V6 public trust SPKI SHA256
`141600d4e89781368c82b1f59ed7436f3ea688c27bb578ddaa40a53d41399516`
only after rechecking original installed root verifier/pin.
Source-review and install **one original purpose-bound verifier**,
not an arbitrary new root daemon. Authenticated owner-session
issuer must have real usable signing key and source-derived
HEAD/CI/artifact/BUILD/rollback/FS-UUID/dev/inode/class/controller
identity, 24+ bytes random nonce, expiry at most 15 minutes and
actual original ROOT replay/revocation ledger. Owner manually
typing SHAs is NOT an acceptable proxy for independently read
source identities; do not export or bypass the encrypted V6 key.

For first exact COPY: require original purpose
`HEL1_HISTORICAL_FACTORY_COMPRESSED_ARCHIVE_COPY_ONLY`, exact
object CAS, current BAE T8/T9/T10 protection, verified distinct
DATA filesystem, physical reserve, durable receiver ACK, complete
DATA SHA reread and original ROOT archive retained. Only a
**separately issued, independently verified, human-reviewed L4**
RETIRE can later pass if an isolated restore is proven, no
hot/rollback/open-FD consumers remain, fresh object CAS holds
and original ROOT nonce is spent exactly once.
**L5 never deletes.** No `apply()` with asserted JSON flags,
manual `rm`, overwrite, backup suppression or bypass of
protected CI. Historical or grading source code cannot create
that permission.

**Release order:** WE2 stabilizes ROOT capacity and genuine
owner cryptographic source admission; WE3 ships fixed Atlas
#1453 artifact through original Factory T7–T10 and real owner
Incognito/ordinary Scribe browser acceptance; then merge/admit
this secondary Scorecard/Historical source and UI through normal
DocsV2/PRODUCT/CI. Mainline remains frozen here.
