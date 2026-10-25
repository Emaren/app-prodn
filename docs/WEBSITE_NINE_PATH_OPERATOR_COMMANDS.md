---
id: "aoe2war.app-prodn.website-nine-path-operator-commands"
title: "Held Nine-Path Website Protected Operator Commands"
type: "runbook"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn","wolochain"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "nonauthorizing-source-engineering"
reviewed_at: "2026-10-24"
review_interval_days: 1
sensitivity: "internal"
---

# Held Nine-Path Website Protected Operator Commands

**HOLD until independent source/security acceptance and six trusted public
keys, a real signed runtime observer, independent verified source/finance
report, four independent signed approvals PER phase and protected operator
identity exist.** These are preparation commands, NOT an authorization. Do not
paste private keys, receipts containing identifying information or wallet
data into chats or GitHub. Wolo original `vps-source-drift` remains OPEN.

## Phase A: READ-ONLY CHECK — safe immediately

Run from the **separately reviewed controller checkout** on the Mac. Set actual
local paths and the independently reviewed exact controller commit; do not
mistake controller/source branch for the published product:

```bash
set -euo pipefail
export APP="$HOME/projects/AoE2HDBets/app-prodn"
export OP="$HOME/projects/AoE2HDBets/app-prodn-website-controller"
export PRODUCT_SHA="21cd1493b182cb0968a6b6cf3f528d0578cfd797"
export CERTIFIED_PROD="a2b941f154fdc31ec4d6c4ece6d0e49036c48abd"
export APPROVED_CONTROLLER_SHA="<EXACT_CI_GREEN_INDEPENDENTLY_ACCEPTED_CONTROLLER_SHA>"
export WEBSITE_MAIN_REPO="$APP"
export WEBSITE_CONTROLLER_REPO="$OP"
export WEBSITE_APPROVED_CONTROLLER_SHA="$APPROVED_CONTROLLER_SHA"
test -d "$APP/.git" || test -f "$APP/.git"
test -d "$OP/.git" || test -f "$OP/.git"
test "$(git -C "$APP" rev-parse HEAD)" = "$PRODUCT_SHA"
test "$(git -C "$OP" rev-parse HEAD)" = "$APPROVED_CONTROLLER_SHA"
bash "$OP/scripts/aoe2_website_release_readonly_diag.sh"
```

The read-only diagnostic inspects local/main and operator Git HEAD, dirty flags,
GitHub `origin/main` reachability, release receipts and role-key presence,
then uses **read-only SSH** to print certified VPS checkout, active/staged
BUILD_ID, service state, Wolo listeners and passive deployment-version
reachability. It never calls a wager/Founder GET, a DB, wallet/signer,
`systemctl` mutations, `git fetch/pull/checkout`, direct `rsync` or a
deployment.

## Release transport and public-authority enrollment (nondeploying)

**Two SSH principals were observed on the VPS, but neither is inferred as
the Mac's actual release credential from a VPS-side `ssh -G`**. The
protected Ship implementation requires the remote Git executor
`tony`, its pre-enrolled deploy key and restrictive sudo permissions.
`root@hel1` worked for the separate diagnostic but **must not replace
`tony`** or silently bypass Ship's user/transport validation.

Only from the owner **Mac terminal**, and never from inside a VPS shell:

```bash
set -euo pipefail
APP="$HOME/projects/AoE2HDBets/app-prodn"
OP="$HOME/projects/AoE2HDBets/app-prodn-website-controller"
CONTROLLER_SHA="<FINAL_CI_GREEN_INDEPENDENTLY_ACCEPTED_OPERATOR_SHA>"
export AOE2_RELEASE_HOST="hel1"
export WEBSITE_SSH_TARGET="root@hel1"   # prior diagnostic only, NOT Ship
export WEBSITE_MAIN_REPO="$APP"
export WEBSITE_CONTROLLER_REPO="$OP"
export WEBSITE_APPROVED_CONTROLLER_SHA="$CONTROLLER_SHA"
ssh -G "$AOE2_RELEASE_HOST" |
  awk '$1=="user" || $1=="hostname" || $1=="port" { print $1, $2 }'
bash "$OP/scripts/aoe2_website_release_readonly_diag.sh"
python3 "$OP/scripts/aoe2_website_public_enrollment_verify.py"
```

This diagnostic now probes BOTH independently: the known root read-only
inspection and the canonical `tony@hel1` restricted release channel
without taking any lock or modifying service state. It prints only
user, host, status, source and permissions. Require the actual remote
username `tony`, the canonical repo source, writable global release
lock (or writable protected lock parent if absent) and the named
restricted `sudo -n -l` checks. Any failure is a release HOLD, not an
invitation to `sudo`/run raw root Ship.

The real **five independent human** roles are Owner (project owner);
Chain/Custody reviewer; Finance reviewer; Release Operator; Source/Build
reviewer. A separate, independently administered runtime witness
signer is not a substitute for a human role. Enroll genuine unique
public-key credentials **out of band** after identity, custodian
and possession attestation. No artificial signing keys or trust in
AI-signed approval are permitted.

Provisioning involves ONLY trust-store directories and independent
PUBLIC keys; it does not issue a release permit. As authorized Mac
administrator, verify the requested paths and execute only the
following, after source review and approval of this operator plane:

```bash
set -euo pipefail
test "$(id -un)" = tonyblum
sudo install -d -o root -g wheel -m 0755 /etc/aoe2war/website-release-authority-v2
if [ ! -d /var/lib ]; then
  sudo install -d -o root -g wheel -m 0755 /var/lib
fi
test "$(stat -f '%Su' /var/lib)" = root
sudo install -d -o "$(id -un)" -g "$(id -gn)" -m 0700 \
  /var/lib/aoe2war-website-authority-v2
```

For each individually verified **PUBLIC** reviewer key file only:

```bash
# Replace both values only with independently authenticated PUBLIC PEM sources.
: "${REVIEWER_ROLE:?owner|chain_reviewer|finance_reviewer|release_operator|source_reviewer|runtime_witness}"
: "${VERIFIED_PUBLIC_PEM:?existing externally verified .pem public key file}"
case "$REVIEWER_ROLE" in
  owner|chain_reviewer|finance_reviewer|release_operator|source_reviewer|runtime_witness) ;;
  *) echo "INVALID_ROLE" >&2; exit 2 ;;
esac
grep -q -- 'BEGIN PUBLIC KEY' "$VERIFIED_PUBLIC_PEM"
! grep -q -- 'PRIVATE KEY' "$VERIFIED_PUBLIC_PEM"
sudo install -o root -g wheel -m 0644 "$VERIFIED_PUBLIC_PEM" \
  "/etc/aoe2war/website-release-authority-v2/$REVIEWER_ROLE.pem"
```

Do not invent, create or import an independently signed witness merely
because the public-key inspector reports six unique fingerprints.
Separately authorized security/Chain custodians must install a
root-owned, independently audited LOCAL executable at
`/usr/local/libexec/aoe2war-website-witness-v2`. That executable
must emit independently signed fresh **real** VPS process/config,
original Wolo P1, financial writer HOLD and website source/BUILD_ID
observations; no private signing material should be accessible to the
release operator or checked into GitHub. Once provisioned, re-run the
public trust inspector; `PUBLIC_TRUST_MATERIAL_PRESENT_NONAUTHORIZING`
means public credentials exist, **not** that humans approved deployment.

## Phase B: AUTHORIZED STAGE — requires real external approval

Root-administer the **public** role keys and independent observer out of band,
but run the protected controller as the ordinary authenticated Mac
SSH operator. Ledger directory must be owned by that operator (0700) under
a root-owned, non-group-writable `/var/lib`; the public trust directory
is root-owned 0755 with individually root-owned PEMs 0644. Key roles:
`owner`, `chain_reviewer`, `finance_reviewer`,
`release_operator`, `source_reviewer`, `runtime_witness`.
All six must have DIFFERENT canonical DER public fingerprints; the first
five represent real, independently authenticated humans. The root-owned
witness executable must be `/usr/local/libexec/aoe2war-website-witness-v2`
and independently produce signed current Wolo/website/finance facts.

Before issuing a challenge, obtain **independently witnessed** source,
dependency/SSR/financial-worker restart, legacy GET nonwrite and P1-open
attestations. Ensure `fast-uri@3.1.9` is reviewed and no Watcher executable
is being released. The exact main is conservatively `WATCHER` risk because
the draft review filename contains `watcher`; the narrower immutable
no-version-change proof is required, not a broad risk downgrade.

```bash
set -euo pipefail
test "$(git -C "$APP" rev-parse HEAD)" = "$PRODUCT_SHA"
test "$(git -C "$OP" rev-parse HEAD)" = "$APPROVED_CONTROLLER_SHA"
test -z "$(git -C "$APP" status --porcelain --untracked-files=all)"
test -z "$(git -C "$OP" status --porcelain --untracked-files=all)"
export AOE2WAR_WEBSITE_CANDIDATE_ROOT="$APP"
cd "$OP"
python3 scripts/aoe2_release.py gate
python3 scripts/aoe2_release.py manifest

# Nonce is issued only while holding the normal remote global release lease.
python3 scripts/aoe2_website_protected_release_v2.py issue-stage \
  --candidate-repo "$APP"
```

Capture the exact JSON output (`attempt_id`, `challenge`,
`issued_at`, `expires_at`). Independently authenticate all reviews.
Signers must complete the phase before the strict 20-minute challenge expires.
The human-approved signed reference witness may be up to 20 minutes old,
but the controller re-observes the SAME Wolo + website identity with a
separately signed <=90-second reading under the global release lease.
Do not extend those clocks or bypass this continuity proof.
Four distinct real humans sign canonical PRE_STAGE JSON specifying:
candidate/main SHA, scope, controller SHA and entire operator executable
inventory digest, actual gate/manifest, Source+Finance attestations, live
independently signed Wolo witness SHA, rollback, risk class, nonce and
expiration. **No staged artifact or BUILD_ID is allowed yet.**

When actual reviewed signed files exist, with full permissions isolated from
the Git worktrees, run:

```bash
set -euo pipefail
: "${PRE_STAGE_PACKET:?absolute path to four-real-human PRE_STAGE packet}"
: "${SIGNED_SOURCE_FINANCE:?absolute path to distinct Source+Finance attestations}"
: "${SIGNED_WOLO_PRESTAGE:?absolute path to fresh independently signed witness}"
: "${EVIDENCE_DIR:?private operator receipt directory OUTSIDE both repos}"
install -d -m 0700 "$EVIDENCE_DIR"
test -f "$PRE_STAGE_PACKET"
test -f "$SIGNED_SOURCE_FINANCE"
test -f "$SIGNED_WOLO_PRESTAGE"
cd "$OP"
python3 scripts/aoe2_website_protected_release_v2.py stage \
  --candidate-repo "$APP" \
  --packet "$PRE_STAGE_PACKET" \
  --signed-noninterference "$SIGNED_SOURCE_FINANCE" \
  --signed-wolo-prestate "$SIGNED_WOLO_PRESTAGE" \
  | tee "$EVIDENCE_DIR/stage-result.json"
```

The controller FAILS CLOSED if the nonce has expired, signer material is
untrusted, Wolo/current finance writers differ, stage mutation is not
proven isolated, or Wolo P1 has disappeared. A consumed nonce is NEVER
retried. A stage is NOT a release.

## Phase C: VERIFIED PRE-ACTIVATE — requires actual staged artifact

```bash
set -euo pipefail
STAGE_RECEIPT="$(python3 - "$APP" "$EVIDENCE_DIR/stage-result.json" <<'PY'
import json, sys
from pathlib import Path
root=Path(sys.argv[1]).resolve()
record=json.loads(Path(sys.argv[2]).read_text())
assert record["status"] == "SOURCE_BOUND_WEBSITE_ONLY_STAGED"
relative=record["protected_release_result"]["local_receipt_path"]
print(root / relative)
PY
)"
STAGE_APPROVAL_SHA="$(python3 - "$EVIDENCE_DIR/stage-result.json" <<'PY'
import json,sys
from pathlib import Path
record=json.loads(Path(sys.argv[1]).read_text())
assert record["status"] == "SOURCE_BOUND_WEBSITE_ONLY_STAGED"
print(record["authorization_sha256"])
PY
)"
: "${STAGE_ATTEMPT_ID:?the actual attempt_id output of issue-stage}"
test -f "$STAGE_RECEIPT"
cd "$OP"
python3 scripts/aoe2_website_protected_release_v2.py issue-activation \
  --candidate-repo "$APP" \
  --attempt-id "$STAGE_ATTEMPT_ID" \
  --previous-stage-approval-sha256 "$STAGE_APPROVAL_SHA" \
  --stage-receipt "$STAGE_RECEIPT"
```

Collect the **NEW** issued nonce and second actual signed Wolo receipt
while the staged BUILD_ID, artifact digest, original live BUILD_ID and
runtime witnesses still match. Obtain entirely fresh real four-human
PRE_ACTIVATE signatures over actual stage receipt SHA, artifact SHA,
BUILD_ID, previous stage signature SHA, **previous stage challenge**,
new challenge, exact source/manifest/gate and full rollback plan. Never
re-use PRE_STAGE challenge or signatures.

## Phase D: AUTHORIZED ACTIVATE — only after fresh independent approvals

```bash
set -euo pipefail
: "${PRE_ACTIVATE_PACKET:?absolute path to new genuine four-human packet}"
: "${SIGNED_WOLO_POSTSTAGE:?absolute path to NEW signed Wolo witness}"
test -f "$PRE_ACTIVATE_PACKET"
test -f "$SIGNED_WOLO_POSTSTAGE"
test -f "$SIGNED_SOURCE_FINANCE"
test -f "$STAGE_RECEIPT"
cd "$OP"
python3 scripts/aoe2_website_protected_release_v2.py activate \
  --candidate-repo "$APP" \
  --packet "$PRE_ACTIVATE_PACKET" \
  --signed-noninterference "$SIGNED_SOURCE_FINANCE" \
  --signed-wolo-prestate "$SIGNED_WOLO_POSTSTAGE" \
  --stage-receipt "$STAGE_RECEIPT" \
  | tee "$EVIDENCE_DIR/activation-result.json"
```

No raw Ship invocation, `systemctl` restart, manual file copy,
`rsync`, database write, Wolo restart or P1 suppression is permitted.
The protected controller already holds the global deployment lease
and performs one validated staged activation. On transport ambiguity,
do NOT issue a second nonce or retry the network mutation.

## Phase E: POST-DEPLOY VALIDATION — read only

```bash
set -euo pipefail
python3 - "$EVIDENCE_DIR/activation-result.json" "$PRODUCT_SHA" <<'PY'
import json,sys
from pathlib import Path
result=json.loads(Path(sys.argv[1]).read_text())
assert result["status"] == "SOURCE_BOUND_WEBSITE_ONLY_CERTIFIED"
assert result["candidate_sha"] == sys.argv[2]
assert result["financial_release_authorized"] is False
assert result["custody_authorized"] is False
assert result["original_wolo_p1"]["status"] == "BLOCKED"
assert result["protected_release_result"]["active_build_id"]
print("VERIFIED_NEW_BUILD_ID="+result["protected_release_result"]["active_build_id"])
PY
WEBSITE_STAGE_RECEIPT="$STAGE_RECEIPT" \
  bash "$OP/scripts/aoe2_website_release_readonly_diag.sh"
```

Confirm VPS Git SHA equals the exact main commit, active BUILD_ID equals
the protected activation receipt, service is active, internal/public
deployment identity is healthy and both Wolo 8092/8093 listeners remain
unchanged. Preserve actual durable stage/activation/rollback records.
The activation script owns its own remote rollback trap; separate
post-commit rollback requires a separately approved incident action.
Funded bank, Auto Bets, War Satchel, Founder/custody and Wolo mainnet
financial activation remain **HOLD**.

## Human decision / incident guardrail

A CI-green GitHub PR, code SHA, source review, self-produced witness or
operator terminal transcript is not a five-human council approval.
If independent role identity, signer private-key custody, independent
runtime observer, signed Source+Finance approval, site restart financial
noninterference or operational SSH trust is missing, production **NO-GO**,
even when all code tests pass.
