#!/usr/bin/env bash
# Strictly read-only. No checkout/fetch/pull, systemctl writes, git config writes,
# signing, SSH secrets, private key material, DB access, wallet or balances.
set -uo pipefail

TARGET_MAIN="21cd1493b182cb0968a6b6cf3f528d0578cfd797"
CERT_PROD="a2b941f154fdc31ec4d6c4ece6d0e49036c48abd"
CANDIDATE="${WEBSITE_MAIN_REPO:-$HOME/projects/AoE2HDBets/app-prodn}"
CONTROLLER="${WEBSITE_CONTROLLER_REPO:-$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)}"
HOST="${WEBSITE_SSH_TARGET:-root@hel1}"
KEYROOT="/etc/aoe2war/website-release-authority-v2"
STATEDIR="/var/lib/aoe2war-website-authority-v2"

out() { printf '%-39s %s\n' "$1" "$2"; }
sub() { printf '\n===== %s =====\n' "$1"; }
describe_checkout() {
  local label="$1" root="$2" head="NOT_FOUND" dirty="UNKNOWN" hidden="UNKNOWN" count=""
  sub "$label"
  out "${label}_PATH" "$root"
  if ! [ -d "$root/.git" ] && ! [ -f "$root/.git" ]; then
    out "${label}_REPOSITORY" "MISSING"
    return
  fi
  head="$(git -C "$root" rev-parse --verify HEAD 2>/dev/null || printf "UNAVAILABLE")"
  count="$(git -C "$root" status --porcelain --untracked-files=all --ignore-submodules=none 2>/dev/null | wc -l | tr -d ' ')"
  dirty="DIRTY(count=$count)"
  [ "$count" = 0 ] && dirty="CLEAN"
  hidden="$(git -C "$root" ls-files -v 2>/dev/null | awk 'substr($0,1,1)!="H" {n++} END{print n+0}')"
  out "${label}_HEAD" "$head"
  out "${label}_DIRTY" "$dirty"
  out "${label}_HIDDEN_INDEX_MARKERS" "${hidden:-UNKNOWN}"
  if [ "$label" = "PRODUCT" ]; then
    [ "$head" = "$TARGET_MAIN" ] && out "PRODUCT_SHA_POLICY" "PASS" || out "PRODUCT_SHA_POLICY" "HOLD"
    count="$(git -C "$root" diff --name-only "$CERT_PROD..$TARGET_MAIN" 2>/dev/null | wc -l | tr -d ' ')"
    out "CERTIFIED_TO_PRODUCT_CHANGED_PATHS" "${count:-UNKNOWN} (expected 9)"
    if [ -f "$root/.aoe2war-release/stage-receipts" ]; then
      out "STAGE_RECEIPTS" "UNEXPECTED_NON_DIRECTORY"
    elif [ -d "$root/.aoe2war-release/stage-receipts" ]; then
      count="$(find "$root/.aoe2war-release/stage-receipts" -maxdepth 1 -type f -name '*.json' 2>/dev/null | wc -l | tr -d ' ')"
      out "STAGE_RECEIPT_FILES" "${count:-0} (validate exact receipt before using)"
    else
      out "STAGE_RECEIPT_FILES" "NONE"
    fi
    for name in gates manifests; do
      if [ -d "$root/.aoe2war-release/$name" ]; then
        count="$(find "$root/.aoe2war-release/$name" -maxdepth 1 -type f -name '*.json' 2>/dev/null | wc -l | tr -d ' ')"
        out "LOCAL_${name^^}_FILES" "$count (NOT an approval)"
      else
        out "LOCAL_${name^^}_FILES" "NONE"
      fi
    done
  fi
}
evidence_presence() {
  local label="$1" path="$2"
  if [ -n "$path" ] && [ -f "$path" ] && [ ! -L "$path" ]; then
    out "$label" "FILE_PRESENT (signature NOT verified by this diagnostic)"
  else
    out "$label" "MISSING"
  fi
}
sub "AOE2WAR WEBSITE ONLY - READ ONLY DIAGNOSTIC"
out "LOCAL_UTC" "$(date -u +%FT%TZ)"
out "LOCAL_ACCOUNT" "$(id -un 2>/dev/null || printf UNKNOWN) uid=$(id -u 2>/dev/null || printf UNKNOWN)"
out "PRODUCT_EXPECTED" "$TARGET_MAIN"
out "CERTIFIED_EXPECTED" "$CERT_PROD"
describe_checkout "PRODUCT" "$CANDIDATE"
describe_checkout "CONTROLLER" "$CONTROLLER"
if [ -n "${WEBSITE_APPROVED_CONTROLLER_SHA:-}" ]; then
  cur="$(git -C "$CONTROLLER" rev-parse HEAD 2>/dev/null || true)"
  [ "$cur" = "$WEBSITE_APPROVED_CONTROLLER_SHA" ] && out "CONTROLLER_APPROVED_SHA" "MATCH" || out "CONTROLLER_APPROVED_SHA" "MISMATCH/HOLD"
else
  out "CONTROLLER_APPROVED_SHA" "NOT_PROVIDED (HOLD)"
fi

sub "GITHUB REMOTE READ ONLY"
if [ -d "$CANDIDATE/.git" ] || [ -f "$CANDIDATE/.git" ]; then
  origin="$(GIT_TERMINAL_PROMPT=0 GIT_SSH_COMMAND='ssh -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=yes' git -C "$CANDIDATE" ls-remote origin refs/heads/main 2>/dev/null | awk 'NR==1{print $1}')"
  if [ -n "$origin" ]; then
    out "GITHUB_MAIN_REMOTE_SHA" "$origin"
    [ "$origin" = "$TARGET_MAIN" ] && out "GITHUB_MAIN_MATCH" "PASS" || out "GITHUB_MAIN_MATCH" "HOLD"
  else
    out "GITHUB_MAIN_REMOTE_SHA" "UNREACHABLE_OR_UNAUTHORIZED (HOLD)"
  fi
fi

sub "ROLE TRUST ROOT AND NONCE LEDGER (presence only)"
if [ -d "$KEYROOT" ]; then out "PUBLIC_TRUST_ROOT" "PRESENT"; else out "PUBLIC_TRUST_ROOT" "MISSING"; fi
for name in owner chain_reviewer finance_reviewer release_operator source_reviewer runtime_witness; do
  if [ -f "$KEYROOT/$name.pem" ] && [ ! -L "$KEYROOT/$name.pem" ]; then
    out "PUBLIC_ROLE_$name" "PRESENT (identity/authority NOT independently confirmed)"
  else
    out "PUBLIC_ROLE_$name" "MISSING"
  fi
done
if [ -d "$STATEDIR" ] && [ ! -L "$STATEDIR" ]; then
  out "NONCE_LEDGER_DIRECTORY" "PRESENT"
else
  out "NONCE_LEDGER_DIRECTORY" "MISSING"
fi
if [ -f "$STATEDIR/authority.sqlite3" ] && [ ! -L "$STATEDIR/authority.sqlite3" ]; then
  out "NONCE_LEDGER_FILE" "PRESENT (not inspected)"
else
  out "NONCE_LEDGER_FILE" "MISSING"
fi
if [ -x "/usr/local/libexec/aoe2war-website-witness-v2" ]; then
  out "TRUSTED_WITNESS_EXECUTABLE" "PRESENT (not executed or authenticated)"
else
  out "TRUSTED_WITNESS_EXECUTABLE" "MISSING"
fi

sub "EXTERNAL EVIDENCE PRESENCE"
evidence_presence "SIGNED_SOURCE_FINANCE" "${WEBSITE_SIGNED_NONINTERFERENCE:-}"
evidence_presence "PRE_STAGE_FOUR_HUMANS" "${WEBSITE_PRE_STAGE_PACKET:-}"
evidence_presence "PRE_ACTIVATE_FOUR_HUMANS" "${WEBSITE_PRE_ACTIVATE_PACKET:-}"
evidence_presence "SIGNED_WOLO_PRESTATE" "${WEBSITE_SIGNED_WOLO_PRESTATE:-}"
evidence_presence "SIGNED_WOLO_POSTSTAGE" "${WEBSITE_SIGNED_WOLO_POSTSTAGE:-}"
evidence_presence "STAGE_RECEIPT_EXACT_PATH" "${WEBSITE_STAGE_RECEIPT:-}"

sub "VPS SNAPSHOT - READ ONLY SSH"
out "SSH_TARGET" "$HOST"
ssh -T -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=yes "$HOST" 'bash -s' <<'REMOTE_READONLY'
set -uo pipefail
out() { printf '%-39s %s\n' "$1" "$2"; }
WEB="/var/www/AoE2HDBets/app-prodn"
out "REMOTE_ACCOUNT" "$(id -un 2>/dev/null || printf UNKNOWN) uid=$(id -u 2>/dev/null || printf UNKNOWN)"
out "REMOTE_UTC" "$(date -u +%FT%TZ)"
out "WEB_ROOT_EXISTS" "$(test -d "$WEB" && echo YES || echo NO)"
if [ -d "$WEB" ]; then
  out "REMOTE_GIT_HEAD" "$(git -c safe.directory="$WEB" -C "$WEB" rev-parse HEAD 2>/dev/null || printf UNAVAILABLE)"
  count="$(git -c safe.directory="$WEB" -C "$WEB" status --porcelain --untracked-files=all 2>/dev/null | wc -l | tr -d ' ')"
  out "REMOTE_GIT_DIRTY_COUNT" "$count"
  for key in ".next/BUILD_ID" ".next-release/BUILD_ID" ".aoe2war-build-version"; do
    if [ -f "$WEB/$key" ]; then
      value="$(head -c 120 "$WEB/$key" | tr -cd '[:alnum:]_-.' )"
      out "REMOTE_$key" "${value:-EMPTY}"
    else
      out "REMOTE_$key" "NOT_PRESENT"
    fi
  done
fi
out "WEB_SERVICE" "$(systemctl is-active aoe2hdbets-web.service 2>/dev/null || printf UNKNOWN)"
if command -v ss >/dev/null 2>&1; then
  listeners="$(ss -ltn 2>/dev/null || true)"
  for port in 8092 8093; do
    count="$(printf '%s\n' "$listeners" | awk -v port=":$port" '$4 ~ port"$" {n++} END{print n+0}')"
    out "WOLO_LISTENER_$port" "$count (expected 1)"
  done
else
  out "WOLO_LISTENERS" "ss utility unavailable"
fi
if command -v curl >/dev/null 2>&1; then
  if curl -fsS --max-time 8 http://127.0.0.1:3030/api/deployment-version >/dev/null 2>&1; then
    out "PASSIVE_INTERNAL_WEB_IDENTITY" "REACHABLE"
  else
    out "PASSIVE_INTERNAL_WEB_IDENTITY" "UNREACHABLE"
  fi
fi
out "WOLO_SOURCE_P1" "MUST_REMAIN_OPEN (diagnostic does not adjudicate)"
REMOTE_READONLY
rc=$?
out "SSH_READ_ONLY_RC" "$rc"
sub "DIAGNOSTIC COMPLETE - NEVER AUTHORIZES DEPLOYMENT"
out "PRODUCTION_PERMISSION" "HOLD unless independent validated signatures/witness and protected source-bound stage/activation receipts exist"
exit 0
