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
