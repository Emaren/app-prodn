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

This remains **source proposal / fail closed** until these gaps are actually
resolved and physical recovery and site capacity independently pass.

## October 29 — authoritative operator execution and lock integration HOLD

The **single operator runbook** is
[SOLO_OWNER_WEBSITE_RELEASE_V1_OPERATOR_RUNBOOK.md](SOLO_OWNER_WEBSITE_RELEASE_V1_OPERATOR_RUNBOOK.md),
linked from docs/OPERATOR_START_HERE.md and root DEPLOY.md. It contains
real M1 and HEL1 host-guarded, read-only commands and precise native
W1/post-W1 stage/activation/rollback interfaces, but deliberately prints
HOLD for all currently unauthorized live mutations.

**Do not mistake the nonce module for an installed stage controller.**
Frozen W1 `scripts/aoe2_release.py` takes HEL1 release.lock through a
separate long-lived SSH flock process while its protected stage and activation
engine runs. Holding an independent root nonce-journal flock and then
calling the original stage function would deadlock; consuming the nonce
and releasing that lock before stage would lose atomicity. A separately
reviewed controller must bind root nonce consumption to the *existing
ongoing lease transaction*, or implement a single new protected root
transaction with equivalent safety. The old stage/activate functions also
hard-require the incompatible multi-human `require_admission`;
no environment skip flag, monkeypatch, shim, fake signing roots or frozen
W1 source modification is permitted.

The new HEL1 collector source
`scripts/aoe2_solo_website_hel1_observer.py` is a **read-only host
program**, not installed. It intentionally reports UNKNOWN for unsigned
rollback, finance, Doctor, recovery and stage evidence. It must not be
pinned or installed until independently reviewed and connected to real
protected native receipts.

G owns generated DocsV2 baseline work. Do not modify the generated
baseline in this session. Each new source change requires fresh exact-head
CI; earlier PASS jobs do not qualify a new commit.
