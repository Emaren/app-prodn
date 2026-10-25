---
id: "aoe2war.app-prodn.website-owner-hold-reconciliation"
title: "Website Owner Historical HOLD Reconciliation"
type: "runbook"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn","wolochain"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "release-engineering-contract"
reviewed_at: "2026-10-25"
review_interval_days: 1
sensitivity: "internal"
---

# Website owner historical HOLD reconciliation

**WEBSITE ALREADY LIVE. Do not activate it again.** This dossier records a
protected engine success followed by an outer verification failure. It grants
no financial, custody, migration, restart or transaction authority.

| Fact | Exact preserved evidence | Scope |
| --- | --- | --- |
| Product/source | `6be434c00469afa4acb0623715c3bcf724f927f4`; BUILD_ID `xqX6Oi-zV5gSKH1kIC4zC` | Live website |
| Owner controller | PR #874, `74047f8b5e2a87b495ac3466eb17b447a44d4cb5` | Historical executed source |
| Approved manifest | SHA256 `7fd6fa4a01ffe0906eeeda0719fdf7b1cd0c8e2b1975e35d7669b80c082ab4e6` | Ten product paths, zero migrations |
| Staged artifact | SHA256 `daa06aa48aa87735247fa34140ffa944e05b3cc406e631e57f53816e010349d6` | Source/build-bound artifact |
| Stage receipt | SHA256 `1c04e814d2270fb7747294cb0d300d1c59cb6d7c1d1930246f4430f2989a12a1` | STAGED, owner PRE_STAGE COMPLETE |
| Activation receipt | SHA256 `e0f9e7103d5cc0f1fa6030decec972cb017f54130e42061cfb0da45cdc795618`; completed `2026-10-25T08:24:20.003732Z` | CERTIFIED, six soak samples, `wolo_mutated=false` |
| Owner journal | Attempt `J7L33p5QGHSmEBgafge913eqVIB1XCREYo9U5sbaiFc`; PRE_ACTIVATE CONSUMED, result NULL | Historical outer HOLD, never COMPLETE |
| Current comparison | `2026-10-25T08:59:22.635545Z`; SHA256 `aacfb7e1c6937885283322a108c7a3ff033557d950d5f1c51b642b73a670b891`; raw and stable differences both zero | Current same-owner configured boundary, not independent noninterference |

The exact source order at 74047f8 is: deployment lease; collect and validate
signed-reference/current evidence; consume nonce durably; recheck freshness;
one protected dispatch; fresh observer; strict comparator; only then
`finish_request`. A comparator HOLD after dispatch therefore leaves CONSUMED
while the protected engine can already have durably recorded CERTIFIED. That
is consistent with the original journal and engine receipt. Neither overrides
the other. `OWNER_WEBSITE_ACTIVATION_VERIFIED` was **not** established.

Preservation at `2026-10-25T08:51:40Z` copied the original nonce bytes read-only,
recorded stable source metadata before/after, and saved dirty/index/worktree
state without modifying any checkout. Manifest SHA256
`6ab4cfe772b224cf50a83b0e40e7d72fbd3c6029fa67b3b6b9be181cb5081979`.
The owner encrypted-key/trust directories were inventoried by metadata only;
no private key or passphrase was read. Signed packets, local/VPS receipts and
public/internal passive build-version observations are in restricted
`final-closure-forensics-20261025T085855Z` evidence. The original journal is at
`/var/lib/aoe2war-website-owner-v3/owner-v3.sqlite3`; immutable engine receipt is
`.aoe2war-release/activation-receipts/6be434c00469afa4acb0623715c3bcf724f927f4-daa06aa48aa8.json`.
Do not publish private packet/runtime inventories or financial addresses.

## What remains unknowable

The controller did not retain its failing after-observation or exact
field differences. A later zero-difference observation cannot recover that
missing instant, prove uninterrupted runtime continuity, or establish a root
cause. Timer transients remain a hypothesis. Genuine config, process, source,
timer or executable drift would be a HOLD. No historical status is backdated,
rewritten or promoted by this dossier.

## Source-only repair and recovery semantics

The descendant patch adds bounded private append-only event attachments and a
read-only reconciliation command. It changes future evidence handling, not the
historical journal, admitted product, nonce semantics, comparator tolerance,
protected engine or deployed website artifact. A protected result is persisted
before final observation; raw before/after packets and structured differences
survive a final HOLD. Full disk/permission/fsync failure before dispatch refuses
execution; after dispatch it remains CONSUMED and cannot retry automatically.
Crash after dispatch-starting with no result is UNKNOWN, even if an operator
suspects execution did not occur. An existing protected CERTIFIED receipt may
be assessed against its original consumed context; it never authorizes a second
dispatch or supplies a final owner stamp.

Reconciliation reports four separate facts:

- `WEBSITE_PROTECTED_CERTIFIED`: exact preserved engine receipt/owner lineage.
- `OWNER_FINAL_VERIFICATION_HELD_HISTORICALLY`: original CONSUMED state remains.
- `CURRENT_SAME_OWNER_BOUNDARY_MATCH`: fresh bounded SSH comparison only.
- `FINANCIAL_MAINNET_NOT_AUTHORIZED`: always true for this website policy.

The result additionally distinguishes expected product active, known rollback
active and unknown source/build. Stale or malformed current observations never
become a match. Original receipts/nonce remain untouched. The CLI obtains
current evidence itself; no user-supplied JSON can replace server collection.

## Exact nonmutating owner check

After reviewing the held descendant and exact-head CI, use its clean operator
checkout. Replace only `PACKET` with the preserved signed PRE_ACTIVATE path;
it contains public authorization, never the private key. No password is needed.
The command reads the original nonce ledger, public trust, immutable receipt and
configured VPS runtime through SSH. It writes no live file, service or database.
Capture stdout/stderr to a NEW private local filename, never an original receipt.

```bash
PACKET="$HOME/.local/share/aoe2war-release-private/<preserved-signed-PRE_ACTIVATE>.json"
PYTHONDONTWRITEBYTECODE=1 python3 scripts/aoe2_website_owner_evidence_v1.py \
  --packet "$PACKET" \
  --receipt "$HOME/projects/AoE2HDBets/app-prodn/.aoe2war-release/activation-receipts/6be434c00469afa4acb0623715c3bcf724f927f4-daa06aa48aa8.json" \
  --receipt-sha256 e0f9e7103d5cc0f1fa6030decec972cb017f54130e42061cfb0da45cdc795618
printf 'READONLY_RECONCILIATION_RC=%s\n' "$?"
```

A successful command means the assessment ran; inspect each independent status.
It does not certify money, discharge claims, repair the journal or approve a
future release. Do not rerun issue/stage/activate, SQLite UPDATE or Ship.
