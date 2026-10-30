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


## P0 financial-isolation security contract — Session B, 2026-10-30

**Source-level verifier is not native admission.** The independently reviewed
website-only release MUST preserve the original Wolo finance HOLD and must not
start/stop, fund, migrate, claim, reconcile, stake, settle, or change protected
financial writer state. Neither a clean build nor a `ROLLED_BACK` web receipt
can establish finance noninterference.

The protected **real HEL1 writer census** is wider than ten generic roles.
Its minimum native unit roster is the explicit
`REQUIRED_SERVICES` + `REQUIRED_TIMERS` in
`scripts/aoe2_solo_website_financial_proof.py` (25 distinct units).
It includes both HD/DE web and API processes; distinct Wolo 8092 mainnet
settlement and 8093 founder-rewards settlement daemons; chain consensus,
additional settlement/relayer/custody producers; actual daily staking-rewards
oneshot and timer; reconciliation plan/application, challenge, replay, trophy,
Wolo transfer heartbeat; and five-minute GET/prewarm units and timers.
Original 8092/8093 executable, PID, start ticks, UID, systemd unit/drop-ins,
environment/config/source/cgroup, balances, fees, pending transactions,
withdrawals, liabilities, UNKNOWN, and WAL/database digests remain separately
mandatory in the root native audit. An idle oneshot is **not absent**; it needs
its unit/timer schedule, trigger and last invocation evidence. A newly found
systemd/cron/at/process/external ingress/database writer cannot disappear into
a generic `staking` or `settlement` bucket: unknown or omitted identity is
**P0 HOLD**, and any additional unit must be explicitly independently reviewed.

`scripts/aoe2_solo_website_financial_collector.py` is a narrowly bounded
root-HEL1 **read-only observer**, not an authority. It discovers installed
systemd unit files, reads unit properties and hashes their native definitions,
and checks actual live /proc PID/start-time/executable/cgroup relationships.
It emits `UNSIGNED_PARTIAL_OBSERVATION` with unresolved cron, external
ingress, financial DB, HTTP GET/HEAD, PREWARM, full source dependency and
balance evidence. An unsigned collector output **cannot** enter admission
as `CLOSED_WORLD_VERIFIED`. This source is uninstalled and has not collected
current HEL1 evidence. Never make up missing identities, suppress an active
financial timer, or let CI fixtures stand in for live snapshots.

**Frozen W1 already has GET-to-finance side effects.** Exact immutable W1
`b46a51f1592c9f296839924ae55e722618b10d35` contains
`GET /api/lobby -> loadLobbySnapshot -> queueLobbyMaintenance ->
ensureBetMarkets`, `GET /api/live-games -> queueBetMarketEnsure`,
`GET /api/bets -> queueBetMarketEnsure` (even though the downstream
snapshot passes `ensureMarkets:false`), and prewarm calls `/`,
`/api/lobby`, `/api/live-games`. `lib/bets.ts`'s ensure path
can reach market settlement, pending claim reconciliation and founder
bonuses. These are source-proven **mutation-capable reachability**,
not evidence that funds moved. A W1 signed graph omitting the
`W1_PUBLIC_FINANCIAL_EDGES` floor fails; source CI alone cannot
declare public read routes financially inert. F/Central must resolve
whether live unchanged financial-capable behavior can be safely
admitted under separately signed noninterference, or whether a new
reviewed source/runtime fence and SHA is necessary. Never silently
change frozen W1 or disable protected writers to manufacture PASS.

**Transitive source admission** must bind the exact candidate source tree,
actual changed files, package/dependency graph, import edges, dynamic and
server actions, financial DTOs, layout/SSR, GET/HEAD handlers and scheduled
prewarm HTTP behavior to an independently SHA-pinned/owner-enrolled protected
source review. The native auditor must independently recompute the graph,
account for external calls and runtime side effects, and cryptographically
sign its native producer report. The graph verifier traverses every changed
node to financial writer nodes; reachable financial writers or unchecked
import/GET/prewarm/external edges are **HOLD**. Signed strings containing
only `INDEPENDENTLY_REVIEWED` without real graph bytes and reviewed digests
are insufficient. `verify_all` checks the six Ed25519 producer receipt
signatures, but independent producer enrollment/origin and real host evidence
remain separate installation requirements.

**Failure and rollback are financial UNKNOWN unless separately proven.**
The engine's failed/SSH-lost/timeout activation retains a consumed nonce,
never redispatches, and must label finance `ROLLBACK_FINANCE_UNKNOWN`
even if original website source and 8092/8093 listener counts are restored.
The final F-owned engine/root rollback hook must gather separate genuinely
signed PRE_ACTIVATE and POST_ROLLBACK finance snapshots for the same attempt,
reject phase/timestamp/signature replay, reverify all producer signatures,
full writer census and exposure/liability/balance hashes, then and only then
may return `ROLLED_BACK_WEB_AND_FINANCE_NATIVE_VERIFIED`. The B verifier
`rollback_finance_status` is not an execution hook by itself.

**F root-stage boundary repair (2026-10-30):** A signed `POST_ROLLBACK`
native observation after an attempted activation is **post-stage**, even
when the original website source was restored. The separate retained W1
candidate stage receipt must remain `STAGED` with exact original HEL1
receipt SHA, source SHA, artifact SHA, node_modules SHA and Next BUILD_ID.
The root hook now requests `post_stage=True`, and the same shared
stage validator rejects forged `NOT_STAGED`, altered artifact/dependency,
foreign source and mismatching BUILD_ID. The PRE_STAGE boundary still
forbids impersonating a durable staged artifact. No synthesized restore
receipt or unsigned website-only rollback may be labeled PASS.

**F successful activation witness repair:** Root completion must obtain a
new `POST_ACTIVATE` independently producer-signed, root-validated native
audit using the genuine staged boundary. It compares all protected writer
identity and financial exposure hashes against the root-sealed prior
`PRE_ACTIVATE` observation, writes a separate immutable
`<attempt>-POST_ACTIVATE-native-after.json` and binds its canonical SHA
to the completed activation certificate. Replaying the original signed
`PRE_ACTIVATE` packet after source mutation is NOT post-activation
evidence. The independent installed native signer must support this
distinct phase; otherwise activation completion fails closed.

**Gate ownership:** B owns the financial verifier, partial native observer,
negative tests and this security contract; F owns original continuous FD200
release/rollback execution and the final failure hook; C owns enforced SSH
key restrictions and canonical lock ancestors; E owns physical recovery and
capacity; G owns DocsV2 control-plane reseal and post-deployment acceptance.
A genuine funded WOLO GO is not needed for a **proven nonfinancial** website
release, but none of these physical, native signed and operator-authenticated
website-specific gates can be silently skipped. Draft source PASS is not
HEL1 acceptance or a production permit.


## R10 — independent financial admission repairs (source only)

This source branch requires four additional **fail-closed** original-release
conditions, without changing frozen W1 or permitting funded WOLO:

1. **Same-session rollback.** `reconcile-rollback` is legal only once in
   the still-live ORIGINAL command-channel FD200 lease that consumed and
   verified the same PRE_ACTIVATE attempt and dispatched its UID1000 website
   action. A new SSH lease on the same lock inode is *not* a continuation.
   Unknown/lost transport cannot be reconciled by opening a fresh lease;
   that needs a future separately reviewed owner-approved recovery protocol.
2. **Six independent public signing keys.** Six signed producer labels
   without six distinct Ed25519 SPKI identities AND distinct protected key
   paths are not independent authority. Native physical origin, key custody
   and signed observation freshness require separate enrolled review.
3. **HEAD runtime evidence.** W1 HEAD=UNVERIFIED_NO_PROBE is explicitly
   **HOLD** for source-closure admission, not an empty unresolved list.
   The signed W1 graph must include the original public GET handler
   entrypoints under HEAD and their financial-writer reachability, and
   signed native finance must contain HEAD-handler/GET-fallback traces,
   not a status label alone. Do not probe finance-capable live GET/HEAD
   to fabricate safe behavior.
4. **Idle timer-driven services.** A legitimate PID0 oneshot is accepted
   only with exact named native signed inactive/failed unit, zero process
   identity, current unit/dropin/environment and last-invocation digest
   correspondence. Persistent custody, HD/DE and settlement roles still
   require real live PID/start/UID/cgroup/executable proof.

**R10 install and production HOLD.** The historical supplemental
14,390-byte C bootstrap with SHA256
`c18f6ec0beda17c52a181081d1b901025b92aa1af7d0619444edd7c287a38c18`
pins the OLD F `f041f6d073498ba675846b03e73d2e0efe08c08f` helper
bytes. It MUST NOT be executed for a revised F source. C must independently
publish/review the actual complete bootstrap bytes and new exact root-helper
Git blob + SHA256 pin list before any owner-run native PLAN/INSTALL.
An owner's successful SHA verification on HEL1 is not F's independent
review of those file bytes.

D's real SHA-pinned native auditor, six genuinely independent root-enrolled
signed producer issuers/restore proofs, and E's physical capacity/recovery
approval remain absent from installed host evidence. Existing strict original
`<92%` Finish / additional `<=88%` effective / `>=30GiB` and six
isolated classes remain enforced. No paper Policy B, blind swap retirement
or source-only CI can override a production gate. Owner PRE_STAGE,
stage, PRE_ACTIVATE, activation and final G Chrome are NOT authorized
until these source, host and independent reviewer gates pass.
