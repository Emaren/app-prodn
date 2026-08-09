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
BUILD_USER = "tony"


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
    return f"""
set -Eeuo pipefail
cd {q(PROD_REPO)}

RELEASE={q(release_sha)}
PREVIOUS={q(previous_sha)}
MANIFEST_SHA={q(manifest_sha)}
GATE_SHA={q(gate_sha)}
RECEIPT={q(receipt_dir)}
SERVICE={q(SERVICE)}
PUBLIC={q(PUBLIC)}
MANIFEST_CONTENT={q(manifest_text)}
GATE_CONTENT={q(gate_text)}

mkdir -p "$RECEIPT"
printf '%s' "$MANIFEST_CONTENT" > "$RECEIPT/release-manifest.json"
printf '%s' "$GATE_CONTENT" > "$RECEIPT/gate-receipt.json"
test "$(sha256sum "$RECEIPT/release-manifest.json" | awk '{{print $1}}')" = "$MANIFEST_SHA"
test "$(sha256sum "$RECEIPT/gate-receipt.json" | awk '{{print $1}}')" = "$GATE_SHA"

before_head="$(git rev-parse HEAD)"
before_branch="$(git branch --show-current)"
before_dirty="$(git status --porcelain --untracked-files=all | wc -l | tr -d ' ')"
before_service="$(systemctl is-active "$SERVICE" || true)"
before_active_build="$(cat .next/BUILD_ID 2>/dev/null || true)"
before_internal="$(curl -fsS --max-time 6 http://127.0.0.1:3030/api/deployment-version)"
before_public="$(curl -fsS --max-time 8 "$PUBLIC/api/deployment-version")"
before_wolo8092="$(ss -ltn | grep -Ec ':8092[[:space:]]' || true)"
before_wolo8093="$(ss -ltn | grep -Ec ':8093[[:space:]]' || true)"
origin="$(git remote get-url origin)"
protocol="$(git config --local --get protocol.version || true)"
sshcmd="$(git config --local --get core.sshCommand || true)"

old_version_present=0
if [ -f .aoe2war-build-version ]; then
  old_version_present=1
  cp -p .aoe2war-build-version "$RECEIPT/pre-build-version"
fi

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
  "origin=$origin" \
  "protocol=$protocol" \
  "sshcmd=$sshcmd" \
  > "$RECEIPT/prestage.txt"

restore_stage_failure() {{
  rc="$?"
  if [ "$rc" -ne 0 ]; then
    rm -rf .next-release
    git reset --hard "$PREVIOUS" >/dev/null 2>&1 || true
    if [ "$old_version_present" = "1" ] && [ -f "$RECEIPT/pre-build-version" ]; then
      cp -p "$RECEIPT/pre-build-version" .aoe2war-build-version || true
    else
      rm -f .aoe2war-build-version || true
    fi
    printf 'status=FAILED\nexit_code=%s\nrestored_source=%s\n' \
      "$rc" "$(git rev-parse HEAD 2>/dev/null || true)" \
      > "$RECEIPT/stage-status.txt" || true
  fi
  exit "$rc"
}}
trap restore_stage_failure EXIT

test "$before_head" = "$PREVIOUS"
test "$before_dirty" = "0"
test "$before_service" = "active"
test -n "$before_active_build"
test "$before_wolo8092" -ge 1
test "$before_wolo8093" -ge 1
test ! -e .next-release

git fetch origin --prune
remote_main="$(git rev-parse origin/main)"
test "$remote_main" = "$RELEASE"

git reset --hard "$RELEASE"
test "$(git rev-parse HEAD)" = "$RELEASE"
test -z "$(git status --porcelain --untracked-files=all)"

rm -rf .next-release
sudo -u {q(BUILD_USER)} -H env NEXT_DIST_DIR=.next-release npm run build \
  > "$RECEIPT/build.log" 2>&1

test -f .next-release/BUILD_ID
test -f .aoe2war-build-version

staged_build="$(cat .next-release/BUILD_ID)"
candidate_version="$(cat .aoe2war-build-version | tr -d '\r\n')"
artifact_sha="$(
  tar \
    --sort=name \
    --mtime='UTC 1970-01-01' \
    --owner=0 \
    --group=0 \
    --numeric-owner \
    -cf - .next-release \
  | sha256sum \
  | awk '{{print $1}}'
)"

after_head="$(git rev-parse HEAD)"
after_dirty="$(git status --porcelain --untracked-files=all | wc -l | tr -d ' ')"
after_service="$(systemctl is-active "$SERVICE" || true)"
after_active_build="$(cat .next/BUILD_ID 2>/dev/null || true)"
after_internal="$(curl -fsS --max-time 6 http://127.0.0.1:3030/api/deployment-version)"
after_public="$(curl -fsS --max-time 8 "$PUBLIC/api/deployment-version")"
after_wolo8092="$(ss -ltn | grep -Ec ':8092[[:space:]]' || true)"
after_wolo8093="$(ss -ltn | grep -Ec ':8093[[:space:]]' || true)"

test "$after_head" = "$RELEASE"
test "$after_dirty" = "0"
test "$after_service" = "active"
test "$after_active_build" = "$before_active_build"
test "$after_internal" = "$before_internal"
test "$after_public" = "$before_public"
test "$after_wolo8092" = "$before_wolo8092"
test "$after_wolo8093" = "$before_wolo8093"
test -n "$staged_build"
test -n "$candidate_version"
test -n "$artifact_sha"

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
  "service=$after_service" \
  "wolo8092=$after_wolo8092" \
  "wolo8093=$after_wolo8093" \
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
printf 'service\t%s\n' "$after_service"
printf 'wolo8092\t%s\n' "$after_wolo8092"
printf 'wolo8093\t%s\n' "$after_wolo8093"
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
    if result.get("source_sha") != manifest.get("release_sha"):
        errors.append("production source did not advance to manifest release SHA")
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
    if result.get("service") != "active":
        errors.append("AoE2WAR web service is not active after staging")
    if result.get("wolo8092") != str(prod.get("wolo_8092_count")):
        errors.append("WOLO 8092 listener count changed during staging")
    if result.get("wolo8093") != str(prod.get("wolo_8093_count")):
        errors.append("WOLO 8093 listener count changed during staging")

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
        print("Action:         advance exact source + build .next-release")
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
                "remote trap removes .next-release, restores previous source "
                "and pre-build version identity; live runtime is never stopped"
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
            print("Stage failure path attempted automatic source/build-version restoration.")
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
        "service": result["service"],
        "wolo_8092_count": int(result["wolo8092"]),
        "wolo_8093_count": int(result["wolo8093"]),
        "remote_receipt_dir": result["receipt_dir"],
        "live_runtime_mutated": False,
        "wolo_mutated": False,
    }
    local_receipt = write_local_receipt(payload)
    payload["local_receipt_path"] = str(local_receipt.relative_to(ROOT))
    payload["local_receipt_sha256"] = sha256_file(local_receipt)

    if json_output:
        print(json.dumps(payload, indent=2, sort_keys=True))
        return 0

    print(f"Source:         {payload['source_sha']}")
    print(f"Active build:   {payload['active_build_id']}  UNCHANGED")
    print(f"Staged build:   {payload['staged_build_id']}")
    print(f"Live version:   {payload['live_build_version']}  UNCHANGED")
    print(f"Candidate ver:  {payload['candidate_build_version']}")
    print(f"Artifact SHA:   {payload['artifact_sha256']}")
    print(f"Service:        {payload['service']}")
    print(
        "WOLO protected: "
        f"8092={payload['wolo_8092_count']}  "
        f"8093={payload['wolo_8093_count']}  UNTOUCHED"
    )
    print(f"Remote receipt: {payload['remote_receipt_dir']}")
    print(f"Local receipt:  {payload['local_receipt_path']}")
    print()
    print("PASS: RELEASE STAGED — LIVE RUNTIME UNCHANGED — WOLO UNTOUCHED")
    return 0
