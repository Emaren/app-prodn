# Website-only nine-path source release — protected controller v2 (HELD)

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
   `/etc/aoe2war/website-release-authority-v2/`, with **six** verification
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
4. Root-owned private local ledger directory
   `/var/lib/aoe2war-website-authority-v2`, mode 0700, one authoritative
   operator machine, backed up under approved durable policy. The
   controller creates SQLite `authority.sqlite3` 0600 with random
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

## Real GO/NO-GO

This PR is source engineering only. It has no provisioned real five-human
reviewer trust anchors, runtime witness signer/executable, live source-and-
finance signed attestations, protected operator device connection, stage
receipt, activated BUILD_ID or production certification. Until those actual
external approvals and host access exist, **WEBSITE PRODUCTION NO-GO**.
Funded/Wolo financial mainnet remains separately on HOLD. Original Wolo
`vps-source-drift` P1 stays OPEN and visible after any website-only
release; neither approval nor this code resolves it.
