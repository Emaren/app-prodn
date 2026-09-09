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
reviewed_at: "2026-09-06"
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

The full Evidence Vault authority is still not configured in the operations
contract, but a real independent Mac database/operator-evidence pilot now
exists. The pilot does not satisfy the complete vault contract because replay,
media, Wolo settlement/consensus recovery, and independent key custody remain
open.

The contract therefore correctly remains disabled while the proven pilot is
recorded as partial recovery evidence rather than mislabeled as complete
disaster recovery.

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

## Recovery OS V2 proof-verification contract

Recovery status is now evidence-derived rather than configuration-derived.
Setting `offsite_evidence.enabled=true`, naming an authority, and typing a
restore-proof path are necessary but never sufficient to produce
`VERIFIED`.

The configured restore proof must live beneath the independent operator
recovery vault, carry a matching SHA-256 sidecar, and use the schema-2
`aoe2war-recovery-proof` / `RECOVERY_VERIFIED` contract. The proof authority
must exactly match the operations contract. It must declare no remaining
full-recovery scope and must include PASS coverage for all required recovery
classes:

- database;
- operator evidence;
- raw replay archive;
- parser evidence corpus;
- managed/user media;
- Radio WOLO private media;
- legacy direct-message attachments;
- Wolo settlement state;
- consistency-safe Wolo consensus recovery;
- separate Wolo key-custody proof.

Every coverage class must bind to a local non-secret proof file by relative path
and SHA-256. A successful isolated restore drill must itself bind to a hashed
proof file. The secrets policy must explicitly prove that database credentials,
environment files, validator private keys, Wolo keyrings, and the recovery
private key were not placed into the general recovery payload.

Doctor consumes this same Recovery OS verifier, and Host OS maintenance planning
is READY only when Recovery OS itself is `VERIFIED`. No independent code path
may award the disaster-recovery score or authorize package/reboot maintenance
from configuration strings alone.

The existing 2026-09-04 database/operator-evidence pilot remains valid
`PILOT_VERIFIED` evidence, but schema 1 pilot proof can never satisfy the full
schema-2 verification contract.

## Recovery campaign planner

`aoe2war recovery campaign plan` is the canonical read-only bridge between the
Recovery OS proof contract and live mutable-state inventory.

It performs one bounded live census over the production host and converts the
result into an ordered evidence campaign without copying data, stopping
services, changing settlement state, or touching Wolo key material.

The planner currently enforces these campaign semantics:

- database and operator evidence reuse the existing verified Mac pilot;
- managed media, direct-message attachments, Radio WOLO media, parser evidence,
  and the raw replay archive are ordinary encrypted stream-copy candidates;
- parser recovery preserves every top-level evidence tree except disposable
  `tmp/`; this intentionally includes cold archives, bounded jobs, reports,
  evidence, golden fixtures, promotions, and backups;
- Wolo settlement state requires a consistency seam rather than a blind live
  recursive copy;
- Wolo consensus recovery requires a two-phase consistency-safe snapshot with
  explicit authorization before any service quiesce;
- validator keys, node keys, and Wolo keyrings remain outside the general
  Evidence Vault and require a separate secret-custody attestation;
- if final Mac headroom is smaller than the campaign's largest retained class,
  restore verification must be streaming/per-class rather than assuming a full
  extracted second copy will fit.

The planner resolves the active Wolo home from the running process command line,
not from an unexpanded systemd template string. Key-custody discovery reads only
path, byte-size, owner, and mode metadata; it never prints key contents or key
hashes.

The read-only planner remains incapable of writing recovery artifacts.

## Recovery ordinary capture campaign

`aoe2war recovery campaign preflight` validates the current read-only plan,
requires a clean local `main`, verifies local SSH/OpenSSL tooling, proves Mac
capacity, and resolves the exact public recovery certificate whose SHA-256
fingerprint matches the verified database/operator pilot. The canonical Mac key
authority is `~/Library/Application Support/AoE2WAR Recovery/keys`, with
`recovery-v1-recipient.pem` as the public certificate and
`recovery-v1-private.pem` as the private key. Preflight requires the private
key to exist at mode 0600 and proves that its public key matches the selected
recipient certificate before any ordinary capture may begin. Private key
contents and hashes are never printed or transmitted. Preflight makes no backup
or service mutation.

`aoe2war recovery campaign start --authorize-ordinary-capture` is the first
bounded write lane. It is deliberately limited to the five ordinary non-Wolo
classes:

- managed/user media;
- legacy direct-message attachments;
- Radio WOLO private media;
- parser evidence corpus, preserving every top-level tree except `tmp/`;
- raw replay archive.

The controller is terminal-independent and processes one class at a time. The
remote source is streamed as a tar archive over SSH; the Mac hashes that
plaintext stream while Recovery OS splits it at deterministic bounded plaintext
chunk boundaries. Each chunk is independently OpenSSL CMS-encrypted into the
survival vault with the pilot-bound recipient certificate. The default maximum
plaintext chunk is 256 MiB, deliberately far below the multi-GiB CMS parse/decrypt
ceiling observed in OpenSSL 3.x. No plaintext staging copy is retained. Each
sealed chunk carries its own plaintext/ciphertext byte counts and SHA-256 proof,
and the class manifest binds the ordered chunk set to the SHA-256 and byte count
of the complete original tar stream.

Pause control is out-of-band from the mutable campaign JSON. An operator pause
creates a per-campaign durable marker under the Recovery campaign state
directory. The controller checks that marker only between classes, so an
in-flight class is never deliberately interrupted, and stale controller state
writes cannot erase a requested pause.

Unexpected controller loss inside a chunked class is recoverable only from
sealed chunk boundaries. A partially written chunk lives in an unsealed
temporary directory and is discarded on resume. Before any later chunk is
accepted, Recovery OS replays the remote tar prefix and requires every sealed
chunk's plaintext byte count and SHA-256 to match exactly. Any source drift
fails closed rather than splicing two generations. If the complete class
manifest was already sealed, resume can finish from local encrypted chunks
without reopening the remote source.

After each chunk, Recovery OS decrypt-verifies that bounded CMS object against
its plaintext hash before atomically sealing the chunk directory. After the
class completes, all chunks are decrypted in order and streamed through
`tar -tf -`; the reconstructed tar bytes/hash must match the capture identity.
Only then is the hashed `CAPTURED_PENDING_RESTORE` class proof written. These
capture receipts do not count as final Recovery OS PASS evidence until the later
isolated restore drill verifies the full recovery contract.

Campaign authorization is intentionally narrow. Ordinary capture does not
authorize settlement mutation, Wolo service quiescence, validator/node keys,
Wolo keyrings, host package upgrades, or reboot. The controller can pause only
between classes. A legacy single-CMS interruption still fails closed and requires
a fresh campaign. A chunked interruption may resume only when sealed chunk
checkpoints exist and the replayed source prefix matches them exactly.

The existing database/operator pilot is reused rather than recopied. Settlement,
consensus recovery, separate key custody and the final streaming restore drill
remain subsequent explicit authorization seams.

## Ordinary streaming restore drill

After a five-class ordinary capture reaches
`ORDINARY_CAPTURE_COMPLETE_WOLO_AUTHORIZATION_REQUIRED`, the canonical next
local proof lane is:

```bash
aoe2war recovery campaign restore-preflight CAMPAIGN_ID
aoe2war recovery campaign restore-start CAMPAIGN_ID --authorize-ordinary-restore-drill
aoe2war recovery campaign restore-status CAMPAIGN_ID
```

The ordinary restore drill is detached, local to the independent Mac recovery
authority, and read-only against production. It refuses to start unless the
capture campaign is complete, all five capture proofs are hash-valid, every
encrypted artifact exists at the recorded byte size, the campaign certificate
still matches the canonical mode-0600 recovery private key, and current local
`main` is clean. Restore understands both the legacy single-CMS evidence format
and the current `aoe2war-recovery-chunked-cms-v1` format. For chunked evidence,
preflight binds the capture proof to the sealed class manifest, exact ordered
chunk count, per-chunk receipts, aggregate ciphertext bytes, complete plaintext
tar hash/size, and recipient-certificate fingerprint without rehashing the full
32+ GiB ciphertext corpus. Restore pause uses its own durable out-of-band marker
and is honored only between classes. Resume clears that marker explicitly and
refuses an interrupted class when an immutable proof already exists for it.

For each ordinary class the drill:

1. verifies the legacy ciphertext SHA-256/size or, for chunked evidence, every
   sealed chunk ciphertext SHA-256/size against its immutable receipt before
   decryption;
2. decrypts CMS locally with the recovery private key; chunked evidence is
   decrypted sequentially and each plaintext chunk must match its own sealed
   hash/size before joining the continuous tar stream;
3. streams the reconstructed plaintext tar through exact whole-stream SHA-256
   and byte-count verification against the capture proof;
4. parses every tar header without extracting the archive wholesale;
5. hashes a privacy-preserving member index instead of persisting plaintext
   member names;
6. when a regular file no larger than the bounded representative limit exists,
   restores that one member only to a disposable isolated directory, hashes it,
   and deletes the workspace immediately afterward;
7. writes a hashed immutable per-class restore proof.

The full plaintext archive is never staged to disk. This matters because the
largest ordinary class can exceed available Mac headroom even though streaming
verification is safe.

Successful completion writes
`ordinary-restore-summary.json` with status
`ORDINARY_RESTORE_VERIFIED`; the controller state closes separately with
completion reason `ORDINARY_RESTORE_VERIFIED_WOLO_AUTHORIZATION_REQUIRED`.
That proof covers the five ordinary non-Wolo classes only. It is deliberately
not schema-2 `RECOVERY_VERIFIED`. Wolo
settlement state, consistency-safe consensus recovery, separate Wolo key
custody, and final schema-2 proof assembly remain explicit gates.

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

## Recovery OS and Council gating

`aoe2war recovery status` exposes the actual `offsite_evidence` contract rather
than inferring safety from local or mounted-volume copies. `aoe2war recovery
plan` lists the recovery-proof requirements and deliberately performs no backup
mutation.

GitHub is already the independent source-code recovery authority. The remaining
Recovery OS question is only irreplaceable mutable production state. A paid
third storage provider is not required by the contract: a deliberately small,
verified Mac survival copy may satisfy the independent-state requirement if it
contains the minimum state needed to recover after total Hetzner loss.

`aoe2war council` ranks missing independent mutable-state recovery proof ahead
of host reboot/package maintenance. Host maintenance planning remains blocked
until the contract names the chosen independent authority and a dated verified
restore-proof receipt. This prevents "source is in GitHub" or "a backup exists"
from being confused with "mutable production state has been restored in a
drill".

## Verified Mac database pilot — 2026-09-04

Bundle:
`20260904T021657Z-db-pilot-cff90db92ae0`.

A fresh `aoe2hd_db` PostgreSQL custom-format archive was created without
database mutation:

- plaintext bytes: `403984404`;
- plaintext SHA-256:
  `6ba16607ae02af02be36be36dca38274c0348ea3725caa3dbf80f18f846dd654`;
- migration state: 99 applied, 0 unfinished, 2 rolled back.

The VPS encrypted the archive before transmission using only the public
Recovery OS recipient certificate. The RSA recovery private key remained mode
0600 on the independent Mac and never entered VPS storage or process
environment.

The Mac isolated restore drill reproduced the exact plaintext hash and size.
PostgreSQL 17.5 `pg_restore` parsed the PostgreSQL-16-produced archive and
confirmed expected critical table identities.

The first inspection attempt with PostgreSQL 14.18 returned archive-header
version 1.15 unsupported. Exact plaintext hashing had already proved the
encrypted round trip was intact; switching to PostgreSQL 17.5 completed the
structural proof. Restore tooling must therefore be at least new enough for the
producer archive version.

The complete local `.aoe2war-release` operator-evidence tree was separately
encrypted, decrypted, and restored hash-exact.

Restore proof SHA-256:
`f4bb2c5dd5de29d739ee5623bb67a94579f13212704659a814d04a1963ddb62b`.

All temporary plaintext restore workspaces were removed afterward.

This pilot materially improves total-Hetzner-loss recovery but does not make
`offsite_evidence.enabled=true` truthful yet.
