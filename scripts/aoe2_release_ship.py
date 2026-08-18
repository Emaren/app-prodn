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


def _bounded_env_int(name: str, default: int, minimum: int, maximum: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    return max(minimum, min(maximum, value))


ACTIVATION_SOAK_SECONDS = _bounded_env_int(
    "AOE2_RELEASE_SOAK_SECONDS", 60, 10, 300
)
ACTIVATION_SOAK_INTERVAL_SECONDS = _bounded_env_int(
    "AOE2_RELEASE_SOAK_INTERVAL_SECONDS", 10, 5, 60
)
FAST_ROLLBACK_KEEP = _bounded_env_int(
    "AOE2_RELEASE_FAST_ROLLBACK_KEEP", 1, 1, 10
)


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
    if prod.get("wolo_8092_count") != 1:
        errors.append("protected WOLO listener 8092 count must be exactly 1")
    if prod.get("wolo_8093_count") != 1:
        errors.append("protected WOLO listener 8093 count must be exactly 1")

    migrations = manifest.get("migration_paths") or []
    if migrations and manifest.get("risk_class") not in {"FINANCIAL", "DATABASE"}:
        errors.append(
            "release contains Prisma migrations without a DATABASE/FINANCIAL gate"
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
            "action": "Preserve a cache-free copy of the active .next runtime plus source/build-version identity in durable rollback storage before activation.",
        },
        {
            "phase": "isolate",
            "command": f"git worktree add --detach <temporary-worktree> {release_sha}",
            "action": "Create a disposable per-release worktree. Keep the live source, public tree, node_modules, build-version sidecar, and active runtime unchanged during staging.",
        },
        {
            "phase": "migration",
            "action": (
                "After candidate staging, require an exact production migration frontier, "
                "write a durable pre-migration pg_dump, apply only the manifest-bound additive "
                "Prisma migrations, and verify their _prisma_migrations receipts before activation."
                if (manifest.get("migration_paths") or [])
                else "No Prisma migration. The manifest declares zero migration paths."
            ),
        },
        {
            "phase": "build",
            "command": "prove unchanged Yarn/package dependency contract, copy live node_modules into a temporary worktree, then run NEXT_DIST_DIR=.next-release yarn build",
            "action": "With an unchanged Yarn lock and package dependency contract, build in the disposable worktree using a copy of the proven dependency tree; fail closed when atomic node_modules activation and rollback would be required.",
        },
        {
            "phase": "artifact",
            "action": "Remove rebuildable cache, copy the cache-free candidate to live .next-release, and bind BUILD_ID, build version, and deterministic artifact SHA-256 in the stage receipt.",
        },
        {
            "phase": "activate",
            "command": f"systemctl stop {SERVICE}; mv .next .next-rollback-<UTC>; mv .next-release .next; git reset --hard {release_sha}; write-build-version; systemctl start {SERVICE}",
            "action": "While the web service is stopped, advance runtime, source, and build-version identity together, then start only the AoE2WAR web service.",
        },
        {
            "phase": "prove",
            "action": "Prove service active; BUILD_ID/build-version identity; internal /, /api/lobby, /api/bets, /api/deployment-version; corresponding public routes; and protected WOLO listener continuity.",
        },
        {
            "phase": "soak",
            "action": "Keep the activation rollback trap armed through a bounded post-activation health soak that repeatedly proves exact source/build/version, critical internal/public routes, service health, and WOLO listener continuity.",
        },
        {
            "phase": "certify",
            "action": "Write final proof and artifact identity to the durable deployment receipt only after the soak passes. On any critical proof failure before certification, restore previous source/build-version/runtime, preserve the exact staged candidate, and prove internal health.",
        },
        {
            "phase": "retention",
            "action": "After certification, retain the newest verified fast rollback copies and prune only older modern fast copies whose BUILD_ID has durable volume-backed rollback/rescue evidence. Never auto-delete unmatched artifacts.",
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


ACTIVATION_RECEIPT_DIR = ROOT / ".aoe2war-release" / "activation-receipts"
STAGE_RECEIPT_DIR = ROOT / ".aoe2war-release" / "stage-receipts"
REMOTE_RECEIPT_ROOT = "/mnt/HC_Volume_105319120/aoe2war/deploy-receipts"
ROLLBACK_ROOT = "/mnt/HC_Volume_105319120/aoe2war/rollbacks"


def _is_hex(value: object, length: int) -> bool:
    return (
        isinstance(value, str)
        and len(value) == length
        and all(ch in "0123456789abcdef" for ch in value)
    )


def load_stage_receipt(
    stage_receipt: str,
) -> tuple[Path, dict, str, Path, dict, str, Path, str]:
    raw = Path(stage_receipt)
    path = (raw if raw.is_absolute() else ROOT / raw).resolve()
    allowed = STAGE_RECEIPT_DIR.resolve()
    try:
        path.relative_to(allowed)
    except ValueError as exc:
        raise ShipError(
            "Activation stage receipt must live under "
            ".aoe2war-release/stage-receipts."
        ) from exc
    if not path.is_file():
        raise ShipError(f"Stage receipt is missing: {path}")

    try:
        receipt = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise ShipError(f"Stage receipt is invalid JSON: {exc}") from exc

    if receipt.get("schema") != 1:
        raise ShipError("Stage receipt schema is not supported.")
    if receipt.get("kind") != "aoe2war-stage-result":
        raise ShipError("Stage receipt kind is not aoe2war-stage-result.")
    if receipt.get("status") != "STAGED":
        raise ShipError("Stage receipt is not STAGED.")
    if receipt.get("live_runtime_mutated") is not False:
        raise ShipError("Stage receipt does not prove live runtime remained unchanged.")
    if receipt.get("wolo_mutated") is not False:
        raise ShipError("Stage receipt does not prove WOLO remained untouched.")
    isolation_requirements = {
        "isolated_worktree": True,
        "build_process_sandboxed": True,
        "build_network_private": True,
        "build_secret_paths_inaccessible": True,
        "dependency_fetch_sandboxed": True,
        "dependency_fetch_scripts_disabled": True,
        "dependency_build_offline": True,
        "prisma_schema_engine_seeded": True,
        "cache_free_artifact": True,
        "artifact_path_relocated": True,
        "live_source_mutated": False,
        "live_public_mutated": False,
        "live_node_modules_mutated": False,
        "live_build_version_mutated": False,
    }
    for key, expected in isolation_requirements.items():
        if receipt.get(key) is not expected:
            raise ShipError(
                f"Stage receipt does not prove isolated-stage invariant: {key}."
            )

    release_sha = receipt.get("release_sha")
    artifact_sha = receipt.get("artifact_sha256")
    if not _is_hex(release_sha, 40):
        raise ShipError("Stage receipt release SHA is invalid.")
    if not _is_hex(artifact_sha, 64):
        raise ShipError("Stage receipt artifact SHA-256 is invalid.")

    dependency_sha = receipt.get("candidate_node_modules_sha256")
    if not _is_hex(dependency_sha, 64):
        raise ShipError(
            "Stage receipt candidate node_modules SHA-256 is invalid."
        )

    try:
        dependency_kb = int(receipt.get("candidate_node_modules_kb") or 0)
    except (TypeError, ValueError):
        dependency_kb = 0
    if dependency_kb <= 0:
        raise ShipError(
            "Stage receipt candidate node_modules size is invalid."
        )

    prisma_engine_commit = receipt.get("prisma_schema_engine_commit")
    if not _is_hex(prisma_engine_commit, 40):
        raise ShipError("Stage receipt Prisma schema-engine commit is invalid.")
    prisma_engine_sha = receipt.get("prisma_schema_engine_sha256")
    if not _is_hex(prisma_engine_sha, 64):
        raise ShipError("Stage receipt Prisma schema-engine SHA-256 is invalid.")

    for key in ("dependency_contract_unchanged", "dependency_lock_changed"):
        if not isinstance(receipt.get(key), bool):
            raise ShipError(
                f"Stage receipt dependency evidence flag is invalid: {key}."
            )
    if path.name != f"{release_sha}-{artifact_sha[:12]}.json":
        raise ShipError("Stage receipt filename is not bound to release/artifact.")

    required = (
        "active_build_id",
        "staged_build_id",
        "live_build_version",
        "candidate_build_version",
        "candidate_node_modules_sha256",
        "candidate_node_modules_kb",
        "prisma_schema_engine_commit",
        "prisma_schema_engine_sha256",
        "previous_production_sha",
        "source_sha",
        "manifest_path",
        "manifest_sha256",
        "gate_path",
        "gate_sha256",
        "remote_receipt_dir",
    )
    for key in required:
        if not receipt.get(key):
            raise ShipError(f"Stage receipt is missing required field: {key}")

    if not _is_hex(receipt.get("previous_production_sha"), 40):
        raise ShipError("Stage receipt previous production SHA is invalid.")
    if not _is_hex(receipt.get("manifest_sha256"), 64):
        raise ShipError("Stage receipt manifest SHA-256 is invalid.")
    if not _is_hex(receipt.get("gate_sha256"), 64):
        raise ShipError("Stage receipt gate SHA-256 is invalid.")
    if int(receipt.get("wolo_8092_count") or 0) != 1:
        raise ShipError("Stage receipt must bind exactly one WOLO 8092 listener.")
    if int(receipt.get("wolo_8093_count") or 0) != 1:
        raise ShipError("Stage receipt must bind exactly one WOLO 8093 listener.")

    remote_receipt = str(receipt["remote_receipt_dir"])
    if not remote_receipt.startswith(f"{REMOTE_RECEIPT_ROOT}/stage-"):
        raise ShipError("Remote stage receipt is outside the canonical receipt root.")

    manifest_path, manifest, manifest_sha = load_manifest(release_sha)
    gate_path, gate_sha = gate_integrity(manifest)
    if str(manifest_path.relative_to(ROOT)) != receipt["manifest_path"]:
        raise ShipError("Stage receipt manifest path does not match release manifest.")
    if manifest_sha != receipt["manifest_sha256"]:
        raise ShipError("Stage receipt manifest SHA-256 does not match release manifest.")
    if str(gate_path.relative_to(ROOT)) != receipt["gate_path"]:
        raise ShipError("Stage receipt gate path does not match bound gate receipt.")
    if gate_sha != receipt["gate_sha256"]:
        raise ShipError("Stage receipt gate SHA-256 does not match bound gate receipt.")
    if manifest.get("release_sha") != release_sha:
        raise ShipError("Manifest release SHA does not match stage receipt.")
    if manifest.get("previous_production_sha") != receipt["previous_production_sha"]:
        raise ShipError("Manifest previous production SHA does not match stage receipt.")
    if receipt.get("source_sha") != receipt.get("previous_production_sha"):
        raise ShipError(
            "Stage receipt does not prove production source remained on the previous SHA."
        )
    if manifest.get("risk_class") != receipt.get("risk_class"):
        raise ShipError("Manifest risk class does not match stage receipt.")
    if manifest.get("migration_paths") and manifest.get("risk_class") not in {"FINANCIAL", "DATABASE"}:
        raise ShipError(
            "Release contains Prisma migrations without a DATABASE/FINANCIAL gate."
        )
    dependency_lock_changed = "yarn.lock" in (
        manifest.get("changed_files") or []
    )
    if receipt.get("dependency_lock_changed") is not dependency_lock_changed:
        raise ShipError(
            "Stage receipt dependency-lock evidence does not match manifest."
        )

    return (
        path,
        receipt,
        sha256_file(path),
        manifest_path,
        manifest,
        manifest_sha,
        gate_path,
        gate_sha,
    )


def activation_validation_errors(
    data: dict,
    receipt: dict,
    transport: dict[str, str],
) -> list[str]:
    local = data["local"]
    github = data["github"]
    docs = data["documentation"]
    prod = data["production"]
    errors: list[str] = []

    if local.get("dirty_count") != 0:
        errors.append("local tooling worktree is not clean")
    if not local.get("head"):
        errors.append("local tooling HEAD is unavailable")
    if github.get("main_sha") != local.get("head"):
        errors.append("local tooling HEAD does not equal GitHub main")
    if docs.get("baseline_is_ancestor_of_local") is not True:
        errors.append("Documentation Baseline is not a valid ancestor of tooling HEAD")

    if not prod.get("reachable"):
        errors.append("production is unreachable")
    if prod.get("dirty_count") != 0:
        errors.append("production worktree is not clean")
    if prod.get("source_sha") != receipt.get("previous_production_sha"):
        errors.append("production source does not equal the stage receipt previous SHA")
    if prod.get("service") != "active":
        errors.append("production web service is not active")
    if prod.get("active_build_id") != receipt.get("active_build_id"):
        errors.append("active BUILD_ID drifted from stage receipt")
    if prod.get("staged_build_id") != receipt.get("staged_build_id"):
        errors.append("staged BUILD_ID drifted from stage receipt")
    if prod.get("internal_build_version") != receipt.get("live_build_version"):
        errors.append("internal live build version drifted from stage receipt")
    if prod.get("public_build_version") != receipt.get("live_build_version"):
        errors.append("public live build version drifted from stage receipt")
    if prod.get("version_parity") is not True:
        errors.append("internal/public live build-version parity is not healthy")
    if prod.get("wolo_8092_count") != receipt.get("wolo_8092_count"):
        errors.append("protected WOLO listener 8092 drifted from stage receipt")
    if prod.get("wolo_8093_count") != receipt.get("wolo_8093_count"):
        errors.append("protected WOLO listener 8093 drifted from stage receipt")

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
        errors.append("production dedicated deploy key is not readable by deploy user")
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
    if transport.get("remote_main") != github.get("main_sha"):
        errors.append("production origin main does not equal current GitHub main")

    return errors


def remote_activation_script(
    receipt: dict,
    *,
    stage_receipt_sha: str,
    stage_receipt_text: str,
    dry_run: bool,
    receipt_dir: str,
    rollback_dir: str,
) -> str:
    q = shlex.quote
    mode = "DRY_RUN" if dry_run else "ACTIVATE"
    return f"""
set -euo pipefail
cd {q(PROD_REPO)}

MODE={q(mode)}
SERVICE={q(SERVICE)}
PUBLIC={q(PUBLIC)}
RELEASE={q(receipt['release_sha'])}
PREVIOUS={q(receipt['previous_production_sha'])}
OLD_BUILD={q(receipt['active_build_id'])}
STAGED_BUILD={q(receipt['staged_build_id'])}
LIVE_VERSION={q(receipt['live_build_version'])}
CANDIDATE_VERSION={q(receipt['candidate_build_version'])}
ARTIFACT={q(receipt['artifact_sha256'])}
DEPENDENCY_ARTIFACT={q(receipt['candidate_node_modules_sha256'])}
DEPENDENCY_KB={q(str(receipt['candidate_node_modules_kb']))}
PRISMA_ENGINE_COMMIT={q(receipt['prisma_schema_engine_commit'])}
PRISMA_ENGINE_SHA={q(receipt['prisma_schema_engine_sha256'])}
DEPENDENCY_CONTRACT_UNCHANGED={q("1" if receipt['dependency_contract_unchanged'] else "0")}
DEPENDENCY_LOCK_CHANGED={q("1" if receipt['dependency_lock_changed'] else "0")}
MANIFEST_SHA={q(receipt['manifest_sha256'])}
GATE_SHA={q(receipt['gate_sha256'])}
STAGE_RECEIPT_SHA={q(stage_receipt_sha)}
STAGE_REMOTE={q(receipt['remote_receipt_dir'])}
ACT_RECEIPT={q(receipt_dir)}
ROLLBACK={q(rollback_dir)}
STAGE_RECEIPT_CONTENT={q(stage_receipt_text)}
SOAK_SECONDS={ACTIVATION_SOAK_SECONDS}
SOAK_INTERVAL={ACTIVATION_SOAK_INTERVAL_SECONDS}
FAST_ROLLBACK_KEEP={FAST_ROLLBACK_KEEP}

wolo_count() {{ ss -ltn | grep -Ec ":$1[[:space:]]" || true; }}
build_version() {{ python3 -c 'import json,sys; print(json.load(sys.stdin).get("buildVersion",""))'; }}
artifact_hash() {{
  tar --sort=name --mtime='UTC 1970-01-01' --owner=0 --group=0 --numeric-owner \
    -C "$1" -cf - . \
  | sha256sum | awk '{{print $1}}'
}}
content_hash() {{
  tar --sort=name --mtime='UTC 1970-01-01' --owner=0 --group=0 --numeric-owner \
    --exclude='./cache' --exclude='./cache/*' \
    -C "$1" -cf - . \
  | sha256sum | awk '{{print $1}}'
}}
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
source_state_hash() {{
  {{
    git rev-parse HEAD
    printf '\\0'
    source_status
  }} | sha256sum | awk '{{print $1}}'
}}
release_path_is_reserved() {{
  case "$1" in
    .next|.next/*|node_modules|node_modules/*|\
    .next-release|.next-release/*|.node_modules-release|.node_modules-release/*|\
    .next-rollback*|.node_modules-rollback*|\
    .aoe2war-build-version|.aoe2war-release|.aoe2war-release/*) return 0 ;;
  esac
  return 1
}}
release_only_list_integrity() {{
  test -f "$RELEASE_ONLY_PATHS" \
    && test ! -L "$RELEASE_ONLY_PATHS" \
    && test "$(stat -c '%a' "$RELEASE_ONLY_PATHS")" = "600" \
    && test "$(sha256sum "$RELEASE_ONLY_PATHS" | awk '{{print $1}}')" = "$release_only_paths_sha"
}}
release_path_literal() {{ printf '%s' ":(top,literal)$1"; }}
release_path_shape_is_safe() {{
  release_shape_path="$1"
  case "$release_shape_path" in
    ""|/*|.|..|./*|../*|*/./*|*/.|*/../*|*/..|*//*) return 1 ;;
  esac
  release_path_is_reserved "$release_shape_path" && return 1
  release_shape_parent=""
  release_shape_remainder="$release_shape_path"
  while [[ "$release_shape_remainder" == */* ]]; do
    release_shape_component="${{release_shape_remainder%%/*}}"
    release_shape_remainder="${{release_shape_remainder#*/}}"
    if [ -z "$release_shape_parent" ]; then
      release_shape_parent="$release_shape_component"
    else
      release_shape_parent="$release_shape_parent/$release_shape_component"
    fi
    test ! -L "$release_shape_parent" || return 1
    if [ -e "$release_shape_parent" ] && [ ! -d "$release_shape_parent" ]; then
      return 1
    fi
  done
  return 0
}}
release_path_absent() {{
  release_absent_path="$1"
  release_absent_literal="$(release_path_literal "$release_absent_path")"
  test ! -e "$release_absent_path" || return 1
  test ! -L "$release_absent_path" || return 1
  release_absent_tracked_bytes="$(
    git ls-files --cached -z -- "$release_absent_literal" | wc -c | tr -d ' '
  )" || return 1
  release_absent_untracked_bytes="$(
    git ls-files --others --exclude-standard -z -- "$release_absent_literal" | wc -c | tr -d ' '
  )" || return 1
  release_absent_ignored_bytes="$(
    git ls-files --others --ignored --exclude-standard -z -- "$release_absent_literal" | wc -c | tr -d ' '
  )" || return 1
  test "$release_absent_tracked_bytes" = "0" \
    && test "$release_absent_untracked_bytes" = "0" \
    && test "$release_absent_ignored_bytes" = "0"
}}
validate_release_only_paths() {{
  release_only_list_integrity || return 1
  while IFS= read -r -d '' release_only_path; do
    release_path_shape_is_safe "$release_only_path" || return 1
    release_only_literal="$(release_path_literal "$release_only_path")"
    release_only_mode="$(
      git -c core.quotePath=true ls-tree "$RELEASE" -- "$release_only_literal" \
        | awk 'NR == 1 {{print $1; exit}}'
    )"
    case "$release_only_mode" in
      100644|100755|120000) ;;
      *) return 1 ;;
    esac
    release_path_absent "$release_only_path" || return 1
  done < "$RELEASE_ONLY_PATHS"
}}
cleanup_release_only_paths() {{
  cleanup_release_only_rc=0
  release_only_list_integrity || return 1
  while IFS= read -r -d '' release_only_path; do
    # A failed reset toward RELEASE can materialize a newly tracked path while
    # leaving HEAD at PREVIOUS. The pre-mutation proof makes -x safe here; the
    # literal top-level pathspec prevents names from expanding as Git magic.
    if ! release_path_shape_is_safe "$release_only_path"; then
      cleanup_release_only_rc=1
      continue
    fi
    release_only_literal="$(release_path_literal "$release_only_path")"
    if [ -e "$release_only_path" ] || [ -L "$release_only_path" ]; then
      git clean -f -x -- "$release_only_literal" >/dev/null 2>&1 \
        || cleanup_release_only_rc=1
    fi
    release_path_absent "$release_only_path" || cleanup_release_only_rc=1
  done < "$RELEASE_ONLY_PATHS"
  return "$cleanup_release_only_rc"
}}
critical_get() {{
  curl -fsS --max-time 12 --retry 3 --retry-delay 1 --retry-all-errors -o /dev/null "$1"
}}

before_head="$(git rev-parse HEAD)"
before_dirty="$(source_status | wc -l | tr -d ' ')"
before_source_state="$(source_state_hash)"
before_service="$(systemctl is-active "$SERVICE" || true)"
before_pid="$(systemctl show "$SERVICE" -p MainPID --value)"
before_active_build="$(cat .next/BUILD_ID 2>/dev/null || true)"
before_staged_build="$(cat .next-release/BUILD_ID 2>/dev/null || true)"
before_build_version_file="$(cat .aoe2war-build-version 2>/dev/null | tr -d '\\r\\n')"
before_internal_version="$(curl -fsS --max-time 8 http://127.0.0.1:3030/api/deployment-version | build_version)"
before_public_version="$(curl -fsS --max-time 10 "$PUBLIC/api/deployment-version" | build_version)"
before_wolo8092="$(wolo_count 8092)"
before_wolo8093="$(wolo_count 8093)"

sudo -n -l /usr/bin/systemctl stop "$SERVICE" >/dev/null
sudo -n -l /usr/bin/systemctl start "$SERVICE" >/dev/null
sudo -n -l /usr/bin/install >/dev/null

test "$before_head" = "$PREVIOUS"
test "$before_dirty" = "0"
test "$before_service" = "active"
test -n "$before_pid"
test "$before_active_build" = "$OLD_BUILD"
test "$before_staged_build" = "$STAGED_BUILD"
test "$before_build_version_file" = "$LIVE_VERSION"
test "$before_internal_version" = "$LIVE_VERSION"
test "$before_public_version" = "$LIVE_VERSION"
test "$before_wolo8092" = {q(str(receipt['wolo_8092_count']))}
test "$before_wolo8093" = {q(str(receipt['wolo_8093_count']))}

test -d "$STAGE_REMOTE"
test -f "$STAGE_REMOTE/release-manifest.json"
test -f "$STAGE_REMOTE/gate-receipt.json"
test -f "$STAGE_REMOTE/stage-status.txt"
test "$(sha256sum "$STAGE_REMOTE/release-manifest.json" | awk '{{print $1}}')" = "$MANIFEST_SHA"
test "$(sha256sum "$STAGE_REMOTE/gate-receipt.json" | awk '{{print $1}}')" = "$GATE_SHA"
grep -Fx "status=STAGED" "$STAGE_REMOTE/stage-status.txt" >/dev/null
grep -Fx "release_sha=$RELEASE" "$STAGE_REMOTE/stage-status.txt" >/dev/null
grep -Fx "active_build_id=$OLD_BUILD" "$STAGE_REMOTE/stage-status.txt" >/dev/null
grep -Fx "staged_build_id=$STAGED_BUILD" "$STAGE_REMOTE/stage-status.txt" >/dev/null
grep -Fx "candidate_build_version=$CANDIDATE_VERSION" "$STAGE_REMOTE/stage-status.txt" >/dev/null
grep -Fx "artifact_sha256=$ARTIFACT" "$STAGE_REMOTE/stage-status.txt" >/dev/null
grep -Fx "candidate_node_modules_sha256=$DEPENDENCY_ARTIFACT" "$STAGE_REMOTE/stage-status.txt" >/dev/null
grep -Fx "candidate_node_modules_kb=$DEPENDENCY_KB" "$STAGE_REMOTE/stage-status.txt" >/dev/null
grep -Fx "prisma_schema_engine_commit=$PRISMA_ENGINE_COMMIT" "$STAGE_REMOTE/stage-status.txt" >/dev/null
grep -Fx "prisma_schema_engine_sha256=$PRISMA_ENGINE_SHA" "$STAGE_REMOTE/stage-status.txt" >/dev/null
grep -Fx "prisma_schema_engine_seeded=1" "$STAGE_REMOTE/stage-status.txt" >/dev/null
grep -Fx "source_sha=$PREVIOUS" "$STAGE_REMOTE/stage-status.txt" >/dev/null
grep -Fx "isolated_worktree=1" "$STAGE_REMOTE/stage-status.txt" >/dev/null
grep -Fx "build_process_sandboxed=1" "$STAGE_REMOTE/stage-status.txt" >/dev/null
grep -Fx "build_network_private=1" "$STAGE_REMOTE/stage-status.txt" >/dev/null
grep -Fx "build_secret_paths_inaccessible=1" "$STAGE_REMOTE/stage-status.txt" >/dev/null
grep -Fx "dependency_fetch_sandboxed=1" "$STAGE_REMOTE/stage-status.txt" >/dev/null
grep -Fx "dependency_fetch_scripts_disabled=1" "$STAGE_REMOTE/stage-status.txt" >/dev/null
grep -Fx "dependency_build_offline=1" "$STAGE_REMOTE/stage-status.txt" >/dev/null
grep -Fx "dependency_contract_unchanged=$DEPENDENCY_CONTRACT_UNCHANGED" "$STAGE_REMOTE/stage-status.txt" >/dev/null
grep -Fx "dependency_lock_changed=$DEPENDENCY_LOCK_CHANGED" "$STAGE_REMOTE/stage-status.txt" >/dev/null
grep -Fx "cache_free_artifact=1" "$STAGE_REMOTE/stage-status.txt" >/dev/null
grep -Fx "artifact_path_relocated=1" "$STAGE_REMOTE/stage-status.txt" >/dev/null
grep -Fx "live_source_mutated=0" "$STAGE_REMOTE/stage-status.txt" >/dev/null
grep -Fx "live_public_mutated=0" "$STAGE_REMOTE/stage-status.txt" >/dev/null
grep -Fx "live_node_modules_mutated=0" "$STAGE_REMOTE/stage-status.txt" >/dev/null
grep -Fx "live_build_version_mutated=0" "$STAGE_REMOTE/stage-status.txt" >/dev/null

test ! -e .next-release/cache
test -d .node_modules-release

candidate_artifact="$(artifact_hash .next-release)"
test "$candidate_artifact" = "$ARTIFACT"

candidate_dependency_artifact="$(artifact_hash .node_modules-release)"
test "$candidate_dependency_artifact" = "$DEPENDENCY_ARTIFACT"

candidate_dependency_kb="$(du -sk .node_modules-release | awk '{{print $1}}')"
test "$candidate_dependency_kb" = "$DEPENDENCY_KB"

candidate_prisma_engine=.node_modules-release/@prisma/engines/schema-engine-debian-openssl-3.0.x
test -f "$candidate_prisma_engine"
test -x "$candidate_prisma_engine"
test ! -L "$candidate_prisma_engine"
test "$(sha256sum "$candidate_prisma_engine" | awk '{{print $1}}')" = "$PRISMA_ENGINE_SHA"
test "$("$candidate_prisma_engine" --version)" = "schema-engine-cli $PRISMA_ENGINE_COMMIT"

candidate_dependency_identity="$(stat -Lc '%d:%i' .node_modules-release)"
test -n "$candidate_dependency_identity"

candidate_content_sha="$(content_hash .next-release)"
test -n "$candidate_content_sha"
critical_get http://127.0.0.1:3030/
critical_get http://127.0.0.1:3030/api/lobby
critical_get http://127.0.0.1:3030/api/bets
critical_get "$PUBLIC/"
critical_get "$PUBLIC/api/lobby"
critical_get "$PUBLIC/api/bets"

if [ "$MODE" = "DRY_RUN" ]; then
  printf 'status\\tPREPARED\\n'
  printf 'release_sha\\t%s\\n' "$RELEASE"
  printf 'source_sha\\t%s\\n' "$before_head"
  printf 'active_build_id\\t%s\\n' "$before_active_build"
  printf 'staged_build_id\\t%s\\n' "$before_staged_build"
  printf 'live_build_version\\t%s\\n' "$before_internal_version"
  printf 'candidate_build_version\\t%s\\n' "$CANDIDATE_VERSION"
  printf 'artifact_sha256\\t%s\\n' "$candidate_artifact"
  printf 'wolo8092\\t%s\\n' "$before_wolo8092"
  printf 'wolo8093\\t%s\\n' "$before_wolo8093"
  exit 0
fi

sudo -n /usr/bin/install -d -o tony -g tony -m 0750 "$ACT_RECEIPT"
sudo -n /usr/bin/install -d -o tony -g tony -m 0750 "$ROLLBACK"
printf '%s' "$STAGE_RECEIPT_CONTENT" > "$ACT_RECEIPT/stage-receipt.json"
test "$(sha256sum "$ACT_RECEIPT/stage-receipt.json" | awk '{{print $1}}')" = "$STAGE_RECEIPT_SHA"
cp -p "$STAGE_REMOTE/release-manifest.json" "$ACT_RECEIPT/release-manifest.json"
cp -p "$STAGE_REMOTE/gate-receipt.json" "$ACT_RECEIPT/gate-receipt.json"
cp -p "$STAGE_REMOTE/stage-status.txt" "$ACT_RECEIPT/stage-status.txt"
RELEASE_ONLY_PATHS="$(mktemp "$ACT_RECEIPT/release-only-paths.nul.XXXXXX")"
chmod 0600 "$RELEASE_ONLY_PATHS"
test -f "$RELEASE_ONLY_PATHS"
test ! -L "$RELEASE_ONLY_PATHS"
test "$(stat -c '%a' "$RELEASE_ONLY_PATHS")" = "600"
git diff --no-renames --name-only --diff-filter=A -z "$PREVIOUS" "$RELEASE" \
  > "$RELEASE_ONLY_PATHS"
release_only_paths_sha="$(sha256sum "$RELEASE_ONLY_PATHS" | awk '{{print $1}}')"
test "${{#release_only_paths_sha}}" = "64"
release_only_list_integrity
validate_release_only_paths

old_dependency_artifact="$(artifact_hash node_modules)"
test "${{#old_dependency_artifact}}" = "64"

# Fail closed before creating either durable rollback runtime half.
# Reserve the measured live dependency tree + live Next runtime + 1 GiB
# on the evidence filesystem for rollback materialization and overhead.
rollback_parent="$(dirname "$ROLLBACK")"
test -d "$rollback_parent"
live_dependency_kb="$(du -sk node_modules | awk '{{print $1}}')"
live_next_kb="$(du -sk .next | awk '{{print $1}}')"
evidence_available_kb="$(df -Pk "$rollback_parent" | awk 'NR==2 {{print $4}}')"
test "$live_dependency_kb" -gt 0
test "$live_next_kb" -gt 0
test "$evidence_available_kb" -gt 0
evidence_required_kb=$((live_dependency_kb + live_next_kb + 1048576))

printf '%s\n' \
  "live_dependency_kb=$live_dependency_kb" \
  "live_next_kb=$live_next_kb" \
  "evidence_available_kb=$evidence_available_kb" \
  "evidence_required_kb=$evidence_required_kb" \
  > "$ACT_RECEIPT/disk-preflight.txt"

test "$evidence_available_kb" -ge "$evidence_required_kb"

printf '%s\\n' \
  "release_sha=$RELEASE" \
  "previous_production_sha=$PREVIOUS" \
  "old_build_id=$OLD_BUILD" \
  "staged_build_id=$STAGED_BUILD" \
  "live_build_version=$LIVE_VERSION" \
  "candidate_build_version=$CANDIDATE_VERSION" \
  "artifact_sha256=$ARTIFACT" \
  "candidate_content_sha256=$candidate_content_sha" \
  "manifest_sha256=$MANIFEST_SHA" \
  "gate_sha256=$GATE_SHA" \
  "stage_receipt_sha256=$STAGE_RECEIPT_SHA" \
  "release_only_paths_sha256=$release_only_paths_sha" \
  "initial_source_state_sha256=$before_source_state" \
  "before_pid=$before_pid" \
  "before_wolo8092=$before_wolo8092" \
  "before_wolo8093=$before_wolo8093" \
  > "$ACT_RECEIPT/preactivation.txt"

mkdir "$ROLLBACK/next"
rsync -a --exclude '/cache/' .next/ "$ROLLBACK/next/"
test "$(cat "$ROLLBACK/next/BUILD_ID")" = "$OLD_BUILD"
test ! -e "$ROLLBACK/next/cache"

mkdir "$ROLLBACK/node_modules"
rsync -a node_modules/ "$ROLLBACK/node_modules/"
test "$(artifact_hash "$ROLLBACK/node_modules")" = "$old_dependency_artifact"
printf '%s\\n' "$PREVIOUS" > "$ROLLBACK/source-sha"
printf '%s\\n' "$LIVE_VERSION" > "$ROLLBACK/build-version"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FAST_OLD=".next-rollback-activate-$STAMP"
FAST_OLD_MODULES=".node_modules-rollback-activate-$STAMP"
test ! -e "$FAST_OLD"
test ! -e "$FAST_OLD_MODULES"
MUTATED=0
SOURCE_MUTATION_STARTED=0
SERVICE_STOPPED=0
COMMITTED=0

rollback_activation() {{
  rc=$?
  if [ "$COMMITTED" = "1" ]; then return 0; fi
  set +e
  rollback_status="FAILED_PREACTIVATION"
  if [ "$MUTATED" = "1" ]; then
    rollback_status="ROLLBACK_FAILED"
    sudo -n /usr/bin/systemctl stop "$SERVICE" >/dev/null 2>&1 || true
    if [ -d .next ] && [ ! -e .next-release ] && [ -d "$FAST_OLD" ]; then
      mv .next .next-release
    fi
    if [ -d node_modules ] && [ ! -e .node_modules-release ] && [ -d "$FAST_OLD_MODULES" ]; then
      mv node_modules .node_modules-release
    fi
    if [ ! -e node_modules ] && [ -d "$FAST_OLD_MODULES" ]; then
      mv "$FAST_OLD_MODULES" node_modules
    fi
    if [ ! -e .next ] && [ -d "$FAST_OLD" ]; then
      mv "$FAST_OLD" .next
    fi
    rollback_pre_head="$(git rev-parse HEAD 2>/dev/null || true)"
    rollback_pre_dirty="$(source_status 2>/dev/null | wc -l | tr -d ' ')"
    # MUTATED is armed only after proving the original clean source state.
    # Always restore that state: a failed reset can dirty tracked files while
    # leaving HEAD at PREVIOUS, which makes HEAD-only rollback guards unsafe.
    rollback_source_reset=1
    git reset --hard "$PREVIOUS" >/dev/null 2>&1
    rollback_source_reset_rc=$?
    rollback_release_only_cleanup_rc=0
    if [ "$SOURCE_MUTATION_STARTED" = "1" ]; then
      cleanup_release_only_paths
      rollback_release_only_cleanup_rc=$?
    fi
    printf '%s\\n' "$LIVE_VERSION" > .aoe2war-build-version 2>/dev/null || true
    sudo -n /usr/bin/systemctl start "$SERVICE" >/dev/null 2>&1 || true
    for _ in $(seq 1 30); do
      if [ "$(systemctl is-active "$SERVICE" 2>/dev/null || true)" = "active" ] \
        && curl -fsS --max-time 5 http://127.0.0.1:3030/api/deployment-version >/dev/null 2>&1; then break; fi
      sleep 1
    done
    rb_service="$(systemctl is-active "$SERVICE" 2>/dev/null || true)"
    rb_head="$(git rev-parse HEAD 2>/dev/null || true)"
    rb_dirty="$(source_status 2>/dev/null | wc -l | tr -d ' ')"
    rb_dirty_rc=$?
    rb_source_state="$(source_state_hash 2>/dev/null)"
    rb_source_state_rc=$?
    rb_build="$(cat .next/BUILD_ID 2>/dev/null || true)"
    rb_staged="$(cat .next-release/BUILD_ID 2>/dev/null || true)"
    rb_build_version_file="$(cat .aoe2war-build-version 2>/dev/null | tr -d '\\r\\n')"
    rb_staged_artifact=""
    if [ -d .next-release ]; then
      rb_staged_artifact="$(artifact_hash .next-release 2>/dev/null || true)"
    fi
    rb_internal="$(curl -fsS --max-time 6 http://127.0.0.1:3030/api/deployment-version 2>/dev/null | build_version 2>/dev/null || true)"
    rb_public="$(curl -fsS --max-time 8 "$PUBLIC/api/deployment-version" 2>/dev/null | build_version 2>/dev/null || true)"
    rb_wolo8092="$(wolo_count 8092)"
    rb_wolo8093="$(wolo_count 8093)"
    if [ "$rb_service" = "active" ] \
      && [ "$rollback_source_reset_rc" = "0" ] \
      && [ "$rollback_release_only_cleanup_rc" = "0" ] \
      && [ "$rb_dirty_rc" = "0" ] \
      && [ "$rb_source_state_rc" = "0" ] \
      && [ "$rb_head" = "$PREVIOUS" ] \
      && [ "$rb_dirty" = "0" ] \
      && [ "$rb_source_state" = "$before_source_state" ] \
      && [ "$rb_build" = "$OLD_BUILD" ] \
      && [ "$rb_staged" = "$STAGED_BUILD" ] \
      && [ "$rb_staged_artifact" = "$ARTIFACT" ] \
      && [ "$rb_build_version_file" = "$LIVE_VERSION" ] \
      && [ "$rb_internal" = "$LIVE_VERSION" ] \
      && [ "$rb_public" = "$LIVE_VERSION" ] \
      && [ "$rb_wolo8092" = "$before_wolo8092" ] \
      && [ "$rb_wolo8093" = "$before_wolo8093" ]; then
      rollback_status="ROLLED_BACK"
    fi
    printf '%s\\n' \
      "status=$rollback_status" \
      "original_exit_code=$rc" \
      "pre_rollback_source_sha=$rollback_pre_head" \
      "pre_rollback_dirty_count=$rollback_pre_dirty" \
      "source_reset_attempted=$rollback_source_reset" \
      "source_reset_exit_code=$rollback_source_reset_rc" \
      "release_only_cleanup_exit_code=$rollback_release_only_cleanup_rc" \
      "source_sha=$rb_head" \
      "dirty_count=$rb_dirty" \
      "dirty_probe_exit_code=$rb_dirty_rc" \
      "source_state_sha256=$rb_source_state" \
      "source_state_probe_exit_code=$rb_source_state_rc" \
      "active_build_id=$rb_build" \
      "staged_build_id=$rb_staged" \
      "staged_artifact_sha256=$rb_staged_artifact" \
      "build_version_file=$rb_build_version_file" \
      "internal_build_version=$rb_internal" \
      "public_build_version=$rb_public" \
      "wolo8092=$rb_wolo8092" \
      "wolo8093=$rb_wolo8093" \
      > "$ACT_RECEIPT/rollback-status.txt" 2>/dev/null || true
  elif [ "$SERVICE_STOPPED" = "1" ]; then
    # A last-moment source drift must abort before runtime/source mutation.
    # Restore only service availability; never reset the newly observed work.
    sudo -n /usr/bin/systemctl start "$SERVICE" >/dev/null 2>&1 || true
  fi
  return "$rc"
}}
trap rollback_activation EXIT

SERVICE_STOPPED=1
sudo -n /usr/bin/systemctl stop "$SERVICE"
test "$(systemctl is-active "$SERVICE" 2>/dev/null || true)" != "active"
final_pre_mutation_head="$(git rev-parse HEAD)"
final_pre_mutation_dirty="$(source_status | wc -l | tr -d ' ')"
final_pre_mutation_source_state="$(source_state_hash)"
final_release_only_paths_sha="$(sha256sum "$RELEASE_ONLY_PATHS" | awk '{{print $1}}')"
test "$final_pre_mutation_head" = "$PREVIOUS"
test "$final_pre_mutation_dirty" = "0"
test "$final_pre_mutation_source_state" = "$before_source_state"
test "$final_release_only_paths_sha" = "$release_only_paths_sha"
validate_release_only_paths
printf '%s\n' \
  "final_pre_mutation_head=$final_pre_mutation_head" \
  "final_pre_mutation_dirty_count=$final_pre_mutation_dirty" \
  "final_pre_mutation_source_state_sha256=$final_pre_mutation_source_state" \
  "final_release_only_paths_sha256=$final_release_only_paths_sha" \
  >> "$ACT_RECEIPT/preactivation.txt"
MUTATED=1
mv .next "$FAST_OLD"
mv node_modules "$FAST_OLD_MODULES"
mv .node_modules-release node_modules
test "$(stat -Lc '%d:%i' node_modules)" = "$candidate_dependency_identity"

mv .next-release .next

test "$(cat .next/BUILD_ID)" = "$STAGED_BUILD"
test ! -e .next/cache
test -d node_modules
test ! -e .node_modules-release

test -d "$FAST_OLD"
test "$(cat "$FAST_OLD/BUILD_ID")" = "$OLD_BUILD"
test -d "$FAST_OLD_MODULES"
SOURCE_MUTATION_STARTED=1
git reset --hard "$RELEASE"
test "$(git rev-parse HEAD)" = "$RELEASE"
test -z "$(source_status)"
printf '%s\\n' "$CANDIDATE_VERSION" > .aoe2war-build-version
test "$(cat .aoe2war-build-version | tr -d '\\r\\n')" = "$CANDIDATE_VERSION"
sudo -n /usr/bin/systemctl start "$SERVICE"
SERVICE_STOPPED=0

READY=0
for _ in $(seq 1 30); do
  if [ "$(systemctl is-active "$SERVICE" 2>/dev/null || true)" = "active" ] \
    && curl -fsS --max-time 5 http://127.0.0.1:3030/api/deployment-version >/dev/null 2>&1; then READY=1; break; fi
  sleep 1
done
test "$READY" = "1"

after_service="$(systemctl is-active "$SERVICE")"
after_pid="$(systemctl show "$SERVICE" -p MainPID --value)"
after_head="$(git rev-parse HEAD)"
after_dirty="$(source_status | wc -l | tr -d ' ')"
after_active_build="$(cat .next/BUILD_ID)"
after_build_version_file="$(cat .aoe2war-build-version | tr -d '\\r\\n')"
after_internal_version="$(curl -fsS --max-time 8 http://127.0.0.1:3030/api/deployment-version | build_version)"
after_public_version="$(curl -fsS --max-time 10 "$PUBLIC/api/deployment-version" | build_version)"
after_wolo8092="$(wolo_count 8092)"
after_wolo8093="$(wolo_count 8093)"
after_content_sha="$(content_hash .next)"

test "$after_service" = "active"
test -n "$after_pid"
test "$after_head" = "$RELEASE"
test "$after_dirty" = "0"
test "$after_active_build" = "$STAGED_BUILD"
test "$after_build_version_file" = "$CANDIDATE_VERSION"
test "$after_internal_version" = "$CANDIDATE_VERSION"
test "$after_public_version" = "$CANDIDATE_VERSION"
test "$after_wolo8092" = "$before_wolo8092"
test "$after_wolo8093" = "$before_wolo8093"
test "$after_content_sha" = "$candidate_content_sha"
test ! -e .next-release
test -d "$FAST_OLD"
test "$(cat "$ROLLBACK/next/BUILD_ID")" = "$OLD_BUILD"
test ! -e "$ROLLBACK/next/cache"
test "$(cat "$ROLLBACK/source-sha")" = "$PREVIOUS"
test "$(cat "$ROLLBACK/build-version")" = "$LIVE_VERSION"

critical_get http://127.0.0.1:3030/
critical_get http://127.0.0.1:3030/api/lobby
critical_get http://127.0.0.1:3030/api/bets
critical_get http://127.0.0.1:3030/api/deployment-version
critical_get "$PUBLIC/"
critical_get "$PUBLIC/api/lobby"
critical_get "$PUBLIC/api/bets"
critical_get "$PUBLIC/api/deployment-version"

# ------------------------------------------------------------
# POST-ACTIVATION PERFORMANCE PREWARM
#
# Statistics has a deliberately expensive first computation and
# a process-local SWR cache thereafter. Pay the cold calculation
# here while rollback remains armed so a human visitor does not
# become the first caller after a successful activation.
#
# This is performance evidence, not a release-critical truth
# route, so warmup failure is recorded but does not independently
# roll back an otherwise healthy release.
# ------------------------------------------------------------
STATISTICS_PREWARM="FAIL"
STATISTICS_WARM_SECONDS=""

if curl -fsS \
  --connect-timeout 3 \
  --max-time 20 \
  -o /dev/null \
  http://127.0.0.1:3030/api/statistics
then
  STATISTICS_WARM_SECONDS="$(
    curl -fsS \
      --connect-timeout 3 \
      --max-time 12 \
      -o /dev/null \
      -w '%{{time_total}}' \
      http://127.0.0.1:3030/api/statistics \
      || true
  )"

  if [ -n "$STATISTICS_WARM_SECONDS" ]; then
    STATISTICS_PREWARM="PASS"
  fi
fi

LEADERBOARD_PREWARM="PASS"
LEADERBOARD_WARM_SECONDS=""

for spec in \
  "rm all" \
  "rm claimed" \
  "dm all" \
  "dm claimed"
do
  set -- $spec
  lane="$1"
  scope="$2"

  leaderboard_url="http://127.0.0.1:3030/api/lobby/leaderboard?lane=$lane&scope=$scope&offset=0&limit=50"

  if ! curl -fsS \
    --connect-timeout 3 \
    --max-time 20 \
    -o /dev/null \
    "$leaderboard_url"
  then
    LEADERBOARD_PREWARM="FAIL"
    continue
  fi

  warm_seconds="$(
    curl -fsS \
      --connect-timeout 3 \
      --max-time 12 \
      -o /dev/null \
      -w '%{{time_total}}' \
      "$leaderboard_url" \
      || true
  )"

  if [ -z "$warm_seconds" ]; then
    LEADERBOARD_PREWARM="FAIL"
    continue
  fi

  if [ -n "$LEADERBOARD_WARM_SECONDS" ]; then
    LEADERBOARD_WARM_SECONDS="$LEADERBOARD_WARM_SECONDS,"
  fi

  LEADERBOARD_WARM_SECONDS="$LEADERBOARD_WARM_SECONDS$lane:$scope:$warm_seconds"
done

# ------------------------------------------------------------
# BOUNDED POST-ACTIVATION HEALTH SOAK
#
# COMMITTED is deliberately still 0 here. Any critical failure
# exits through rollback_activation(), restoring OLD_BUILD.
# ------------------------------------------------------------
SOAK_SAMPLES=0
soak_elapsed=0
while [ "$soak_elapsed" -lt "$SOAK_SECONDS" ]; do
  sleep "$SOAK_INTERVAL"
  soak_elapsed=$((soak_elapsed + SOAK_INTERVAL))

  soak_service="$(systemctl is-active "$SERVICE" 2>/dev/null || true)"
  soak_head="$(git rev-parse HEAD)"
  soak_dirty="$(source_status | wc -l | tr -d ' ')"
  soak_build="$(cat .next/BUILD_ID 2>/dev/null || true)"
  soak_build_version_file="$(cat .aoe2war-build-version 2>/dev/null | tr -d '\\r\\n')"
  soak_internal="$(curl -fsS --max-time 8 http://127.0.0.1:3030/api/deployment-version | build_version)"
  soak_public="$(curl -fsS --max-time 10 "$PUBLIC/api/deployment-version" | build_version)"
  soak_wolo8092="$(wolo_count 8092)"
  soak_wolo8093="$(wolo_count 8093)"

  test "$soak_service" = "active"
  test "$soak_head" = "$RELEASE"
  test "$soak_dirty" = "0"
  test "$soak_build" = "$STAGED_BUILD"
  test "$soak_build_version_file" = "$CANDIDATE_VERSION"
  test "$soak_internal" = "$CANDIDATE_VERSION"
  test "$soak_public" = "$CANDIDATE_VERSION"
  test "$soak_wolo8092" = "$before_wolo8092"
  test "$soak_wolo8093" = "$before_wolo8093"

  critical_get http://127.0.0.1:3030/
  critical_get http://127.0.0.1:3030/api/lobby
  critical_get http://127.0.0.1:3030/api/bets
  critical_get http://127.0.0.1:3030/api/deployment-version
  critical_get "$PUBLIC/"
  critical_get "$PUBLIC/api/lobby"
  critical_get "$PUBLIC/api/bets"
  critical_get "$PUBLIC/api/deployment-version"

  SOAK_SAMPLES=$((SOAK_SAMPLES + 1))
done

certified_dependency_artifact="$(artifact_hash node_modules)"
test "$certified_dependency_artifact" = "$DEPENDENCY_ARTIFACT"

previous_fast_dependency_artifact="$(artifact_hash "$FAST_OLD_MODULES")"
test "$previous_fast_dependency_artifact" = "$old_dependency_artifact"

printf '%s\\n' \
  "status=CERTIFIED" \
  "release_sha=$RELEASE" \
  "previous_production_sha=$PREVIOUS" \
  "source_sha=$after_head" \
  "old_build_id=$OLD_BUILD" \
  "active_build_id=$after_active_build" \
  "live_build_version=$LIVE_VERSION" \
  "candidate_build_version=$after_internal_version" \
  "build_version_file=$after_build_version_file" \
  "artifact_sha256=$ARTIFACT" \
  "candidate_node_modules_sha256=$certified_dependency_artifact" \
  "previous_node_modules_sha256=$old_dependency_artifact" \
  "content_sha256=$after_content_sha" \
  "manifest_sha256=$MANIFEST_SHA" \
  "gate_sha256=$GATE_SHA" \
  "stage_receipt_sha256=$STAGE_RECEIPT_SHA" \
  "before_pid=$before_pid" \
  "after_pid=$after_pid" \
  "wolo8092=$after_wolo8092" \
  "wolo8093=$after_wolo8093" \
  "soak_seconds=$SOAK_SECONDS" \
  "soak_samples=$SOAK_SAMPLES" \
  "statistics_prewarm=$STATISTICS_PREWARM" \
  "statistics_warm_seconds=$STATISTICS_WARM_SECONDS" \
  "leaderboard_prewarm=$LEADERBOARD_PREWARM" \
  "leaderboard_warm_seconds=$LEADERBOARD_WARM_SECONDS" \
  "fast_rollback=$FAST_OLD" \
  "fast_rollback_modules=$FAST_OLD_MODULES" \
  "durable_rollback=$ROLLBACK" \
  "durable_cache_free=1" \
  "activation_bundle_while_stopped=1" \
  "release_specific_proof=INFRASTRUCTURE_exact_runtime_identity_critical_routes_and_bounded_health_soak" \
  > "$ACT_RECEIPT/certification.txt"
COMMITTED=1

# ------------------------------------------------------------
# VERIFIED FAST-ROLLBACK RETENTION
#
# This is post-certification and intentionally non-fatal. Only
# modern fast copies with a durable BUILD_ID twin are eligible.
# Unmatched artifacts are never auto-deleted. Keep the newest N
# verified fast copies; older verified duplicates are reclaimable.
# ------------------------------------------------------------
RETENTION_STATUS="PASS"
RETENTION_PRUNED=0
RETENTION_RECLAIMED_KB=0
RETENTION_MATCHED=0
RETENTION_UNMATCHED=0
retention_candidates="$ACT_RECEIPT/fast-retention-candidates.tsv"
retention_sorted="$ACT_RECEIPT/fast-retention-sorted.tsv"
retention_plan="$ACT_RECEIPT/fast-retention.tsv"

printf 'mtime\tfast_path\tbuild_id\tsize_kb\tproof_kind\tproof_path\n' > "$retention_candidates"
printf 'action\tfast_path\tbuild_id\tsize_kb\tproof_kind\tproof_path\n' > "$retention_plan"

set +e
for d in .next-rollback-activate-* .next-rollback-manual-*; do
  [ -d "$d" ] || continue

  # A fast rollback is one runtime unit: .next + node_modules.
  # Legacy/unpaired artifacts are always keep-only.
  modules="${{d/.next-/.node_modules-}}"
  [ -d "$modules" ] || {{
    RETENTION_UNMATCHED=$((RETENTION_UNMATCHED + 1))
    size_kb="$(du -sk "$d" 2>/dev/null | awk '{{print $1}}')"
    printf 'UNMATCHED_KEEP\t%s\t%s\t%s\tMISSING_MODULE_PAIR\t-\n' \
      "$d" "-" "${{size_kb:-0}}" >> "$retention_plan"
    continue
  }}

  build="$(cat "$d/BUILD_ID" 2>/dev/null || true)"
  [ -n "$build" ] || {{
    RETENTION_UNMATCHED=$((RETENTION_UNMATCHED + 1))
    next_kb="$(du -sk "$d" 2>/dev/null | awk '{{print $1}}')"
    modules_kb="$(du -sk "$modules" 2>/dev/null | awk '{{print $1}}')"
    size_kb=$((${{next_kb:-0}} + ${{modules_kb:-0}}))
    printf 'UNMATCHED_KEEP\t%s\t%s\t%s\tNO_BUILD_ID\t-\n' \
      "$d" "$build" "$size_kb" >> "$retention_plan"
    continue
  }}

  # Pruning requires a durable proof for BOTH runtime halves.
  proof_kind=""
  proof_path=""
  proof_modules=""

  match="$(
    find /mnt/HC_Volume_105319120/aoe2war/rollbacks \
      -type f -path '*/next/BUILD_ID' \
      -exec grep -lFx "$build" {{}} \\; 2>/dev/null \
    | head -n 1
  )"
  if [ -n "$match" ]; then
    proof_next="${{match%/BUILD_ID}}"
    candidate_proof_modules="${{proof_next%/next}}/node_modules"
    if [ -d "$candidate_proof_modules" ]; then
      proof_kind="DURABLE_ROLLBACK"
      proof_path="$proof_next"
      proof_modules="$candidate_proof_modules"
    fi
  fi

  if [ -z "$proof_kind" ]; then
    match="$(
      find /mnt/HC_Volume_105319120/aoe2war/deploy-receipts \
        -type f -path '*/current-next/BUILD_ID' \
        -exec grep -lFx "$build" {{}} \\; 2>/dev/null \
      | head -n 1
    )"
    if [ -n "$match" ]; then
      proof_next="${{match%/BUILD_ID}}"
      candidate_proof_modules="${{proof_next%/current-next}}/current-node_modules"
      if [ -d "$candidate_proof_modules" ]; then
        proof_kind="DURABLE_RESCUE"
        proof_path="$proof_next"
        proof_modules="$candidate_proof_modules"
      fi
    fi
  fi

  if [ -z "$proof_kind" ] || [ ! -d "$proof_modules" ]; then
    RETENTION_UNMATCHED=$((RETENTION_UNMATCHED + 1))
    next_kb="$(du -sk "$d" 2>/dev/null | awk '{{print $1}}')"
    modules_kb="$(du -sk "$modules" 2>/dev/null | awk '{{print $1}}')"
    size_kb=$((${{next_kb:-0}} + ${{modules_kb:-0}}))
    printf 'UNMATCHED_KEEP\t%s\t%s\t%s\tNO_PAIRED_DURABLE_PROOF\t-\n' \
      "$d" "$build" "$size_kb" >> "$retention_plan"
    continue
  fi

  mtime="$(stat -c '%Y' "$d" 2>/dev/null)"
  next_kb="$(du -sk "$d" 2>/dev/null | awk '{{print $1}}')"
  modules_kb="$(du -sk "$modules" 2>/dev/null | awk '{{print $1}}')"

  if [ -z "$mtime" ] || [ -z "$next_kb" ] || [ -z "$modules_kb" ]; then
    RETENTION_STATUS="WARN"
    RETENTION_UNMATCHED=$((RETENTION_UNMATCHED + 1))
    size_kb=$((${{next_kb:-0}} + ${{modules_kb:-0}}))
    printf 'UNMATCHED_KEEP\t%s\t%s\t%s\t%s\t%s\n' \
      "$d" "$build" "$size_kb" "$proof_kind" "$proof_path" >> "$retention_plan"
    continue
  fi

  size_kb=$((next_kb + modules_kb))
  printf '%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$mtime" "$d" "$build" "$size_kb" "$proof_kind" "$proof_path" \
    >> "$retention_candidates"
done

sort -rn -k1,1 "$retention_candidates" > "$retention_sorted"
rank=0

while IFS=$'\t' read -r mtime path build size_kb proof_kind proof_path; do
  [ "$mtime" = "mtime" ] && continue
  [ -n "$path" ] || continue

  modules="${{path/.next-/.node_modules-}}"

  # A pair that disappeared or became incomplete since enumeration
  # immediately becomes keep-only.
  if [ ! -d "$path" ] || [ ! -d "$modules" ]; then
    RETENTION_STATUS="WARN"
    RETENTION_UNMATCHED=$((RETENTION_UNMATCHED + 1))
    printf 'UNMATCHED_KEEP\t%s\t%s\t%s\tPAIR_DRIFT\t%s\n' \
      "$path" "$build" "$size_kb" "$proof_path" >> "$retention_plan"
    continue
  fi

  rank=$((rank + 1))
  RETENTION_MATCHED=$((RETENTION_MATCHED + 1))

  if [ "$rank" -le "$FAST_ROLLBACK_KEEP" ]; then
    printf 'KEEP\t%s\t%s\t%s\t%s\t%s\n' \
      "$path" "$build" "$size_kb" "$proof_kind" "$proof_path" >> "$retention_plan"
    continue
  fi

  case "$path" in
    .next-rollback-activate-*|.next-rollback-manual-*) ;;
    *)
      RETENTION_STATUS="WARN"
      printf 'UNMATCHED_KEEP\t%s\t%s\t%s\t%s\t%s\n' \
        "$path" "$build" "$size_kb" "$proof_kind" "$proof_path" >> "$retention_plan"
      continue
      ;;
  esac

  if [ "$(cat "$path/BUILD_ID" 2>/dev/null || true)" != "$build" ]; then
    RETENTION_STATUS="WARN"
    printf 'UNMATCHED_KEEP\t%s\t%s\t%s\t%s\t%s\n' \
      "$path" "$build" "$size_kb" "$proof_kind" "$proof_path" >> "$retention_plan"
    continue
  fi

  # Remove the pair from the canonical rollback namespace atomically-ish:
  # first rename BOTH halves on the same filesystem. If the second rename
  # fails, restore the first immediately. Only then delete the two temps.
  prune_next_tmp="${{path}}.prune-$$"
  prune_modules_tmp="${{modules}}.prune-$$"

  if [ -e "$prune_next_tmp" ] || [ -e "$prune_modules_tmp" ]; then
    RETENTION_STATUS="WARN"
    printf 'KEEP_PRUNE_TMP_COLLISION\t%s\t%s\t%s\t%s\t%s\n' \
      "$path" "$build" "$size_kb" "$proof_kind" "$proof_path" >> "$retention_plan"
    continue
  fi

  if ! mv "$path" "$prune_next_tmp"; then
    RETENTION_STATUS="WARN"
    printf 'KEEP_PAIR_MOVE_FAILED\t%s\t%s\t%s\t%s\t%s\n' \
      "$path" "$build" "$size_kb" "$proof_kind" "$proof_path" >> "$retention_plan"
    continue
  fi

  if ! mv "$modules" "$prune_modules_tmp"; then
    mv "$prune_next_tmp" "$path" >/dev/null 2>&1 || true
    RETENTION_STATUS="WARN"
    printf 'KEEP_PAIR_MOVE_FAILED\t%s\t%s\t%s\t%s\t%s\n' \
      "$path" "$build" "$size_kb" "$proof_kind" "$proof_path" >> "$retention_plan"
    continue
  fi

  if rm -rf -- "$prune_next_tmp" "$prune_modules_tmp" \
    && [ ! -e "$prune_next_tmp" ] \
    && [ ! -e "$prune_modules_tmp" ]; then
    RETENTION_PRUNED=$((RETENTION_PRUNED + 1))
    RETENTION_RECLAIMED_KB=$((RETENTION_RECLAIMED_KB + size_kb))
    printf 'PRUNE_PAIR\t%s\t%s\t%s\t%s\t%s\n' \
      "$path" "$build" "$size_kb" "$proof_kind" "$proof_path" >> "$retention_plan"
  else
    # Best-effort restoration of any surviving temp halves.
    if [ -d "$prune_next_tmp" ] && [ ! -e "$path" ]; then
      mv "$prune_next_tmp" "$path" >/dev/null 2>&1 || true
    fi
    if [ -d "$prune_modules_tmp" ] && [ ! -e "$modules" ]; then
      mv "$prune_modules_tmp" "$modules" >/dev/null 2>&1 || true
    fi
    RETENTION_STATUS="WARN"
    printf 'KEEP_DELETE_FAILED\t%s\t%s\t%s\t%s\t%s\n' \
      "$path" "$build" "$size_kb" "$proof_kind" "$proof_path" >> "$retention_plan"
  fi
done < "$retention_sorted"

rm -f "$retention_candidates" "$retention_sorted"

retention_service="$(systemctl is-active "$SERVICE" 2>/dev/null || true)"
retention_head="$(git rev-parse HEAD 2>/dev/null || true)"
retention_build="$(cat .next/BUILD_ID 2>/dev/null || true)"
retention_build_version_file="$(cat .aoe2war-build-version 2>/dev/null | tr -d '\\r\\n')"
retention_wolo8092="$(wolo_count 8092)"
retention_wolo8093="$(wolo_count 8093)"
if [ "$retention_service" != "active" ] \
  || [ "$retention_head" != "$RELEASE" ] \
  || [ "$retention_build" != "$STAGED_BUILD" ] \
  || [ "$retention_build_version_file" != "$CANDIDATE_VERSION" ] \
  || [ "$retention_wolo8092" != "$before_wolo8092" ] \
  || [ "$retention_wolo8093" != "$before_wolo8093" ]; then
  RETENTION_STATUS="WARN"
fi
set -e

printf '%s\n' \
  "status=$RETENTION_STATUS" \
  "keep=$FAST_ROLLBACK_KEEP" \
  "matched=$RETENTION_MATCHED" \
  "unmatched_kept=$RETENTION_UNMATCHED" \
  "pruned=$RETENTION_PRUNED" \
  "reclaimed_kb=$RETENTION_RECLAIMED_KB" \
  "source_sha=$retention_head" \
  "active_build_id=$retention_build" \
  "wolo8092=$retention_wolo8092" \
  "wolo8093=$retention_wolo8093" \
  > "$ACT_RECEIPT/fast-retention-result.txt"

printf 'status\tCERTIFIED\n'
printf 'release_sha\\t%s\\n' "$RELEASE"
printf 'source_sha\\t%s\\n' "$after_head"
printf 'previous_build_id\\t%s\\n' "$OLD_BUILD"
printf 'active_build_id\\t%s\\n' "$after_active_build"
printf 'candidate_build_version\\t%s\\n' "$after_internal_version"
printf 'artifact_sha256\\t%s\\n' "$ARTIFACT"
printf 'candidate_node_modules_sha256\\t%s\\n' "$certified_dependency_artifact"
printf 'previous_node_modules_sha256\\t%s\\n' "$old_dependency_artifact"
printf 'content_sha256\\t%s\\n' "$after_content_sha"
printf 'wolo8092\\t%s\\n' "$after_wolo8092"
printf 'wolo8093\\t%s\\n' "$after_wolo8093"
printf 'soak_seconds\\t%s\\n' "$SOAK_SECONDS"
printf 'soak_samples\\t%s\\n' "$SOAK_SAMPLES"
printf 'retention_status\\t%s\\n' "$RETENTION_STATUS"
printf 'retention_keep\\t%s\\n' "$FAST_ROLLBACK_KEEP"
printf 'retention_pruned\\t%s\\n' "$RETENTION_PRUNED"
printf 'retention_reclaimed_kb\\t%s\\n' "$RETENTION_RECLAIMED_KB"
printf 'retention_unmatched_kept\\t%s\\n' "$RETENTION_UNMATCHED"
printf 'fast_rollback\\t%s\\n' "$FAST_OLD"
printf 'fast_rollback_modules\\t%s\\n' "$FAST_OLD_MODULES"
printf 'durable_rollback\\t%s\\n' "$ROLLBACK"
printf 'durable_cache_free\\t1\\n'
printf 'activation_bundle_while_stopped\\t1\\n'
printf 'receipt_dir\\t%s\\n' "$ACT_RECEIPT"
"""


def validate_activation_result(result: dict[str, str], receipt: dict) -> list[str]:
    errors: list[str] = []
    if result.get("status") != "CERTIFIED":
        errors.append("remote activation did not report CERTIFIED")
    if result.get("release_sha") != receipt.get("release_sha"):
        errors.append("activated release SHA does not equal stage receipt")
    if result.get("source_sha") != receipt.get("release_sha"):
        errors.append("production source changed away from staged release")
    if result.get("previous_build_id") != receipt.get("active_build_id"):
        errors.append("activation previous BUILD_ID does not equal stage receipt")
    if result.get("active_build_id") != receipt.get("staged_build_id"):
        errors.append("active BUILD_ID does not equal staged BUILD_ID")
    if result.get("candidate_build_version") != receipt.get("candidate_build_version"):
        errors.append("active build version does not equal candidate build version")
    if result.get("artifact_sha256") != receipt.get("artifact_sha256"):
        errors.append("active artifact SHA-256 does not equal staged artifact")

    if result.get("candidate_node_modules_sha256") != receipt.get(
        "candidate_node_modules_sha256"
    ):
        errors.append(
            "active candidate node_modules SHA-256 does not equal "
            "staged candidate node_modules"
        )

    previous_dependency_sha = (
        result.get("previous_node_modules_sha256") or ""
    )
    if (
        len(previous_dependency_sha) != 64
        or any(
            c not in "0123456789abcdef"
            for c in previous_dependency_sha
        )
    ):
        errors.append(
            "previous node_modules SHA-256 is missing or invalid"
        )

    fast_rollback = result.get("fast_rollback") or ""
    fast_rollback_modules = result.get("fast_rollback_modules") or ""
    expected_fast_modules = (
        fast_rollback.replace(".next-", ".node_modules-", 1)
        if fast_rollback.startswith(".next-rollback-activate-")
        else ""
    )
    if (
        not expected_fast_modules
        or fast_rollback_modules != expected_fast_modules
    ):
        errors.append(
            "paired fast rollback node_modules path is missing or inconsistent"
        )
    if result.get("durable_cache_free") != "1":
        errors.append("durable rollback does not prove cache-free storage")
    if result.get("activation_bundle_while_stopped") != "1":
        errors.append("activation does not prove source/build/runtime advanced while stopped")
    if result.get("wolo8092") != str(receipt.get("wolo_8092_count")):
        errors.append("WOLO listener 8092 changed during activation")
    if result.get("wolo8093") != str(receipt.get("wolo_8093_count")):
        errors.append("WOLO listener 8093 changed during activation")
    if result.get("soak_seconds") != str(ACTIVATION_SOAK_SECONDS):
        errors.append("activation health-soak duration does not match policy")
    try:
        soak_samples = int(result.get("soak_samples") or "0")
    except ValueError:
        soak_samples = 0
    if soak_samples < 1:
        errors.append("activation health soak did not complete any samples")
    if result.get("retention_status") not in {"PASS", "WARN"}:
        errors.append("fast-rollback retention did not report PASS/WARN")
    if result.get("retention_keep") != str(FAST_ROLLBACK_KEEP):
        errors.append("fast-rollback retention keep count does not match policy")
    if not result.get("receipt_dir"):
        errors.append("durable activation receipt directory is missing")
    if not result.get("durable_rollback"):
        errors.append("durable rollback directory is missing")
    return errors


def write_activation_receipt(payload: dict) -> Path:
    ACTIVATION_RECEIPT_DIR.mkdir(parents=True, exist_ok=True)
    path = ACTIVATION_RECEIPT_DIR / (
        f"{payload['release_sha']}-{payload['artifact_sha256'][:12]}.json"
    )
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return path


def migration_names_from_manifest(manifest: dict) -> list[str]:
    paths = [str(item) for item in (manifest.get("migration_paths") or [])]
    names = sorted({Path(path).parent.name for path in paths})
    if len(names) != len(paths):
        raise ShipError("Manifest contains duplicate Prisma migration directories.")
    return names


def verify_production_migration_receipt(manifest: dict) -> None:
    names = migration_names_from_manifest(manifest)
    if not names:
        return
    if manifest.get("risk_class") not in {"FINANCIAL", "DATABASE"}:
        raise ShipError("Prisma migrations require a DATABASE or FINANCIAL release gate.")

    release_sha = str(manifest.get("release_sha") or "")
    if len(release_sha) != 40:
        raise ShipError("Migration verification requires an exact release SHA.")

    q = shlex.quote
    expected = "\n".join(names)
    release_short = release_sha[:12]
    script = f"""
set -Eeuo pipefail
RELEASE={q(release_sha)}
RELEASE_SHORT={q(release_short)}
PROD_REPO={q(PROD_REPO)}
RECEIPT_ROOT={q(REMOTE_RECEIPT_ROOT)}
EXPECTED_MIGRATIONS={q(expected)}

cred="$(mktemp /tmp/aoe2war-db-verify.XXXXXX)"
cleanup() {{ rm -f "$cred"; }}
trap cleanup EXIT INT TERM
chmod 600 "$cred"

python3 - "$PROD_REPO" > "$cred" <<'PY'
from pathlib import Path
from urllib.parse import unquote, urlsplit
import shlex
import sys

repo = Path(sys.argv[1])
database_url = None
for candidate in [repo / ".env", repo / ".env.production", repo / ".env.local"]:
    if not candidate.is_file():
        continue
    for raw in candidate.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        if key.strip() != "DATABASE_URL":
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {{chr(34), chr(39)}}:
            value = value[1:-1]
        database_url = value
        break
    if database_url:
        break

if not database_url:
    raise SystemExit("STOP: production DATABASE_URL is unavailable")

raw = database_url.replace("postgresql+asyncpg://", "postgresql://", 1)
parsed = urlsplit(raw)
if parsed.scheme not in {{"postgresql", "postgres"}}:
    raise SystemExit("STOP: production DATABASE_URL is not PostgreSQL")

for key, value in {{
    "PGHOST": parsed.hostname or "",
    "PGPORT": str(parsed.port or 5432),
    "PGUSER": unquote(parsed.username or ""),
    "PGPASSWORD": unquote(parsed.password or ""),
    "PGDATABASE": unquote(parsed.path.lstrip("/")),
}}.items():
    print(f"export {{key}}={{shlex.quote(value)}}")
PY
# shellcheck disable=SC1090
. "$cred"
rm -f "$cred"
cred=""

expected_file="$(mktemp /tmp/aoe2war-expected-migrations.XXXXXX)"
trap 'rm -f "$expected_file" "$cred"' EXIT INT TERM
printf '%s\\n' "$EXPECTED_MIGRATIONS" | sed '/^$/d' | sort -u > "$expected_file"

while IFS= read -r migration; do
  [ -n "$migration" ] || continue
  count="$(psql -X -v ON_ERROR_STOP=1 -Atqc \
    "select count(*) from \\"_prisma_migrations\\" where migration_name='$migration' and finished_at is not null and rolled_back_at is null;")"
  [ "$count" = "1" ] || {{
    echo "STOP: production migration is not applied exactly once: $migration" >&2
    exit 81
  }}
done < "$expected_file"

receipt_match=""
while IFS= read -r candidate; do
  status="$candidate/migration-status.txt"
  [ -f "$status" ] || continue
  grep -Fqx "release_sha=$RELEASE" "$status" || continue
  grep -Fqx "status=APPLIED" "$status" || continue
  ok=1
  while IFS= read -r migration; do
    [ -n "$migration" ] || continue
    grep -Fqx "migration=$migration" "$status" || ok=0
  done < "$expected_file"
  [ "$ok" = 1 ] && receipt_match="$candidate"
done < <(
  find "$RECEIPT_ROOT" -mindepth 1 -maxdepth 1 -type d \
    -name "migration-*-${{RELEASE_SHORT}}" -print 2>/dev/null | sort
)

[ -n "$receipt_match" ] || {{
  echo "STOP: durable production migration receipt is missing" >&2
  exit 82
}}
printf 'migration_receipt\\t%s\\n' "$receipt_match"
"""
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
        timeout=120,
    )
    if p.returncode != 0:
        detail = ((p.stderr or "") or (p.stdout or "")).strip()
        raise ShipError(
            "Production migration verification failed"
            + (f": {detail[-4000:]}" if detail else "")
        )


def activate_release(
    data: dict,
    *,
    stage_receipt: str,
    dry_run: bool,
    json_output: bool = False,
) -> int:
    try:
        (
            receipt_path,
            receipt,
            receipt_sha,
            manifest_path,
            manifest,
            manifest_sha,
            gate_path,
            gate_sha,
        ) = load_stage_receipt(stage_receipt)
    except ShipError as exc:
        if json_output:
            print(json.dumps({"status": "ERROR", "error": str(exc)}, indent=2))
        else:
            print(f"STOP: {exc}")
        return 2

    try:
        verify_production_migration_receipt(manifest)
    except ShipError as exc:
        if json_output:
            print(json.dumps({"status": "ERROR", "error": str(exc)}, indent=2))
        else:
            print(f"STOP: {exc}")
        return 2

    transport, transport_error = production_transport()
    if transport_error:
        if json_output:
            print(json.dumps({"status": "ERROR", "error": transport_error}, indent=2))
        else:
            print(f"STOP: production Git transport inspection failed: {transport_error}")
        return 2

    errors = activation_validation_errors(data, receipt, transport)
    if errors:
        payload = {
            "schema": 1,
            "kind": "aoe2war-activation-preflight",
            "status": "BLOCKED",
            "release_sha": receipt["release_sha"],
            "stage_receipt_path": str(receipt_path.relative_to(ROOT)),
            "errors": errors,
        }
        if json_output:
            print(json.dumps(payload, indent=2, sort_keys=True))
        else:
            print("STOP: RECEIPT-DRIVEN ACTIVATION PREFLIGHT BLOCKED")
            for error in errors:
                print(f"  - {error}")
        return 2

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    release_short = receipt["release_sha"][:12]
    receipt_dir = f"{REMOTE_RECEIPT_ROOT}/activate-{stamp}-{release_short}"
    rollback_dir = f"{ROLLBACK_ROOT}/activate-{stamp}-{release_short}"
    script = remote_activation_script(
        receipt,
        stage_receipt_sha=receipt_sha,
        stage_receipt_text=receipt_path.read_text(encoding="utf-8"),
        dry_run=dry_run,
        receipt_dir=receipt_dir,
        rollback_dir=rollback_dir,
    )
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
        message = (p.stderr or "").strip() or f"ssh exited {p.returncode}"
        payload = {
            "schema": 1,
            "kind": "aoe2war-activation-result",
            "status": "ERROR",
            "release_sha": receipt["release_sha"],
            "stage_receipt_path": str(receipt_path.relative_to(ROOT)),
            "remote_receipt_dir": receipt_dir,
            "error": message,
            "remote_stdout": (p.stdout or "").strip(),
        }
        if json_output:
            print(json.dumps(payload, indent=2, sort_keys=True))
        else:
            print("STOP: RECEIPT-DRIVEN ACTIVATION FAILED")
            print(f"Release: {receipt['release_sha']}")
            print(f"Receipt: {receipt_dir}")
            if p.stdout:
                print(p.stdout.rstrip())
            if message:
                print(message)
            print(
                "Remote activation trap was armed before runtime mutation; "
                "inspect rollback-status.txt if mutation began."
            )
        return 2

    result = parse_kv(p.stdout or "")
    if dry_run:
        expected = {
            "status": "PREPARED",
            "release_sha": receipt["release_sha"],
            "source_sha": receipt["previous_production_sha"],
            "active_build_id": receipt["active_build_id"],
            "staged_build_id": receipt["staged_build_id"],
            "live_build_version": receipt["live_build_version"],
            "candidate_build_version": receipt["candidate_build_version"],
            "artifact_sha256": receipt["artifact_sha256"],
            "wolo8092": str(receipt["wolo_8092_count"]),
            "wolo8093": str(receipt["wolo_8093_count"]),
        }
        mismatches = [
            f"{key}: expected {value!r}, got {result.get(key)!r}"
            for key, value in expected.items()
            if result.get(key) != value
        ]
        if mismatches:
            if json_output:
                print(json.dumps({"status": "BLOCKED", "errors": mismatches}, indent=2))
            else:
                print("STOP: ACTIVATION DRY-RUN RESULT DRIFT")
                for mismatch in mismatches:
                    print(f"  - {mismatch}")
            return 2
        payload = {
            "schema": 1,
            "kind": "aoe2war-activation-preflight",
            "status": "PASS",
            "mode": "DRY_RUN",
            "release_sha": receipt["release_sha"],
            "stage_receipt_path": str(receipt_path.relative_to(ROOT)),
            "stage_receipt_sha256": receipt_sha,
            "manifest_path": str(manifest_path.relative_to(ROOT)),
            "manifest_sha256": manifest_sha,
            "gate_path": str(gate_path.relative_to(ROOT)),
            "gate_sha256": gate_sha,
            "artifact_sha256": receipt["artifact_sha256"],
        }
        if json_output:
            print(json.dumps(payload, indent=2, sort_keys=True))
        else:
            print("⚔️  AOE2WAR PHASE IV-B ACTIVATION PREFLIGHT")
            print(f"Release:        {receipt['release_sha']}")
            print(f"Previous prod:  {receipt['previous_production_sha']}")
            print(f"Active build:   {receipt['active_build_id']}")
            print(f"Staged build:   {receipt['staged_build_id']}")
            print(f"Live version:   {receipt['live_build_version']}")
            print(f"Candidate ver:  {receipt['candidate_build_version']}")
            print(f"Artifact SHA:   {receipt['artifact_sha256']}")
            print(f"Manifest SHA:   {manifest_sha}")
            print(f"Gate SHA:       {gate_sha}")
            print(
                "WOLO:           "
                f"8092={receipt['wolo_8092_count']}  "
                f"8093={receipt['wolo_8093_count']}  UNTOUCHED"
            )
            print()
            print("PASS: ACTIVATION PREFLIGHT — ZERO PRODUCTION MUTATION")
        return 0

    result_errors = validate_activation_result(result, receipt)
    if result_errors:
        if json_output:
            print(json.dumps({"status": "ERROR", "errors": result_errors, "remote": result}, indent=2, sort_keys=True))
        else:
            print("STOP: ACTIVATION COMPLETED REMOTELY BUT RESULT VALIDATION FAILED")
            for error in result_errors:
                print(f"  - {error}")
            print(f"Remote receipt: {receipt_dir}")
        return 2

    payload = {
        "schema": 1,
        "kind": "aoe2war-activation-result",
        "generated_at": utc_now(),
        "status": "CERTIFIED",
        "release_sha": receipt["release_sha"],
        "implementation_sha": receipt.get("implementation_sha"),
        "previous_production_sha": receipt["previous_production_sha"],
        "risk_class": receipt.get("risk_class"),
        "stage_receipt_path": str(receipt_path.relative_to(ROOT)),
        "stage_receipt_sha256": receipt_sha,
        "manifest_path": str(manifest_path.relative_to(ROOT)),
        "manifest_sha256": manifest_sha,
        "gate_path": str(gate_path.relative_to(ROOT)),
        "gate_sha256": gate_sha,
        "previous_build_id": result["previous_build_id"],
        "active_build_id": result["active_build_id"],
        "candidate_build_version": result["candidate_build_version"],
        "artifact_sha256": result["artifact_sha256"],
        "candidate_node_modules_sha256": result[
            "candidate_node_modules_sha256"
        ],
        "previous_node_modules_sha256": result[
            "previous_node_modules_sha256"
        ],
        "durable_cache_free": True,
        "activation_bundle_while_stopped": True,
        "wolo_8092_count": int(result["wolo8092"]),
        "wolo_8093_count": int(result["wolo8093"]),
        "soak_seconds": int(result["soak_seconds"]),
        "soak_samples": int(result["soak_samples"]),
        "fast_rollback_retention_status": result["retention_status"],
        "fast_rollback_keep": int(result["retention_keep"]),
        "fast_rollback_pruned": int(result["retention_pruned"]),
        "fast_rollback_reclaimed_kb": int(result["retention_reclaimed_kb"]),
        "fast_rollback_unmatched_kept": int(result["retention_unmatched_kept"]),
        "remote_receipt_dir": result["receipt_dir"],
        "fast_rollback": result["fast_rollback"],
        "fast_rollback_modules": result["fast_rollback_modules"],
        "durable_rollback": result["durable_rollback"],
        "release_specific_proof": (
            "INFRASTRUCTURE exact runtime identity, internal/public critical-route proof, and bounded post-activation health soak"
        ),
        "wolo_mutated": False,
    }
    local_receipt = write_activation_receipt(payload)
    payload["local_receipt_path"] = str(local_receipt.relative_to(ROOT))
    payload["local_receipt_sha256"] = sha256_file(local_receipt)
    if json_output:
        print(json.dumps(payload, indent=2, sort_keys=True))
        return 0

    print("⚔️  AOE2WAR RELEASE ACTIVATED + CERTIFIED")
    print(f"Release:        {payload['release_sha']}")
    print(f"Previous build: {payload['previous_build_id']}")
    print(f"Active build:   {payload['active_build_id']}")
    print(f"Candidate ver:  {payload['candidate_build_version']}")
    print(f"Artifact SHA:   {payload['artifact_sha256']}")
    print(
        "Health soak:    "
        f"{payload['soak_seconds']}s / {payload['soak_samples']} samples  PASS"
    )
    print(
        "Fast retention: "
        f"{payload['fast_rollback_retention_status']}  "
        f"keep={payload['fast_rollback_keep']}  "
        f"pruned={payload['fast_rollback_pruned']}  "
        f"reclaimed={payload['fast_rollback_reclaimed_kb']}KB  "
        f"unmatched-kept={payload['fast_rollback_unmatched_kept']}"
    )
    print(
        "WOLO:           "
        f"8092={payload['wolo_8092_count']}  "
        f"8093={payload['wolo_8093_count']}  UNTOUCHED"
    )
    print(f"Fast rollback:  {payload['fast_rollback']}")
    print(f"Durable rollback: {payload['durable_rollback']}")
    print(f"Remote receipt: {payload['remote_receipt_dir']}")
    print(f"Local receipt:  {payload['local_receipt_path']}")
    print()
    print("PASS: RELEASE ACTIVATED + CERTIFIED — WOLO UNTOUCHED")
    return 0

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
