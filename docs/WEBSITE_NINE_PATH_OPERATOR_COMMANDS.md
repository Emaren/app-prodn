---
id: "aoe2war.app-prodn.website-ten-path-operator-commands"
title: "Held Ten-Path Website Protected Operator Commands"
type: "runbook"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn","wolochain"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "nonauthorizing-source-engineering"
reviewed_at: "2026-10-25"
review_interval_days: 1
sensitivity: "internal"
---

# Held Ten-Path Website Protected Operator Commands

**RELEASE HOLD — source-qualified is not signer-authorized.** This is the
single Mac-operator runbook for canonical product
`6be434c00469afa4acb0623715c3bcf724f927f4` (certified production
`a2b941f154fdc31ec4d6c4ece6d0e49036c48abd`), controller
`f58834ee9e600c244301bd44ba0439fb42105664`, and ten accepted
changed paths. Original Wolo `vps-source-drift` P1 remains **BLOCKED**,
and all finance/custody/Founder/writer/bridge permissions stay **false**.

The genuine gate already passed and sealed manifest was independently verified
(SHA256 `7fd6fa4a01ffe0906eeeda0719fdf7b1cd0c8e2b1975e35d7669b80c082ab4e6`).
Canonical Mac `ssh hel1` user `tony`, restricted sudo, global lease and
build templates also passed. **Do not repeat these checks.** No new artifact
or BUILD_ID has been deployed.

**IMPORTANT FOR INTERACTIVE MAC TERMINAL:** no shell-global `set -e`,
`set -u`, `pipefail`, top-level `exit`, or unguarded `sudo systemctl`
appears in any pasteable block below. All failure branches print HOLD and
return to the shell. No stage or activation is permitted merely by pasting
the preparation blocks.

## 1. Mac-local owner/source identity — READ ONLY

The controller executable, root-administered **public-key** trust anchors,
private operator-owned nonce ledger and root-administered witness CLIENT all
live **on the Mac**. The witness collects/relays independently signed truth
about the REMOTE VPS; it is **not** a VPS release-controller installation.
The remote `tony@hel1` SSH identity is separate from local `tonyblum`.

```bash
APP="$HOME/projects/AoE2HDBets/app-prodn"
OP="$HOME/projects/AoE2HDBets/app-prodn-website-controller"
PRODUCT="6be434c00469afa4acb0623715c3bcf724f927f4"
CONTROLLER="f58834ee9e600c244301bd44ba0439fb42105664"
export AOE2_RELEASE_HOST="hel1"
export AOE2WAR_WEBSITE_CANDIDATE_ROOT="$APP"
if [ "$(git -C "$APP" rev-parse HEAD 2>/dev/null)" = "$PRODUCT" ] &&
   [ "$(git -C "$OP" rev-parse HEAD 2>/dev/null)" = "$CONTROLLER" ] &&
   [ -z "$(git -C "$APP" status --porcelain --untracked-files=all)" ] &&
   [ -z "$(git -C "$OP" status --porcelain --untracked-files=all)" ]; then
  echo "EXACT_PRODUCT_AND_CONTROLLER=PASS"
else
  echo "HOLD: exact clean product/controller source not installed"
fi
```

## 2. Genuine SIX-role enrollment — nondeploying local provisioning

**Independent human custodians** must provide and control their OWN private
keys, never send them to the owner, to GitHub or to the release operator.
The six **distinct canonical DER SHA256** public-key identities are:

| PEM filename | Real responsible custodian | Required action |
|---|---|---|
| `owner.pem` | Actual website owner | Confirm candidate, rollback, nonfinancial release; independently sign both phases |
| `chain_reviewer.pem` | Independent Wolo/Chain/Custody reviewer | Observe original P1 is open and Wolo unchanged; sign both phases |
| `finance_reviewer.pem` | Independent finance reviewer | Sign source/finance noninterference receipt AND both release phases |
| `release_operator.pem` | Independently accountable release/security operator | Verify source, lease, BUILD_ID, rollback; sign both phases |
| `source_reviewer.pem` | Fifth independent Source/Build reviewer | Sign the source/finance-boundary receipt, including ten paths, SSR, `fast-uri`, startup/GET effects |
| `runtime_witness.pem` | Independently administered machine-attestation custodian | Sign fresh actual remote Wolo/finance/website observations; NOT a human council signature |

Enrollment requires external identity validation, exact fingerprint
confirmation in an authenticated out-of-band channel, proof of exclusive
private-key possession, signer-accountability/expiry/revocation process and
an independent review receipt. Six unique PEMs are **not** proof of six
independent people. Do not generate stand-in reviewer keys.

An authorized **Mac administrator** may create the local PUBLIC trust and
PRIVATE nonce directories. This is not a stage/activate operation:

```bash
if [ "$(uname -s)" = "Darwin" ] && [ "$(id -un)" = "tonyblum" ]; then
  sudo install -d -o root -g wheel -m 0755 /etc/aoe2war/website-release-authority-v2
  echo "PUBLIC_DIRECTORY_INSTALL_RC=$?"
  if [ ! -d /var/lib ]; then
    sudo install -d -o root -g wheel -m 0755 /var/lib
    echo "ROOT_PARENT_CREATE_RC=$?"
  fi
  if [ "$(stat -f '%Su' /var/lib 2>/dev/null)" = "root" ]; then
    sudo install -d -o "$(id -un)" -g "$(id -gn)" -m 0700 /var/lib/aoe2war-website-authority-v2
    echo "PRIVATE_NONCE_DIR_INSTALL_RC=$?"
  else
    echo "HOLD: /var/lib not verified root-owned"
  fi
else
  echo "HOLD: directory provisioning requires the approved local Mac owner"
fi
```

After each **real custodian** separately supplies an authenticated **PUBLIC**
PEM and expected canonical-DER SHA256 over an independent channel, install
exactly one. All paths below are local Mac filesystem paths, not VPS paths.
Replace ROLE/PUB/EXPECTED with the custodian-authenticated values. No
unbound `sudo` or shell exit occurs if the input is bad:

```bash
ROLE="owner"
PUB="/absolute/path/to/custodian-approved-owner-public.pem"
EXPECTED_DER_SHA256="PASTE_64_HEX_FINGERPRINT_FROM_INDEPENDENT_CUSTODIAN"
case "$ROLE" in
  owner|chain_reviewer|finance_reviewer|release_operator|source_reviewer|runtime_witness)
    if [ -f "$PUB" ] && [ ! -L "$PUB" ] &&
       [ "${#EXPECTED_DER_SHA256}" -eq 64 ] &&
       ! grep -q "PRIVATE KEY" "$PUB"; then
      GOT="$(openssl pkey -pubin -in "$PUB" -pubout -outform DER 2>/dev/null | shasum -a 256 | awk '{print $1}')"
      if [ "$GOT" = "$EXPECTED_DER_SHA256" ]; then
        sudo install -o root -g wheel -m 0644 "$PUB" "/etc/aoe2war/website-release-authority-v2/$ROLE.pem"
        echo "PUBLIC_ROLE_INSTALL_RC=$?"
      else
        echo "HOLD: approved canonical-DER fingerprint mismatch"
      fi
    else
      echo "HOLD: invalid role public key or expected fingerprint"
    fi ;;
  *) echo "HOLD: invalid key role" ;;
esac
```

The operator's Mac creates `authority.sqlite3` only through a legitimately
requested challenge. It is NOT prepopulated with simulated approvals. The
local directory is mode 0700 and owned by the executing operator; SQLite is
0600; its parent must be root-owned and not writable by other users.

## 3. Independently controlled Wolo runtime witness — required before ANY nonce

This is the only executable the website release controller calls for actual
runtime evidence:

`/usr/local/libexec/aoe2war-website-witness-v2 --json`

It is a **Mac-local, root-owned, non-group/world-writable CLIENT**, not a
substitute signature authority. The independently operated signer/service
must collect the actual VPS read-only facts and sign the canonical JSON
payload using a PRIVATE witness key that **the Mac website operator cannot
access or invoke to sign arbitrary data**. It must not depend solely on an
operator-provided status file or the same SSH session that performs Ship.
Approved Chain/Security custodians must independently attest the signer
identity, remote measurement source and pin the Mac client's reviewed bytes.

The signed packet contract is exact:
`{"schema":1,"kind":"aoe2war-independent-runtime-witness-v1",
"payload":{...},"signature":"BASE64_DETACHED_SIGNATURE"}`.
The signature is SHA256-RSA/ECDSA/OpenSSL
`dgst -sha256` over UTF-8 JSON with sorted keys and no extra whitespace
(`aoe2_website_release_v2.canonical(payload)`). The independent service
must supply signed UTC `observed_at` and:
- `source_p1_open=true`; `financial_release_authorized=false`,
  `custody_authorized=false`, `claim_889_resolved=false`.
- `immutable` with EXACT keys `wolo8092`, `wolo8093`, `consensus`
  (for each: positive `pid`, SHA256 executing binary, positive `inode`);
  `wolo_config_sha256`, `financial_writers_sha256`,
  `signer_capabilities_sha256`, `financial_hold_sha256` (actual SHA256
  fingerprints of independently verified full state);
  `source_p1_original={"key":"vps-source-drift","status":"BLOCKED",
  "detail":"<ACTUAL_UNMODIFIED_P1_FINDINGS>"}`.
- `website={"source_sha":"<ACTUAL_VPS_SOURCE_SHA>",
  "build_id":"<ACTUAL_ACTIVE_BUILD_ID>"}`.

The custodian must document exact raw measurement commands/sources, full
canonical serialization, signing service/audit and anti-replay policies.
Use one authoritative real signer (HSM or offline-custodied remote signing
service), with the private key sealed outside the Mac release operator's
control. The Mac client only fetches the signed complete packet. A
self-asserted JSON body, fabricated PID/config fingerprint, artificial Wolo
P1 detail or embedded signing key is a hard HOLD.

Only after separate independent security review, the authorized Mac admin
can install the custodian-delivered, pinned/audited **CLIENT** binary/file:

```bash
WITNESS_CLIENT="/absolute/path/to/independently-reviewed-witness-client"
APPROVED_WITNESS_SHA256="PASTE_REAL_64_HEX_REVIEWED_CLIENT_SHA256"
if [ -f "$WITNESS_CLIENT" ] && [ ! -L "$WITNESS_CLIENT" ] &&
   [ "${#APPROVED_WITNESS_SHA256}" -eq 64 ] &&
   [ "$(shasum -a 256 "$WITNESS_CLIENT" | awk '{print $1}')" = "$APPROVED_WITNESS_SHA256" ]; then
  sudo install -d -o root -g wheel -m 0755 /usr/local/libexec
  sudo install -o root -g wheel -m 0555 "$WITNESS_CLIENT" /usr/local/libexec/aoe2war-website-witness-v2
  echo "WITNESS_CLIENT_INSTALL_RC=$?"
else
  echo "HOLD: no independent source-verified real witness client"
fi
```

**Nonauthorizing validation** after installation:

```bash
OP="$HOME/projects/AoE2HDBets/app-prodn-website-controller"
python3 "$OP/scripts/aoe2_website_public_enrollment_verify.py"
echo "PUBLIC_TRUST_INSPECT_RC=$?"
```

The successful inspector status means PUBLIC material is present and
mathematically unique. It NEVER establishes real signers' identities,
approvals or independent witness truth. The controller itself will
cryptographically reverify the witness at issuance, stage and activation,
with <=90-second fresh independent lease-held observation, and may allow a
<=20-minute human-approved reference witness ONLY if fingerprints remain
identical.

## 4. PRE_STAGE → real signatures → protected isolated STAGE

Prerequisites: exact product/controller, real PASS gate + sealed manifest,
independent signed Source+Finance noninterference receipt (includes
ten paths, `fast-uri@3.1.9`, SSR, startup/worker, side-effecting legacy GETs,
UNCHANGED Wolo source P1), independent operator acceptance, the six
genuinely enrolled identities and working signed witness.

First issue a **single** bounded 20-minute stage challenge. This is a real
ledger write and global lease use but **does not stage/activate**:

```bash
APP="$HOME/projects/AoE2HDBets/app-prodn"
OP="$HOME/projects/AoE2HDBets/app-prodn-website-controller"
EVIDENCE_DIR="$HOME/.local/share/aoe2war-release-private"
mkdir -p -m 0700 "$EVIDENCE_DIR"
if [ -d "$EVIDENCE_DIR" ] &&
   [ "$(git -C "$APP" rev-parse HEAD 2>/dev/null)" = "6be434c00469afa4acb0623715c3bcf724f927f4" ] &&
   [ "$(git -C "$OP" rev-parse HEAD 2>/dev/null)" = "f58834ee9e600c244301bd44ba0439fb42105664" ]; then
  (cd "$OP" && AOE2_RELEASE_HOST="hel1" AOE2WAR_WEBSITE_CANDIDATE_ROOT="$APP" python3 scripts/aoe2_website_protected_release_v2.py issue-stage --candidate-repo "$APP") > "$EVIDENCE_DIR/issue-stage.json"
  echo "ISSUE_STAGE_RC=$?"
else
  echo "HOLD: no correct source or private evidence directory"
fi
```

The owner must convey this exact original challenge and immutable digests
through their authenticated offline signing process; four distinct real
human custodians must EACH sign PRE_STAGE (`owner`, `chain_reviewer`,
`finance_reviewer`, `release_operator`) and Source+Finance independently
sign their own source/finance boundary receipt. The issuer does not and
must not sign on their behalf. The signed approval packet must match
`scripts/aoe2_website_release_v2.py assess()`, plus operator provenance,
rolled-back previous-build plan, actual signed witness digest,
expiry and financial flags FALSE. PRE_STAGE artifact fields must be NULL.

Only with all real authenticated, currently valid receipts:

```bash
APP="$HOME/projects/AoE2HDBets/app-prodn"
OP="$HOME/projects/AoE2HDBets/app-prodn-website-controller"
EVIDENCE_DIR="$HOME/.local/share/aoe2war-release-private"
PRE_STAGE_PACKET="/absolute/private/path/approved-PRE_STAGE.json"
SIGNED_SOURCE_FINANCE="/absolute/private/path/independent-source-finance.json"
SIGNED_WOLO_PRESTAGE="/absolute/private/path/real-signed-Wolo-PRE_STAGE.json"
if [ -f "$PRE_STAGE_PACKET" ] && [ -f "$SIGNED_SOURCE_FINANCE" ] &&
   [ -f "$SIGNED_WOLO_PRESTAGE" ] && [ -d "$EVIDENCE_DIR" ]; then
  (cd "$OP" && AOE2_RELEASE_HOST="hel1" AOE2WAR_WEBSITE_CANDIDATE_ROOT="$APP" python3 scripts/aoe2_website_protected_release_v2.py stage --candidate-repo "$APP" --packet "$PRE_STAGE_PACKET" --signed-noninterference "$SIGNED_SOURCE_FINANCE" --signed-wolo-prestate "$SIGNED_WOLO_PRESTAGE") > "$EVIDENCE_DIR/stage-result.json"
  echo "PROTECTED_STAGE_RC=$?"
else
  echo "HOLD: actual signed stage/source/Wolo evidence absent"
fi
```

Preserve actual `stage-result.json`, new BUILD_ID, artifact SHA256,
actual local stage receipt path, original rollback SHA and signed packet
digest. **No PRE_STAGE BUILD_ID may be guessed.** A consumed or ambiguous
stage attempt is never blindly repeated.

## 5. VERIFIED PRE_ACTIVATE → independently signed approval → ACTIVATE

Parse the verified, real stage output and issue a FRESH challenge, only
after independent artifact/build receipt verification; never guess
`attempt_id` or stage SHA:

```bash
APP="$HOME/projects/AoE2HDBets/app-prodn"
OP="$HOME/projects/AoE2HDBets/app-prodn-website-controller"
EVIDENCE_DIR="$HOME/.local/share/aoe2war-release-private"
if [ -f "$EVIDENCE_DIR/stage-result.json" ] &&
   [ -f "$EVIDENCE_DIR/issue-stage.json" ]; then
  python3 - "$APP" "$EVIDENCE_DIR/stage-result.json" "$EVIDENCE_DIR/issue-stage.json" <<'PY'
import json,sys
from pathlib import Path
app=Path(sys.argv[1]).resolve()
stage=json.loads(Path(sys.argv[2]).read_text())
issued=json.loads(Path(sys.argv[3]).read_text())
if stage.get("status")!="SOURCE_BOUND_WEBSITE_ONLY_STAGED":
    print("HOLD: not a source-certified staged artifact")
else:
    print("STAGE_ATTEMPT_ID="+str(issued.get("attempt_id","")))
    print("STAGE_APPROVAL_SHA="+str(stage.get("authorization_sha256","")))
    print("STAGE_RECEIPT="+str(app / stage["protected_release_result"]["local_receipt_path"]))
    print("ARTIFACT_SHA256="+str(stage["protected_release_result"].get("artifact_sha256","")))
    print("STAGED_BUILD_ID="+str(stage["protected_release_result"].get("staged_build_id","")))
PY
else
  echo "HOLD: no verified staged proof or original issued challenge"
fi
```

Assign `STAGE_ATTEMPT_ID`, `STAGE_APPROVAL_SHA` and absolute
`STAGE_RECEIPT` only from validated output (not guessed). Have the
independent custodians verify the stage receipt and exact artifact on the
approved deployment host. Then the controller may issue:

```bash
if [ -f "$STAGE_RECEIPT" ] &&
   [ "${#STAGE_APPROVAL_SHA}" -eq 64 ] &&
   [ -n "$STAGE_ATTEMPT_ID" ]; then
  (cd "$OP" && AOE2_RELEASE_HOST="hel1" AOE2WAR_WEBSITE_CANDIDATE_ROOT="$APP" python3 scripts/aoe2_website_protected_release_v2.py issue-activation --candidate-repo "$APP" --attempt-id "$STAGE_ATTEMPT_ID" --previous-stage-approval-sha256 "$STAGE_APPROVAL_SHA" --stage-receipt "$STAGE_RECEIPT") > "$EVIDENCE_DIR/issue-activation.json"
  echo "ISSUE_ACTIVATION_RC=$?"
else
  echo "HOLD: actual staged artifact/approval link missing"
fi
```

PRE_ACTIVATE requires its own NEW independently signed Wolo reference
packet and four genuine fresh phase signatures, this time binding original
stage challenge, consumed stage signature, EXACT artifact SHA256, actual
staged BUILD_ID, stage receipt SHA256, fresh runtime witness digest,
rollback plan and unaltered financial controls. Repeat the independent
Source+Finance review if its 60-minute validity expires.

```bash
PRE_ACTIVATE_PACKET="/absolute/private/path/genuine-PRE_ACTIVATE.json"
SIGNED_WOLO_POSTSTAGE="/absolute/private/path/real-signed-Wolo-PRE_ACTIVATE.json"
if [ -f "$PRE_ACTIVATE_PACKET" ] && [ -f "$SIGNED_WOLO_POSTSTAGE" ] &&
   [ -f "$SIGNED_SOURCE_FINANCE" ] && [ -f "$STAGE_RECEIPT" ]; then
  (cd "$OP" && AOE2_RELEASE_HOST="hel1" AOE2WAR_WEBSITE_CANDIDATE_ROOT="$APP" python3 scripts/aoe2_website_protected_release_v2.py activate --candidate-repo "$APP" --packet "$PRE_ACTIVATE_PACKET" --signed-noninterference "$SIGNED_SOURCE_FINANCE" --signed-wolo-prestate "$SIGNED_WOLO_POSTSTAGE" --stage-receipt "$STAGE_RECEIPT") > "$EVIDENCE_DIR/activation-result.json"
  echo "PROTECTED_ACTIVATE_RC=$?"
else
  echo "HOLD: genuine fresh PRE_ACTIVATE authority absent"
fi
```

No raw Ship, rsync, direct systemctl, manual DB writes or Wolo state
changes. No second attempt after ambiguous network/activation status; first
verify original and newly staged rollback receipts through the protected
operator response.

## 6. POST-ACTIVATION: independently verify real BUILD_ID and rollback

```bash
EVIDENCE_DIR="$HOME/.local/share/aoe2war-release-private"
if [ -f "$EVIDENCE_DIR/activation-result.json" ]; then
  python3 - "$EVIDENCE_DIR/activation-result.json" <<'PY'
import json,sys
from pathlib import Path
try:
    d=json.loads(Path(sys.argv[1]).read_text())
    assert d["status"]=="SOURCE_BOUND_WEBSITE_ONLY_CERTIFIED"
    assert d["candidate_sha"]=="6be434c00469afa4acb0623715c3bcf724f927f4"
    assert d["financial_release_authorized"] is False
    assert d["custody_authorized"] is False
    assert d["original_wolo_p1"]["status"]=="BLOCKED"
    assert d["protected_release_result"]["active_build_id"]
    print("CONTROLLER_CERTIFIED_BUILD_ID="+d["protected_release_result"]["active_build_id"])
except (OSError,KeyError,ValueError,AssertionError) as e:
    print("HOLD: invalid/absent actual signed activation evidence:",type(e).__name__)
PY
else
  echo "HOLD: no actual activation receipt"
fi
```

Independent witness + authorized operator then compare actual deployed VPS
source against exact candidate, internal/public `/api/deployment-version`
source+BUILD_ID parity, active service/soak, unchanged Wolo process/hash,
financial-writer HOLD and durable rollback certificate. Preserve receipts
out of both Git worktrees. After verified activation product `main` is
already clean; do not delete either worktree, original rollback build or
operator ledger. No financial mainnet or Writer activation.

## 7. If five independent humans cannot sign: proposal ONLY

The current six-identity/four-phase controller **cannot** be made to GO
by substituting the owner five times, minting six keys, or inventing a
machine signature. A different *website-only* quorum is a NEW policy
change requiring a separate independent review, source revision, fresh
exact-head CI, fresh controller source/scope signatures and owner-approved
deployment authority. See `docs/WEBSITE_ONLY_ALTERNATIVE_QUORUM_PROPOSAL.md`.
That proposal is NOT implemented, enrolled or an authorization to stage.
