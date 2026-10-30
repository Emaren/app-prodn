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
