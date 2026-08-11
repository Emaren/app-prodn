---
id: "aoe2war.app-prodn.docs-evidence-vault"
title: "AoE2WAR Evidence Vault"
type: "runbook"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn","api-prodn","aoe2-watcher","wolochain"]
audience: ["operators","auditors","ai-agents"]
source_of_truth: "git"
authority: "disaster-recovery-contract"
reviewed_at: "2026-08-10"
review_interval_days: 30
sensitivity: "internal"
---

# AoE2WAR Evidence Vault

## Current status

The off-host Evidence Vault is **not configured**.

The operations contract currently records `offsite_evidence.enabled=false`, no
remote authority, and no restore proof. `aoe2war doctor` therefore reports a
disaster-recovery warning: VPS root and
`/mnt/HC_Volume_105319120` are durable in different filesystems but still share
one host failure domain. GitHub source history is useful off-host protection,
but it is not a backup of production receipts, database dumps, runtime
provenance, or unique operational evidence.

No vault authority or credential has been supplied, so no upload or transmission
is implemented or authorized in this pass. This document stops at the reviewed
architecture and activation/restore contract.

Do not change the flag merely to silence Doctor. It may become enabled only
after an actual encrypted upload, independent remote verification, and a
successful isolated restore drill produce durable proof. Until then, a
successful `aoe2war finish` certifies the application release, not complete
off-host disaster recovery.

## Purpose and threat model

The Evidence Vault preserves enough trusted evidence to reconstruct what ran,
why it ran, how it was certified, and how to recover after loss or compromise
of the VPS. It must survive:

- loss of the root disk and mounted volume together;
- accidental deletion or over-broad retention;
- ransomware or a compromised production credential;
- a bad deploy followed by local evidence loss;
- an operator needing to restore without conversational memory.

The vault is an evidence and recovery layer. It is not a second production
runtime, a secrets manager, a Wolo signer, or a general-purpose mirror of every
cache on the server.

## Required architecture

The final design must have five independently verifiable stages:

1. **Select:** collect only allow-listed, closed evidence from canonical local
   producers.
2. **Manifest:** bind every item to a bundle ID, source path, classification,
   byte size, SHA-256, creation time, release/build identity, and retention
   class.
3. **Encrypt:** encrypt on the trusted operator side before transmission with a
   versioned key ID. Recovery key material must live outside the VPS and must
   never enter Git, receipts, shell output, or the application environment.
4. **Store:** upload with create-only semantics to an authority outside the VPS
   provider/account failure domain. The destination must provide versioning or
   object lock, retention controls, access logs, and a least-privilege upload
   identity that cannot silently rewrite old bundles.
5. **Prove:** verify the remote object version and digest, then periodically
   retrieve, decrypt, hash, and inspect a bundle in an isolated restore
   workspace. A local upload exit code is not restore proof.

Provider choice is intentionally open. S3-compatible object lock, a dedicated
backup service, or another immutable object authority is acceptable only if it
meets the same contract. Provider credentials and recovery keys must be
provisioned separately from this repository.

## Evidence classes

| Class | Include | Exclude or handle separately |
| --- | --- | --- |
| Release provenance | gate, manifest, stage, activation, soak, certification, rollback, finish, audit, Doctor, and retention receipts | rebuildable `.next/cache`, `node_modules`, transient logs |
| Recovery state | cache-free certified runtime generations needed by the approved recovery policy; source/build/version identities; restore instructions | unverified or partial candidates presented as certified |
| Database recovery | explicitly created, access-restricted backups plus schema/migration manifests and hashes | live credentials, connection URLs, unreviewed ad hoc dumps |
| System context | generated current-state maps, service/unit inventory, storage summary, and sealed incident/release records | mutable convenience copies without a canonical hash |
| Unique product evidence | raw replays, uploads, or settlement evidence only under their owning retention and privacy policy | broad user-data replication with no classification or expiry |

Wolo consensus keys, signer keyrings, bridge tokens, environment files,
database passwords, API keys, session material, and secret-bearing logs are
never Evidence Vault payloads. Their recovery belongs to a separately approved
secrets/key-custody plan.

## Bundle and receipt contract

Every bundle must have a canonical manifest that records at least:

- schema version, immutable bundle ID, creation time, producer, and environment;
- exact source path or receipt identity for every object;
- classification, size, SHA-256, and retention class for every object;
- encryption format and non-secret key ID;
- remote authority, bucket/container, object key, and immutable version ID;
- remote checksum verification result and time;
- restore-drill status and the superseding proof reference, when available.

A finalized release, rollback, retention, maintenance, or vault receipt is
immutable operational evidence. Never modify it in place, reuse its identifier,
or delete it to make a failed check disappear. Corrections create a new receipt
that names the superseded record and explains the discrepancy. Local and
off-host manifests must cross-reference hashes so either side can expose drift.

## First activation checklist

Keep `offsite_evidence.enabled` false until all of these are true:

- the off-host authority and ownership boundary are documented;
- upload and restore identities have least privilege and separate credentials;
- client-side encryption and an independent recovery-key location are proven;
- an allow-listed first bundle uploads with create-only/versioned semantics;
- the remote API reports the expected object version, size, and checksum;
- a clean machine or isolated temporary directory retrieves and decrypts it;
- every restored file matches the manifest and the operator can read the
  release/rollback chain;
- a dated restore-proof receipt is stored locally and in the vault;
- monitoring has an explicit freshness target and alerts on missed uploads or
  failed verification.

Only then may the operations contract name the authority and exact restore
proof. Review the change as disaster-recovery infrastructure, not as a
documentation-only toggle.

## Restore drill

1. Choose a sealed bundle and record its immutable remote version ID.
2. Restore into a new isolated directory or disposable host, never over live
   production.
3. Retrieve the manifest and encrypted objects through the documented recovery
   identity.
4. Verify remote checksums before decryption, then verify every plaintext
   SHA-256 and byte size against the manifest.
5. Prove that release identity, rollback lineage, database/schema metadata, and
   required system context are understandable without chat history.
6. Exercise only the safest representative restore. Do not import production
   data, start Wolo, or overwrite live paths merely to complete a drill.
7. Write a new immutable proof with elapsed time, gaps, hashes, object versions,
   and remediation owners.

Run a drill after initial setup, after encryption/provider changes, and at a
regular interval no longer than one quarter. A stale or failed drill must be
visible to Doctor rather than hidden behind the last successful upload.

## Failure behavior

- Upload or verification failure must preserve every local source object.
- Vault cleanup must never use source-synchronizing `--delete` semantics.
- Automatic retry must be bounded and idempotent by bundle ID.
- A partially uploaded bundle is not valid until its manifest and remote proof
  close successfully.
- Off-host failure must not grant permission for database, Wolo, reboot,
  package-upgrade, or broad-retention mutation.
- If the vault becomes required for release policy, that requirement must be an
  explicit fail-closed gate with a documented emergency override and receipt;
  it must not be inferred from a green application deploy.
