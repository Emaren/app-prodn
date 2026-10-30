---
id: "aoe2war.app-prodn.solo-owner-w1-website-admission"
title: "Q19 — Solo-owner WEBSITE-ONLY admission v1 (review-only PR)"
type: "reference"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn", "vpssentry"]
audience: ["developers", "operators", "ai-agents"]
source_of_truth: "git"
authority: "review-only-release-admission-contract"
reviewed_at: "2026-10-29"
review_interval_days: 30
sensitivity: "internal"
---

# Q19 — Solo-owner WEBSITE-ONLY admission v1 (review-only PR)

Authority: **ONE real human owner**, not a fictional signer council. This file and
`scripts/aoe2_solo_website_admission.py` are a **versioned, non-dispatching
verifier proposal**. They do NOT enable staging or activation, replace the frozen
W1 multi-role verifier, install trust, write HEL1, or authorize money movement.

## Fixed release lineage

| Train | Candidate | Expected live source before release |
|---|---|---|
| W1 | `b46a51f1592c9f296839924ae55e722618b10d35` | `33e0f42b3d34d324b6cbab6c0347d4f5aff6fb8a` |
| Post-W1 | `fa5c350b35cba7ace8d4515a7ad52ba4e1534295` | frozen W1 SHA |

**Do not merge this PR into frozen W1 main.** It is controller review work and
must eventually ship independently from the frozen candidate. Source-integrated
post-W1 is not automatically a deployable W1 replacement.

## Owner identity and phase policy

- Reuse the already legitimate owner-v4 **public RSA** trust identity only:
  canonical root-owned Mac
  `/private/etc/aoe2war/website-owner-v4/owner.pem`, pinned SPKI DER SHA256
  `3ac8653650acd9c545f4ffa5d007db981bd634ab2f94fa08e687fed92948f1fd`.
  Do not copy or read a private key, reproduce its passphrase, invent reviewers,
  or reuse any owner-v4 challenge, permit, attempt ID, receipt or release signature.
- New domain `AOE2WAR.SOLO_OWNER.WEBSITE.ADMISSION.V1` and policy
  `aoe2war.solo-owner.website.admission.v1`, signed payload encoded with
  canonical ASCII JSON. Two **fresh, distinct** PRE_STAGE / PRE_ACTIVATE nonce
  challenges; <=10-minute owner intent TTL, <=120-second authenticated HEL1
  observation freshness, same one-attempt lease and exact candidate/manifest/
  gate/scope/active BUILD_ID/rollback/finance fingerprints.
- PRE_STAGE cannot invent a future staged artifact. PRE_ACTIVATE must bind
  the authentic prior owner packet/signature, the immutable completed STAGED
  receipt SHA, actual new BUILD_ID, unchanged finance boundary and same lease.
- Only the real owner signs. HEL1 is an authenticated **machine observation**,
  **not** a second independent human signer. A compromised sole owner
  credential cannot be vetoed by an imaginary second human.

## Mandatory *physical* admission, not green CI theater

The trusted host reader, when implemented, MUST obtain fresh HEL1 root-authorized
read-only measurements under an authenticated, pinned SSH channel, check source,
service, rollback, immutable release lease/challenge and original 8092/8093
process/config/writer fingerprints, and fail closed on error or mismatch.

The verifier checks E's **exact six independently restored protected classes**,
a separately reviewed physical restore verdict, signed Doctor 0 P0/0 P1,
actual attached volume >=30GiB ordinary free AND <=88% effective usage AND
<92% Finish usage. These values cannot originate from an owner-submitted
JSON, unsigned UI telemetry, CI fixtures, source-only tests or the verifier
itself. Finance P1 remains HOLD, and financial/custody authorization is FALSE.
No changes to live financial writers, services, fund balances, database schema,
or WOLO 8092/8093 are in scope.

Verified last owner observation 2026-10-30T03:30Z: HEL1 **21.048 GiB** free,
**92.563% effective** (requires >=**12.916 GiB** more genuine usable free
plus write margin); E genuine class-consistent encrypted copies and third
physical isolated restore still **0/6**. Intel Mac has 317.13GiB shared
available, FileVault OFF: **ciphertext-only**, offline-held private age key;
its same SSD is not the independent third restore target. W1 remains HOLD.

## Still required before a real stage controller is connected

1. Independent code review of exact-head PR + adversarial CI. Confirm
   canonical owner public-key pin and actual owner consent to the single-key
   risk (decision recorded in app issue #873).
2. Review and implement the missing **trusted HEL1 root SSH observer/challenge
   issuer**; it must not accept arbitrary JSON or pretend a caller-supplied
   callback is proof. Bind host lease, financial writer snapshots before/after,
   root journal, and signer observation to immutable challenge/freshness.
3. Review and implement an **atomic durable nonce-consumption + global lease**
   and hook this verified admission into the genuine existing isolated
   website-only STAGE/ACTIVATE engine. Do not monkeypatch old
   `require_admission`, pass skip flags or modify frozen W1 source.
4. Independently verify manifest/gate actual verdict and transitive closure,
   artifact SHA, separate PRE_STAGE and PRE_ACTIVATE approval, source-scoped
   build/rollback, authentic Chrome at 375/768/1440 and site-wide 88 routes.
   Existing owner-v4 code hard-pins old Renaissance candidate; do NOT retarget
   its source or replay historical signed receipts.
5. Owner-approved protected dry-run/review, then independent owner approval
   at each phase. Activate W1 only after actual physical passes. Then repeat
   the same full policy/release process for post-W1 independently. Record
   actual internal + public SHA/BUILD_ID, service, admin 401/403, signed
   freshness, rollback and financial noninterference in #665/#934.

**STOP CONDITION:** Until steps 1–5 genuinely pass, the module returns
`INPUTS_VERIFIED_ONLY_NOT_AUTHORIZED`. This PR by itself is not a production
release authority. No owner keys, paid backups, bank transfers, delete or
service mutations are authorized by accepting source code.

## Central security review follow-up (PR #1008, subsequent head)

- **Gate:** the verifier now parses the original schema-2 release gate
  receipt and demands exact source/base/scope, explicit `status=PASS`, matching
  `required_commands` and **zero** command failures, plus the schema-1
  sealed manifest's gate SHA and rollback/no-Wolo-mutating policy. A hash of
  `status=FAIL` is never admission.
- **Transitive scope:** an exact SHA-bound, root-protected reviewer report is
  mandatory at `/private/etc/aoe2war/solo-owner-website-v1/source-reviews/<candidate>.json`.
  It requires closed-world import graph and finance-surface hashes with zero
  unresolved import edges, unchecked producer edges or changed financial
  writers. The report MUST be installed only after a genuine separately
  reviewed source and CI receipt; its editable `review_url` field by itself
  is NOT cryptographic proof of an independent review. No report is installed
  or accepted by this source PR.
- **HEL1:** a dedicated `aoe2_solo_website_host_observer.py` now strictly
  pins the previously measured HEL1 ED25519 host fingerprint and fixed IP,
  requires root-owned Mac SSH identity and single-entry known_hosts, and
  checks the authorized remote helper's pinned SHA256 before accepting
  output. Arbitrary supplied host callback/dictionaries are no longer a
  production verifier argument. This source module does **not** enroll
  any SSH key or install the remote root helper. Missing physical input HOLD.
- **Durable stage receipt:** the owner PRE_ACTIVATE verifier now demands
  the **pinned root-SSH observation** include an on-host re-read receipt,
  source, BUILD_ID, artifact and dependencies. A caller-supplied receipt is
  insufficient and cannot become an activation permit.
- **Atomic nonce/lease foundation:** `scripts/aoe2_solo_website_nonce_ledger.py`
  adds root-only exclusive `release.lock`, durable O_EXCL+fsync phase
  journal and separate fresh PRE_STAGE/PRE_ACTIVATE challenge nonces. Tests
  reject replay, missing stage, wrong lease, expired issuance and consumption
  outside a held transaction. It exposes **no remote command, stage or
  activation endpoint**; it is NOT a production lease issuer until the
  actual HEL1 root install and protected deploy controller are reviewed.
- **Dispatch and rollback:** still **NOT CONNECTED**. The original immutable
  stage receipt and exact .next artifact must be re-read from protected HEL1
  storage. Genuine owner PRE_STAGE/PRE_ACTIVATE intents must be consumed by
  a reviewed on-host agent that retains the global lease across actual
  protected STAGE/ACTIVATE/rollback. Never monkeypatch frozen W1's
  admission or claim from synthetic receipts.
- **CI:** initial #41008372217 was not green; DocsV2 correctly rejected the
  code-only implementation-baseline drift. It requires a legitimate
  `python3 scripts/docs_v2_check.py --write --refresh-baseline` on the
  exact finalized new head in a full trusted checkout, review of the emitted
  documentation diff, then new exact-head CI and independent code review.
  Do not fake that baseline by changing registry bytes by hand.


## G production browser acceptance — execute only after F authenticates LIVE

**Scope and stop condition:** This is a production **procedure**, not a CI screenshot
receipt or permission to deploy. Session F first supplies the authentic
installed source SHA, Next.js BUILD_ID, public-served BUILD_ID, running
service identities, rollback/build receipt and both approved release phases.
The initial frozen W1 and the later post-W1 deployment are **separate**
governed activations. Never reuse a W1 receipt to accept post-W1.

Before Chrome, match on-host immutable activation/source evidence to the
running process, the installed `.next/BUILD_ID` and the real public-served
assets. Any mismatch, unverified admin session or missing F receipt means
**PRODUCTION HOLD**; a passing GitHub Actions candidate is insufficient.

For **each** viewport width **375, 768 and 1440 CSS pixels**, run the
actual production origin in a real browser with a valid owner/admin session,
then separately with anonymous and non-admin identities wherever access is
restricted. Record the URL, installed source SHA, internal/public BUILD_ID,
time, viewport, authenticated response, screenshot, axe results and
horizontal overflow. Fail on a serious/critical accessibility violation,
misleading stale state, private-data leak or an unauthorized mutation.
Do not capture credentials, wallet filenames, raw home directories, key
material or protected financial paths in screenshots or public routes.

| Required interface | Production proof obligation |
| --- | --- |
| **Storage OS** | Private `/admin/storage-os`: distinct M1 and HEL1 readings, source provenance and age; Intel free/ciphertext destination only when source-authenticated. Never infer real APFS gain from gross categories, samples or a category preview. Confirm signed-freshness UNKNOWN/STALE on missing or failed producers. |
| **Backup OS** | Resolve the **existing** private recovery/backup view from the deployed authenticated navigation inventory (do not invent a route). For each of six E classes require source-consistent capture, encrypted destination readback and a **physically independent isolated restore** witness; absent proof is UNKNOWN/HOLD, not 100%. |
| **Documents OS** | Resolve the existing documents control interface and assert DocsV2 verified baseline/registry, genuine current document evidence and privacy. No synthetic 100% doc health or assumed standalone route. |
| **General Inspections** | Check `/general-inspections` against production source/BUILD_ID, signed host receipts, true L1 8-gate policy and physical recovery. Stale or missing producer evidence must lower, never inflate, the score. |
| **Kingdom Intelligence** | Check `/kingdom-intelligence` shows sanitized live/source provenance and physical restore/HEL1/Mac HOLD/UNKNOWN; no leaked host paths, phantom work or unsupported 100%. |
| **Work Board / Six-Lane Ledger** | Private `/admin/central-command/work-board` and `/admin/central-command/lanes`: exactly one ordered 8-stage board, six original lanes, no hydration duplicates, correct access boundaries, live/source status explicitly distinguished. |
| **Navigation Atlas** | Test the deployed 32-route Atlas and the independently required 88-route site navigation/accessibility set against the same **actual production BUILD_ID**, not a loopback CI build. |

For Storage OS, also inspect append-only L2 owner history (individual exact
fingerprint, source revision, owner click, scope, expiry, revoke/superseded
state) **only if** a separately accepted authenticated per-item transport
exists. Until then, the aggregate L2 basket is **LOCAL PREVIEW ONLY**,
`INDIVIDUAL_TRANSPORT_ADOPTED=false`, and exact approval history is UNKNOWN.
Any historic L2 approval may rank a future suggestion; it is **never**
a standing delete token or automatic writer. L3/L4/L5 remain protected.
L1 may not assert full closure before all 8/8 physical proof gates. Show
actual reclaimed APFS bytes only after a permitted per-original disposal
with before/after native disk receipt and independently verified restore.

Acceptance requires both the screenshot/DOM/accessibility set **and**
authenticated underlying E/D/C/F signed receipts. Missing one means
`HOLD — PRODUCTION ACCEPTANCE INCOMPLETE`. Record the final PASS/HOLD with
evidence links in Q18 #1007, G #976 and F #665. No new UI features or live
host mutations are authorized by this runbook.

This remains **source proposal / fail closed** until these gaps are actually
resolved and physical recovery and site capacity independently pass.
