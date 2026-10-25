---
id: "aoe2war.app-prodn.solo-owner-website-release-v3"
title: "Solo-owner Website Release Policy V3"
type: "runbook"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn","wolochain"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "release-engineering-contract"
reviewed_at: "2026-10-25"
review_interval_days: 1
sensitivity: "internal"
---

# Solo-owner Website Release Policy V3

The owner explicitly corrected the former multi-human project assumption.
`aoe2war.solo-owner.website.v3` authenticates ONE real owner. It preserves
v2 as historical source; v2 council packets cannot authorize v3. AI agents
never count as approvers. This is an owner-authorized policy design, pending
owner acceptance of its reviewed exact commit and actual phase/artifact.
No live mutation follows merely from a green CI run or this document.

## Exact bounded authority

Only product `6be434c00469afa4acb0623715c3bcf724f927f4`, original production
`a2b941f154fdc31ec4d6c4ece6d0e49036c48abd` and sealed manifest SHA256
`7fd6fa4a01ffe0906eeeda0719fdf7b1cd0c8e2b1975e35d7669b80c082ab4e6`
are admitted. The complete ten-path Git delta is checked, including hidden
index flags, the exact dependency blob and client-only component. No server,
financial, startup, migration, Watcher executable or package script change is
admitted. The client adds a pinned JSON import and presentation of unpublished
Watcher source estimates. JSON/docs and the one fast-uri lock update remain
pinned by the exact product Git tree; this is no generic filename exception.
Existing startup/server/financial implementation is unchanged. Legacy GETs
with financial side effects are deliberately not used as health probes. The
protected engine's exact-product passive `/api/deployment-version` probes,
isolated build, artifact checks, activation trap, soak and rollback remain.
A different product/source/manifest requires a new policy review.

The separate Mac observer measures actual executing Wolo primary/Founder/
consensus PID, inode, device and SHA256; root-protected unit/drop-in/env-file
configuration digests; configured HD/DE financial service and timer states;
original source P1; and current website source/BUILD_ID/execution identity.
Known active services and timers are preserved. No keys, SQL, financial HTTP,
bank balances or service changes are used. These are SAME-OWNER authenticated
SSH observations, NOT independent attestations, complete writer exclusion,
consensus finality or solvency. Raw environment values never enter receipts.
Missing/changed/oversized/stale/unstable evidence holds. Configuration continuity
does not certify actual signer custody or undiscovered external writers.

## One owner credential, outside Git

After personally reviewing the policy commit and green CI, the owner may use
an existing suitable encrypted RSA credential or create a website-only one.
This is not a WOLO wallet/keyring key. The private credential stays outside
ALL Git checkouts in an owner-only directory; minimum RSA 2048 (3072 recommended).
OpenSSL reads the encrypted-key password from the owner's terminal, never from
a command argument, environment variable, assistant, GitHub or chat. Never
paste a private PEM or password. Keep an encrypted owner-controlled recovery
copy; loss or suspected compromise requires explicit key/attempt reconciliation.

Example OWNER-EXECUTED creation (only when these files do not already exist):

```bash
KEYDIR="$HOME/.local/share/aoe2war-owner-signing"
if [ ! -e "$KEYDIR" ] && [ ! -L "$KEYDIR" ]; then
  mkdir -m 0700 "$KEYDIR"
  printf 'PRIVATE_DIRECTORY_RC=%s\n' "$?"
fi
if [ -d "$KEYDIR" ] && [ ! -L "$KEYDIR" ] && [ ! -e "$KEYDIR/website-owner.key" ]; then
  (umask 077; openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -aes-256-cbc -out "$KEYDIR/website-owner.key")
  printf 'OWNER_KEY_CREATION_RC=%s\n' "$?"
  openssl pkey -in "$KEYDIR/website-owner.key" -pubout -out "$KEYDIR/owner.pem"
  printf 'OWNER_PUBLIC_EXPORT_RC=%s\n' "$?"
else
  printf 'HOLD: inspect the existing owner credential; never overwrite it\n'
fi
```

The owner verifies their public canonical-DER SHA256 and authorizes Mac-admin
installation of PUBLIC `owner.pem` under root-owned 0755
`/etc/aoe2war/website-owner-v3/` (file0644). Create operator-owned0700
`/var/lib/aoe2war-website-owner-v3/` beneath root-protected `/var/lib`.
These are a new policy namespace; do not relabel old council keys/packets or
reuse its nonce database. The private key is never installed in the trust
store. No purported independent custodian is required or claimed.

## Exact owner phase flow

Set `OP` to this reviewed policy checkout and `APP` to the clean product main.
Run only from the owner-approved exact controller commit, with authenticated
`hel1` release identity and existing global lease. The following commands
represent separate steps, not an unattended batch. Save each JSON output in
a private directory outside Git using a scoped `umask 077`, and print each
command's immediate return code. No global fail-fast shell flags are needed.

1. `python3 scripts/aoe2_website_owner_release_v3.py issue-stage --candidate-repo "$APP"`
   rechecks source/manifest/runtime under the real lease and durably issues a
   20-minute owner request. It does not stage or activate. Review its entire
   payload, exact controller commit/inventory, scope, rollback and manifest.
2. Owner signs that request interactively with `sign --request REQUEST.json
   --private-key "$KEYDIR/website-owner.key" --approve-candidate 6be434c00469afa4acb0623715c3bcf724f927f4
   --approve-controller REVIEWED_COMMIT --approve-manifest 7fd6fa4a01ffe0906eeeda0719fdf7b1cd0c8e2b1975e35d7669b80c082ab4e6
   --approve-phase PRE_STAGE`. Save the public signed packet privately.
3. `stage --candidate-repo "$APP" --packet SIGNED_PRE_STAGE.json` obtains NEW
   lease-held observations, compares the owner-approved immutable reference,
   checks freshness after context I/O, consumes the exact nonce BEFORE the one
   existing protected stage dispatch, then validates unchanged live runtime.
4. Independently of the first signature (the SAME owner), inspect the actual
   stage receipt/BUILD_ID/artifact/rollback. `issue-activation --candidate-repo
   "$APP" --attempt-id ACTUAL_STAGE_ATTEMPT --stage-receipt ABSOLUTE_STAGE_RECEIPT`
   only accepts a proven completed stage with matching receipt/artifact/build.
   It issues a fresh PRE_ACTIVATE request, not an activation permit by itself.
5. The owner signs the new actual-artifact-bound PRE_ACTIVATE request using
   the same explicit approval flags, then invokes `activate --candidate-repo
   "$APP" --packet SIGNED_PRE_ACTIVATE.json --stage-receipt ABSOLUTE_STAGE_RECEIPT`.
   The existing protected engine checks source/dependencies/build/runtime,
   performs its passive health soak and preserves its bounded rollback trap.
   The new observer must confirm exact new source and owner-approved BUILD_ID,
   unchanged Wolo/config/timer boundaries and financial flags false.

The owner-reference observation may be up to20minutes old only while a NEW
<=90-second live observation proves unchanged identity under the lease. No
packet extends its controller-issued expiry. SQLite FULL durability + atomic
consumption makes duplicates/concurrency/restarts nonretryable. An exception,
transport loss or missing result after consumption stays UNCERTAIN; inspect
protected stage/activation/rollback receipts before any new owner decision.
Never reset/restore the nonce database to reuse a consumed challenge. Do not
rerun a stage or activation automatically after ambiguity.

## Separate Wolo and funded frontier

Wolo source-to-original-binary reproduction is solved. The 171-commit semantic
release P1 remains OPEN and financial/custody/claim889 flags remain false in
all v3 receipts. Solo-owner website authorization does not certify bank assets,
liabilities, historical transfers, consensus origin or full recovery. No funded
branch/ninth migration is included. The owner can later authorize a separately
versioned financial cutover only after the objective journal/transaction,
solvency, writer-containment and recovery checks actually pass. Council absence
is no blockchain defect. Actual financial evidence gaps still matter.
