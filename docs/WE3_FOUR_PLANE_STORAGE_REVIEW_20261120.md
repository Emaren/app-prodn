---
id: "aoe2war.app-prodn.we3-four-plane-storage-review-20261120"
title: "WE3 Four-Plane Storage Explorer and Owner Review Release Contract"
type: "reference"
status: "draft"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "nonfinancial-product-source-only-not-production-admission"
reviewed_at: "2026-11-20"
review_interval_days: 14
sensitivity: "internal"
---

# WE3 Four-Plane Storage Explorer and Owner Review Release Contract

This is ONE current-main PRODUCT release candidate based on `815d66ef94900d29bb50b7241dc47927a4343955`, **not** an install permit. The live baseline remains BUILD_ID `RHE-s_XmtI5heC0JuZP7r` until WE2 independently proves another build and T10.

## One existing production experience

URL: `https://aoe2war.com/admin/storage-os/explorer`. Preserve its radial allocation map, ranked gross buckets, exact-file inspector, signed freshness, owner classification and history. Add Intel as the fourth selectable plane **inside this same page**. Selecting Intel switches to its signed archive/vault view; it must not masquerade as a normal C-v1 source bucket. No second dashboard is introduced.

- M1, HEL1 root and HEL1 mounted volume: existing source-owned signatures and admin read model. Current C v1 may attest bounded gross categories, **not per-inode identity, allocated-vs-logical file size, APFS clone uniqueness, unique physical reclaim or complete signed ACKs**. `INDIVIDUAL_TRANSPORT_ADOPTED` remains false.
- Intel: the earlier PR #1410 contained a useful signed status **draft**, but not an accepted current WE4 four-plane per-file producer. This integration carries only an isolated, bounded purpose-specific status adapter. It is **disabled by default** via `AOE2WAR_INTEL_STATUS_CONTRACT_ADMITTED`. The exact value `WE4_SIGNED_V1` must be enrolled **only after WE4 supplies and WE1 independently accepts this exact schema/domain, Intel host/filesystem identity and signer purpose**. Otherwise GET returns `HOLD` with all missing measurements UNKNOWN.
- Even when that bounded legacy-compatible status contract is admitted, it supplies vault free bytes, host/volume identity, encrypted archive tenant count and reported restore-SHA parity. It supplies **no** total/used, per-file allocated/logical size, inode, collision-free blob inventory, independently certified physical gain, or L2 item permit. Do not derive a radial wedge from a quota, blob object count, or ciphertext gross sum.
- WE4's current Intel fleet observation (23 archive objects / approx. 55.95 GB gross, six independently restored and 232.51 GiB free in prior reports) is **owner-review / hash-sealed evidence, not production HMAC-signed and accepted source**. Do not hardcode historical figures into the UI. Known previous incomplete age ciphertext remains NOT RECOVERABLE and cannot authorize source deletion.

## Per-item Intel YES / NO: additive, independently gated

The existing Explorer's exact-file inspector contains one narrowly scoped choice: **Send to Intel cold storage? YES / NO**. This control is independent of all L1–L5 classification events. It does not turn a category into a filename or permit transfer, deletion, hardlink unlink, mount mutation or automatic timer action.

- **Unanswered:** NOT QUEUED; no transfer or deletion authority.
- **YES:** owner-only, same-origin POST to `/api/admin/storage-os/archive-preference`, durable append-only HMAC receipt. When an independently admitted Intel receiver is not ONLINE, UI says `QUEUED (INTEL OFFLINE)`; this is a **preference queue, not a running copy/transfer worker**. If Intel is online, preference is still only saved, transfer HELD.
- **NO:** durable explicit NOT QUEUED; does not alter level/source history.
- **Correction:** second signed owner event, per-object previous event ID plus global previous digest. Readback and hard reload must recover both historical choices. Exact duplicate and stale/overwritten concurrent choices rejected.
- **Source:** per-object file identity uses machine + filesystem UUID + device ID + inode + source digest hashed into stable `objectId`. Signed metadata must report allocated and logical bytes, L1–L5 floor, overlap/dependency uncertainty, restore state, and an observation newer than one hour; arbitrary category data and unsigned aliases cannot satisfy this contract.
- **Source admission:** default `AOE2WAR_EXACT_ITEM_CONTRACT_ADMITTED` OFF. Only WE1/WE2 can independently qualify the versioned `WE1_WE2_SIGNED_V1` source, native producer, enrolled isolated HMAC signer `AOE2WAR_STORAGE_EXACT_OBJECT_HMAC_KEY` and file `state/storage-exact-items.v1.json`. No runtime or frontend toggle may bypass the independent signed contract.
- **Owner ledger:** separately isolated `AOE2WAR_STORAGE_ARCHIVE_PREFERENCE_HMAC_KEY` must not be reused from source, L1–5 owner teaching, Intel status or visual key. Requires WE2-protected writable state dir, enrolled exact owner UID, immutable review history, real production receipt and independent WE1 ledger-tip anchoring. Ledger recording has zero execution/transfer authority.

**Do not block first three-plane category classification for Intel or individual-file adoption.** WE2's current immediate blocker is authentic M1/HEL1 category receipts and enrolled Emaren teaching UID. The existing category route `/api/admin/storage-os/teaching` remains unchanged; its first authentic owner event and appended correction may go live before the exact-file/Intel contracts.

## Owner teaching and deterministic recommendations

The existing append-only signed owner ledger remains separate from the C-source contract. Category classification is an owner decision, not a cleanup approval. The new in-place review queue is produced solely from current signed aggregate buckets **and verified owner-bound event history**. It shows source observation time, protection floor, gross bytes, overlap uncertainty, existing owner example count, confidence, exceptions and a manual "Inspect category" action. No ledger, no current source, or no owner binding => queue withheld. Two distinct earlier signed observations with L2 owner explanations are the minimum for a category-level suggestion.

The previous L3/L4 floor remains sticky for the entire category; L5 is irreversible. Individual files stay a different evidence class. No UI route, recurring timer, model suggestion or repeated owner feedback may grant native deletion authority. Future exact-manifest execution must recheck inode/device/mount, content fingerprint, dependencies, snapshots/clones/hardlinks, retention, independent restore, prior protections, owner purpose permit and time-of-action changes.

## Independent admission and acceptance gates

1. **WE1:** separately accept the exact Intel signer/source schema. Do not confuse PR #1410 or a hash-sealed unsigned inventory with signed admission. Revalidate level floors and append-only owner history, including owner L5.
2. **WE4:** publish real current Intel observation under the accepted purpose/host/volume identity with physically measured free/used/allocated/logical fields and archive per-object provenance only in an independently versioned extension. Supply authentic recovery receipts and record incompatible/missing fields as UNKNOWN.
3. **WE2:** with source-verified permit, install new website only after qualified CI and native signed producer/intake/ledger; preserve 3030/3032/3033/9447 and seven financial gates. Enroll distinct owner UID and HMAC, safe append-only storage and independently anchored sequence/head. Document genuine signed ACK; no web token or fabricated receipt.
4. **WE3:** physically confirm exact new BUILD_ID, Emaren Incognito owner GET=200 and Scribe GET=403, signed M1/HEL1/Intel sample identity and capacity, first genuinely owner-selected category -> save event ID/digest -> hard reload -> exact recovery -> new correction event preserving old one and strongest floor -> explainable queue; 1440/768/375 Chrome matrix. No proxy/simulated owner selection. If source or owner ledger is absent, report HOLD rather than inventing success.

No interactive owner teaching should require Terminal. No deletion authority is added in this release.
