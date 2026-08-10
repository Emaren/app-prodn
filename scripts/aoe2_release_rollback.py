#!/usr/bin/env python3
from __future__ import annotations

import json
import shlex
import subprocess
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

from aoe2_release_gate import ROOT, sha256_file
from aoe2_release_ship import (
    PROD_HOST,
    PROD_REPO,
    PUBLIC,
    REMOTE_RECEIPT_ROOT,
    SERVICE,
)

ACTIVATION_RECEIPT_DIR = ROOT / ".aoe2war-release" / "activation-receipts"
ROLLBACK_RECEIPT_DIR = ROOT / ".aoe2war-release" / "rollback-receipts"
CANONICAL_DURABLE_ROLLBACK_ROOT = "/mnt/HC_Volume_105319120/aoe2war/rollbacks/activate-"
CANONICAL_FAST_ROLLBACK_PREFIX = ".next-rollback-activate-"


class RollbackError(RuntimeError):
    pass


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def run(args: list[str], *, timeout: int = 300) -> subprocess.CompletedProcess:
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


def load_json_receipt(relative_path: str, expected_sha: str | None = None) -> tuple[Path, dict, str]:
    try:
        path = (ROOT / relative_path).resolve()
        path.relative_to(ROOT.resolve())
    except (OSError, ValueError) as exc:
        raise RollbackError("receipt path escapes the repository state directory") from exc
    if not path.is_file():
        raise RollbackError(f"receipt is missing: {relative_path}")
    actual = sha256_file(path)
    if expected_sha and actual != expected_sha:
        raise RollbackError(
            f"receipt SHA-256 mismatch for {relative_path}: expected {expected_sha}, got {actual}"
        )
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise RollbackError(f"receipt is invalid JSON: {relative_path}: {exc}") from exc
    return path, payload, actual


def activation_evidence_ok(payload: dict) -> bool:
    evidence = (
        ("stage_receipt_path", "stage_receipt_sha256"),
        ("manifest_path", "manifest_sha256"),
        ("gate_path", "gate_sha256"),
    )
    try:
        for path_key, sha_key in evidence:
            relative = payload.get(path_key)
            expected = payload.get(sha_key)
            if not isinstance(relative, str) or not isinstance(expected, str):
                return False
            load_json_receipt(relative, expected)
    except RollbackError:
        return False
    return True


def find_target_certification(
    release_sha: str,
    build_id: str,
    build_version: str,
) -> tuple[Path, dict, str] | None:
    if not ACTIVATION_RECEIPT_DIR.exists():
        return None
    try:
        paths = sorted(
            ACTIVATION_RECEIPT_DIR.glob("*.json"),
            key=lambda item: item.stat().st_mtime,
            reverse=True,
        )
    except OSError:
        return None
    for path in paths:
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if payload.get("schema") != 1:
            continue
        if payload.get("kind") != "aoe2war-activation-result":
            continue
        if payload.get("status") != "CERTIFIED" or payload.get("wolo_mutated") is not False:
            continue
        if payload.get("release_sha") != release_sha:
            continue
        if payload.get("active_build_id") != build_id:
            continue
        if payload.get("candidate_build_version") != build_version:
            continue
        if not activation_evidence_ok(payload):
            continue
        return path, payload, sha256_file(path)
    return None


def rollback_plan(data: dict) -> dict:
    cert = data.get("certification") or {}
    prod = data.get("production") or {}
    local = data.get("local") or {}
    github = data.get("github") or {}
    docs = data.get("documentation") or {}

    errors: list[str] = []
    if local.get("dirty_count") != 0:
        errors.append("local worktree must be clean")
    if not local.get("head") or local.get("head") != github.get("main_sha"):
        errors.append("local HEAD must equal GitHub main")
    if docs.get("baseline_is_ancestor_of_local") is not True:
        errors.append("Documentation Baseline must be a valid ancestor")
    if not prod.get("reachable"):
        errors.append("production is unreachable")
    if prod.get("dirty_count") != 0:
        errors.append("production worktree must be clean")
    if prod.get("service") != "active":
        errors.append("AoE2WAR production service must be active")
    if prod.get("staged_build_id"):
        errors.append("a staged candidate exists; resolve it before rollback")
    if prod.get("version_parity") is not True:
        errors.append("internal/public production version parity must be healthy")
    if (prod.get("wolo_8092_count") or 0) < 1:
        errors.append("protected WOLO listener 8092 is missing")
    if (prod.get("wolo_8093_count") or 0) < 1:
        errors.append("protected WOLO listener 8093 is missing")
    if cert.get("status") != "CERTIFIED":
        errors.append("active runtime must have matching CERTIFIED provenance")
    if cert.get("release_sha") != prod.get("source_sha"):
        errors.append("certified release SHA does not equal production source")
    if cert.get("active_build_id") != prod.get("active_build_id"):
        errors.append("certified BUILD_ID does not equal active BUILD_ID")
    if cert.get("build_version") != prod.get("internal_build_version"):
        errors.append("certified build version does not equal active build version")
    if local.get("head") != prod.get("source_sha"):
        errors.append("rollback requires local/GitHub/production source parity")
    if errors:
        raise RollbackError("rollback preflight blocked: " + "; ".join(errors))

    current_rel = cert.get("receipt_path")
    if not isinstance(current_rel, str):
        raise RollbackError("current certification receipt path is unavailable")
    current_path, current, current_sha = load_json_receipt(current_rel)
    if current.get("schema") != 1 or current.get("kind") != "aoe2war-activation-result":
        raise RollbackError("current certification receipt has the wrong schema/kind")
    if current.get("status") != "CERTIFIED" or current.get("wolo_mutated") is not False:
        raise RollbackError("current certification receipt is not safe CERTIFIED evidence")
    if not activation_evidence_ok(current):
        raise RollbackError("current certification supporting evidence failed hash verification")

    current_release = str(current.get("release_sha") or "")
    current_build = str(current.get("active_build_id") or "")
    current_version = str(current.get("candidate_build_version") or "")
    target_release = str(current.get("previous_production_sha") or "")
    target_build = str(current.get("previous_build_id") or "")
    fast_rollback = str(current.get("fast_rollback") or "")
    durable_rollback = str(current.get("durable_rollback") or "")

    if current_release != prod.get("source_sha"):
        raise RollbackError("current receipt release no longer equals production source")
    if current_build != prod.get("active_build_id"):
        raise RollbackError("current receipt BUILD_ID no longer equals production BUILD_ID")
    if current_version != prod.get("internal_build_version"):
        raise RollbackError("current receipt build version no longer equals production version")
    if len(target_release) != 40 or any(c not in "0123456789abcdef" for c in target_release):
        raise RollbackError("previous production SHA in current receipt is invalid")
    if not target_build:
        raise RollbackError("previous BUILD_ID in current receipt is unavailable")
    if not fast_rollback.startswith(CANONICAL_FAST_ROLLBACK_PREFIX):
        raise RollbackError("fast rollback path is outside the canonical release namespace")
    if "/" in fast_rollback or ".." in fast_rollback:
        raise RollbackError("fast rollback path must be a top-level production directory")
    if not durable_rollback.startswith(CANONICAL_DURABLE_ROLLBACK_ROOT):
        raise RollbackError("durable rollback path is outside the canonical rollback root")

    stage_rel = current.get("stage_receipt_path")
    stage_sha = current.get("stage_receipt_sha256")
    if not isinstance(stage_rel, str) or not isinstance(stage_sha, str):
        raise RollbackError("current certification does not bind its stage receipt")
    stage_path, stage, actual_stage_sha = load_json_receipt(stage_rel, stage_sha)
    if stage.get("status") != "STAGED":
        raise RollbackError("bound stage receipt is not STAGED")
    if stage.get("release_sha") != current_release:
        raise RollbackError("stage receipt release does not equal current release")
    if stage.get("previous_production_sha") != target_release:
        raise RollbackError("stage receipt previous production does not equal rollback target")
    if stage.get("active_build_id") != target_build:
        raise RollbackError("stage receipt previous BUILD_ID does not equal rollback target")
    target_version = str(stage.get("live_build_version") or "")
    if not target_version:
        raise RollbackError("stage receipt does not bind the previous live build version")

    target_cert = find_target_certification(target_release, target_build, target_version)
    if target_cert is None:
        raise RollbackError(
            "immediately previous runtime has no matching CERTIFIED activation receipt; "
            "refusing automatic rollback"
        )
    target_path, target_payload, target_sha = target_cert

    return {
        "schema": 1,
        "current_release_sha": current_release,
        "current_build_id": current_build,
        "current_build_version": current_version,
        "target_release_sha": target_release,
        "target_build_id": target_build,
        "target_build_version": target_version,
        "fast_rollback": fast_rollback,
        "durable_rollback": durable_rollback,
        "wolo_8092_count": int(prod.get("wolo_8092_count") or 0),
        "wolo_8093_count": int(prod.get("wolo_8093_count") or 0),
        "current_activation_receipt_path": str(current_path.relative_to(ROOT)),
        "current_activation_receipt_sha256": current_sha,
        "stage_receipt_path": str(stage_path.relative_to(ROOT)),
        "stage_receipt_sha256": actual_stage_sha,
        "target_certification_receipt_path": str(target_path.relative_to(ROOT)),
        "target_certification_receipt_sha256": target_sha,
        "target_certification": target_payload,
    }


def remote_rollback_script(plan: dict, *, dry_run: bool, receipt_dir: str) -> str:
    q = shlex.quote
    mode = "DRY_RUN" if dry_run else "ROLLBACK"
    return f'''set -euo pipefail
cd {q(PROD_REPO)}

MODE={q(mode)}
SERVICE={q(SERVICE)}
PUBLIC={q(PUBLIC)}
CURRENT={q(plan['current_release_sha'])}
CURRENT_BUILD={q(plan['current_build_id'])}
CURRENT_VERSION={q(plan['current_build_version'])}
TARGET={q(plan['target_release_sha'])}
TARGET_BUILD={q(plan['target_build_id'])}
TARGET_VERSION={q(plan['target_build_version'])}
FAST_TARGET={q(plan['fast_rollback'])}
DURABLE_TARGET={q(plan['durable_rollback'])}
RECEIPT={q(receipt_dir)}
EXPECTED_WOLO8092={q(str(plan['wolo_8092_count']))}
EXPECTED_WOLO8093={q(str(plan['wolo_8093_count']))}

wolo_count() {{ ss -ltn | grep -Ec ":$1[[:space:]]" || true; }}
build_version() {{ python3 -c 'import json,sys; print(json.load(sys.stdin).get("buildVersion",""))'; }}
critical_get() {{ curl -fsS --max-time 12 --retry 3 --retry-delay 1 --retry-all-errors -o /dev/null "$1"; }}

before_head="$(git rev-parse HEAD)"
before_dirty="$(git status --porcelain --untracked-files=all | wc -l | tr -d ' ')"
before_service="$(systemctl is-active "$SERVICE" || true)"
before_build="$(cat .next/BUILD_ID 2>/dev/null || true)"
before_staged="$(cat .next-release/BUILD_ID 2>/dev/null || true)"
before_internal="$(curl -fsS --max-time 8 http://127.0.0.1:3030/api/deployment-version | build_version)"
before_public="$(curl -fsS --max-time 10 "$PUBLIC/api/deployment-version" | build_version)"
before_wolo8092="$(wolo_count 8092)"
before_wolo8093="$(wolo_count 8093)"

test "$before_head" = "$CURRENT"
test "$before_dirty" = "0"
test "$before_service" = "active"
test "$before_build" = "$CURRENT_BUILD"
test -z "$before_staged"
test "$before_internal" = "$CURRENT_VERSION"
test "$before_public" = "$CURRENT_VERSION"
test "$before_wolo8092" = "$EXPECTED_WOLO8092"
test "$before_wolo8093" = "$EXPECTED_WOLO8093"
git cat-file -e "$TARGET^{{commit}}"
test -d "$DURABLE_TARGET/next"
test "$(cat "$DURABLE_TARGET/next/BUILD_ID")" = "$TARGET_BUILD"

SOURCE_KIND="durable"
SOURCE_PATH="$DURABLE_TARGET/next"
if [ -d "$FAST_TARGET" ] && [ "$(cat "$FAST_TARGET/BUILD_ID" 2>/dev/null || true)" = "$TARGET_BUILD" ]; then
  SOURCE_KIND="fast"
  SOURCE_PATH="$FAST_TARGET"
fi

critical_get http://127.0.0.1:3030/
critical_get http://127.0.0.1:3030/api/lobby
critical_get http://127.0.0.1:3030/api/bets
critical_get "$PUBLIC/"
critical_get "$PUBLIC/api/lobby"
critical_get "$PUBLIC/api/bets"

if [ "$MODE" = "DRY_RUN" ]; then
  printf 'status\tPREPARED\n'
  printf 'current_release_sha\t%s\n' "$CURRENT"
  printf 'current_build_id\t%s\n' "$CURRENT_BUILD"
  printf 'target_release_sha\t%s\n' "$TARGET"
  printf 'target_build_id\t%s\n' "$TARGET_BUILD"
  printf 'target_build_version\t%s\n' "$TARGET_VERSION"
  printf 'source_kind\t%s\n' "$SOURCE_KIND"
  printf 'source_path\t%s\n' "$SOURCE_PATH"
  printf 'wolo8092\t%s\n' "$before_wolo8092"
  printf 'wolo8093\t%s\n' "$before_wolo8093"
  exit 0
fi

sudo -n /usr/bin/install -d -o tony -g tony -m 0750 "$RECEIPT"
printf '%s\n' \
  "current_release_sha=$CURRENT" \
  "current_build_id=$CURRENT_BUILD" \
  "current_build_version=$CURRENT_VERSION" \
  "target_release_sha=$TARGET" \
  "target_build_id=$TARGET_BUILD" \
  "target_build_version=$TARGET_VERSION" \
  "source_kind=$SOURCE_KIND" \
  "source_path=$SOURCE_PATH" \
  "before_wolo8092=$before_wolo8092" \
  "before_wolo8093=$before_wolo8093" \
  > "$RECEIPT/prerollback.txt"

# Preserve the currently certified runtime on durable storage before mutation.
cp -a .next "$RECEIPT/current-next"
test "$(cat "$RECEIPT/current-next/BUILD_ID")" = "$CURRENT_BUILD"
if [ -f .aoe2war-build-version ]; then cp -p .aoe2war-build-version "$RECEIPT/current-build-version"; fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FORWARD_FAST=".next-rollback-manual-$STAMP"
TARGET_TMP=".next-rollback-target-$STAMP"
test ! -e "$FORWARD_FAST"
test ! -e "$TARGET_TMP"
cp -a "$SOURCE_PATH" "$TARGET_TMP"
test "$(cat "$TARGET_TMP/BUILD_ID")" = "$TARGET_BUILD"

MUTATED=0
COMMITTED=0
rollback_failure() {{
  rc=$?
  if [ "$COMMITTED" = "1" ]; then return 0; fi
  set +e
  status="FAILED_PREMUTATION"
  if [ "$MUTATED" = "1" ]; then
    status="ROLLBACK_FAILED"
    sudo -n /usr/bin/systemctl stop "$SERVICE" >/dev/null 2>&1 || true
    rm -rf .next >/dev/null 2>&1 || true
    if [ -d "$FORWARD_FAST" ]; then mv "$FORWARD_FAST" .next; fi
    git reset --hard "$CURRENT" >/dev/null 2>&1 || true
    printf '%s\n' "$CURRENT_VERSION" > .aoe2war-build-version
    sudo -n /usr/bin/systemctl start "$SERVICE" >/dev/null 2>&1 || true
    for _ in $(seq 1 30); do
      if [ "$(systemctl is-active "$SERVICE" 2>/dev/null || true)" = "active" ] \
        && curl -fsS --max-time 5 http://127.0.0.1:3030/api/deployment-version >/dev/null 2>&1; then break; fi
      sleep 1
    done
    rb_head="$(git rev-parse HEAD 2>/dev/null || true)"
    rb_build="$(cat .next/BUILD_ID 2>/dev/null || true)"
    rb_internal="$(curl -fsS --max-time 6 http://127.0.0.1:3030/api/deployment-version 2>/dev/null | build_version 2>/dev/null || true)"
    rb_public="$(curl -fsS --max-time 8 "$PUBLIC/api/deployment-version" 2>/dev/null | build_version 2>/dev/null || true)"
    rb_wolo8092="$(wolo_count 8092)"
    rb_wolo8093="$(wolo_count 8093)"
    if [ "$rb_head" = "$CURRENT" ] \
      && [ "$rb_build" = "$CURRENT_BUILD" ] \
      && [ "$rb_internal" = "$CURRENT_VERSION" ] \
      && [ "$rb_public" = "$CURRENT_VERSION" ] \
      && [ "$rb_wolo8092" = "$EXPECTED_WOLO8092" ] \
      && [ "$rb_wolo8093" = "$EXPECTED_WOLO8093" ]; then
      status="RESTORED_CURRENT"
    fi
  fi
  printf '%s\n' \
    "status=$status" \
    "original_exit_code=$rc" \
    > "$RECEIPT/failure-recovery.txt" 2>/dev/null || true
}}
trap rollback_failure EXIT

sudo -n /usr/bin/systemctl stop "$SERVICE"
MUTATED=1
mv .next "$FORWARD_FAST"
mv "$TARGET_TMP" .next
git reset --hard "$TARGET"
printf '%s\n' "$TARGET_VERSION" > .aoe2war-build-version
test -z "$(git status --porcelain --untracked-files=all)"
test "$(cat .next/BUILD_ID)" = "$TARGET_BUILD"
sudo -n /usr/bin/systemctl start "$SERVICE"

READY=0
for _ in $(seq 1 30); do
  if [ "$(systemctl is-active "$SERVICE" 2>/dev/null || true)" = "active" ] \
    && curl -fsS --max-time 5 http://127.0.0.1:3030/api/deployment-version >/dev/null 2>&1; then READY=1; break; fi
  sleep 1
done
test "$READY" = "1"

after_head="$(git rev-parse HEAD)"
after_dirty="$(git status --porcelain --untracked-files=all | wc -l | tr -d ' ')"
after_service="$(systemctl is-active "$SERVICE")"
after_build="$(cat .next/BUILD_ID)"
after_staged="$(cat .next-release/BUILD_ID 2>/dev/null || true)"
after_internal="$(curl -fsS --max-time 8 http://127.0.0.1:3030/api/deployment-version | build_version)"
after_public="$(curl -fsS --max-time 10 "$PUBLIC/api/deployment-version" | build_version)"
after_wolo8092="$(wolo_count 8092)"
after_wolo8093="$(wolo_count 8093)"

test "$after_head" = "$TARGET"
test "$after_dirty" = "0"
test "$after_service" = "active"
test "$after_build" = "$TARGET_BUILD"
test -z "$after_staged"
test "$after_internal" = "$TARGET_VERSION"
test "$after_public" = "$TARGET_VERSION"
test "$after_wolo8092" = "$EXPECTED_WOLO8092"
test "$after_wolo8093" = "$EXPECTED_WOLO8093"

critical_get http://127.0.0.1:3030/
critical_get http://127.0.0.1:3030/api/lobby
critical_get http://127.0.0.1:3030/api/bets
critical_get http://127.0.0.1:3030/api/deployment-version
critical_get "$PUBLIC/"
critical_get "$PUBLIC/api/lobby"
critical_get "$PUBLIC/api/bets"
critical_get "$PUBLIC/api/deployment-version"

printf '%s\n' \
  "status=ROLLED_BACK" \
  "from_release_sha=$CURRENT" \
  "to_release_sha=$TARGET" \
  "from_build_id=$CURRENT_BUILD" \
  "to_build_id=$TARGET_BUILD" \
  "to_build_version=$TARGET_VERSION" \
  "source_kind=$SOURCE_KIND" \
  "forward_fast_rollback=$FORWARD_FAST" \
  "wolo8092=$after_wolo8092" \
  "wolo8093=$after_wolo8093" \
  > "$RECEIPT/certification.txt"
COMMITTED=1

printf 'status\tROLLED_BACK\n'
printf 'from_release_sha\t%s\n' "$CURRENT"
printf 'to_release_sha\t%s\n' "$TARGET"
printf 'from_build_id\t%s\n' "$CURRENT_BUILD"
printf 'to_build_id\t%s\n' "$TARGET_BUILD"
printf 'to_build_version\t%s\n' "$TARGET_VERSION"
printf 'source_kind\t%s\n' "$SOURCE_KIND"
printf 'forward_fast_rollback\t%s\n' "$FORWARD_FAST"
printf 'wolo8092\t%s\n' "$after_wolo8092"
printf 'wolo8093\t%s\n' "$after_wolo8093"
printf 'receipt_dir\t%s\n' "$RECEIPT"
'''


def validate_remote_result(result: dict[str, str], plan: dict) -> list[str]:
    errors: list[str] = []
    expected = {
        "status": "ROLLED_BACK",
        "from_release_sha": plan["current_release_sha"],
        "to_release_sha": plan["target_release_sha"],
        "from_build_id": plan["current_build_id"],
        "to_build_id": plan["target_build_id"],
        "to_build_version": plan["target_build_version"],
        "wolo8092": str(plan["wolo_8092_count"]),
        "wolo8093": str(plan["wolo_8093_count"]),
    }
    for key, value in expected.items():
        if result.get(key) != value:
            errors.append(f"{key}: expected {value!r}, got {result.get(key)!r}")
    if result.get("source_kind") not in {"fast", "durable"}:
        errors.append("rollback source kind is invalid")
    if not result.get("forward_fast_rollback", "").startswith(".next-rollback-manual-"):
        errors.append("forward fast rollback was not preserved")
    if not result.get("receipt_dir", "").startswith(f"{REMOTE_RECEIPT_ROOT}/rollback-"):
        errors.append("remote rollback receipt is outside canonical receipt root")
    return errors


def write_local_receipt(payload: dict) -> Path:
    ROLLBACK_RECEIPT_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = ROLLBACK_RECEIPT_DIR / (
        f"{payload['from_release_sha'][:12]}-to-{payload['to_release_sha'][:12]}-{stamp}.json"
    )
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return path


def rollback_release(
    data: dict,
    *,
    collect: Callable[[], dict],
    dry_run: bool,
    json_output: bool = False,
) -> int:
    try:
        plan = rollback_plan(data)
    except RollbackError as exc:
        if json_output:
            print(json.dumps({"status": "BLOCKED", "error": str(exc)}, indent=2))
        else:
            print(f"STOP: {exc}")
        return 2

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    receipt_dir = (
        f"{REMOTE_RECEIPT_ROOT}/rollback-{stamp}-"
        f"{plan['current_release_sha'][:12]}-to-{plan['target_release_sha'][:12]}"
    )
    script = remote_rollback_script(plan, dry_run=dry_run, receipt_dir=receipt_dir)

    if not json_output:
        print("⚔️  AOE2WAR CERTIFIED ROLLBACK")
        print(f"From release:   {plan['current_release_sha']}")
        print(f"From build:     {plan['current_build_id']}")
        print(f"To release:     {plan['target_release_sha']}")
        print(f"To build:       {plan['target_build_id']}")
        print(f"To version:     {plan['target_build_version']}")
        print("Target proof:   previous CERTIFIED activation receipt")
        print("WOLO:           OBSERVE ONLY")
        print(f"Mode:           {'DRY RUN' if dry_run else 'ROLLBACK'}")
        print()

    p = run(
        [
            "ssh",
            "-o", "BatchMode=yes",
            "-o", "ConnectTimeout=8",
            PROD_HOST,
            f"bash -lc {shlex.quote(script)}",
        ],
        timeout=180 if dry_run else 900,
    )
    if p.returncode != 0:
        payload = {
            "schema": 1,
            "kind": "aoe2war-rollback-result",
            "status": "ERROR",
            "from_release_sha": plan["current_release_sha"],
            "to_release_sha": plan["target_release_sha"],
            "remote_receipt_dir": receipt_dir,
            "returncode": p.returncode,
            "stdout_tail": (p.stdout or "")[-4000:],
            "stderr_tail": (p.stderr or "")[-4000:],
        }
        if json_output:
            print(json.dumps(payload, indent=2, sort_keys=True))
        else:
            print("STOP: CERTIFIED ROLLBACK FAILED")
            if p.stdout and p.stdout.strip():
                print(p.stdout.rstrip())
            if p.stderr and p.stderr.strip():
                print(p.stderr.rstrip())
            print(f"Remote receipt: {receipt_dir}")
            print("Failure trap attempts to restore the current certified runtime if mutation began.")
        return 2

    result = parse_kv(p.stdout or "")
    if dry_run:
        expected = {
            "status": "PREPARED",
            "current_release_sha": plan["current_release_sha"],
            "current_build_id": plan["current_build_id"],
            "target_release_sha": plan["target_release_sha"],
            "target_build_id": plan["target_build_id"],
            "target_build_version": plan["target_build_version"],
            "wolo8092": str(plan["wolo_8092_count"]),
            "wolo8093": str(plan["wolo_8093_count"]),
        }
        mismatches = [
            f"{key}: expected {value!r}, got {result.get(key)!r}"
            for key, value in expected.items()
            if result.get(key) != value
        ]
        if result.get("source_kind") not in {"fast", "durable"}:
            mismatches.append("rollback source kind is invalid")
        if mismatches:
            if json_output:
                print(json.dumps({"status": "BLOCKED", "errors": mismatches}, indent=2))
            else:
                print("STOP: ROLLBACK DRY-RUN RESULT DRIFT")
                for mismatch in mismatches:
                    print(f"  - {mismatch}")
            return 2
        if json_output:
            print(json.dumps({"schema": 1, "kind": "aoe2war-rollback-preflight", **result}, indent=2, sort_keys=True))
        else:
            print(f"Source:         {result.get('source_kind')}  {result.get('source_path')}")
            print("PASS: CERTIFIED ROLLBACK PREFLIGHT — ZERO PRODUCTION MUTATION")
        return 0

    errors = validate_remote_result(result, plan)
    if errors:
        if json_output:
            print(json.dumps({"status": "ERROR", "errors": errors, "remote": result}, indent=2, sort_keys=True))
        else:
            print("STOP: ROLLBACK COMPLETED REMOTELY BUT RESULT VALIDATION FAILED")
            for error in errors:
                print(f"  - {error}")
            print(f"Remote receipt: {receipt_dir}")
        return 2

    final = collect()
    final_prod = final.get("production") or {}
    final_cert = final.get("certification") or {}
    final_errors: list[str] = []
    if final_prod.get("source_sha") != plan["target_release_sha"]:
        final_errors.append("production source does not equal rollback target")
    if final_prod.get("active_build_id") != plan["target_build_id"]:
        final_errors.append("active BUILD_ID does not equal rollback target")
    if final_prod.get("internal_build_version") != plan["target_build_version"]:
        final_errors.append("internal build version does not equal rollback target")
    if final_prod.get("public_build_version") != plan["target_build_version"]:
        final_errors.append("public build version does not equal rollback target")
    if final_prod.get("version_parity") is not True:
        final_errors.append("internal/public build-version parity failed after rollback")
    if final_prod.get("service") != "active":
        final_errors.append("AoE2WAR service is not active after rollback")
    if final_prod.get("staged_build_id"):
        final_errors.append("staged build exists after rollback")
    if (final_prod.get("wolo_8092_count") or 0) != plan["wolo_8092_count"]:
        final_errors.append("WOLO 8092 listener count changed during rollback")
    if (final_prod.get("wolo_8093_count") or 0) != plan["wolo_8093_count"]:
        final_errors.append("WOLO 8093 listener count changed during rollback")
    if final_cert.get("status") != "CERTIFIED":
        final_errors.append("rollback target is not recognized as CERTIFIED after restoration")
    if final_cert.get("release_sha") != plan["target_release_sha"]:
        final_errors.append("post-rollback certification does not bind target release")
    if final_errors:
        if json_output:
            print(json.dumps({"status": "ERROR", "errors": final_errors, "remote": result}, indent=2, sort_keys=True))
        else:
            print("STOP: POST-ROLLBACK CERTIFICATION FAILED")
            for error in final_errors:
                print(f"  - {error}")
        return 2

    payload = {
        "schema": 1,
        "kind": "aoe2war-rollback-result",
        "generated_at": utc_now(),
        "status": "CERTIFIED_ROLLBACK",
        "from_release_sha": plan["current_release_sha"],
        "from_build_id": plan["current_build_id"],
        "from_build_version": plan["current_build_version"],
        "to_release_sha": plan["target_release_sha"],
        "to_build_id": plan["target_build_id"],
        "to_build_version": plan["target_build_version"],
        "source_kind": result["source_kind"],
        "forward_fast_rollback": result["forward_fast_rollback"],
        "current_activation_receipt_path": plan["current_activation_receipt_path"],
        "current_activation_receipt_sha256": plan["current_activation_receipt_sha256"],
        "target_certification_receipt_path": plan["target_certification_receipt_path"],
        "target_certification_receipt_sha256": plan["target_certification_receipt_sha256"],
        "remote_receipt_dir": result["receipt_dir"],
        "wolo_8092_count": int(result["wolo8092"]),
        "wolo_8093_count": int(result["wolo8093"]),
        "wolo_mutated": False,
    }
    local_receipt = write_local_receipt(payload)
    payload["local_receipt_path"] = str(local_receipt.relative_to(ROOT))
    payload["local_receipt_sha256"] = sha256_file(local_receipt)

    if json_output:
        print(json.dumps(payload, indent=2, sort_keys=True))
        return 0

    print("⚔️  AOE2WAR ROLLED BACK + CERTIFIED")
    print(f"From release:   {payload['from_release_sha']}")
    print(f"To release:     {payload['to_release_sha']}")
    print(f"Active build:   {payload['to_build_id']}")
    print(f"Build version:  {payload['to_build_version']}")
    print(f"Source:         {payload['source_kind']}")
    print(f"Forward rescue: {payload['forward_fast_rollback']}")
    print(f"Remote receipt: {payload['remote_receipt_dir']}")
    print(f"Local receipt:  {payload['local_receipt_path']}")
    print(
        "WOLO:           "
        f"8092={payload['wolo_8092_count']}  "
        f"8093={payload['wolo_8093_count']}  UNTOUCHED"
    )
    print()
    print("PASS: CERTIFIED ROLLBACK — PREVIOUS KNOWN-GOOD RUNTIME RESTORED — WOLO UNTOUCHED")
    return 0
