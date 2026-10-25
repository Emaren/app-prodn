#!/usr/bin/env bash
# Strictly read-only. No checkout/fetch/pull, systemctl writes, git config writes,
# signing, SSH secrets, private key material, DB access, wallet or balances.
set -uo pipefail

TARGET_MAIN="21cd1493b182cb0968a6b6cf3f528d0578cfd797"
CERT_PROD="a2b941f154fdc31ec4d6c4ece6d0e49036c48abd"
CANDIDATE="${WEBSITE_MAIN_REPO:-$HOME/projects/AoE2HDBets/app-prodn}"
CONTROLLER="${WEBSITE_CONTROLLER_REPO:-$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)}"
# A root diagnostic and canonical deploy principal are DIFFERENT identities.
# Ship is pinned to tony's dedicated git remote and restricted sudo.
HOST="${WEBSITE_SSH_TARGET:-root@hel1}"
RELEASE_HOST="${AOE2_RELEASE_HOST:-tony@hel1}"
GLOBAL_LOCK="/mnt/HC_Volume_105319120/aoe2war/os-control/locks/release.lock"
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
      count="$(find "$root/.aoe2war-release/stage-receipts" -type f -name '*.json' 2>/dev/null | wc -l | tr -d ' ')"
      out "STAGE_RECEIPT_FILES" "${count:-0} (validate exact receipt before using)"
    else
      out "STAGE_RECEIPT_FILES" "NONE"
    fi
    for name in gates manifests; do
      if [ -d "$root/.aoe2war-release/$name" ]; then
        count="$(find "$root/.aoe2war-release/$name" -type f -name '*.json' 2>/dev/null | wc -l | tr -d ' ')"
        out "LOCAL_$(printf "%s" "$name" | tr "[:lower:]" "[:upper:]")_FILES" "$count (NOT an approval)"
      else
        out "LOCAL_$(printf "%s" "$name" | tr "[:lower:]" "[:upper:]")_FILES" "NONE"
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

sub "MAC SIDE: CANONICAL DEPLOY SSH IDENTITY"
out "SSH_RELEASE_TARGET" "$RELEASE_HOST"
ssh_config="$(ssh -G "$RELEASE_HOST" 2>/dev/null || true)"
ssh_user="$(printf '%s\\n' "$ssh_config" | awk '$1=="user" {print $2;exit}')"
ssh_host="$(printf '%s\\n' "$ssh_config" | awk '$1=="hostname" {print $2;exit}')"
ssh_port="$(printf '%s\\n' "$ssh_config" | awk '$1=="port" {print $2;exit}')"
out "MAC_SSH_G_USER" "${ssh_user:-UNRESOLVED}"
out "MAC_SSH_G_HOST" "${ssh_host:-UNRESOLVED}"
out "MAC_SSH_G_PORT" "${ssh_port:-UNRESOLVED}"
if [ "$ssh_user" != "tony" ]; then
  out "RELEASE_SSH_IDENTITY" "HOLD (canonical VPS deploy executor must be tony)"
else
  out "RELEASE_SSH_IDENTITY" "SSH_CONFIG_TONY (requires actual remote authentication)"
fi
ssh -T -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=yes "$RELEASE_HOST" 'bash -s' <<'REMOTE_DEPLOY_READONLY'
set -uo pipefail
out() { printf '%-39s %s\\n' "$1" "$2"; }
out "RELEASE_REMOTE_USER" "$(id -un 2>/dev/null || echo UNKNOWN)"
out "RELEASE_REMOTE_UID" "$(id -u 2>/dev/null || echo UNKNOWN)"
LOCK="/mnt/HC_Volume_105319120/aoe2war/os-control/locks/release.lock"
PARENT="$(dirname "$LOCK")"
if [ -d "$PARENT" ] && [ -x "$PARENT" ]; then
  out "GLOBAL_LEASE_PARENT_TRAVERSABLE" "YES"
else
  out "GLOBAL_LEASE_PARENT_TRAVERSABLE" "NO"
fi
if [ -f "$LOCK" ]; then
  if [ -w "$LOCK" ]; then
    out "GLOBAL_LEASE_LOCK_WRITABLE" "YES"
  else
    out "GLOBAL_LEASE_LOCK_WRITABLE" "NO"
  fi
else
  out "GLOBAL_LEASE_LOCK_EXISTS" "NO (parent write access required)"
  if [ -w "$PARENT" ]; then
    out "GLOBAL_LEASE_PARENT_WRITABLE" "YES"
  else
    out "GLOBAL_LEASE_PARENT_WRITABLE" "NO"
  fi
fi
WEB="/var/www/AoE2HDBets/app-prodn"
if [ -d "$WEB" ]; then
  out "TONY_WEB_SOURCE_HEAD" "$(git -C "$WEB" rev-parse --verify HEAD 2>/dev/null || echo UNAVAILABLE)"
  if [ -w "$WEB/.git" ]; then
    out "TONY_WEB_GIT_WRITABLE" "YES"
  else
    out "TONY_WEB_GIT_WRITABLE" "NO"
  fi
fi
if sudo -n -l /usr/bin/systemctl stop aoe2hdbets-web.service >/dev/null 2>&1 &&
   sudo -n -l /usr/bin/systemctl start aoe2hdbets-web.service >/dev/null 2>&1 &&
   sudo -n -l /usr/bin/install >/dev/null 2>&1; then
  out "RESTRICTED_SUDO_RELEASE_PREFLIGHT" "YES (policy query only)"
else
  out "RESTRICTED_SUDO_RELEASE_PREFLIGHT" "NO (source-bound Ship will block)"
fi
REMOTE_DEPLOY_READONLY
out "RELEASE_REMOTE_SSH_RC" "$?"

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
      value="$(head -c 120 "$WEB/$key" | tr -cd '[:alnum:]_.-' )"
      out "REMOTE_$key" "${value:-EMPTY}"
    else
      out "REMOTE_$key" "NOT_PRESENT"
    fi
  done
fi
out "WEB_SERVICE" "$(systemctl is-active aoe2hdbets-web.service 2>/dev/null || true)"
# Report likely money-moving units only. Names/states are NOT proof that all
# financial producers are fenced; independent Source+Finance must certify that.
for unit in aoe2hdbets-bet-stake-reconcile.timer aoe2hdbets-bet-stake-reconcile.service; do
  state="$(systemctl is-active "$unit" 2>/dev/null || true)"
  enabled="$(systemctl is-enabled "$unit" 2>/dev/null || true)"
  out "FINANCIAL_UNIT_STATE" "$unit active=${state:-unknown} enabled=${enabled:-unknown}"
done
if command -v systemctl >/dev/null 2>&1; then
  systemctl list-units --all --type=service --type=timer --no-legend --plain 2>/dev/null \
    | awk 'tolower($1) ~ /(satchel|autobet|auto-bet|stake-reconcile|finance|bridge|wolo.*settle)/ {print $1, $3, $4}' \
    | head -n 20 \
    | while read -r unit active sub; do
        out "OTHER_FINANCE_RELATED_UNIT" "$unit active=$active sub=$sub"
      done
fi
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
