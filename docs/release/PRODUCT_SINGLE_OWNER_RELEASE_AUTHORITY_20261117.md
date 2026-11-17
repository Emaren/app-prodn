---
id: "aoe2war.app-prodn.product-single-owner-release-authority"
title: "Single-Owner PRODUCT Release Authority"
type: "runbook"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn", "vpssentry"]
audience: ["operators", "developers", "ai-agents"]
source_of_truth: "git"
authority: "nonfinancial-owner-release-governance"
reviewed_at: "2026-11-17"
review_interval_days: 30
sensitivity: "internal"
---

# Single-Owner PRODUCT Release Authority

## Decision — November 17, 2026

**Emaren is the project's sole human owner, operator and approving reviewer.**
A second human/GitHub identity is **not** a release prerequisite. Never tell
the owner to invite an invented reviewer, ask another account to click Approve,
or pretend an AI agent is a different human. The owner may direct AI sessions,
automated tests, deterministic verifiers and separate host readbacks; these are
independent **technical evidence**, not independent human consent.

The WE2 website/Factory authority is NONFINANCIAL ONLY. WE1 owns custody,
settlement, keys, reserves and financial writers. WE3 independently owns
Kingdom Traders strategy/broker accounts/PAPER journals. WE2 may integrate
only reviewed, filtered, authenticated nonfinancial PAPER telemetry and must
not acquire broker credentials, root custody or any new FINANCIAL writer.

## The only HUMAN release approval

The owner acts as **Emaren** from the actual M1 owner terminal (UID501).
The Factory already accepts `aoe2war.product.owner-approval.v1` with
`approvedBy=Emaren`, `financialAuthorized=false`, a unique source SHA,
PR/run, BUILD_ID, Linux artifact and independent proof artifact SHA256/length,
required completed exact-head CI checks, explicit permitted phases and a
short expiry. This is its real trust contract. No second human GitHub review
exists in the Factory; do not manufacture one in a wrapping script.

Independent means the **Linux artifact verifier, exact-head CI, root and
public identity checks, and physical rollback witness** are different
evidence producers. One owner can authorize a release based on all of them.
Missing machine evidence, an untrusted signing key, a noninteractive owner
consent or a stale permit still HOLD. Owner consent is not inferred from
a chat message alone when the active Factory requires its exact local
permit file.

## Current production candidate #1394 — one owner-local approval action

At this checkpoint only, release candidate PR #1394 is pinned to:
- Source: `8ccf253bd470ed623e1101a6d1b30f8fab2ff5d6`
- Canonical base: `7751b79f9dc2ca70cf4a852dad0f163c48060300`
- Linux build CI run: `43973746619`
- BUILD_ID: `bZXuYceLMprSfau1Je5Q_`
- Already verified build artifact ID: `14279692927`
- Already verified independent proof artifact ID: `14280347633`

The owner-private issuer is installed only on the M1, under
`~/AoE2WAR-Recovery/WE2-approval-tools/issue_pr1394.py`, file mode
0600 in a 0700 directory. Its known-good source SHA256 on this review date:
`f820e4b3ebcc6f0331e9fc8e0f98999188de152a0700f5864bc1713695609e56`.

Owner can optionally preview, then issue **from their own interactive Terminal**:

```bash
python3 ~/AoE2WAR-Recovery/WE2-approval-tools/issue_pr1394.py --check
python3 ~/AoE2WAR-Recovery/WE2-approval-tools/issue_pr1394.py --issue
```

The interactive issuer validates the already-existing exact Linux artifact,
CI, proof, approved actor Emaren and PR source; it prompts the sole human to
type **APPROVE WEBSITE PR1394** followed by the **exact 40-hex source SHA**.
It emits a mode-0600 owner-approval.v1 valid for 60 minutes and prints its
private absolute path. This is the **only** human ceremony. No invitation,
second GitHub identity, self-APPROVE GitHub click or repeated rebuild needed.

**A verified previous green source is never an automatic permit.** If the
source/branch/base, checks, artifact digest or expiry drifts, stop and
requalify the actual candidate. The historical owner request JSON contained
`PENDING_DISTINCT_REVIEWER` as an extra mistaken wrapper condition;
it remains a preserved audit artifact, not current release policy. The
private helper's old version remains preserved for audit, not execution.

## Existing Factory — one accepted production transaction

After the owner has explicitly issued the permit, WE2 executes the
**already-installed, exact-source verified** Factory on the owner M1:

```bash
python3 /Users/tonyblum/.aoe2war-product-releases/we2-recovery-main-20261116/scripts/aoe2_product_release.py --approval /ABSOLUTE/PRIVATE/PATH/PRINTED/BY/ISSUER.json --phase release
```

The private path above is **illustrative**; substitute only the path actually
printed by the local owner issuer. Do not write any credential or permit to
GitHub, logs, chat or shared PRODUCT worktrees. `--phase plan` is read-only,
`--phase transport` stages verified bytes without activating, and the
single `--phase release` executes the installed full release controller.
Its exact-owner permit and check gates must pass, or production remains HOLD.

For an accepted release the existing Factory must witness staged source and
BUILD_ID, single intended 3032 instance, public verified HTTP routes, owner
Emaren Incognito/admin, ordinary Scribe regular-profile/denial, guest denial,
Radio, Betting HOLD, then **activate → rollback to original 3032 →
reactivate**, with durable physical T10 receipts and measured monotonic times.
Do not re-route public traffic through rollback 3030 or start a third
Next.js runtime. Preserve emergency 3033, PAPER 9447, appearance writer and
the closed financial 8092–8095 ports. A user's general approval cannot
change any FINANCIAL gate or root signing boundary.

## Repeatability and owner effort

One person makes the decision once per exact source/expiry. Automated
builders, verifiers, unit/Chrome CI, Factory and immutable receipts do the
repetitive work. GitHub PRs can be generated by engineering sessions to
bind source and CI; do not ask the owner to open, approve or review their
own PR by hand. A protected code-review signal may be provided by separate
AI analysis and independent machine proof, **never falsely labeled a human**.

For future PRODUCT releases, rebind the same single-owner pattern to the
new candidate and its actual artifact IDs. Do not reuse the specific
#1394 helper or previously issued/expired approval for different source.
Do not alter the root Factory or weaken artifact/rollback gates to remove
an imaginary human reviewer.

This document is source governance, not proof #1394 was deployed.
The last independently witnessed live November Ember Reign source remains
`09ff9eeccb93b4701d1cfd1ff329f0286cdc6e16`, BUILD_ID
`0f6xSDXOwMuS544lD15sb`, until HEL1/HTTP evidence establishes otherwise.
