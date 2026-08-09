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

from aoe2_release_gate import MANIFEST_DIR, ROOT, sha256_file

PROD_HOST = os.getenv("AOE2_RELEASE_HOST", "hel1")
PROD_REPO = os.getenv(
    "AOE2_RELEASE_PROD_REPO",
    "/var/www/AoE2HDBets/app-prodn",
)
SERVICE = os.getenv(
    "AOE2_RELEASE_SERVICE",
    "aoe2hdbets-web.service",
)
PUBLIC = os.getenv(
    "AOE2_RELEASE_PUBLIC_BASE",
    "https://aoe2war.com",
)
SHIP_PLAN_DIR = ROOT / ".aoe2war-release" / "ship-plans"

EXPECTED_ORIGIN = "git@github.com:Emaren/app-prodn.git"
EXPECTED_PROD_USER = "tony"
EXPECTED_DEPLOY_KEY = "/home/tony/.ssh/gh_deploy_aoe2hdbets_app_prodn"
EXPECTED_DEPLOY_KEY_FINGERPRINT = "SHA256:229KVsTphLtYRwmLbqR82g+uIBRip3wzmXfR3etNcZk"
EXPECTED_KNOWN_HOSTS = "/home/tony/.ssh/known_hosts"
EXPECTED_PROTOCOL = "0"


class ShipError(RuntimeError):
    pass


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def run(
    args: list[str],
    *,
    timeout: int = 30,
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


def production_transport() -> tuple[dict[str, str], str | None]:
    commands = [
        "set -euo pipefail",
        f"cd {shlex.quote(PROD_REPO)}",
        "origin=$(git remote get-url origin 2>/dev/null || true)",
        "sshcmd=$(git config --local --get core.sshCommand 2>/dev/null || true)",
        "protocol=$(git config --local --get protocol.version 2>/dev/null || true)",
        "executor=$(id -un)",
        "git_foreign_entries=$(find .git ! -user \"$executor\" -printf . 2>/dev/null | wc -c | tr -d ' ')",
        "git_unwritable_dirs=$(find .git -type d ! -writable -printf . 2>/dev/null | wc -c | tr -d ' ')",
        f"deploy_key={shlex.quote(EXPECTED_DEPLOY_KEY)}",
        "deploy_key_readable=$([ -r \"$deploy_key\" ] && echo 1 || echo 0)",
        "deploy_key_owner=$(stat -c '%U:%G' \"$deploy_key\" 2>/dev/null || true)",
        "deploy_key_mode=$(stat -c '%a' \"$deploy_key\" 2>/dev/null || true)",
        "deploy_key_fingerprint=$(ssh-keygen -lf \"$deploy_key\" 2>/dev/null | awk '{print $2}' || true)",
        "remote_main=$(git ls-remote --exit-code origin refs/heads/main 2>/dev/null | awk '{print $1}' || true)",
        'printf "origin\\t%s\\nsshcmd\\t%s\\nprotocol\\t%s\\nexecutor\\t%s\\ngit_foreign_entries\\t%s\\ngit_unwritable_dirs\\t%s\\ndeploy_key_readable\\t%s\\ndeploy_key_owner\\t%s\\ndeploy_key_mode\\t%s\\ndeploy_key_fingerprint\\t%s\\nremote_main\\t%s\\n" "$origin" "$sshcmd" "$protocol" "$executor" "$git_foreign_entries" "$git_unwritable_dirs" "$deploy_key_readable" "$deploy_key_owner" "$deploy_key_mode" "$deploy_key_fingerprint" "$remote_main"',
    ]
    remote = "; ".join(commands)
    p = run(
        [
            "ssh",
            "-o",
            "BatchMode=yes",
            "-o",
            "ConnectTimeout=8",
            PROD_HOST,
            f"bash -lc {shlex.quote(remote)}",
        ],
        timeout=20,
    )
    if p.returncode != 0:
        return {}, (p.stderr or "").strip() or f"ssh exited {p.returncode}"
    return parse_kv(p.stdout or ""), None


def load_manifest(release_sha: str) -> tuple[Path, dict, str]:
    path = MANIFEST_DIR / f"{release_sha}.json"
    digest_path = path.with_suffix(".json.sha256")
    if not path.is_file():
        raise ShipError(
            f"Release manifest is missing: {path.relative_to(ROOT)}"
        )
    if not digest_path.is_file():
        raise ShipError(
            f"Manifest SHA-256 file is missing: {digest_path.relative_to(ROOT)}"
        )

    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise ShipError(f"Release manifest is invalid JSON: {exc}") from exc

    actual = sha256_file(path)
    expected = digest_path.read_text(encoding="utf-8").split()[0]
    if actual != expected:
        raise ShipError(
            f"Release manifest SHA-256 mismatch: expected {expected}, got {actual}"
        )

    return path, payload, actual


def gate_integrity(manifest: dict) -> tuple[Path, str]:
    gate = manifest.get("gate") or {}
    rel = gate.get("receipt_path")
    expected = gate.get("receipt_sha256")
    if not rel or not expected:
        raise ShipError("Manifest does not bind a gate receipt.")

    path = (ROOT / rel).resolve()
    try:
        path.relative_to(ROOT.resolve())
    except ValueError as exc:
        raise ShipError("Manifest gate receipt escapes repository state.") from exc

    if not path.is_file():
        raise ShipError(f"Bound gate receipt is missing: {rel}")

    actual = sha256_file(path)
    if actual != expected:
        raise ShipError(
            f"Gate receipt SHA-256 mismatch: expected {expected}, got {actual}"
        )

    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise ShipError(f"Gate receipt is invalid JSON: {exc}") from exc

    if payload.get("status") != "PASS":
        raise ShipError("Bound gate receipt is not PASS.")
    if payload.get("target_sha") != manifest.get("release_sha"):
        raise ShipError("Gate receipt target does not equal manifest release SHA.")
    if payload.get("scope_sha256") != manifest.get("scope_sha256"):
        raise ShipError("Gate receipt scope does not equal manifest scope.")

    return path, actual


def validation_errors(
    data: dict,
    manifest: dict,
    transport: dict[str, str],
) -> list[str]:
    local = data["local"]
    github = data["github"]
    docs = data["documentation"]
    prod = data["production"]

    release_sha = manifest.get("release_sha")
    errors: list[str] = []

    if local.get("dirty_count") != 0:
        errors.append("local worktree is not clean")
    if not release_sha or local.get("head") != release_sha:
        errors.append("local HEAD does not equal manifest release SHA")
    if github.get("main_sha") != release_sha:
        errors.append("GitHub main does not equal manifest release SHA")
    if docs.get("baseline_is_ancestor_of_local") is not True:
        errors.append("Documentation Baseline is not a valid ancestor")
    if manifest.get("documentation_baseline") != docs.get(
        "implementation_baseline"
    ):
        errors.append("manifest Documentation Baseline does not match repository")
    if not prod.get("reachable"):
        errors.append("production is unreachable")
    if prod.get("dirty_count") != 0:
        errors.append("production worktree is not clean")
    if prod.get("source_sha") != manifest.get("previous_production_sha"):
        errors.append("production source no longer equals manifest previous production")
    if prod.get("source_sha") == release_sha:
        errors.append("production source already equals the release")
    if prod.get("service") != "active":
        errors.append("production web service is not active")
    if not prod.get("active_build_id"):
        errors.append("active production BUILD_ID is unavailable")
    if prod.get("version_parity") is not True:
        errors.append("internal/public build-version parity is not healthy")
    if prod.get("staged_build_id"):
        errors.append("a staged .next-release build already exists")
    if (prod.get("wolo_8092_count") or 0) < 1:
        errors.append("protected WOLO listener 8092 is missing")
    if (prod.get("wolo_8093_count") or 0) < 1:
        errors.append("protected WOLO listener 8093 is missing")

    migrations = manifest.get("migration_paths") or []
    if migrations:
        errors.append(
            "release contains Prisma migrations; automated ship does not support migrations yet"
        )

    if transport.get("origin") != EXPECTED_ORIGIN:
        errors.append("production Git origin does not match canonical origin")
    if transport.get("protocol") != EXPECTED_PROTOCOL:
        errors.append("production Git protocol is not canonical protocol v0")
    if transport.get("executor") != EXPECTED_PROD_USER:
        errors.append("production Git execution user is not the canonical deploy user")
    if transport.get("git_foreign_entries") != "0":
        errors.append("production .git contains entries not owned by the deploy user")
    if transport.get("git_unwritable_dirs") != "0":
        errors.append("production .git contains directories not writable by the deploy user")
    if transport.get("deploy_key_readable") != "1":
        errors.append("production dedicated deploy key is not readable by the deploy user")
    if transport.get("deploy_key_owner") != f"{EXPECTED_PROD_USER}:{EXPECTED_PROD_USER}":
        errors.append("production dedicated deploy key ownership is not canonical")
    if transport.get("deploy_key_mode") not in {"400", "600"}:
        errors.append("production dedicated deploy key permissions are not restrictive")
    if transport.get("deploy_key_fingerprint") != EXPECTED_DEPLOY_KEY_FINGERPRINT:
        errors.append("production dedicated deploy key fingerprint does not match")
    sshcmd = transport.get("sshcmd") or ""
    if EXPECTED_DEPLOY_KEY not in sshcmd:
        errors.append("production core.sshCommand does not use the dedicated deploy key")
    if "-F /dev/null" not in sshcmd:
        errors.append("production core.sshCommand does not disable SSH config fallback")
    if "IdentitiesOnly=yes" not in sshcmd:
        errors.append("production core.sshCommand does not require IdentitiesOnly=yes")
    if "BatchMode=yes" not in sshcmd:
        errors.append("production core.sshCommand does not require BatchMode=yes")
    if "StrictHostKeyChecking=yes" not in sshcmd:
        errors.append("production core.sshCommand does not require strict host-key checking")
    if f"UserKnownHostsFile={EXPECTED_KNOWN_HOSTS}" not in sshcmd:
        errors.append("production core.sshCommand does not use the canonical known_hosts file")
    if transport.get("remote_main") != release_sha:
        errors.append("production origin main does not resolve to manifest release SHA")

    return errors


def build_plan(
    data: dict,
    manifest: dict,
    manifest_sha: str,
    gate_path: Path,
    gate_sha: str,
) -> dict:
    prod = data["production"]
    release_sha = manifest["release_sha"]
    previous_sha = manifest["previous_production_sha"]
    active_build = prod["active_build_id"]
    version = prod["internal_build_version"]
    release_short = release_sha[:12]

    steps = [
        {
            "phase": "preflight",
            "action": "Re-read production source, service, build identity, disk, Git transport, public version, and protected WOLO listeners; abort on drift.",
        },
        {
            "phase": "receipt",
            "action": "Create a durable deployment receipt under /mnt/HC_Volume_105319120/aoe2war/deploy-receipts/ and record the bound release manifest plus predeploy truth.",
        },
        {
            "phase": "rollback",
            "action": "Preserve the active .next runtime and deployment identity in durable rollback storage before runtime mutation.",
        },
        {
            "phase": "source",
            "command": f"git reset --hard {release_sha}",
            "action": "Advance production source only to the exact manifest release SHA and verify a clean checkout.",
        },
        {
            "phase": "migration",
            "action": "No Prisma migration. The manifest declares zero migration paths.",
        },
        {
            "phase": "build",
            "command": "rm -rf .next-release && sudo -n -u tony -H env NEXT_DIST_DIR=.next-release npm run build",
            "action": "Build beside the active runtime; verify build success, BUILD_ID, generated build version, ownership, and repository cleanliness before service stop.",
        },
        {
            "phase": "artifact",
            "action": "Record candidate BUILD_ID, build version, and deterministic artifact SHA-256 in the deployment receipt before activation.",
        },
        {
            "phase": "activate",
            "command": f"systemctl stop {SERVICE}; mv .next .next-rollback-<UTC>; mv .next-release .next; chown -R tony:tony .next; systemctl start {SERVICE}",
            "action": "Atomically preserve the fast rollback, activate the staged runtime, and restart only the AoE2WAR web service.",
        },
        {
            "phase": "prove",
            "action": "Prove service active; BUILD_ID/build-version identity; internal /, /api/lobby, /api/bets, /api/deployment-version; corresponding public routes; and protected WOLO listener continuity.",
        },
        {
            "phase": "certify",
            "action": "Write final proof and artifact identity to the durable deployment receipt. On any critical proof failure, restore previous source/runtime and prove internal health.",
        },
    ]

    return {
        "schema": 1,
        "kind": "aoe2war-ship-plan",
        "generated_at": utc_now(),
        "mode": "DRY_RUN",
        "release_sha": release_sha,
        "release_short": release_short,
        "implementation_sha": manifest.get("implementation_sha"),
        "previous_production_sha": previous_sha,
        "current_active_build_id": active_build,
        "current_build_version": version,
        "risk_class": manifest.get("risk_class"),
        "migration_paths": manifest.get("migration_paths") or [],
        "manifest_sha256": manifest_sha,
        "gate_receipt_path": str(gate_path.relative_to(ROOT)),
        "gate_receipt_sha256": gate_sha,
        "protected_services": {
            "wolo_8092_mutation_allowed": False,
            "wolo_8093_mutation_allowed": False,
        },
        "public_base": PUBLIC,
        "steps": steps,
    }


def write_plan(plan: dict) -> Path:
    SHIP_PLAN_DIR.mkdir(parents=True, exist_ok=True)
    path = SHIP_PLAN_DIR / (
        f"{plan['release_sha']}-{plan['manifest_sha256'][:12]}.json"
    )
    path.write_text(
        json.dumps(plan, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return path


def ship_release(
    data: dict,
    *,
    dry_run: bool,
    json_output: bool = False,
) -> int:
    if not dry_run:
        message = (
            "Phase III currently implements ship --dry-run only. "
            "No production mutation was performed."
        )
        if json_output:
            print(json.dumps({"status": "ERROR", "error": message}, indent=2))
        else:
            print(f"STOP: {message}")
        return 2

    release_sha = data["local"].get("head")
    if not release_sha:
        print("STOP: local HEAD is unavailable.")
        return 2

    try:
        manifest_path, manifest, manifest_sha = load_manifest(release_sha)
        gate_path, gate_sha = gate_integrity(manifest)
    except ShipError as exc:
        if json_output:
            print(json.dumps({"status": "ERROR", "error": str(exc)}, indent=2))
        else:
            print(f"STOP: {exc}")
        return 2

    transport, transport_error = production_transport()
    if transport_error:
        if json_output:
            print(
                json.dumps(
                    {"status": "ERROR", "error": transport_error},
                    indent=2,
                )
            )
        else:
            print(f"STOP: production Git transport inspection failed: {transport_error}")
        return 2

    errors = validation_errors(data, manifest, transport)
    if errors:
        payload = {
            "schema": 1,
            "kind": "aoe2war-ship-preflight",
            "status": "BLOCKED",
            "errors": errors,
        }
        if json_output:
            print(json.dumps(payload, indent=2, sort_keys=True))
        else:
            print("STOP: SHIP DRY-RUN PREFLIGHT BLOCKED")
            for error in errors:
                print(f"  - {error}")
        return 2

    plan = build_plan(
        data,
        manifest,
        manifest_sha,
        gate_path,
        gate_sha,
    )
    plan_path = write_plan(plan)
    payload = {
        **plan,
        "status": "PASS",
        "manifest_path": str(manifest_path.relative_to(ROOT)),
        "plan_path": str(plan_path.relative_to(ROOT)),
        "plan_sha256": sha256_file(plan_path),
    }

    if json_output:
        print(json.dumps(payload, indent=2, sort_keys=True))
        return 0

    print("⚔️  AOE2WAR SHIP DRY RUN")
    print(f"Release:        {plan['release_sha']}")
    print(f"Implementation: {plan['implementation_sha']}")
    print(f"Previous prod:  {plan['previous_production_sha']}")
    print(f"Risk:           {plan['risk_class']}")
    print(f"Migrations:     {len(plan['migration_paths'])}")
    print(f"Manifest SHA:   {plan['manifest_sha256']}")
    print(f"Gate SHA:       {plan['gate_receipt_sha256']}")
    print(f"Origin:         {transport.get('origin')}")
    print(f"Protocol:       {transport.get('protocol')}")
    print(f"Remote main:    {transport.get('remote_main')}")
    print(f"Plan:           {payload['plan_path']}")
    print(f"Plan SHA256:    {payload['plan_sha256']}")
    print()
    for index, step in enumerate(plan["steps"], start=1):
        print(f"{index:02d}. {step['phase'].upper()}: {step['action']}")
        if step.get("command"):
            print(f"    $ {step['command']}")
    print()
    print("PASS: SHIP DRY RUN — ZERO PRODUCTION MUTATION")

    return 0
