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
The authenticated hel1 observer stamps observations in VPS UTC and the owner
controller validates them against Mac UTC. A narrowly bounded 5-second VPS
clock lead is permitted to absorb small NTP offsets (observed ~1.6 seconds),
without extending 90-second fresh or 1200-second signed-reference stale limits.
A timestamp more than 5 seconds in the future, a stale capture, overlong remote
collection or any altered financial/runtime identity still HOLDS. Never change
the live Cosmos server time or loosen Wolo safety fences to satisfy this check.

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

After reviewing the exported public key, install it without overwriting any
previous enrollment (Mac only; each return code stays visible):

```bash
KEYDIR="$HOME/.local/share/aoe2war-owner-signing"
if [ "$(uname -s)" = "Darwin" ] && [ "$(id -un)" = "tonyblum" ] &&
   [ -f "$KEYDIR/owner.pem" ] && [ ! -L "$KEYDIR/owner.pem" ]; then
  openssl pkey -pubin -in "$KEYDIR/owner.pem" -pubout -outform DER -out "$KEYDIR/owner-public.der"
  OWNER_DER_RC=$?
  printf 'PUBLIC_DER_EXPORT_RC=%s\n' "$OWNER_DER_RC"
  if [ "$OWNER_DER_RC" = 0 ] && [ -s "$KEYDIR/owner-public.der" ] &&
     [ ! -L /etc/aoe2war/website-owner-v3 ]; then
    shasum -a 256 "$KEYDIR/owner-public.der"
    printf 'OWNER_PUBLIC_FINGERPRINT_RC=%s\n' "$?"
    sudo install -d -o root -g wheel -m 0755 /etc/aoe2war/website-owner-v3
    printf 'OWNER_TRUST_DIRECTORY_RC=%s\n' "$?"
    if [ ! -e /etc/aoe2war/website-owner-v3/owner.pem ] &&
       [ ! -L /etc/aoe2war/website-owner-v3/owner.pem ]; then
      sudo install -o root -g wheel -m 0644 "$KEYDIR/owner.pem" /etc/aoe2war/website-owner-v3/owner.pem
      printf 'OWNER_PUBLIC_INSTALL_RC=%s\n' "$?"
    else
      printf 'HOLD: public key already enrolled; verify it, never silently rotate\n'
    fi
    if [ ! -e /var/lib/aoe2war-website-owner-v3 ] && [ ! -L /var/lib/aoe2war-website-owner-v3 ]; then
      sudo install -d -o "$(id -un)" -g "$(id -gn)" -m 0700 /var/lib/aoe2war-website-owner-v3
      printf 'OWNER_PRIVATE_NONCE_DIRECTORY_RC=%s\n' "$?"
    fi
  fi
else
  printf 'HOLD: expected local owner and exported public key required\n'
fi
```

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
packet extends its controller-issued expiry. SQLite EXTRA/DELETE durability,
Mac fullfsync and atomic
consumption makes duplicates/concurrency/restarts nonretryable. An exception,
transport loss or missing result after consumption stays UNCERTAIN; inspect
protected stage/activation/rollback receipts before any new owner decision.
Never reset/restore the nonce database to reuse a consumed challenge. Do not
rerun a stage or activation automatically after ambiguity.

The full before/after runtime snapshots preserve each configured service's actual
state. Across the protected website stage, the policy comparison treats only
transient MainPID/active/start/stop observations of six known timer-triggered
financial one-shot services as volatile; a failed state is never accepted.
Their unit/configuration hashes and enablement, the active timers, continuous
Wolo settlement/consensus executable identity and original P1 remain pinned.
This does NOT certify complete finance-writer enumeration or bank solvency.

The nonce connection verifies its effective durability settings. SQLite's
[documented EXTRA mode](https://www.sqlite.org/pragma.html#pragma_synchronous)
also synchronizes the rollback-journal directory after deletion; plain FULL
does not guarantee that last commit across power loss. Process-crash tests
do not constitute a physical power-loss certification of the owner's disk.

## Separate Wolo and funded frontier

Wolo source-to-original-binary reproduction is solved. The 171-commit semantic
release P1 remains OPEN and financial/custody/claim889 flags remain false in
all v3 receipts. Solo-owner website authorization does not certify bank assets,
liabilities, historical transfers, consensus origin or full recovery. No funded
branch/ninth migration is included. The owner can later authorize a separately
versioned financial cutover only after the objective journal/transaction,
solvency, writer-containment and recovery checks actually pass. Council absence
is no blockchain defect. Actual financial evidence gaps still matter.

## October 25 live release and historical outer HOLD

Product `6be434c00469afa4acb0623715c3bcf724f927f4` is already live with
BUILD_ID `xqX6Oi-zV5gSKH1kIC4zC`. The owner genuinely signed and consumed both
phases through controller `74047f8b5e2a87b495ac3466eb17b447a44d4cb5`.
The inner activation receipt is CERTIFIED; the outer PRE_ACTIVATE journal
remains CONSUMED with NULL result after final observer/comparator failure.
Never replay, reset or force-complete this authorization. See
[the incident dossier](WEBSITE_OWNER_HOLD_RECONCILIATION.md).

Future source adds private, immutable evidence under the existing private state
root's `evidence-v1/<attempt>/<phase>/` directory. Before dispatch it records
both preflight observations; immediately after return it records the protected
result, before attempting the final observer. Each complete event is fsynced,
atomically linked without replacement, and its directory fsynced. Final raw
observations and structured JSON-pointer differences are retained before HOLD.
Incomplete temporary files after an abrupt crash are evidence, not permission
to rerun. Evidence I/O failure prevents dispatch; failure after dispatch leaves
the nonce CONSUMED. Freshness and owner expiry are checked again after evidence
fsync. Existing Wolo/timer/config comparison rules are unchanged.

`scripts/aoe2_website_owner_evidence_v1.py` is a separate **read-only** assessment:
it opens SQLite with `mode=ro`/`query_only`, verifies the original packet against
the consumed journal and public owner signature, checks the exact protected
receipt checksum and artifact/source/build/stage lineage, and obtains current
server-owned SSH observations. Archival signature verification at signed issue
time does not renew its expiry or create any execution authority. This command
never dispatches, signs, consumes, completes or repairs a request. Its JSON
separates protected certification, historical owner HOLD, current same-owner
boundary match, and financial nonauthorization. Missing engine receipt, unknown
runtime, rollback, stale evidence or drift cannot imply successful completion.
A checksum verifies preserved bytes, not independent chain/finance authority.

An owner may retain its JSON as a *new* restricted reconciliation receipt. Do
not overwrite original owner packets, journal, snapshots or engine receipts.
