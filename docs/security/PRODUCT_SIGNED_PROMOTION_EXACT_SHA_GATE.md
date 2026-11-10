---
id: "aoe2war.app-prodn.product-signed-promotion-gate"
title: "PRODUCT Signed Promotion Exact SHA Gate"
type: "reference"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "security-contract"
reviewed_at: "2026-11-10"
review_interval_days: 30
sensitivity: "restricted"
---

# SOURCE-ONLY PRODUCT RELEASE PROMOTION CONTRACT v1 — exact SHA + owner signature + independent CI

Status: DESIGN/NEGATIVE FIXTURE QUALIFIED; **NOT INSTALLED ON B'S RELEASE CONTROLLER**. This is a fail-closed integration requirement, not a claim that GitHub optional PR checks stop direct pushes. Session B alone owns App R25/Steam/3032/restricted rollback; Codex solely owns FINANCIAL; Session C may produce only source-bound candidate evidence. Kingdom Traders remains PAPER HALT.

## Motivation — actual provider enforcement limitations

2026-11-10 read-only GitHub API observed: public Emaren/app-prodn main branch protection 404 NOT PROTECTED and rulesets empty; private Emaren/kingdom-traders protection/rulesets 403 provider entitlement. Keep KT PRIVATE and retain existing billing. Current GitHub administrator/direct-push ability to the repository is **not eliminated** by a GitHub Action. Production release must never be inferred from branch name, main merge, optional workflow success, a source PR green badge, GitHub write permissions, or a model/agent instruction.

## Independent trust boundary

The future B/Central promotion controller is installed by B/owner **outside PRODUCT's untrusted write permission**, with exact pinned code/source hash, root/B-owned allowed_signers file (not group/world writable), root/B-owned one-use nonce ledger, reviewed release/rollback script and read-only GitHub API token. The OWNER signing private key is offline/outside PRODUCT, never exposed to C, Foundry, Traders or the runner. New restricted PRODUCT runner must have no B promotion, host SSH deployment, owner key or release-controller write access.

This source document does not create that controller. Until an external writable-boundary/host controller is physically proven, RELEASE_GATE_INSTALLED=HOLD.

## Manifest to be independently signed by the one human owner

Canonical UTF-8 sorted-key JSON, fixed schema aoe2war.product.promotion.v1, minimum fields:

- repository (exact Emaren/app-prodn or Emaren/kingdom-traders)
- PR number, **exact PR base branch AND base 40-hex SHA**, plus exact 40-hex PR HEAD source commit SHA
- reviewed allowed change paths plus reviewed baseline SHA and source diff SHA256
- artifact SHA256 and precise allowed operation (STAGE_NONFINANCIAL_APP or STAGE_PAPER_ONLY; no live trading/funding)
- required CI workflow IDs, run IDs, attempt numbers and expected workflow-file blob hashes bound to that HEAD
- required GitGuardian/security, docs, build, source provenance and negative/positive guard results
- release controller trusted version SHA, rollback source+artifact SHA **matching B/root-controlled trusted_policy.approved_rollback**, host CPU/RAM/storage bounds and preflight receipts
- absolute expiry UTC, unpredictable nonce, exact owner/Central review comment ID
- private/authenticated acceptance matrix and signed-in role evidence for routes that require it; explicit protected finance 503 and denied mutations
- declaration that FINANCIAL, C06/C07, custody, 8092–8095 and trading remain held

Owner signs the canonical manifest with OpenSSH Ed25519 SSHSIG: namespace **aoe2war-product-release**, principal **aoe2war-central**; exact source and artifact SHAs become immutable release admission. Example *owner-host-only future commands* (not executed):

  ssh-keygen -Y sign -f /owner-controlled/offline_key -n aoe2war-product-release /owner-reviewed/admission.json

  ssh-keygen -Y verify -f /B-controlled/allowed_signers -I aoe2war-central -n aoe2war-product-release -s /owner-reviewed/admission.json.sig < /owner-reviewed/admission.json

No text substitution or JSON whitespace normalization is permitted after signing; verify the exact bytes.

The source-only gate now enforces B-controlled/root-owned, non-group/world-writable artifact and rollback staging roots and exact staged files in addition to SHA256; artifact review must include symlink/TOCTOU controls. The root-controlled trust policy supplies its own independently approved rollback source SHA and artifact digest; a valid owner signature alone cannot silently replace rollback. A PR based on a pinned B release branch (rather than main) is permitted only when **both exact base branch and SHA** match the signed manifest and real GitHub PR.

## REQUIRED release-controller algorithm — reject unless every condition PASS

1. Reject missing/malformed fields, duplicates, invalid 40-hex/64-hex SHAs, noncanonical JSON, stale expiry, reused nonce, wrong operation/owner principal/namespace, unknown repository, unsigned or invalid signature. Verify external allowed_signers ownership and permissions; no trust root may be editable by the PRODUCT runner.
2. Fetch GitHub PR via read-only API: repo exact, base exact, actual PR HEAD equals signed SHA, source branch matches signed value; no stale workflow_dispatch or previous SHA reused. Read-only GitHub API failure is HOLD.
3. Independently fetch each exact GitHub Actions run ID and assert status=completed, conclusion=success, event=pull_request on that repo, head_sha=exact signed head, run_attempt matches, workflow ID/name/path matches the separately approved list. Reject cancelled/skipped/in_progress/neutral runs and absent job evidence. Verify specific source-bound negative guard test job steps completed successfully; do NOT trust a contributor-provided summary.
4. Re-fetch workflow file source at immutable commit SHA, hash and compare against B/Central's **pretrusted** workflow bytes, not a hash provided only by the PR. Treat unprotected-workflow modifications as a fresh owner review requirement. App exact PR: require product-boundary plus full AoE2WAR production build, DocsV2/dependency-security, release/source checks, GitGuardian and scoped Chrome/role suites. KT: product-boundary, original offline contracts/provenance, GitGuardian; no funded authorization.
5. Obtain exact immutable build artifact/source tarball; independently SHA256 bytes against signed artifact. Rebuild/reproduce if required; refuse 3rd heavy Next runtime or unknown host storage/memory envelope. For App, B checks protected private finance 503, anonymous 401, ordinary admin denial 403, authorized admin 200 only where relevant and proper separate Steam identities. Verify same-slot restricted 3032 rollback artifact and 3030 retained, without legacy finance fallback.
6. **Before any write**, create an O_CREAT|O_EXCL, fsynced nonce-consumption receipt in B-controlled non-PRODUCT release ledger. A second attempt with same nonce MUST refuse. Controller emits signed immutable PREPARED, REJECTED or COMPLETED receipt; cutover follows B-only one-use controller and independent rollback.
7. Agent instruction, ordinary repo CI, or a direct push cannot grant promotion permission. No source self-approval, no alternate Git ref or artifact selector, no user-provided shell arguments interpreted as command.

## Real negative evidence obtained in PRODUCT disposable fixture only

On the M1, a freshly generated temporary fixture Ed25519 test key (NOT an owner signing key, never exported) signed a fake admission manifest under namespace aoe2war-product-release. OpenSSH signature verification returned: exact manifest PASS; a changed source_sha field FAILED verification; wrong principal FAILED verification. Fixture auto-removed. **This proves SSHSIG bytes/principal binding only, not GitHub CI attestation or a real installed production gate.**

Future independent negative tests: wrong run SHA, stale PR head, nonmatching workflow source blob, missing required security job, changed artifact hash, expired owner approval, replayed nonce, missing real finance 503/Steam role, unsigned source, wrong repo, direct unqualified push to main. Each must be DENIED before any production write. A mocked offline CI status is NOT enough: B must independently observe real GitHub and installed-artifact receipts.

## Exact open limitation — direct push

- **App main** is currently unprotected; anyone with push rights can mutate GitHub source or workflow definitions. Owner/B should enable branch rules + original release/Docs/GitGuardian checks after reviewing the consequences for B; not performed here.
- **Private Traders** lacks available private branch rules on current provider entitlement. Do NOT make KT public or change billing. Limit write credentials and require the external independent B/Central signed-release controller; still cannot truthfully claim prevention of GitHub repository direct pushes.
- Before external B/Central promotion wrapper is actually installed and tested, this manifest/signature source remains a DESIGN, so enforceability is HOLD. Source-only PRs never authorize a website release, daemon or funded bot.
