---
id: "aoe2war.app-prodn.storage-classification-disposition-v1"
title: "Storage Classification and Disposition OS v1"
type: "reference"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn", "vpssentry", "aoe2war"]
audience: ["operators", "developers", "ai-agents"]
source_of_truth: "git"
authority: "review-only-policy-proposal-no-new-execution-authority"
reviewed_at: "2026-11-22"
review_interval_days: 14
sensitivity: "internal"
---

# Storage Classification & Disposition OS v1 — WE1

**Controlling original**: [Storage OS](STORAGE_OS.md) (including the immutable L4 human-only and L5 never-delete floors). **Exact registry**: `config/storage-disposition-policy.v1.json`. This draft is a **source-controlled policy proposal** and read-only cross-product vocabulary, not an installed signer, new delete controller, production scanner, signed permit or source-owned standing mutation grant. Do not merge or apply until normal PRODUCT/DocsV2, original source-owner and approved authority gates pass. Scan OS #1455 remains merged, unchanged and `PLAN_ONLY_NO_EXECUTION`.

## 1. Two independent axes: disposition and protection level

| Disposition | Meaning | Allowed next act |
|---|---|---|
| `KEEP` | Currently live, newest two admitted hot rollback generations, recovery services, originals still referenced | Preserve; inspect only |
| `COLD` | Historical generation worth off-host retention with actual signed transport and independent recoverability proofs | Separate exact COPY authority, then verify archive; **no source removal by inference** |
| `PRUNE` | Byte-exact bounded, reproducible generated content, independently unprotected | Run only the already-installed/approved exact allowlisted controller and required owner apply; make a same-volume post-action measurement |
| `PROTECTED` | L4/L5, source-of-truth originals, finance/legal/evidence, unknown identity/consumers or incomplete admission | Preserve; fail closed |

Protection levels are **not** dispositions and do not get downgraded by archive age, owner teaching or GUI hints: L1 is narrow source-verifiable regeneration under an existing controller; L2 is category or exact item owner-reviewed rebuildability (no automatic deletion); L3 needs an individual source-owner review; L4 is **human-only with NO software deletion path**, even after a person reviews it; L5 is **NEVER DELETE** with no web revoke, downclass or ordinary software action. Effective floor is the stronger of the current source floor and authentic historical protections.

Do not relabel "COLD" as "PRUNE": off-host archive / old time / duplicate name never constitutes retirement eligibility. No automatic L1 promotion from a named directory, parent of a cache, generalized `.next`, `node_modules`, tar, ZIP, worktree or suspected inactive database.

## 2. Standing L1 classes — existing Mac controller only

These **ten and only these ten** paths exactly mirror the source tuples `LOCAL_REGENERABLE_PATHS`, `LOCAL_EXTENDED_REGENERABLE_PATHS`, `LOCAL_ELECTRON_REGENERABLE_PATHS` in `scripts/aoe2_storage.py`:

| Approved controller mode | Exact `$HOME/` relative entries | Owner apply entrypoint |
|---|---|---|
| Standard | `Library/Caches/Yarn`, `Library/Caches/go-build`, `Library/Caches/pnpm`, `Library/Developer/CoreSimulator/Caches` | `aoe2war storage local-maintain --apply` |
| Separate extended opt-in | `.npm/_cacache`, `Library/Caches/Homebrew`, `Library/Caches/pip`, `.cache/pip` | `aoe2war storage local-maintain --apply --extended` |
| Separate Electron opt-in | `Library/Caches/electron`, `Library/Caches/electron-builder` | `aoe2war storage local-maintain --apply --electron-only` |

The standing authority is **source classification**, not a new permission to delete. A single explicit owner invocation of an already-approved mode may process that mode's verified allowlisted cache entries under its own rules without a second per-file debate. Do not add a daemon, timer, wildcard cleaner, automatic `--apply` or broad owner grant. Require source-owned path/ancestor/symlink confinement, same-device identity, installed controller exactness, relevant consumer/process/FD checks, protected-subtree exclusions, bounded operation and existing controller ledger. Unreadable or partial checks HOLD. A successful transaction requires a durable itemized receipt and **real ordinary filesystem available bytes before and after on the same APFS volume**. APFS clones and snapshots make gross allocated ≠ physically reclaimed. Zero exhausted caches are not proof of a clean machine. Prior +63,946,752B Mac cache cleanup is historical and must not be counted a second time.

**No new L1 classes admitted by this draft**: `~/.cache` parent (contains protected Codex and financial evidence), `~/.npm` parent, `.next` under active or unmerged source, `node_modules`, Factory ZIPs, original releases, watcher staging, unknown HEL1 root caches, DB, backup, browser profiles, private recovery, old data swap, unique originals. A newly discovered producer must be promoted through source review showing exact output path and filesystem, rebuild recipe and input source, current consumer-negative evidence, independent default floor and tested original controller safety; not simply appended as a new JSON name.

## 3. L2 and owner consent

L2 category suggestions can be recorded only against genuine authenticated current receipts and the pre-existing owner teaching HMAC/witness; they do **not** identify or approve an individual file. An exact-object L2 lesson requires signed current host source, mount UUID/dev/inode, path alias, source digest/fingerprint, complete collection coverage or explicit partiality, current producing binary/source/config, deterministic rebuild and independently checked output, exact dependency/FD and rollback-negative evidence, and strong historical protection-floor reconciliation. Missing source or writer enrollment yields `EXACT_SOURCE_NOT_ADMITTED`.

`TEACH_EXACT_L2_REBUILDABLE` is an *owner opinion/lesson*. It never becomes a transfer, retirement, or deletion permit. If the source changes, the lesson expires. Actual reversible operation requires separately authorized one-object controller, nonce/expiry and fresh source CAS, independent restore if source retention is relevant, and same-device receipt. L3/L4/L5 are never silently mapped to L2.

## 4. Owner-pinned Factory and Intel authority boundaries

The current protected runtime set is web `9cf670724c82`, hot1 `50b943a44a2e`, hot2 `dbceb5df20f9`. The native T8/T9/T10 dossier digest is `2568cac7ed900d0ea7d7516a82b83631563e567cc9cba4506ca19de53341d30d`. Separate active appearance `f50ead889c61`, social `da0bee282e52`, 3030 legacy and 3033 emergency are KEEP. WE2 #125 owner decision source uses existing Ed25519 SPKI `141600d4e89781368c82b1f59ed7436f3ea688c27bb578ddaa40a53d41399516`, domain `AOE2WAR:WE2:CURRENT_TWO_HOT_PROTECTED_PINSET:V1\0`, 15-minute expiry and nonce. **Valid signature alone is not installed Factory ledger admission.** Current owner signature/ledger admission is not demonstrated; preserve candidates as provisional KEEP until authentic original verification and source-owner ledger acceptance. No key export or fabricated owner signature.

HEL1 original `4c14cbc7c518`: UUID `64f6fb02-4fed-4836-a33b-86e8993afdfa`, inode4493824, source `4c14cbc7c518f9b28e1d84b5f88a022a82f7d2e7`, BUILD `w-tDoD2iUw6P2P4oTw3Ti`. The owner-selected one-object nomination is **not** an admitted copy class. It requires `HEL1_HISTORICAL_FACTORY_RUNTIME/COPY_ONLY_NO_RETIRE/4c14cbc7c518`, its own existing restricted receiver class + nonce-bound one-use COPY grant, current manifest/source verification, encrypted Intel ACK, full ciphertext reread, and fresh isolated restoration. COPY never authorizes original L4 retirement.

M1 Factory original ZIP `60011e8fda8ba9aefabae3f32723f6f5fb0a306d963a936851477a52e219d3db.zip` remains **historically L4 DENIED** despite matching historical cold ciphertext/plaintext and CRC. At least ten positive original Factory source references were reported; source-owner original/rollback/T10/3030/3033 negative proof is **not complete**. Even subsequent human redecision cannot enable an L4 software delete under the existing policy. No ZIP wildcard cleanup. DATA old swap inode3276802 retains the historic **L5** floor, despite being inactive in a bounded observation.

## 5. Common provenance vocabulary and claim states

Provenance envelope `aoe2war.storage-provenance-disposition.v1` (registry describes required fields; no new production receiver):
- **Subject/source**: machine, exact mount/UUID/dev/inode/nlink, private alias, source SHA and BUILD_ID, object/manifest digest, original producer and observed UTC;
- **Bytes**: logical, gross allocated, partial sampled, proven unique reclaim, ordinary available before/after, physically reclaimed. Never coerce missing `null` to 0 or sum overlapping buckets;
- **Owner and coverage**: source principal, owner admission signer/witness, independent verifier, collection roots and exclusions, errors/limits, overlap, freshness and receiver arrival time;
- **Disposition/protection**: KEEP/COLD/PRUNE/PROTECTED, strongest L1–L5 floor, original dependencies, current and rollback consumers, next eligible *review* operation and its blocker;
- **Destination/recovery**: transport class, exact receiver, permit nonce/expiry, durable ACK, ciphertext SHA, independently dated restore proof and exact source reconstruction;
- **Outcome**: transaction receipt, successful/partial/failed state, same-volume available postimage and causal physical reclaim.

Allowed evidence states `SIGNED_EXACT`, `SIGNED_PARTIAL`, `UNSIGNED_SOURCE`, `NOT_ADMITTED`, `HOLD`, `UNKNOWN`. Authentic source signature does not prove complete coverage; archived copy does not prove restoration; historical restore does not prove a current restore; 1.58GB gross does not prove 1.58GB freed. Scan OS, Storage OS, Factory and Intel can consume the same **reviewed vocabulary**, but cannot each infer a different authority from it. All product modes Basic, Advanced and Extreme show the same evidence.

## 6. Promotion and rollback of this proposal

Accept via original C/WE1 product branch/source review, real DocsV2 baseline regeneration, exact-head PRODUCT/CI, and independent original Storage OS controller reviewer. This draft never edits `scripts/scan_os.py`, its catalog, Factory original producer, Ed25519 signer, protected L4/L5 ledger or installed host. A policy text/registry error is reverted by ordinary source rollback; it must not mutate storage. **The first permitted physical operations remain only current-controller, owner-invoked, guarded L1 caches if fresh eligibility exists.**