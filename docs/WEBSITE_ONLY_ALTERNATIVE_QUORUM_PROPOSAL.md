---
id: "aoe2war.app-prodn.website-only-alternative-quorum-proposal"
title: "Held Alternative Website-Only Release Quorum Proposal"
type: "design"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn","wolochain"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "proposal-only-nonauthorizing"
reviewed_at: "2026-10-25"
review_interval_days: 30
sensitivity: "internal"
---

# Held Alternative Website-Only Release Quorum Proposal

**STATUS: DISCUSSION ONLY. The currently qualified controller does NOT
implement this policy and remains strictly four independently signed
council roles + fifth independent Source + separate Wolo machine witness.**
No code change, public-key enrollment, fictional role, test signing or
deployment is authorized by this document.

## Why an alternative may be reasonable

The proposed ten-path website release modifies Kingdom Index presentation
and clearly unpublished Watcher draft review, DocsV2 source documentation,
Node lockfile patch `fast-uri@3.1.9`, and tests; it changes no business
wager/Founder/withdrawal/settlement writer, financial schema or Wolo
binary. The canonical parent website holds `vps-source-drift` P1 OPEN;
funded economics and all bridge/writer capabilities remain disabled.
Requiring five separate human signers may be operationally unrealistic
for a small noncustodial website-only team, even though the five-person
council remains the CURRENT active security contract.

## Candidate policy, if and only if reviewed and formally accepted

One possible LOWER-COMPLEXITY policy would require **three DIFFERENT
verified humans**, plus the unchanged separately operated cryptographically
signed machine-witness service:

1. **Owner** — actual controlling website owner, explicitly approves
   exact product SHA, operator/controller SHA, no financial authority,
   rollback plan, deployment window and public release.
2. **Independent Release+Source Security reviewer** — genuinely distinct
   from owner and finance, accepts exact source/diff/build/gate/manifest,
   `fast-uri` dependency, SSR/startup/legacy GET side effects, Watcher
   unchanged-binary exception and exact protected deployment mechanics.
3. **Independent Chain+Finance reviewer** — genuinely distinct from the
   other two, accepts unchanged Wolo P1, consensus/Wolo process identity,
   unchanged pre-existing finance writers, ongoing financial HOLD and
   no bank/custody/Founder authority. Their signature must cover the
   Source+Finance noninterference receipt.

**No one human signs as two independent reviewers.** Each independent
person retains a separately enrolled private key and out-of-band
custodian/identity record. The machine signer is not counted as human
and cannot be controlled by the person pushing the release. If
three genuinely separate human custodians cannot be recruited, the
release is STILL HOLD. Reducing this to one owner/key would eliminate
independent failure detection and is not recommended.

## Nonnegotiable admission invariants

- Exact ten-path candidate SHA `6be434c00469afa4acb0623715c3bcf724f927f4`,
  its already verified source-bound gate and manifest, and actual
  current production `a2b941f154fdc31ec4d6c4ece6d0e49036c48abd`
  are bound to every phase signature.
- Original source P1 `vps-source-drift` is reported *OPEN/BLOCKED* in
  every witness, not waived, suppressed or globally reclassified.
- Funded activation FALSE: no treasury, wallet/bank, Founder,
  auto-bet, payout, settlement or Wolo RPC mutations; zero new SQL
  migrations and unchanged finance-service/writer state.
- One authenticated global deployment lease, private durable one-use
  nonce ledger, fresh exact artifact/BUILD_ID and source-provenance checks
  still apply.
- PRE_STAGE signed before staging; PRE_ACTIVATE is another newly issued
  signature challenge over an ACTUAL staged artifact, BUILD_ID, receipt
  digest and rollback plan. Never reuse approval or nonce.
- Independent machine signer verifies live Wolo processes, configuration,
  original P1, finance writers, signer capabilities, bank HOLD, active
  website source/BUILD_ID, both before and after staging/activation.
  The operator cannot create arbitrary signatures.
- Passive deployment-version health checks and rollback receipts remain
  mandatory; no bets/lobby GETs as release probes.
- Existing original LIVE/funded finance feature code and SQL migrations
  are never merged to accomplish a website-only release.

## Required new engineering BEFORE the alternative could be used

Central Command must first publish an explicit policy decision and sign
off on the changed independence assumptions, signer enrollment and threat
model. Session A may then open a **separate policy implementation PR**
(not edit production, not silently change the active #871 authority)
with narrowly scoped role-map changes in `aoe2_website_release_v2.py`
and `aoe2_website_protected_release_v2.py`, a new schema/policy ID so old
four-role packets cannot be replayed under three-role authority, and
a signed migration/revocation plan for the trust store. Keep old policy
validation available ONLY for independently authorized pre-existing
live approvals and forbid hybrid role packets. Add adversarial tests for
same-human duplicate identities, changed policy ID, stale machine
witness, split-brain release ledger, altered exact product SHA,
Wolo P1 suppression, changed bank/financial writer state and rollback.
Re-seal DocsV2, run exact-head 3/3 CI, obtain new independent human review,
and separately authorize deployment of new operator tooling. Until all
that is complete and genuine new keys exist, **NO GO**.

**Current action:** pursue five-person enrollment and independent runtime
witness first. This proposal is only an explicit owner/Central Command
decision alternative, not a deploy shortcut.
