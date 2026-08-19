#!/usr/bin/env bash
# AoE2WAR Storage OS one-generation archive worker.
# Derived from proven B2B2 pilot:
# aae6f7f3c367a8a6f59c918b37ba2cafc6897cf25d18e6cc212373ca925420ae
set -euo pipefail

RELEASE="$1"
BUILD="$2"
GEN="$3"

APP="/var/www/AoE2HDBets/app-prodn"
VOL="/mnt/HC_Volume_105319120"
ROLL="$VOL/aoe2war/rollbacks"
ARCHROOT="$VOL/aoe2war/rollback-archives"
CONTROL="$VOL/aoe2war/os-control"
RECEIPTS="$CONTROL/rollback-archive-receipts"
VERIFYROOT="$CONTROL/rollback-archive-verify"
LOCK="$CONTROL/locks/rollback-archive.lock"

RUNNER="/usr/local/sbin/aoe2war-maintenance-run"
NODE="wolochaind-mainnet.service"
RPC="http://127.0.0.1:27657"

SOURCE="$ROLL/$GEN"
ARCHIVE="$ARCHROOT/$GEN.tar.zst"
MANIFEST="$ARCHROOT/$GEN.tree-manifest.jsonl"
VERIFIED_RECEIPT="$RECEIPTS/$GEN.verified.json"
REPLACED_RECEIPT="$RECEIPTS/$GEN.replaced.json"

GEN_RE='^activate-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}$'

height_now() {
  curl -fsS --max-time 4 "$RPC/status" \
    | python3 -c '
import json,sys
p=json.load(sys.stdin)
print(int(p["result"]["sync_info"]["latest_block_height"]))
'
}

block_epoch_now() {
  curl -fsS --max-time 4 "$RPC/status" \
    | python3 -c '
import json,sys
from datetime import datetime
p=json.load(sys.stdin)
value=p["result"]["sync_info"]["latest_block_time"].replace("Z","+00:00")
print(int(datetime.fromisoformat(value).timestamp()))
'
}

wolo_advancing() {
  local h1 h2 epoch age now
  h1="$(height_now)"
  sleep 6
  h2="$(height_now)"
  test "$h2" -gt "$h1"
  epoch="$(block_epoch_now)"
  now="$(date +%s)"
  age=$((now - epoch))
  test "$age" -le 20
  printf '%s %s %s\n' "$h1" "$h2" "$age"
}

assert_runtime() {
  cd "$APP"
  test "$(git rev-parse HEAD)" = "$RELEASE"
  test -z "$(git status --porcelain --untracked-files=all)"
  test "$(systemctl is-active aoe2hdbets-web.service)" = "active"
  test "$(cat .next/BUILD_ID)" = "$BUILD"
  test ! -e .next-release
  test ! -e .node_modules-release
  test "$(systemctl is-active "$NODE")" = "active"
  test "$(ss -ltn | grep -Ec ':8092[[:space:]]' || true)" = "1"
  test "$(ss -ltn | grep -Ec ':8093[[:space:]]' || true)" = "1"
}

echo
echo "-- Preflight runtime + safety rails --"

assert_runtime
test -x "$RUNNER"

pid_before="$(systemctl show "$NODE" -p MainPID --value)"
restart_before="$(systemctl show "$NODE" -p NRestarts --value)"
active_enter_before="$(
  systemctl show "$NODE" -p ActiveEnterTimestampMonotonic --value
)"

[[ "$pid_before" =~ ^[1-9][0-9]*$ ]]
test "$(systemctl show "$NODE" -p OOMScoreAdjust --value)" = "-900"
test "$(cat "/proc/$pid_before/oom_score_adj")" = "-900"

read -r pre_h1 pre_h2 pre_age < <(wolo_advancing)

echo "PASS: Wolo advancing $pre_h1 -> $pre_h2; block_age=${pre_age}s"
echo "Wolo PID=$pid_before NRestarts=$restart_before"

echo
echo "-- Generation eligibility --"

[[ "$GEN" =~ $GEN_RE ]]
test -d "$SOURCE"
test ! -L "$SOURCE"

mapfile -t generations < <(
  find "$ROLL" \
    -mindepth 1 -maxdepth 1 \
    -type d \
    -name 'activate-*' \
    -printf '%f\n' \
  | sort -r
)

test "${#generations[@]}" -ge 6

protected=("${generations[@]:0:5}")
printf 'Protected newest five:\n'
printf '  %s\n' "${protected[@]}"

for item in "${protected[@]}"; do
  if [ "$item" = "$GEN" ]; then
    echo "STOP: archive target is one of newest five protected generations"
    exit 1
  fi
done

if ! printf '%s\n' "${generations[@]}" | grep -Fqx "$GEN"; then
  echo "STOP: archive target is not an exact current durable rollback generation"
  exit 1
fi

test -d "$SOURCE/next"
test -d "$SOURCE/node_modules"
test -f "$SOURCE/source-sha"
test -f "$SOURCE/next/BUILD_ID"

source_sha="$(tr -d '[:space:]' < "$SOURCE/source-sha")"
source_build="$(tr -d '[:space:]' < "$SOURCE/next/BUILD_ID")"

[[ "$source_sha" =~ ^[0-9a-f]{40}$ ]]
[[ "$source_build" =~ ^[A-Za-z0-9_-]{1,256}$ ]]

DEPLOY_RECEIPT="$VOL/aoe2war/deploy-receipts/$GEN"
test -d "$DEPLOY_RECEIPT"
test ! -L "$DEPLOY_RECEIPT"

# The generation identifies the activation that CREATED this rollback.
# source-sha identifies the PRIOR runtime stored inside it. They differ by design.
if [ "$source_sha" = "$RELEASE" ]; then
  echo "STOP: refuses to archive current production source"
  exit 1
fi

for path in "$ARCHIVE" "$MANIFEST" "$VERIFIED_RECEIPT" "$REPLACED_RECEIPT"; do
  if [ -e "$path" ]; then
    echo "STOP: pilot evidence already exists unexpectedly: $path"
    exit 1
  fi
done

if findmnt -rn -R "$SOURCE" 2>/dev/null | grep -q .; then
  echo "STOP: source rollback contains or is a mountpoint; refuse replacement"
  findmnt -rn -R "$SOURCE" || true
  exit 1
fi

available_kb="$(df -Pk "$VOL" | awk 'NR==2 {print $4}')"
source_kb="$(du -skx "$SOURCE" | awk '{print $1}')"
needed_kb=$((source_kb + 2 * 1024 * 1024))

echo "Source:        $SOURCE"
echo "Source SHA:    $source_sha"
echo "Source build:  $source_build"
echo "Source size:   ${source_kb} KB"
echo "Available:     ${available_kb} KB"
echo "Archive floor: ${needed_kb} KB"

if [ "$available_kb" -lt "$needed_kb" ]; then
  echo "STOP: insufficient headroom for archive + isolated round-trip extraction"
  exit 1
fi

install -d -m 0755 "$ARCHROOT" "$RECEIPTS" "$VERIFYROOT" "$(dirname "$LOCK")"

exec 9>"$LOCK"
if ! flock -n 9; then
  echo "STOP: rollback archive lock is already held"
  exit 1
fi

TMPBASE="$VERIFYROOT/$GEN-$$"
EXTRACT_PARENT="$TMPBASE/extract"
EXTRACTED="$EXTRACT_PARENT/$GEN"
POST_MANIFEST="$TMPBASE/source-post.jsonl"
EXTRACT_MANIFEST="$TMPBASE/extracted.jsonl"
ARCHIVE_PARTIAL="$ARCHIVE.partial.$$"
MANIFEST_PARTIAL="$MANIFEST.partial.$$"

cleanup() {
  rm -f "$ARCHIVE_PARTIAL" "$MANIFEST_PARTIAL" "$POST_MANIFEST" "$EXTRACT_MANIFEST" 2>/dev/null || true
  rm -rf "$TMPBASE" 2>/dev/null || true
}
trap cleanup EXIT

mkdir -p "$EXTRACT_PARENT"

echo
echo "-- Tree-manifest helper --"

MANIFEST_HELPER="$TMPBASE/tree_manifest.py"
cat > "$MANIFEST_HELPER" <<'PY'
#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import os
import stat
import sys
from pathlib import Path

if len(sys.argv) != 3:
    raise SystemExit("usage: tree_manifest.py ROOT OUTPUT")

root = Path(sys.argv[1])
output = Path(sys.argv[2])

root_lstat = os.lstat(root)
if stat.S_ISLNK(root_lstat.st_mode) or not stat.S_ISDIR(root_lstat.st_mode):
    raise SystemExit(f"unsafe manifest root: {root}")

def file_sha(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

def row_for(path: Path, rel: str) -> dict[str, object]:
    st = os.lstat(path)
    mode = stat.S_IMODE(st.st_mode)
    base: dict[str, object] = {
        "path": rel,
        "mode": mode,
        "uid": st.st_uid,
        "gid": st.st_gid,
    }
    if stat.S_ISDIR(st.st_mode):
        base["type"] = "dir"
    elif stat.S_ISREG(st.st_mode):
        base["type"] = "file"
        base["size"] = st.st_size
        base["sha256"] = file_sha(path)
    elif stat.S_ISLNK(st.st_mode):
        base["type"] = "symlink"
        base["target"] = os.readlink(path)
    else:
        raise SystemExit(f"refusing special filesystem entry: {path}")
    return base

with output.open("w", encoding="utf-8", newline="\n") as out:
    out.write(json.dumps(row_for(root, "."), sort_keys=True, separators=(",", ":")) + "\n")
    stack: list[tuple[Path, str]] = [(root, "")]
    while stack:
        directory, prefix = stack.pop()
        entries = sorted(os.scandir(directory), key=lambda e: e.name, reverse=True)
        dirs: list[tuple[Path, str]] = []
        for entry in entries:
            child = Path(entry.path)
            rel = f"{prefix}/{entry.name}" if prefix else entry.name
            out.write(json.dumps(row_for(child, rel), sort_keys=True, separators=(",", ":")) + "\n")
            st = entry.stat(follow_symlinks=False)
            if stat.S_ISDIR(st.st_mode):
                dirs.append((child, rel))
        stack.extend(dirs)
PY
chmod 0755 "$MANIFEST_HELPER"

echo
echo "-- A. Generate canonical source tree manifest inside bounded runner --"

"$RUNNER" rollback-manifest-one -- \
  "$MANIFEST_HELPER" "$SOURCE" "$MANIFEST_PARTIAL"

test -s "$MANIFEST_PARTIAL"
manifest_sha="$(sha256sum "$MANIFEST_PARTIAL" | awk '{print $1}')"
manifest_lines="$(wc -l < "$MANIFEST_PARTIAL" | tr -d ' ')"

echo "Source manifest SHA: $manifest_sha"
echo "Source manifest rows: $manifest_lines"

echo
echo "-- B. Create zstd archive inside bounded runner --"

"$RUNNER" rollback-archive-one -- \
  /bin/bash -c '
    set -euo pipefail
    roll="$1"
    gen="$2"
    out="$3"
    tar \
      --numeric-owner \
      --acls \
      --xattrs \
      --one-file-system \
      -C "$roll" \
      -cf - "$gen" \
    | zstd -q -T1 -3 -c > "$out"
    test -s "$out"
  ' bash "$ROLL" "$GEN" "$ARCHIVE_PARTIAL"

test -s "$ARCHIVE_PARTIAL"

archive_bytes="$(stat -c '%s' "$ARCHIVE_PARTIAL")"
archive_sha="$(sha256sum "$ARCHIVE_PARTIAL" | awk '{print $1}')"

echo "Archive bytes:  $archive_bytes"
echo "Archive SHA256: $archive_sha"

echo
echo "-- C. Compressed-stream integrity test inside bounded runner --"

"$RUNNER" rollback-zstd-test -- \
  zstd -q -T1 -t "$ARCHIVE_PARTIAL"

echo
echo "-- D. Validate archive member namespace =="

"$RUNNER" rollback-member-check -- \
  /bin/bash -c '
    set -euo pipefail
    archive="$1"
    gen="$2"
    zstd -q -dc "$archive" \
      | tar -tf - \
      | python3 -c "
import sys
gen=sys.argv[1]
prefix=gen + \"/\"
count=0
for raw in sys.stdin:
    name=raw.rstrip(\"\\n\")
    count += 1
    if name == gen or name == prefix:
        continue
    if name.startswith(\"/\") or \"../\" in name or not name.startswith(prefix):
        raise SystemExit(f\"unsafe archive member: {name!r}\")
if count == 0:
    raise SystemExit(\"archive contains no members\")
print(f\"PASS: {count} archive members confined to {gen}\")
" "$gen"
  ' bash "$ARCHIVE_PARTIAL" "$GEN"

echo
echo "-- E. Isolated extraction inside bounded runner --"

"$RUNNER" rollback-extract-one -- \
  /bin/bash -c '
    set -euo pipefail
    archive="$1"
    destination="$2"
    zstd -q -dc "$archive" \
      | tar \
          --numeric-owner \
          --acls \
          --xattrs \
          -C "$destination" \
          -xf -
  ' bash "$ARCHIVE_PARTIAL" "$EXTRACT_PARENT"

test -d "$EXTRACTED"
test ! -L "$EXTRACTED"

echo
echo "-- F. Generate extracted tree manifest inside bounded runner --"

"$RUNNER" rollback-extracted-manifest -- \
  "$MANIFEST_HELPER" "$EXTRACTED" "$EXTRACT_MANIFEST"

test -s "$EXTRACT_MANIFEST"

extracted_manifest_sha="$(
  sha256sum "$EXTRACT_MANIFEST" | awk '{print $1}'
)"
test "$extracted_manifest_sha" = "$manifest_sha"

cmp -s "$MANIFEST_PARTIAL" "$EXTRACT_MANIFEST"

test "$(tr -d '[:space:]' < "$EXTRACTED/source-sha")" = "$source_sha"
test "$(tr -d '[:space:]' < "$EXTRACTED/next/BUILD_ID")" = "$source_build"

echo "PASS: extracted rollback is byte/content/ownership/mode equivalent"

echo
echo "-- G. Re-hash live source AFTER archive/extract to reject races --"

"$RUNNER" rollback-source-recheck -- \
  "$MANIFEST_HELPER" "$SOURCE" "$POST_MANIFEST"

test -s "$POST_MANIFEST"
cmp -s "$MANIFEST_PARTIAL" "$POST_MANIFEST"

echo "PASS: source tree did not change during archival proof"

echo
echo "-- H. Wolo + runtime recheck BEFORE replacement --"

assert_runtime

pid_mid="$(systemctl show "$NODE" -p MainPID --value)"
restart_mid="$(systemctl show "$NODE" -p NRestarts --value)"
active_enter_mid="$(
  systemctl show "$NODE" -p ActiveEnterTimestampMonotonic --value
)"

test "$pid_mid" = "$pid_before"
test "$restart_mid" = "$restart_before"
test "$active_enter_mid" = "$active_enter_before"
test "$(cat "/proc/$pid_mid/oom_score_adj")" = "-900"

read -r mid_h1 mid_h2 mid_age < <(wolo_advancing)

echo "PASS: Wolo never restarted and advances $mid_h1 -> $mid_h2"

echo
echo "-- I. Publish immutable archive + manifest atomically --"

mv "$ARCHIVE_PARTIAL" "$ARCHIVE"
mv "$MANIFEST_PARTIAL" "$MANIFEST"

chmod 0444 "$ARCHIVE" "$MANIFEST"
chown root:root "$ARCHIVE" "$MANIFEST"

test "$(sha256sum "$ARCHIVE" | awk '{print $1}')" = "$archive_sha"
test "$(sha256sum "$MANIFEST" | awk '{print $1}')" = "$manifest_sha"

verified_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

python3 - \
  "$VERIFIED_RECEIPT" \
  "$GEN" \
  "$SOURCE" \
  "$ARCHIVE" \
  "$MANIFEST" \
  "$source_sha" \
  "$source_build" \
  "$source_kb" \
  "$archive_bytes" \
  "$archive_sha" \
  "$manifest_sha" \
  "$manifest_lines" \
  "$RELEASE" \
  "$BUILD" \
  "$pid_before" \
  "$restart_before" \
  "$pre_h2" \
  "$mid_h2" \
  "$verified_at" <<'PY'
import json
import os
import sys
from pathlib import Path

(
    receipt,
    generation,
    source_path,
    archive_path,
    manifest_path,
    source_sha,
    source_build,
    source_kb,
    archive_bytes,
    archive_sha,
    manifest_sha,
    manifest_lines,
    release,
    build,
    wolo_pid,
    wolo_restarts,
    wolo_height_before,
    wolo_height_verified,
    verified_at,
) = sys.argv[1:]

payload = {
    "schema": 1,
    "kind": "aoe2war-durable-rollback-archive",
    "status": "VERIFIED_ARCHIVE_READY",
    "generation": generation,
    "source_path": source_path,
    "source_sha": source_sha,
    "source_build_id": source_build,
    "original_allocated_kb": int(source_kb),
    "archive_path": archive_path,
    "archive_bytes": int(archive_bytes),
    "archive_sha256": archive_sha,
    "tree_manifest_path": manifest_path,
    "tree_manifest_sha256": manifest_sha,
    "tree_manifest_rows": int(manifest_lines),
    "round_trip_extract_verified": True,
    "round_trip_manifest_exact": True,
    "certified_release_during_operation": release,
    "certified_build_during_operation": build,
    "wolo_pid": int(wolo_pid),
    "wolo_restart_counter": int(wolo_restarts),
    "wolo_height_before": int(wolo_height_before),
    "wolo_height_verified": int(wolo_height_verified),
    "wolo_mutated": False,
    "verified_at": verified_at,
    "restore_procedure": (
        f"mkdir -p <destination> && zstd -q -dc {archive_path} | "
        f"tar --numeric-owner --acls --xattrs -C <destination> -xf -"
    ),
}

path = Path(receipt)
tmp = path.with_name(path.name + f".partial.{os.getpid()}")
tmp.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")
os.chmod(tmp, 0o444)
os.replace(tmp, path)
print("VERIFIED_RECEIPT=" + str(path))
PY

test -f "$VERIFIED_RECEIPT"
test "$(stat -c '%a' "$VERIFIED_RECEIPT")" = "444"

echo "PASS: immutable VERIFIED_ARCHIVE_READY receipt sealed"

echo
echo "-- J. Delete ONLY the proven expanded generation through bounded runner --"

# Exact path identity and mount safety immediately before deletion.
test "$SOURCE" = "$ROLL/$GEN"
test -d "$SOURCE"
test ! -L "$SOURCE"
if findmnt -rn -R "$SOURCE" 2>/dev/null | grep -q .; then
  echo "STOP: source became a mountpoint before replacement"
  exit 1
fi

"$RUNNER" rollback-replace-one -- \
  /bin/rm -rf -- "$SOURCE"

test ! -e "$SOURCE"
test -f "$ARCHIVE"
test -f "$MANIFEST"
test -f "$VERIFIED_RECEIPT"
test "$(sha256sum "$ARCHIVE" | awk '{print $1}')" = "$archive_sha"
test "$(sha256sum "$MANIFEST" | awk '{print $1}')" = "$manifest_sha"

echo "PASS: exactly one expanded generation replaced by verified archive"

echo
echo "-- K. Final Wolo/runtime proof + replacement receipt --"

assert_runtime

pid_after="$(systemctl show "$NODE" -p MainPID --value)"
restart_after="$(systemctl show "$NODE" -p NRestarts --value)"
active_enter_after="$(
  systemctl show "$NODE" -p ActiveEnterTimestampMonotonic --value
)"

test "$pid_after" = "$pid_before"
test "$restart_after" = "$restart_before"
test "$active_enter_after" = "$active_enter_before"
test "$(cat "/proc/$pid_after/oom_score_adj")" = "-900"

read -r post_h1 post_h2 post_age < <(wolo_advancing)

archive_kb="$(( (archive_bytes + 1023) / 1024 ))"
reclaimed_kb=$((source_kb - archive_kb))
free_after_kb="$(df -Pk "$VOL" | awk 'NR==2 {print $4}')"
used_after_pct="$(df -P "$VOL" | awk 'NR==2 {gsub("%","",$5); print $5}')"

replaced_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

python3 - \
  "$REPLACED_RECEIPT" \
  "$VERIFIED_RECEIPT" \
  "$GEN" \
  "$ARCHIVE" \
  "$archive_sha" \
  "$MANIFEST" \
  "$manifest_sha" \
  "$source_kb" \
  "$archive_kb" \
  "$reclaimed_kb" \
  "$free_after_kb" \
  "$used_after_pct" \
  "$pid_after" \
  "$restart_after" \
  "$post_h2" \
  "$replaced_at" <<'PY'
import hashlib
import json
import os
import sys
from pathlib import Path

(
    receipt,
    verified_receipt,
    generation,
    archive_path,
    archive_sha,
    manifest_path,
    manifest_sha,
    original_kb,
    archive_kb,
    reclaimed_kb,
    free_after_kb,
    used_after_pct,
    wolo_pid,
    wolo_restarts,
    wolo_height_after,
    replaced_at,
) = sys.argv[1:]

verified_sha = hashlib.sha256(Path(verified_receipt).read_bytes()).hexdigest()

payload = {
    "schema": 1,
    "kind": "aoe2war-durable-rollback-archive-replacement",
    "status": "REPLACED_BY_VERIFIED_ARCHIVE",
    "generation": generation,
    "verified_receipt_path": verified_receipt,
    "verified_receipt_sha256": verified_sha,
    "archive_path": archive_path,
    "archive_sha256": archive_sha,
    "tree_manifest_path": manifest_path,
    "tree_manifest_sha256": manifest_sha,
    "original_allocated_kb": int(original_kb),
    "archive_allocated_estimate_kb": int(archive_kb),
    "reclaimed_estimate_kb": int(reclaimed_kb),
    "volume_free_after_kb": int(free_after_kb),
    "volume_used_percent_after": int(used_after_pct),
    "wolo_pid": int(wolo_pid),
    "wolo_restart_counter": int(wolo_restarts),
    "wolo_height_after": int(wolo_height_after),
    "wolo_mutated": False,
    "expanded_generation_present_after": False,
    "replaced_at": replaced_at,
}

path = Path(receipt)
tmp = path.with_name(path.name + f".partial.{os.getpid()}")
tmp.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")
os.chmod(tmp, 0o444)
os.replace(tmp, path)
print("REPLACED_RECEIPT=" + str(path))
PY

test -f "$REPLACED_RECEIPT"
test "$(stat -c '%a' "$REPLACED_RECEIPT")" = "444"

echo
echo "============================================================"
echo "PASS: ONE-GENERATION ARCHIVE TRANSACTION COMPLETE"
echo "============================================================"
echo "Generation:       $GEN"
echo "Source SHA:       $source_sha"
echo "Build ID:         $source_build"
echo "Original:         ${source_kb} KB"
echo "Archive:          $archive_bytes bytes"
echo "Archive SHA256:   $archive_sha"
echo "Manifest SHA256:  $manifest_sha"
echo "Reclaimed est.:   ${reclaimed_kb} KB"
echo "Volume after:     ${used_after_pct}% used · ${free_after_kb} KB free"
echo "Wolo:             PID unchanged · restarts unchanged"
echo "Wolo height:      $post_h1 -> $post_h2 · ADVANCING"
echo "Verified receipt: $VERIFIED_RECEIPT"
echo "Replace receipt:  $REPLACED_RECEIPT"
echo "============================================================"
echo
echo "IMPORTANT: exactly one generation was processed."
echo "Storage OS must re-plan before any next transaction."