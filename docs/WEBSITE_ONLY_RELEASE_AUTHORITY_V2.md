---
id: "aoe2war.app-prodn.website-only-release-authority-v2"
title: "Held Website-Only Release Authority V2"
type: "runbook"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn","wolochain"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "nonauthorizing-source-engineering"
reviewed_at: "2026-10-24"
review_interval_days: 1
sensitivity: "internal"
---

# Held Website-Only Release Authority V2

**Status: NOT AUTHORIZED.** This document defines independently reviewable engineering
and exact production operator prerequisites. It does not provide permission to run
a production deployment or override the original WoloChain `vps-source-drift` P1.

## Immutable product release

- Certified production: `a2b941f154fdc31ec4d6c4ece6d0e49036c48abd`
- Target **product** source: canonical application main
  `21cd1493b182cb0968a6b6cf3f528d0578cfd797`.
- Changed paths from certified production: **nine**, including Kingdom Index's
  clearly labelled **UNPUBLISHED Watcher 1.6.6 draft** and security-patched
  `fast-uri@3.1.9`. Source review metadata is NOT engineering certification.
- No funded Auto Bets/Satchel, wallet signing, Founder payments, withdrawal,
  settlement, API/GET financial implementation or Prisma migrations are part
  of this **product source** delta.
- The distinct operator-control source lives on held PR #867. It is **not**
  the product runtime artifact; never merge #862/#863 financial code as
  a shortcut into the first release.

## What actual independent humans must provision

Provision OUT OF BAND. Do not publish private keys, bearer material, wallets,
live balances, recipient data, signer seed phrases or plaintext service
environment to GitHub, chat, or workflow logs.

1. Authoritative operator checkout contains the reviewed, source-sealed
   control scripts from this **exact independently approved commit**.
   Controller checkout and product main checkout are separate, both clean.
2. Root-owned protected public trust directory
   `/etc/aoe2war/website-release-authority-v2/`, **mode 0755** (public
   verification material, NOT signing secrets). Each enrolled PEM is
   root-owned, mode 0644. This allows the ordinary authenticated Mac release
   operator to read independent public keys without sudo or changing SSH
   identity. The directory contains **six** verification
   certificates (five distinct human roles and independently operated runtime
   witness): `owner.pem`, `chain_reviewer.pem`,
   `finance_reviewer.pem`, `release_operator.pem`,
   `source_reviewer.pem`, `runtime_witness.pem`.
   The five human private signing keys are managed by five independent real
   persons. Public-key uniqueness alone does not demonstrate human identity;
   record enrollment/hardware key control evidence independently.
3. Independently administered executable
   `/usr/local/libexec/aoe2war-website-witness-v2 --json`.
   It must be root-owned, never writable by group/others, genuinely
   capture runtime truth on the authorized host and return an independently
   signed `aoe2war-independent-runtime-witness-v1` packet. Do not replace
   with an operator-supplied self-asserted JSON file.
4. Authenticated release-operator-owned private local ledger directory
   `/var/lib/aoe2war-website-authority-v2`, mode 0700 and parent
   `/var/lib` ROOT-owned and not group/world writable. The owner UID
   **must equal the user executing the controller and holding the existing
   SSH/global-release lease**. This avoids sudo silently changing Git and
   SSH identity. One authoritative operator machine, backed up under
   approved durable policy. The controller creates operator-owned SQLite
   `authority.sqlite3` mode 0600 with random
   `PRE_STAGE` / `PRE_ACTIVATE` challenge issuance, full-sync transactional
   consumption and permanent rejection of reused attempts. No other
   machine/ledger may be admitted without cross-host single-instance proof.
5. Reviewer-signed source-finance boundary document:
   `aoe2war-website-source-finance-boundary-v2` includes exact
   production `base_sha`, nine changed paths, scope digest, source review
   time (fresh within 60 minutes), `fast-uri@3.1.9` transitive inventory,
   SSR and layout, server actions, financial GET queue behavior, scheduled
   systemd/workers, web service restart impact, environment/feature flags,
   absence of new migrations and financial source writes, positive
   no-unresolved-effects verdict, original Wolo P1 *still open*,
   detached signatures by the independent `source_reviewer` and
   `finance_reviewer`. Both hashes must also be covered by all four
   separately signed per-phase approvals.
6. Fresh runtime witness packet before **each** approval phase:
   observed UTC age <=90 seconds when consumed, identical original P1 raw
   `source_p1_original`, Wolo 8092, 8093 and separate consensus PID,
   executable SHA256+inode, Wolo config SHA256, financial writer-state SHA256,
   signer capabilities SHA256, financial HOLD SHA256 and current web SHA/build
   evidence. Preserve the original P1 `BLOCKED` text verbatim.
7. Independent signatures of **four** additional exact candidate / phase
   packets: owner, chain reviewer, finance reviewer and release operator.
   These bind stage attempt, challenge, application SHA, independent
   dispatch code SHA, manifest/gate/source-review/financial-readonly/Wolo
   witness digests, rollback policy, expiry, and risk classification.
   PRE_STAGE must not invent BUILD_ID/artifact hash.
   PRE_ACTIVATE requires an ACTUAL durable stage receipt, built artifact
   SHA256, BUILD_ID, consumed stage approval digest, a NEW challenge and
   fresh runtime identity. No artificial signatures or approvals.

## Protected, gated operator flow (not a deployment instruction without approval)

1. Independently review CI/DocsV2, all source runtime GET/startup effects
   and the operator control tree. Check the target product checkout is
   **exact main SHA** and has no hidden Git index bits, dirty source or
   unexpected dependency tree. Check `aoe2war-release gate` and `manifest`
   source receipts exist on the candidate checkout; neither is
   production permission.
2. Obtain a fresh signed Wolo machine snapshot from the independent observer.
   Using the separately reviewed controller checkout, the operator invokes
   `python3 scripts/aoe2_website_protected_release_v2.py issue-stage
   --candidate-repo /absolute/verified/canonical/app-prodn`.
   This only issues a random one-use challenge **under the global lease**.
3. Collect the five distinct humans' evidence and owner/chain/finance/release
   phase signatures. Only after all attestations exist, operator invokes
   `... stage --candidate-repo <exact-main-checkout> --packet
   <real-PRE_STAGE.json> --signed-wolo-prestate <real-signed-wolo.json>
   --signed-noninterference <real-source-finance.json>`.
   The controller acquires the global lease, rechecks source and living Wolo,
   cryptographically authenticates every proof, atomically consumes the nonce,
   then invokes the original isolated protected stage using the hardened
   controller source. No partial stage authorizes activation.
4. Verify actual source-bound, durable stage receipt, staged artifact digest,
   BUILD_ID and unchanged live source. Invoke `... issue-activation
   --candidate-repo <exact-main-checkout> --attempt-id <issued-stage-attempt>
   --previous-stage-approval-sha256 <ACTUAL-64-hex-signed-packet-digest>
   --stage-receipt <exact-operator-stage-receipt>`, under the same global
   lease protocol with a fresh independent runtime witness.
5. Obtain a second fresh per-phase set of real signed attestations referring
   to the new PRE_ACTIVATE challenge, actual stage receipt, BUILD_ID, artifact,
   rollback plan, P1, finance proof and new signed witness. Invoke
   `... activate --candidate-repo <exact-main-checkout> --packet
   <real-PRE_ACTIVATE.json> --signed-wolo-prestate <real-new-wolo.json>
   --signed-noninterference <real-source-finance.json>
   --stage-receipt <exact-operator-stage-receipt>`.
   The controller revalidates under the lease and consumes activation nonce
   before one protected `ship --activate` dispatch.
6. The nine-path legacy product candidate uses identity-only internal/public
   `/api/deployment-version` probes and bounded soak, never finance-scheduling
   `/api/bets`, `/api/lobby`, workshop or unproven prewarm as passive probes.
   Other reviewed source releases retain their separate full smoke contract.
   Validate exact active BUILD_ID, Git SHA, duration, certified receipt and
   unchanged live Wolo/finance fingerprints. Preserve fast and durable
   rollback receipts.

**On any failure:** HOLD, retain all evidence, do not repeat consumed nonces,
do not retry SSH after ambiguous activation, do not manually restart Wolo or
bypass global lease. If the remote activation trap already restored the
previous live site, independently verify its rollback certificate. A
post-commit outside-witness conflict requires an independently approved
incident/rollback decision; absence of a signed result is not a successful GO.

## October 24 independent controller correction — exact operator tree and one lease

The governed operator/controller checkout is **different from** the nine-path
product checkout. Each four-role, candidate-bound PRE_STAGE and PRE_ACTIVATE
signature packet must additionally contain:

- `operator_controller_commit_sha`: exact, independently reviewed 40-digit
  Git SHA of the authoritative controller checkout
- `operator_source_inventory_sha256`: the canonical SHA256 of sorted pairs
  `[tracked path, actual file SHA256]` for every tracked file under
  `scripts/` and `deploy/` in that same checkout
- Existing `controller_sha` and `protected_dispatch_sha256` must remain
  bound to the exact two authority entrypoint bytes

The controller checks the operator checkout is clean, tracked, free of hidden
`assume-unchanged`/`skip-worktree` Git flags and executable-source symlinks.
The full inventory is checked **inside the global release lease** and rechecked
after all signed receipts verify, immediately before the irreversible nonce
consumption and protected stage/activation dispatch. Source stamps from only
the candidate main checkout are insufficient; release scripts execute from
this distinct privileged operator tree.

The operator CLI **must forward** `--signed-noninterference` to
`verified_operation(noninterference_receipt=...)`. Stage/activate invokes
the *existing* `aoe2_release_stage.stage_release` and
`aoe2_release_ship.activate_release` guarded libraries once, in-process,
using the source-specific canonical-main ROOT, while retaining the existing
one local deployment lock and global Wolo/release lease. It does **not** spawn
a child `aoe2_release.py ship` that would deadlock on the parent's
nonreentrant lock, and it does **not** skip transport, source, manifest,
gate, runtime, finality, rollback or health checks. Errors fail closed and
consumed nonces are never silently retried.

These are engineering acceptance checks, **not live production authorization**.
The real independent signed witnesses, securely provisioned external signing
identities, protected operator channel and two-phase artifact approvals
remain mandatory. The historical Wolo source P1 and funded financial HOLD
cannot be relaxed or erased by this website-only scope.

## Real GO/NO-GO

This PR is source engineering only. It has no provisioned real five-human
reviewer trust anchors, runtime witness signer/executable, live source-and-
finance signed attestations, protected operator device connection, stage
receipt, activated BUILD_ID or production certification. Until those actual
external approvals and host access exist, **WEBSITE PRODUCTION NO-GO**.
Funded/Wolo financial mainnet remains separately on HOLD. Original Wolo
`vps-source-drift` P1 stays OPEN and visible after any website-only
release; neither approval nor this code resolves it.

## Exact nine-path WATCHER classification with no Watcher distribution

The nine-path main release remains **risk_class WATCHER** in the existing
conservative path classifier because draft-review filenames include
"watcher". It does **not** publish or install Watcher 1.6.6, which remains
explicitly UNPUBLISHED. The protected controller therefore permits WATCHER
risk only when the signed candidate remains the **exact** main SHA, its
manifest enumerates the exact nine paths, migrations are empty and the
Source and Finance reviewers affirm no hidden transitive financial changes.

The stage function checks `lib/watcherRelease.ts` at both exact Git
commits. It omits a *new* Watcher distribution-vault receipt **only when
the two versions are equal and every exact nine-path/source/migration
condition holds**. Every real Watcher executable/version change and every
other WATCHER candidate still requires the original vault certificate.
Neither policy relaxes the existing Wolo P1, financial review or signer
requirements.

## macOS ordinary-operator privileges (never sudo the release command)

The public trust directory must be root-administered and traverse/readable,
and the private ledger must be owned by the authenticated operator. Do NOT
place private signing keys under the public trust directory; do not export
private keys to GitHub/ChatGPT. Public trust anchors are installed after
off-host independent identities and the person holding each key have been
authenticated and recorded by independent reviewers.

A privileged installer, after explicit owner/administrator approval, may
run these **local provisioning-only** commands. They do not issue release
authority:

```bash
sudo install -d -o root -g wheel -m 0755 /etc/aoe2war/website-release-authority-v2
sudo install -d -o root -g wheel -m 0755 /var/lib
sudo install -d -o "$(id -un)" -g "$(id -gn)" -m 0700 /var/lib/aoe2war-website-authority-v2
```

Independently authenticated public PEM files are then provisioned with
`sudo install -o root -g wheel -m 0644 <APPROVED_PUBLIC_PEM>
/etc/aoe2war/website-release-authority-v2/<ROLE>.pem` for the five real
human roles and distinct machine-witness role, substituting actual verified
local file paths and names. NEVER provision a synthetic or AI-signed
"reviewer" identity as if human. The authorized root-owned witness
executable must be installed and separately audited before the controller
will make a lease-held stage/activation call.

Run `bash scripts/aoe2_website_release_readonly_diag.sh` from this
controller worktree BEFORE any mutating action. Review every HOLD and its
actual sources; this diagnostic never issues a permit.
