#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import shlex
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from aoe2_release_gate import ROOT, sha256_file
from aoe2_release_ship import (
    PUBLIC,
    PROD_HOST,
    PROD_REPO,
    SERVICE,
    gate_integrity,
    load_manifest,
    production_transport,
    validation_errors,
)

STAGE_RECEIPT_DIR = ROOT / ".aoe2war-release" / "stage-receipts"
REMOTE_RECEIPT_ROOT = "/mnt/HC_Volume_105319120/aoe2war/deploy-receipts"
BUILD_SANDBOX_UNIT_SOURCE = ROOT / "deploy" / "aoe2war-build@.service"
BUILD_SANDBOX_UNIT = "/etc/systemd/system/aoe2war-build@.service"
DEPS_SANDBOX_UNIT_SOURCE = ROOT / "deploy" / "aoe2war-deps@.service"
DEPS_SANDBOX_UNIT = "/etc/systemd/system/aoe2war-deps@.service"


class StageError(RuntimeError):
    pass


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def run(
    args: list[str],
    *,
    timeout: int = 1800,
) -> subprocess.CompletedProcess:
    return subprocess.run(
        args,
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=timeout,
        check=False,
    )


def parse_kv(text: str) -> dict[str, str]:
    result: dict[str, str] = {}
    for line in text.splitlines():
        if "\t" in line:
            key, value = line.split("\t", 1)
            result[key] = value
    return result


def remote_stage_script(
    *,
    release_sha: str,
    previous_sha: str,
    manifest_sha: str,
    gate_sha: str,
    receipt_dir: str,
    manifest_text: str = "",
    gate_text: str = "",
) -> str:
    q = shlex.quote
    build_unit_sha = sha256_file(BUILD_SANDBOX_UNIT_SOURCE)
    deps_unit_sha = sha256_file(DEPS_SANDBOX_UNIT_SOURCE)
    return f"""
set -Eeuo pipefail
cd {q(PROD_REPO)}

RELEASE={q(release_sha)}
PREVIOUS={q(previous_sha)}
MANIFEST_SHA={q(manifest_sha)}
GATE_SHA={q(gate_sha)}
RECEIPT={q(receipt_dir)}
BUILD_UNIT_TEMPLATE={q(BUILD_SANDBOX_UNIT)}
BUILD_UNIT_SHA={q(build_unit_sha)}
DEPS_UNIT_TEMPLATE={q(DEPS_SANDBOX_UNIT)}
DEPS_UNIT_SHA={q(deps_unit_sha)}
SERVICE={q(SERVICE)}
PUBLIC={q(PUBLIC)}
LIVE_REPO={q(PROD_REPO)}
MANIFEST_CONTENT={q(manifest_text)}
GATE_CONTENT={q(gate_text)}

mutation_started=0
build_parent=""
build_worktree=""

# Runtime bundles are deployment state, not source state. This filtering must
# work even while production is still checked out at a commit whose .gitignore
# predates the dependency-bundle release lane.
source_status() {{
  git status --porcelain=v1 --untracked-files=normal -- . \
    ':(exclude).next-release' \
    ':(exclude).next-release/**' \
    ':(exclude).node_modules-release' \
    ':(exclude).node_modules-release/**' \
    ':(exclude).next-rollback*' \
    ':(exclude).next-rollback*/**' \
    ':(exclude).node_modules-rollback*' \
    ':(exclude).node_modules-rollback*/**'
}}

cleanup_build_worktree() {{
  if [ -n "$build_worktree" ] && [ -d "$build_worktree" ]; then
    git worktree remove --force "$build_worktree" >/dev/null 2>&1 || true
    if [ -e "$build_worktree" ]; then
      rm -rf -- "$build_worktree" >/dev/null 2>&1 || true
    fi
  fi
  if [ -n "$build_parent" ] && [ -d "$build_parent" ]; then
    rm -rf -- "$build_parent" >/dev/null 2>&1 || true
  fi
  git worktree prune >/dev/null 2>&1 || true
}}

restore_stage_failure() {{
  rc="$?"
  cleanup_build_worktree
  if [ "$rc" -ne 0 ]; then
    if [ "$mutation_started" = "1" ]; then
      rm -rf .next-release .node_modules-release
      printf 'recovery\tRESTORED\n'
      printf 'status=FAILED\nexit_code=%s\nsource_unchanged=%s\n' \
        "$rc" "$(git rev-parse HEAD 2>/dev/null || true)" \
        > "$RECEIPT/stage-status.txt" || true
    else
      printf 'recovery\tNOT_REQUIRED\n'
    fi
  fi
  exit "$rc"
}}
trap restore_stage_failure EXIT

sudo -n /usr/bin/install -d -o tony -g tony -m 0750 "$RECEIPT"
printf '%s' "$MANIFEST_CONTENT" > "$RECEIPT/release-manifest.json"
printf '%s' "$GATE_CONTENT" > "$RECEIPT/gate-receipt.json"
test "$(sha256sum "$RECEIPT/release-manifest.json" | awk '{{print $1}}')" = "$MANIFEST_SHA"
test "$(sha256sum "$RECEIPT/gate-receipt.json" | awk '{{print $1}}')" = "$GATE_SHA"

before_head="$(git rev-parse HEAD)"
before_branch="$(git branch --show-current)"
before_dirty="$(source_status | wc -l | tr -d ' ')"
before_service="$(systemctl is-active "$SERVICE" || true)"
before_active_build="$(cat .next/BUILD_ID 2>/dev/null || true)"
before_internal="$(curl -fsS --max-time 6 http://127.0.0.1:3030/api/deployment-version)"
before_public="$(curl -fsS --max-time 8 "$PUBLIC/api/deployment-version")"
before_wolo8092="$(ss -ltn | grep -Ec ':8092[[:space:]]' || true)"
before_wolo8093="$(ss -ltn | grep -Ec ':8093[[:space:]]' || true)"
origin="$(git remote get-url origin)"
protocol="$(git config --local --get protocol.version || true)"
sshcmd="$(git config --local --get core.sshCommand || true)"
before_build_version_file="$(cat .aoe2war-build-version 2>/dev/null | tr -d '\\r\\n')"

printf '%s\n' \
  "release_sha=$RELEASE" \
  "previous_sha=$PREVIOUS" \
  "manifest_sha256=$MANIFEST_SHA" \
  "gate_sha256=$GATE_SHA" \
  "before_head=$before_head" \
  "before_branch=$before_branch" \
  "before_dirty=$before_dirty" \
  "before_service=$before_service" \
  "before_active_build=$before_active_build" \
  "before_internal=$before_internal" \
  "before_public=$before_public" \
  "before_wolo8092=$before_wolo8092" \
  "before_wolo8093=$before_wolo8093" \
  "before_build_version_file=$before_build_version_file" \
  "origin=$origin" \
  "protocol=$protocol" \
  "sshcmd=$sshcmd" \
  > "$RECEIPT/prestage.txt"


test "$before_head" = "$PREVIOUS"
test "$before_dirty" = "0"
test "$before_service" = "active"
test -n "$before_active_build"
test "$before_build_version_file" = "$(
  printf '%s' "$before_internal" |
    python3 -c 'import json,sys; print(json.load(sys.stdin).get("buildVersion",""))'
)"
test "$before_wolo8092" = "1"
test "$before_wolo8093" = "1"
test ! -e .next-release
test ! -e .node_modules-release

git fetch origin --prune
remote_main="$(git rev-parse origin/main)"
test "$remote_main" = "$RELEASE"
# Dependency changes are supported by staging a fresh candidate-owned tree.
# Policy: yarn install --frozen-lockfile; network fetch executes with
# --ignore-scripts, while lifecycle scripts run only in the offline sandbox.
dependency_contract() {{
  git show "$1:package.json" | python3 -c '
import json,sys
p=json.load(sys.stdin)
keys=("dependencies","devDependencies","optionalDependencies","peerDependencies","packageManager")
print(json.dumps({{key:p.get(key) for key in keys}},sort_keys=True,separators=(",",":")))
'
}}
previous_dependency_contract="$(dependency_contract "$PREVIOUS")"
release_dependency_contract="$(dependency_contract "$RELEASE")"
if [ "$previous_dependency_contract" = "$release_dependency_contract" ]; then
  dependency_contract_unchanged=1
else
  dependency_contract_unchanged=0
fi
if git diff --quiet "$PREVIOUS" "$RELEASE" -- yarn.lock; then
  dependency_lock_changed=0
else
  dependency_lock_changed=1
fi
test "$(yarn --version)" = "1.22.22"
command -v rsync >/dev/null
test -f "$BUILD_UNIT_TEMPLATE"
test "$(sha256sum "$BUILD_UNIT_TEMPLATE" | awk '{{print $1}}')" = "$BUILD_UNIT_SHA"
test -f "$DEPS_UNIT_TEMPLATE"
test "$(sha256sum "$DEPS_UNIT_TEMPLATE" | awk '{{print $1}}')" = "$DEPS_UNIT_SHA"

grep -F -- "--frozen-lockfile --ignore-scripts" "$DEPS_UNIT_TEMPLATE" >/dev/null
grep -F -- "--frozen-lockfile --offline --force" "$BUILD_UNIT_TEMPLATE" >/dev/null
grep -Fx "PrivateNetwork=yes" "$BUILD_UNIT_TEMPLATE" >/dev/null
grep -Fx "InaccessiblePaths=/etc/aoe2hdbets" "$DEPS_UNIT_TEMPLATE" >/dev/null
grep -Fx "InaccessiblePaths=/mnt/HC_Volume_105319120" "$DEPS_UNIT_TEMPLATE" >/dev/null

YARN_RUNTIME=/home/tony/.cache/node/corepack/v1/yarn/1.22.22
test -f "$YARN_RUNTIME/bin/yarn.js"
test "$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' "$YARN_RUNTIME/package.json")" = "1.22.22"

# Fail closed before creating candidate worktrees or fetching dependencies.
# Free-space policy reserves two live dependency-tree equivalents plus 1 GiB
# for candidate materialization, Yarn cache, build output, and staging overhead.
test -d "$LIVE_REPO/node_modules"
live_dependency_kb="$(du -sk "$LIVE_REPO/node_modules" | awk '{{print $1}}')"
root_available_kb="$(df -Pk "$LIVE_REPO" | awk 'NR==2 {{print $4}}')"
test "$live_dependency_kb" -gt 0
test "$root_available_kb" -gt 0
root_required_kb=$((live_dependency_kb * 2 + 1048576))

printf '%s\n' \
  "live_dependency_kb=$live_dependency_kb" \
  "root_available_kb=$root_available_kb" \
  "root_required_kb=$root_required_kb" \
  > "$RECEIPT/disk-preflight.txt"

test "$root_available_kb" -ge "$root_required_kb"

build_parent="$(mktemp -d {q('/var/www/AoE2HDBets/.aoe2war-stage-XXXXXX')})"
build_worktree="$(mktemp -d /tmp/aoe2war-stage-XXXXXXXXXX)"
# Next embeds absolute project paths in several runtime manifests. Use an
# equal-length disposable path so binary-safe relocation cannot shift offsets.
test "${{#build_worktree}}" = "${{#LIVE_REPO}}"
rmdir "$build_worktree"
git worktree add --detach "$build_worktree" "$RELEASE" \
  > "$RECEIPT/worktree-add.log" 2>&1
test "$(git -C "$build_worktree" rev-parse HEAD)" = "$RELEASE"

# Candidate dependencies are fetched from the exact release lock in a
# root-defined sandbox with network access but lifecycle scripts disabled.
# The fetch-created node_modules tree is discarded; the build sandbox then
# rematerializes the exact tree offline with lifecycle scripts enabled.
cp -a "$YARN_RUNTIME" "$build_worktree/.yarn-runtime"
install -d -m 0700 \
  "$build_worktree/.sandbox-home" \
  "$build_worktree/.sandbox-home/.config" \
  "$build_worktree/.sandbox-home/.cache" \
  "$build_worktree/.tmp" \
  "$build_worktree/.yarn-cache"

build_instance="${{build_worktree#/tmp/aoe2war-stage-}}"
[[ "$build_instance" =~ ^[A-Za-z0-9]{{10}}$ ]]
deps_unit="aoe2war-deps@${{build_instance}}.service"
build_unit="aoe2war-build@${{build_instance}}.service"

# Authorization probes only; execution is performed by the separate calls below.
sudo -n -l /usr/bin/systemctl start --wait "$deps_unit" >/dev/null
sudo -n -l /usr/bin/systemctl start --wait "$build_unit" >/dev/null

sudo -n /usr/bin/systemctl reset-failed "$deps_unit" >/dev/null 2>&1 || true
deps_started_epoch="$(date +%s)"
if ! sudo -n /usr/bin/systemctl start --wait "$deps_unit"; then
  sudo -n /usr/bin/journalctl -u "$deps_unit" \
    --since "@$deps_started_epoch" --no-pager -o cat \
    > "$RECEIPT/dependency-fetch.log" 2>&1 || true
  exit 42
fi
sudo -n /usr/bin/journalctl -u "$deps_unit" \
  --since "@$deps_started_epoch" --no-pager -o cat \
  > "$RECEIPT/dependency-fetch.log" 2>&1
test "$(systemctl show "$deps_unit" -p Result --value)" = "success"
test "$(systemctl show "$deps_unit" -p ExecMainStatus --value)" = "0"
test -d "$build_worktree/node_modules"

# Never trust/use the network-phase materialization as the runtime tree.
rm -rf "$build_worktree/node_modules"
test ! -e "$build_worktree/node_modules"

sudo -n /usr/bin/systemctl reset-failed "$build_unit" >/dev/null 2>&1 || true
build_started_epoch="$(date +%s)"
if ! sudo -n /usr/bin/systemctl start --wait "$build_unit"; then
  sudo -n /usr/bin/journalctl -u "$build_unit" \
    --since "@$build_started_epoch" --no-pager -o cat \
    > "$RECEIPT/build.log" 2>&1 || true
  exit 43
fi
sudo -n /usr/bin/journalctl -u "$build_unit" \
  --since "@$build_started_epoch" --no-pager -o cat \
  > "$RECEIPT/build.log" 2>&1
test "$(systemctl show "$build_unit" -p Result --value)" = "success"
test "$(systemctl show "$build_unit" -p ExecMainStatus --value)" = "0"
test -d "$build_worktree/node_modules"

test -f "$build_worktree/.next-release/BUILD_ID"
test -f "$build_worktree/.aoe2war-build-version"

# Next's build cache is rebuildable and is never part of a staged or durable
# rollback runtime. Removing it before hashing makes the receipt bind the exact
# cache-free artifact that activation will consume.
rm -rf "$build_worktree/.next-release/cache"
test ! -e "$build_worktree/.next-release/cache"

# Relocate every embedded disposable-worktree path to the canonical live path
# before hashing. Equal byte lengths keep binary/source-map offsets stable.
relocated_files="$(
  python3 - "$build_worktree/.next-release" "$build_worktree" "$LIVE_REPO" <<'PY'
import os
import sys
from pathlib import Path

root = Path(sys.argv[1])
old_text = sys.argv[2]
new_text = sys.argv[3]
old = old_text.encode()
new = new_text.encode()
if len(old) != len(new):
    raise SystemExit("artifact relocation paths differ in byte length")

changed = 0
for path in root.rglob("*"):
    if path.is_symlink():
        target = os.readlink(path)
        if old_text in target:
            path.unlink()
            path.symlink_to(target.replace(old_text, new_text))
            changed += 1
        continue
    if not path.is_file():
        continue
    data = path.read_bytes()
    if old in data:
        path.write_bytes(data.replace(old, new))
        changed += 1

for path in root.rglob("*"):
    if path.is_symlink():
        if old_text in os.readlink(path):
            raise SystemExit("embedded worktree path remains in artifact symlink")
        continue
    if path.is_file() and old in path.read_bytes():
        raise SystemExit("embedded worktree path remains in artifact file")

print(changed)
PY
)"
test "$relocated_files" -ge 1

staged_build="$(cat "$build_worktree/.next-release/BUILD_ID")"
candidate_version="$(cat "$build_worktree/.aoe2war-build-version" | tr -d '\r\n')"
stage_copy="$build_parent/live-next-release"
mkdir "$stage_copy"
rsync -a --delete "$build_worktree/.next-release/" "$stage_copy/"
test ! -e "$stage_copy/cache"
artifact_sha="$(
  tar \
    --sort=name \
    --mtime='UTC 1970-01-01' \
    --owner=0 \
    --group=0 \
    --numeric-owner \
    -C "$stage_copy" -cf - . \
  | sha256sum \
  | awk '{{print $1}}'
)"

candidate_node_modules_sha="$(
  tar \
    --sort=name \
    --mtime='UTC 1970-01-01' \
    --owner=0 \
    --group=0 \
    --numeric-owner \
    -C "$build_worktree/node_modules" -cf - . \
  | sha256sum \
  | awk '{{print $1}}'
)"
candidate_node_modules_kb="$(du -sk "$build_worktree/node_modules" | awk '{{print $1}}')"
test "${{#candidate_node_modules_sha}}" = "64"
test "$candidate_node_modules_kb" -gt 0

mutation_started=1
mv "$build_worktree/node_modules" .node_modules-release
mv "$stage_copy" .next-release

test -d .node_modules-release
test "$(cat .next-release/BUILD_ID)" = "$staged_build"
test ! -e .next-release/cache

cleanup_build_worktree
build_parent=""
build_worktree=""

after_head="$(git rev-parse HEAD)"
after_dirty="$(source_status | wc -l | tr -d ' ')"
after_service="$(systemctl is-active "$SERVICE" || true)"
after_active_build="$(cat .next/BUILD_ID 2>/dev/null || true)"
after_internal="$(curl -fsS --max-time 6 http://127.0.0.1:3030/api/deployment-version)"
after_public="$(curl -fsS --max-time 8 "$PUBLIC/api/deployment-version")"
after_wolo8092="$(ss -ltn | grep -Ec ':8092[[:space:]]' || true)"
after_wolo8093="$(ss -ltn | grep -Ec ':8093[[:space:]]' || true)"
after_build_version_file="$(cat .aoe2war-build-version 2>/dev/null | tr -d '\\r\\n')"

test "$after_head" = "$PREVIOUS"
test "$after_dirty" = "0"
test "$after_service" = "active"
test "$after_active_build" = "$before_active_build"
test "$after_internal" = "$before_internal"
test "$after_public" = "$before_public"
test "$after_wolo8092" = "$before_wolo8092"
test "$after_wolo8093" = "$before_wolo8093"
test "$after_build_version_file" = "$before_build_version_file"
test -n "$staged_build"
test -n "$candidate_version"
test -n "$artifact_sha"
test -n "$candidate_node_modules_sha"

printf '%s\n' \
  "status=STAGED" \
  "release_sha=$RELEASE" \
  "previous_sha=$PREVIOUS" \
  "source_sha=$after_head" \
  "active_build_id=$after_active_build" \
  "staged_build_id=$staged_build" \
  "live_build_version=$(
    printf '%s' "$after_internal" |
      python3 -c 'import json,sys; print(json.load(sys.stdin).get("buildVersion",""))'
  )" \
  "candidate_build_version=$candidate_version" \
  "artifact_sha256=$artifact_sha" \
  "candidate_node_modules_sha256=$candidate_node_modules_sha" \
  "candidate_node_modules_kb=$candidate_node_modules_kb" \
  "service=$after_service" \
  "wolo8092=$after_wolo8092" \
  "wolo8093=$after_wolo8093" \
  "isolated_worktree=1" \
  "build_process_sandboxed=1" \
  "build_network_private=1" \
  "build_secret_paths_inaccessible=1" \
  "dependency_fetch_sandboxed=1" \
  "dependency_fetch_scripts_disabled=1" \
  "dependency_build_offline=1" \
  "dependency_contract_unchanged=$dependency_contract_unchanged" \
  "dependency_lock_changed=$dependency_lock_changed" \
  "cache_free_artifact=1" \
  "artifact_path_relocated=1" \
  "live_source_mutated=0" \
  "live_public_mutated=0" \
  "live_node_modules_mutated=0" \
  "live_build_version_mutated=0" \
  "receipt_dir=$RECEIPT" \
  > "$RECEIPT/stage-status.txt"

printf 'status\tSTAGED\n'
printf 'release_sha\t%s\n' "$RELEASE"
printf 'previous_sha\t%s\n' "$PREVIOUS"
printf 'source_sha\t%s\n' "$after_head"
printf 'active_build_id\t%s\n' "$after_active_build"
printf 'staged_build_id\t%s\n' "$staged_build"
printf 'live_build_version\t%s\n' "$(
  printf '%s' "$after_internal" |
    python3 -c 'import json,sys; print(json.load(sys.stdin).get("buildVersion",""))'
)"
printf 'candidate_build_version\t%s\n' "$candidate_version"
printf 'artifact_sha256\t%s\n' "$artifact_sha"
printf 'candidate_node_modules_sha256\t%s\n' "$candidate_node_modules_sha"
printf 'candidate_node_modules_kb\t%s\n' "$candidate_node_modules_kb"
printf 'service\t%s\n' "$after_service"
printf 'wolo8092\t%s\n' "$after_wolo8092"
printf 'wolo8093\t%s\n' "$after_wolo8093"
printf 'isolated_worktree\t1\n'
printf 'build_process_sandboxed\t1\n'
printf 'build_network_private\t1\n'
printf 'build_secret_paths_inaccessible\t1\n'
printf 'dependency_fetch_sandboxed\t1\n'
printf 'dependency_fetch_scripts_disabled\t1\n'
printf 'dependency_build_offline\t1\n'
printf 'dependency_contract_unchanged\t%s\n' "$dependency_contract_unchanged"
printf 'dependency_lock_changed\t%s\n' "$dependency_lock_changed"
printf 'cache_free_artifact\t1\n'
printf 'artifact_path_relocated\t1\n'
printf 'live_source_mutated\t0\n'
printf 'live_public_mutated\t0\n'
printf 'live_node_modules_mutated\t0\n'
printf 'live_build_version_mutated\t0\n'
printf 'receipt_dir\t%s\n' "$RECEIPT"

trap - EXIT
""".strip()


def validate_stage_result(
    data: dict,
    manifest: dict,
    result: dict[str, str],
) -> list[str]:
    prod = data["production"]
    errors: list[str] = []

    if result.get("status") != "STAGED":
        errors.append("remote stage did not report STAGED")
    if result.get("release_sha") != manifest.get("release_sha"):
        errors.append("staged release SHA does not equal manifest release SHA")
    if result.get("previous_sha") != manifest.get("previous_production_sha"):
        errors.append("stage previous SHA does not equal manifest previous production")
    if result.get("source_sha") != manifest.get("previous_production_sha"):
        errors.append("production source changed during isolated staging")
    if result.get("active_build_id") != prod.get("active_build_id"):
        errors.append("active runtime BUILD_ID changed during staging")
    if not result.get("staged_build_id"):
        errors.append("staged BUILD_ID is missing")
    if result.get("live_build_version") != prod.get("internal_build_version"):
        errors.append("live build version changed during staging")
    if not result.get("candidate_build_version"):
        errors.append("candidate build version is missing")
    artifact = result.get("artifact_sha256") or ""
    if len(artifact) != 64 or any(c not in "0123456789abcdef" for c in artifact):
        errors.append("candidate artifact SHA-256 is invalid")

    dependency_artifact = result.get("candidate_node_modules_sha256") or ""
    if len(dependency_artifact) != 64 or any(
        c not in "0123456789abcdef" for c in dependency_artifact
    ):
        errors.append("candidate node_modules SHA-256 is invalid")

    try:
        dependency_kb = int(result.get("candidate_node_modules_kb") or "0")
    except ValueError:
        dependency_kb = 0
    if dependency_kb <= 0:
        errors.append("candidate node_modules size is invalid")

    if result.get("service") != "active":
        errors.append("AoE2WAR web service is not active after staging")
    if result.get("wolo8092") != str(prod.get("wolo_8092_count")):
        errors.append("WOLO 8092 listener count changed during staging")
    if result.get("wolo8093") != str(prod.get("wolo_8093_count")):
        errors.append("WOLO 8093 listener count changed during staging")
    for key, expected in (
        ("isolated_worktree", "1"),
        ("build_process_sandboxed", "1"),
        ("build_network_private", "1"),
        ("build_secret_paths_inaccessible", "1"),
        ("dependency_fetch_sandboxed", "1"),
        ("dependency_fetch_scripts_disabled", "1"),
        ("dependency_build_offline", "1"),
        ("cache_free_artifact", "1"),
        ("artifact_path_relocated", "1"),
        ("live_source_mutated", "0"),
        ("live_public_mutated", "0"),
        ("live_node_modules_mutated", "0"),
        ("live_build_version_mutated", "0"),
    ):
        if result.get(key) != expected:
            errors.append(f"isolated-stage invariant failed: {key}={result.get(key)!r}")

    for key in ("dependency_contract_unchanged", "dependency_lock_changed"):
        if result.get(key) not in {"0", "1"}:
            errors.append(
                f"dependency evidence flag is invalid: {key}={result.get(key)!r}"
            )

    if "changed_files" in manifest:
        expected_lock_changed = (
            "1" if "yarn.lock" in (manifest.get("changed_files") or []) else "0"
        )
        if result.get("dependency_lock_changed") != expected_lock_changed:
            errors.append(
                "dependency lock-change evidence does not match release manifest"
            )

    return errors


def write_local_receipt(payload: dict) -> Path:
    STAGE_RECEIPT_DIR.mkdir(parents=True, exist_ok=True)
    path = STAGE_RECEIPT_DIR / (
        f"{payload['release_sha']}-{payload['artifact_sha256'][:12]}.json"
    )
    path.write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return path


def durable_stage_receipt_script(
    *,
    receipt_dir: str,
    receipt_text: str,
    receipt_sha256: str,
) -> str:
    """Persist the exact local stage receipt beside its durable VPS evidence."""
    q = shlex.quote
    return f"""
set -Eeuo pipefail
RECEIPT={q(receipt_dir)}
RECEIPT_ROOT={q(REMOTE_RECEIPT_ROOT)}
EXPECTED_SHA={q(receipt_sha256)}
RECEIPT_CONTENT={q(receipt_text)}

case "$RECEIPT" in
  "$RECEIPT_ROOT"/stage-*) ;;
  *) echo "refusing non-canonical durable stage receipt path" >&2; exit 41 ;;
esac
test -d "$RECEIPT"
test -f "$RECEIPT/release-manifest.json"
test -f "$RECEIPT/gate-receipt.json"
test -f "$RECEIPT/stage-status.txt"

tmp_receipt="$RECEIPT/.stage-receipt.json.$$"
tmp_digest="$RECEIPT/.stage-receipt.json.sha256.$$"
cleanup() {{ rm -f -- "$tmp_receipt" "$tmp_digest"; }}
trap cleanup EXIT
umask 077
printf '%s' "$RECEIPT_CONTENT" > "$tmp_receipt"
actual_sha="$(sha256sum "$tmp_receipt" | awk '{{print $1}}')"
test "$actual_sha" = "$EXPECTED_SHA"
printf '%s  stage-receipt.json\n' "$EXPECTED_SHA" > "$tmp_digest"

if [ -e "$RECEIPT/stage-receipt.json" ]; then
  cmp -s "$tmp_receipt" "$RECEIPT/stage-receipt.json"
  rm -f -- "$tmp_receipt"
else
  mv "$tmp_receipt" "$RECEIPT/stage-receipt.json"
fi
if [ -e "$RECEIPT/stage-receipt.json.sha256" ]; then
  cmp -s "$tmp_digest" "$RECEIPT/stage-receipt.json.sha256"
  rm -f -- "$tmp_digest"
else
  mv "$tmp_digest" "$RECEIPT/stage-receipt.json.sha256"
fi

test "$(sha256sum "$RECEIPT/stage-receipt.json" | awk '{{print $1}}')" = "$EXPECTED_SHA"
test "$(awk 'NR == 1 {{print $1}}' "$RECEIPT/stage-receipt.json.sha256")" = "$EXPECTED_SHA"
printf 'status\tDURABLE\n'
printf 'stage_receipt_sha256\t%s\n' "$EXPECTED_SHA"
printf 'stage_receipt_path\t%s\n' "$RECEIPT/stage-receipt.json"
"""


def persist_durable_stage_receipt(receipt_dir: str, local_receipt: Path) -> dict[str, str]:
    receipt_text = local_receipt.read_text(encoding="utf-8")
    receipt_sha = sha256_file(local_receipt)
    script = durable_stage_receipt_script(
        receipt_dir=receipt_dir,
        receipt_text=receipt_text,
        receipt_sha256=receipt_sha,
    )
    p = run(
        [
            "ssh",
            "-o",
            "BatchMode=yes",
            "-o",
            "ConnectTimeout=8",
            PROD_HOST,
            f"bash -lc {shlex.quote(script)}",
        ],
        timeout=90,
    )
    if p.returncode != 0:
        detail = ((p.stderr or "") or (p.stdout or "")).strip()
        raise StageError(
            "exact stage receipt could not be persisted with durable evidence"
            + (f": {detail}" if detail else "")
        )
    result = parse_kv(p.stdout or "")
    if (
        result.get("status") != "DURABLE"
        or result.get("stage_receipt_sha256") != receipt_sha
        or result.get("stage_receipt_path")
        != f"{receipt_dir}/stage-receipt.json"
    ):
        raise StageError("durable stage receipt proof is incomplete or inconsistent")
    return result


def stage_release(
    data: dict,
    *,
    json_output: bool = False,
) -> int:
    release_sha = data["local"].get("head")
    if not release_sha:
        print("STOP: local HEAD is unavailable.")
        return 2

    try:
        manifest_path, manifest, manifest_sha = load_manifest(release_sha)
        gate_path, gate_sha = gate_integrity(manifest)
    except Exception as exc:
        if json_output:
            print(json.dumps({"status": "ERROR", "error": str(exc)}, indent=2))
        else:
            print(f"STOP: {exc}")
        return 2

    transport, transport_error = production_transport()
    if transport_error:
        message = f"production Git transport inspection failed: {transport_error}"
        if json_output:
            print(json.dumps({"status": "ERROR", "error": message}, indent=2))
        else:
            print(f"STOP: {message}")
        return 2

    errors = validation_errors(data, manifest, transport)
    if errors:
        payload = {
            "schema": 1,
            "kind": "aoe2war-stage-preflight",
            "status": "BLOCKED",
            "errors": errors,
        }
        if json_output:
            print(json.dumps(payload, indent=2, sort_keys=True))
        else:
            print("STOP: SHIP STAGE PREFLIGHT BLOCKED")
            for error in errors:
                print(f"  - {error}")
        return 2

    stamp = utc_now()
    receipt_dir = (
        f"{REMOTE_RECEIPT_ROOT}/"
        f"stage-{stamp}-{release_sha[:12]}"
    )
    script = remote_stage_script(
        release_sha=release_sha,
        previous_sha=manifest["previous_production_sha"],
        manifest_sha=manifest_sha,
        gate_sha=gate_sha,
        receipt_dir=receipt_dir,
        manifest_text=manifest_path.read_text(encoding="utf-8"),
        gate_text=gate_path.read_text(encoding="utf-8"),
    )

    if not json_output:
        print("⚔️  AOE2WAR SHIP STAGE")
        print(f"Release:        {release_sha}")
        print(f"Previous prod:  {manifest['previous_production_sha']}")
        print(f"Risk:           {manifest.get('risk_class')}")
        print(f"Manifest SHA:   {manifest_sha}")
        print(f"Gate SHA:       {gate_sha}")
        print(f"Receipt:        {receipt_dir}")
        print("Action:         isolated worktree build + cache-free .next-release copy")
        print("Live runtime:   MUST REMAIN UNCHANGED")
        print("WOLO:           OBSERVE ONLY")
        print()

    p = run(
        [
            "ssh",
            "-o",
            "BatchMode=yes",
            "-o",
            "ConnectTimeout=8",
            PROD_HOST,
            f"bash -lc {shlex.quote(script)}",
        ],
        timeout=1800,
    )

    if p.returncode != 0:
        payload = {
            "schema": 1,
            "kind": "aoe2war-stage-result",
            "status": "FAIL",
            "release_sha": release_sha,
            "receipt_dir": receipt_dir,
            "returncode": p.returncode,
            "stdout_tail": (p.stdout or "")[-4000:],
            "stderr_tail": (p.stderr or "")[-4000:],
            "rollback_policy": (
                "remote trap removes partial .next-release and "
                ".node_modules-release plus the disposable worktree; "
                "live source/build-version/runtime are never changed"
            ),
        }
        if json_output:
            print(json.dumps(payload, indent=2, sort_keys=True))
        else:
            print("FAIL: SHIP STAGE")
            if p.stdout and p.stdout.strip():
                print(p.stdout.rstrip())
            if p.stderr and p.stderr.strip():
                print(p.stderr.rstrip())
            print(f"Receipt: {receipt_dir}")
            recovery = parse_kv(p.stdout or "").get("recovery")
            if recovery == "RESTORED":
                print("Recovery: partial staged artifact removed; live state was unchanged.")
            elif recovery == "NOT_REQUIRED":
                print("Recovery: not required; failure occurred before artifact copy.")
            else:
                print("Recovery: unconfirmed; inspect production truth before retry.")
        return 1

    result = parse_kv(p.stdout or "")
    result_errors = validate_stage_result(data, manifest, result)
    if result_errors:
        payload = {
            "schema": 1,
            "kind": "aoe2war-stage-result",
            "status": "UNVERIFIED",
            "release_sha": release_sha,
            "receipt_dir": receipt_dir,
            "errors": result_errors,
            "remote": result,
        }
        if json_output:
            print(json.dumps(payload, indent=2, sort_keys=True))
        else:
            print("STOP: STAGE COMPLETED BUT RESULT VERIFICATION FAILED")
            for error in result_errors:
                print(f"  - {error}")
            print(f"Receipt: {receipt_dir}")
        return 2

    payload = {
        "schema": 1,
        "kind": "aoe2war-stage-result",
        "status": "STAGED",
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "release_sha": release_sha,
        "implementation_sha": manifest.get("implementation_sha"),
        "previous_production_sha": manifest.get("previous_production_sha"),
        "risk_class": manifest.get("risk_class"),
        "manifest_path": str(manifest_path.relative_to(ROOT)),
        "manifest_sha256": manifest_sha,
        "gate_path": str(gate_path.relative_to(ROOT)),
        "gate_sha256": gate_sha,
        "source_sha": result["source_sha"],
        "active_build_id": result["active_build_id"],
        "staged_build_id": result["staged_build_id"],
        "live_build_version": result["live_build_version"],
        "candidate_build_version": result["candidate_build_version"],
        "artifact_sha256": result["artifact_sha256"],
        "candidate_node_modules_sha256": result[
            "candidate_node_modules_sha256"
        ],
        "candidate_node_modules_kb": int(result["candidate_node_modules_kb"]),
        "service": result["service"],
        "wolo_8092_count": int(result["wolo8092"]),
        "wolo_8093_count": int(result["wolo8093"]),
        "remote_receipt_dir": result["receipt_dir"],
        "isolated_worktree": True,
        "build_process_sandboxed": True,
        "build_network_private": True,
        "build_secret_paths_inaccessible": True,
        "dependency_fetch_sandboxed": True,
        "dependency_fetch_scripts_disabled": True,
        "dependency_build_offline": True,
        "dependency_contract_unchanged": (
            result["dependency_contract_unchanged"] == "1"
        ),
        "dependency_lock_changed": (
            result["dependency_lock_changed"] == "1"
        ),
        "cache_free_artifact": True,
        "artifact_path_relocated": True,
        "live_source_mutated": False,
        "live_public_mutated": False,
        "live_node_modules_mutated": False,
        "live_build_version_mutated": False,
        "live_runtime_mutated": False,
        "wolo_mutated": False,
    }
    local_receipt = write_local_receipt(payload)
    payload["local_receipt_path"] = str(local_receipt.relative_to(ROOT))
    payload["local_receipt_sha256"] = sha256_file(local_receipt)

    try:
        durable = persist_durable_stage_receipt(receipt_dir, local_receipt)
    except StageError as exc:
        if json_output:
            print(
                json.dumps(
                    {
                        **payload,
                        "status": "UNVERIFIED",
                        "error": str(exc),
                        "recovery": (
                            "the candidate remains staged and the exact local receipt "
                            "remains available; cross-host resume is blocked until its "
                            "durable receipt is proven"
                        ),
                    },
                    indent=2,
                    sort_keys=True,
                )
            )
        else:
            print("STOP: RELEASE STAGED BUT DURABLE RECEIPT PROOF FAILED")
            print(f"  - {exc}")
            print(f"Local receipt:  {payload['local_receipt_path']}")
            print("Live runtime:   UNCHANGED")
            print("Recovery:       retry from this host; cross-host resume remains blocked")
        return 2

    payload["remote_stage_receipt_path"] = durable["stage_receipt_path"]
    payload["remote_stage_receipt_sha256"] = durable[
        "stage_receipt_sha256"
    ]

    if json_output:
        print(json.dumps(payload, indent=2, sort_keys=True))
        return 0

    print(f"Live source:    {payload['source_sha']}  UNCHANGED")
    print(f"Active build:   {payload['active_build_id']}  UNCHANGED")
    print(f"Staged build:   {payload['staged_build_id']}")
    print(f"Live version:   {payload['live_build_version']}  UNCHANGED")
    print(f"Candidate ver:  {payload['candidate_build_version']}")
    print(f"Artifact SHA:   {payload['artifact_sha256']}")
    print(
        "Dependency SHA: "
        f"{payload['candidate_node_modules_sha256']}  "
        f"{payload['candidate_node_modules_kb']}KB"
    )
    print(
        "Dependencies:   fresh frozen candidate tree; "
        "network fetch scripts disabled; offline build materialization"
    )
    print("Build isolation: temporary detached worktree; live source/public/dependencies untouched")
    print("Artifact paths: relocated to canonical live root before hashing")
    print("Artifact cache: cache-free")
    print(f"Service:        {payload['service']}")
    print(
        "WOLO protected: "
        f"8092={payload['wolo_8092_count']}  "
        f"8093={payload['wolo_8093_count']}  UNTOUCHED"
    )
    print(f"Remote receipt: {payload['remote_receipt_dir']}")
    print(f"Local receipt:  {payload['local_receipt_path']}")
    print(f"Durable receipt: {payload['remote_stage_receipt_path']}")
    print()
    print("PASS: RELEASE STAGED — LIVE RUNTIME UNCHANGED — WOLO UNTOUCHED")
    return 0
