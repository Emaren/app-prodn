#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "config" / "aoe2war-operations.json"
EVIDENCE_DOC = ROOT / "docs" / "EVIDENCE_VAULT.md"
RECOVERY_VAULT_ROOT = Path.home() / "aoe2war-recovery"

FULL_PROOF_SCHEMA = 2
FULL_PROOF_KIND = "aoe2war-recovery-proof"
FULL_PROOF_STATUS = "RECOVERY_VERIFIED"
REQUIRED_RECOVERY_CLASSES = (
    "database",
    "operator_evidence",
    "raw_replay_archive",
    "parser_evidence_corpus",
    "managed_user_media",
    "radio_wolo_private_media",
    "legacy_direct_message_attachments",
    "wolo_settlement_state",
    "wolo_consensus_recovery",
    "wolo_key_custody",
)
REQUIRED_FALSE_SECRET_FLAGS = (
    "database_credentials_included",
    "environment_files_included",
    "private_recovery_key_transmitted_to_vps",
    "validator_private_keys_included",
    "wolo_keyrings_included",
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _load_hashed_json(proof: Path) -> tuple[dict[str, Any] | None, str | None, str | None]:
    sidecar = proof.with_name(proof.name + ".sha256")
    if not proof.is_file():
        return None, None, f"restore proof does not exist: {proof}"
    if not sidecar.is_file():
        return None, None, f"restore proof sidecar is missing: {sidecar}"
    try:
        expected = sidecar.read_text(encoding="utf-8").strip().split()[0]
    except Exception as exc:
        return None, None, f"restore proof sidecar is unreadable: {exc}"
    actual = sha256(proof)
    if expected != actual:
        return None, actual, "restore proof SHA-256 does not match its sidecar"
    try:
        payload = json.loads(proof.read_text(encoding="utf-8"))
    except Exception as exc:
        return None, actual, f"restore proof JSON is unreadable: {exc}"
    if not isinstance(payload, dict):
        return None, actual, "restore proof JSON must contain an object"
    return payload, actual, None


def _safe_bundle_file(bundle_root: Path, relative: str) -> Path | None:
    candidate = Path(relative)
    if candidate.is_absolute() or ".." in candidate.parts:
        return None
    resolved = (bundle_root / candidate).resolve()
    try:
        resolved.relative_to(bundle_root.resolve())
    except ValueError:
        return None
    return resolved


def _coverage_status(value: Any) -> str:
    if isinstance(value, dict):
        return str(value.get("status") or "")
    return str(value or "")


def _validate_coverage_evidence(
    bundle_root: Path,
    class_name: str,
    value: Any,
) -> list[str]:
    errors: list[str] = []
    if not isinstance(value, dict):
        return [f"{class_name} coverage must be an object"]
    if value.get("status") != "PASS":
        errors.append(f"{class_name} coverage is not PASS")
    proof_file = value.get("proof_file")
    proof_sha = value.get("proof_sha256")
    if not isinstance(proof_file, str) or not proof_file:
        errors.append(f"{class_name} coverage has no proof_file")
        return errors
    if not isinstance(proof_sha, str) or len(proof_sha) != 64:
        errors.append(f"{class_name} coverage has no valid proof_sha256")
        return errors
    evidence_file = _safe_bundle_file(bundle_root, proof_file)
    if evidence_file is None:
        errors.append(f"{class_name} proof_file escapes the recovery bundle")
        return errors
    if not evidence_file.is_file():
        errors.append(f"{class_name} proof_file is missing: {proof_file}")
        return errors
    if sha256(evidence_file) != proof_sha:
        errors.append(f"{class_name} proof_file SHA-256 mismatch: {proof_file}")
    return errors


def _resolve_contract_proof(reference: Any) -> tuple[Path | None, str | None]:
    if not isinstance(reference, str) or not reference.strip():
        return None, "verified restore-proof receipt is not named"
    candidate = Path(reference).expanduser()
    if not candidate.is_absolute():
        candidate = RECOVERY_VAULT_ROOT / candidate
    candidate = candidate.resolve()
    try:
        candidate.relative_to(RECOVERY_VAULT_ROOT.resolve())
    except ValueError:
        return None, "restore proof must live under the independent recovery vault root"
    return candidate, None


def verify_configured_recovery(evidence: dict[str, Any]) -> dict[str, Any]:
    blockers: list[str] = []
    enabled = bool(evidence.get("enabled"))
    authority = evidence.get("authority")
    reference = evidence.get("restore_proof")

    if not enabled:
        blockers.append("off-host evidence vault is disabled")
    if not isinstance(authority, str) or not authority.strip():
        blockers.append("off-host authority is not named")

    proof_path, reference_error = _resolve_contract_proof(reference)
    if reference_error:
        blockers.append(reference_error)

    proof_payload: dict[str, Any] | None = None
    proof_sha: str | None = None
    if proof_path is not None:
        proof_payload, proof_sha, proof_error = _load_hashed_json(proof_path)
        if proof_error:
            blockers.append(proof_error)

    if proof_payload is not None and proof_path is not None:
        if proof_payload.get("schema") != FULL_PROOF_SCHEMA:
            blockers.append(
                f"restore proof schema must be {FULL_PROOF_SCHEMA}"
            )
        if proof_payload.get("kind") != FULL_PROOF_KIND:
            blockers.append(
                f"restore proof kind must be {FULL_PROOF_KIND}"
            )
        if proof_payload.get("status") != FULL_PROOF_STATUS:
            blockers.append(
                f"restore proof status must be {FULL_PROOF_STATUS}"
            )
        if proof_payload.get("authority") != authority:
            blockers.append("restore proof authority does not match operations contract")

        remaining = proof_payload.get("remaining_before_full_recovery_verification")
        if isinstance(remaining, list) and remaining:
            blockers.append(
                "restore proof still declares remaining recovery scope: "
                + ", ".join(str(item) for item in remaining)
            )

        coverage = proof_payload.get("coverage")
        if not isinstance(coverage, dict):
            blockers.append("restore proof has no coverage map")
        else:
            for class_name in REQUIRED_RECOVERY_CLASSES:
                if class_name not in coverage:
                    blockers.append(f"restore proof lacks {class_name} coverage")
                    continue
                blockers.extend(
                    _validate_coverage_evidence(
                        proof_path.parent,
                        class_name,
                        coverage[class_name],
                    )
                )

        drill = proof_payload.get("restore_drill")
        if not isinstance(drill, dict) or drill.get("status") != "PASS":
            blockers.append("restore proof has no successful isolated restore drill")
        elif isinstance(drill.get("proof_file"), str):
            blockers.extend(
                _validate_coverage_evidence(
                    proof_path.parent,
                    "restore_drill",
                    drill,
                )
            )
        else:
            blockers.append("restore drill has no proof_file")

        secrets = proof_payload.get("secrets_policy")
        if not isinstance(secrets, dict):
            blockers.append("restore proof has no secrets policy")
        else:
            for key in REQUIRED_FALSE_SECRET_FLAGS:
                if secrets.get(key) is not False:
                    blockers.append(f"restore proof secret boundary is not proven: {key}=false")

    return {
        "status": "VERIFIED" if not blockers else "NOT_VERIFIED",
        "blockers": blockers,
        "proof_path": str(proof_path) if proof_path else None,
        "proof_sha256": proof_sha,
        "proof": proof_payload,
    }


def latest_verified_pilot() -> dict[str, Any] | None:
    if not RECOVERY_VAULT_ROOT.is_dir():
        return None

    candidates: list[dict[str, Any]] = []
    for proof in RECOVERY_VAULT_ROOT.glob("*/restore-proof.json"):
        payload, expected, error = _load_hashed_json(proof)
        if error or payload is None:
            continue
        if payload.get("status") != "PILOT_VERIFIED":
            continue
        payload = dict(payload)
        payload["proof_path"] = str(proof)
        payload["proof_sha256"] = expected
        candidates.append(payload)

    if not candidates:
        return None

    candidates.sort(
        key=lambda item: str(item.get("created_at") or ""),
        reverse=True,
    )
    return candidates[0]


def load_contract() -> dict[str, Any]:
    value = json.loads(CONTRACT.read_text(encoding="utf-8"))
    if value.get("schema") != 1:
        raise RuntimeError("invalid operations contract")
    return value


def evaluate() -> dict[str, Any]:
    contract = load_contract()
    evidence = contract.get("offsite_evidence") or {}
    pilot = latest_verified_pilot()
    verification = verify_configured_recovery(evidence)
    usage = shutil.disk_usage(Path.home())

    return {
        "schema": 2,
        "kind": "aoe2war-recovery-status",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "status": verification["status"],
        "enabled": bool(evidence.get("enabled")),
        "authority": evidence.get("authority"),
        "restore_proof": evidence.get("restore_proof"),
        "verification": verification,
        "pilot": pilot,
        "note": evidence.get("note"),
        "blockers": verification["blockers"],
        "required_recovery_classes": list(REQUIRED_RECOVERY_CLASSES),
        "operator_free_gib": usage.free / (1024 ** 3),
        "contract": str(CONTRACT),
        "runbook": str(EVIDENCE_DOC),
    }



def _root_maintenance_host() -> str:
    contract = load_contract()
    configured = str(
        (contract.get("rollback_archive") or {}).get("root_maintenance_host") or ""
    ).strip()
    if configured:
        return configured
    production = str(
        (contract.get("canonical") or {}).get("production_host") or "hel1"
    ).strip()
    return production if "@" in production else f"root@{production}"


def _ssh_json(script: str, timeout: int = 180) -> dict[str, Any]:
    proc = subprocess.run(
        [
            "ssh",
            "-o",
            "BatchMode=yes",
            "-o",
            "ConnectTimeout=8",
            _root_maintenance_host(),
            "python3 -",
        ],
        cwd=ROOT,
        input=script,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=timeout,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(
            "recovery inventory SSH failed: "
            + (proc.stdout.strip() or f"exit={proc.returncode}")
        )
    try:
        payload = json.loads(proc.stdout)
    except Exception as exc:
        raise RuntimeError(
            "recovery inventory returned invalid JSON: "
            + proc.stdout[:500]
        ) from exc
    if not isinstance(payload, dict):
        raise RuntimeError("recovery inventory JSON must be an object")
    return payload


def recovery_inventory() -> dict[str, Any]:
    remote = r"""
import grp
import json
import os
import pathlib
import pwd
import shutil
import stat
import subprocess


def run(*args):
    return subprocess.run(
        list(args),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        check=False,
    ).stdout.strip()


def du_bytes(path):
    if not os.path.exists(path):
        return 0
    text = run("du", "-sb", path)
    try:
        return int(text.split()[0])
    except Exception:
        return 0


def file_count(path):
    if not os.path.exists(path):
        return 0
    if os.path.isfile(path):
        return 1
    total = 0
    for _, _, names in os.walk(path):
        total += len(names)
    return total


def identity(path):
    if not os.path.exists(path):
        return {"exists": False, "path": path, "bytes": 0, "files": 0}
    real = os.path.realpath(path)
    st = os.stat(real)
    return {
        "exists": True,
        "path": real,
        "bytes": du_bytes(real),
        "files": file_count(real),
        "mode": oct(stat.S_IMODE(st.st_mode))[2:],
        "owner": f"{pwd.getpwuid(st.st_uid).pw_name}:{grp.getgrgid(st.st_gid).gr_name}",
    }


sources = {
    "raw_replay_archive": "/mnt/HC_Volume_105319120/aoe2-replay-archive",
    "parser_evidence_corpus": "/mnt/HC_Volume_105319120/aoe2-parser-engine",
    "managed_user_media": "/mnt/HC_Volume_105319120/aoe2-managed-assets",
    "radio_wolo_private_media": "/mnt/HC_Volume_105319120/aoe2-radio-wolo",
    "legacy_direct_message_attachments": "/var/www/AoE2HDBets/app-prodn/storage/direct-message-attachments",
    "wolo_settlement_state": "/mnt/HC_Volume_105319120/wolochain-mainnet/settlement-state",
    "wolo_founder_rewards_settlement_state": "/mnt/HC_Volume_105319120/wolochain-mainnet/founder-rewards-settlement-state",
}

classes = {name: identity(path) for name, path in sources.items()}

parser_root = pathlib.Path(sources["parser_evidence_corpus"])
parser_top_level = {}
if parser_root.is_dir():
    for child in sorted(parser_root.iterdir(), key=lambda item: item.name):
        parser_top_level[child.name] = identity(str(child))

pid_text = run(
    "systemctl",
    "show",
    "wolochaind-mainnet.service",
    "-p",
    "MainPID",
    "--value",
)
try:
    pid = int(pid_text or "0")
except ValueError:
    pid = 0

wolo_home = ""
if pid > 0:
    try:
        raw = pathlib.Path(f"/proc/{pid}/cmdline").read_bytes()
        args = [
            item.decode(errors="replace")
            for item in raw.split(b"\\0")
            if item
        ]
        for index, arg in enumerate(args):
            if arg.startswith("--home="):
                wolo_home = arg.split("=", 1)[1]
                break
            if arg == "--home" and index + 1 < len(args):
                wolo_home = args[index + 1]
                break
    except Exception:
        pass

wolo = {
    "service": "wolochaind-mainnet.service",
    "main_pid": pid,
    "active": run("systemctl", "is-active", "wolochaind-mainnet.service"),
    "home": wolo_home or None,
    "home_identity": identity(wolo_home) if wolo_home else None,
    "data_identity": identity(os.path.join(wolo_home, "data")) if wolo_home else None,
    "config_identity": identity(os.path.join(wolo_home, "config")) if wolo_home else None,
    "key_custody_metadata": [],
}

if wolo_home:
    secret_paths = [
        os.path.join(wolo_home, "config", "priv_validator_key.json"),
        os.path.join(wolo_home, "config", "node_key.json"),
    ]
    try:
        for name in sorted(os.listdir(wolo_home)):
            if name.startswith("keyring-"):
                secret_paths.append(os.path.join(wolo_home, name))
    except Exception:
        pass

    for secret_path in secret_paths:
        if not os.path.exists(secret_path):
            wolo["key_custody_metadata"].append(
                {"path": secret_path, "exists": False}
            )
            continue
        st = os.stat(secret_path)
        wolo["key_custody_metadata"].append(
            {
                "path": secret_path,
                "exists": True,
                "bytes": du_bytes(secret_path),
                "mode": oct(stat.S_IMODE(st.st_mode))[2:],
                "owner": f"{pwd.getpwuid(st.st_uid).pw_name}:{grp.getgrgid(st.st_gid).gr_name}",
            }
        )

listeners = []
for line in run("ss", "-ltn").splitlines():
    if ":8092" in line or ":8093" in line:
        listeners.append(line.strip())

root_usage = shutil.disk_usage("/")
volume_usage = shutil.disk_usage("/mnt/HC_Volume_105319120")

print(
    json.dumps(
        {
            "schema": 1,
            "classes": classes,
            "parser_top_level": parser_top_level,
            "wolo": wolo,
            "listeners": listeners,
            "capacity": {
                "root_free_bytes": root_usage.free,
                "volume_free_bytes": volume_usage.free,
            },
        },
        sort_keys=True,
    )
)
"""
    return _ssh_json(remote)


def _bundle_file_bytes(path: str | None) -> int:
    if not path:
        return 0
    proof = Path(path)
    root = proof.parent
    if not root.is_dir():
        return 0
    total = 0
    for item in root.rglob("*"):
        try:
            if item.is_file():
                total += item.stat().st_size
        except OSError:
            continue
    return total


def build_campaign_plan(
    inventory: dict[str, Any],
    pilot: dict[str, Any] | None,
    operator_free_bytes: int,
) -> dict[str, Any]:
    classes = inventory.get("classes") or {}
    parser_top = inventory.get("parser_top_level") or {}
    wolo = inventory.get("wolo") or {}

    parser_excluded = {"tmp"}
    parser_selected = [
        name
        for name in sorted(parser_top)
        if name not in parser_excluded
    ]
    parser_selected_bytes = sum(
        int((parser_top.get(name) or {}).get("bytes") or 0)
        for name in parser_selected
    )

    settlement_bytes = int(
        (classes.get("wolo_settlement_state") or {}).get("bytes") or 0
    ) + int(
        (classes.get("wolo_founder_rewards_settlement_state") or {}).get("bytes") or 0
    )

    consensus_bytes = int(
        ((wolo.get("home_identity") or {}).get("bytes") or 0)
    )

    stages = [
        {
            "order": 0,
            "class": "database",
            "strategy": "REUSE_VERIFIED_PILOT",
            "estimated_bytes": 0,
            "state": "PROVEN" if pilot else "OPEN",
            "requires_quiesce": False,
            "secret_boundary": "NO_SECRETS_IN_GENERAL_VAULT",
        },
        {
            "order": 0,
            "class": "operator_evidence",
            "strategy": "REUSE_VERIFIED_PILOT",
            "estimated_bytes": 0,
            "state": "PROVEN" if pilot else "OPEN",
            "requires_quiesce": False,
            "secret_boundary": "NO_SECRETS_IN_GENERAL_VAULT",
        },
        {
            "order": 1,
            "class": "managed_user_media",
            "strategy": "ENCRYPTED_STREAM_COPY",
            "estimated_bytes": int(
                (classes.get("managed_user_media") or {}).get("bytes") or 0
            ),
            "state": "READY_TO_CAPTURE",
            "requires_quiesce": False,
        },
        {
            "order": 2,
            "class": "legacy_direct_message_attachments",
            "strategy": "ENCRYPTED_STREAM_COPY",
            "estimated_bytes": int(
                (classes.get("legacy_direct_message_attachments") or {}).get("bytes") or 0
            ),
            "state": "READY_TO_CAPTURE",
            "requires_quiesce": False,
        },
        {
            "order": 3,
            "class": "radio_wolo_private_media",
            "strategy": "ENCRYPTED_STREAM_COPY",
            "estimated_bytes": int(
                (classes.get("radio_wolo_private_media") or {}).get("bytes") or 0
            ),
            "state": "READY_TO_CAPTURE",
            "requires_quiesce": False,
        },
        {
            "order": 4,
            "class": "parser_evidence_corpus",
            "strategy": "ENCRYPTED_STREAM_COPY_SELECTED_ROOT",
            "estimated_bytes": parser_selected_bytes,
            "state": "READY_TO_CAPTURE",
            "requires_quiesce": False,
            "include_top_level": parser_selected,
            "exclude_top_level": sorted(parser_excluded),
        },
        {
            "order": 5,
            "class": "raw_replay_archive",
            "strategy": "ENCRYPTED_STREAM_COPY",
            "estimated_bytes": int(
                (classes.get("raw_replay_archive") or {}).get("bytes") or 0
            ),
            "state": "READY_TO_CAPTURE",
            "requires_quiesce": False,
        },
        {
            "order": 6,
            "class": "wolo_settlement_state",
            "strategy": "CONSISTENCY_SEAM_SNAPSHOT",
            "estimated_bytes": settlement_bytes,
            "state": "AUTHORIZATION_REQUIRED",
            "requires_quiesce": True,
            "includes": [
                "wolo_settlement_state",
                "wolo_founder_rewards_settlement_state",
            ],
        },
        {
            "order": 7,
            "class": "wolo_consensus_recovery",
            "strategy": "TWO_PHASE_QUIESCED_SNAPSHOT",
            "estimated_bytes": consensus_bytes,
            "state": (
                "AUTHORIZATION_REQUIRED"
                if wolo.get("home")
                else "BLOCKED_WOLO_HOME_UNRESOLVED"
            ),
            "requires_quiesce": True,
            "wolo_home": wolo.get("home"),
            "secret_exclusions": [
                "config/priv_validator_key.json",
                "config/node_key.json",
                "keyring-*",
            ],
        },
        {
            "order": 8,
            "class": "wolo_key_custody",
            "strategy": "SEPARATE_SECRET_CUSTODY_ATTESTATION",
            "estimated_bytes": 0,
            "state": "SEPARATE_AUTHORIZATION_REQUIRED",
            "requires_quiesce": False,
            "general_vault_payload": False,
            "metadata": wolo.get("key_custody_metadata") or [],
        },
        {
            "order": 9,
            "class": "restore_drill",
            "strategy": "STREAM_VERIFY_EACH_CLASS_AND_SEAL_SCHEMA2",
            "estimated_bytes": 0,
            "state": "WAITING_FOR_COVERAGE",
            "requires_quiesce": False,
        },
    ]

    new_payload_bytes = sum(
        int(stage.get("estimated_bytes") or 0)
        for stage in stages
    )
    pilot_bytes = _bundle_file_bytes(
        str((pilot or {}).get("proof_path") or "")
    )
    retained_bytes = new_payload_bytes + pilot_bytes
    headroom_after = operator_free_bytes - new_payload_bytes
    largest_stage = max(
        (int(stage.get("estimated_bytes") or 0) for stage in stages),
        default=0,
    )

    return {
        "schema": 1,
        "kind": "aoe2war-recovery-campaign-plan",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "write_actions": "NONE",
        "authority": "Mac encrypted survival vault",
        "inventory": inventory,
        "pilot_bytes": pilot_bytes,
        "new_payload_bytes": new_payload_bytes,
        "retained_payload_bytes_including_pilot": retained_bytes,
        "operator_free_bytes": operator_free_bytes,
        "estimated_headroom_after_capture_bytes": headroom_after,
        "largest_stage_bytes": largest_stage,
        "streaming_restore_required": headroom_after < largest_stage,
        "capacity_ready": headroom_after > 0,
        "stages": stages,
        "invariants": [
            "no private recovery key transmitted to VPS",
            "no validator private key or Wolo keyring in the general evidence vault",
            "no live Wolo consensus copy is accepted as consistency-safe proof",
            "all write stages require a future explicit campaign authorization",
            "every retained artifact must bind to a hash and class proof",
        ],
    }


def campaign_plan() -> dict[str, Any]:
    status = evaluate()
    inventory = recovery_inventory()
    return build_campaign_plan(
        inventory,
        status.get("pilot"),
        int(shutil.disk_usage(Path.home()).free),
    )


def _gib(value: int) -> str:
    return f"{value / (1024 ** 3):.2f} GiB"


def print_campaign_plan(payload: dict[str, Any]) -> None:
    print("⚔️  AOE2WAR RECOVERY CAMPAIGN")
    print()
    print("Mode:          READ-ONLY PLAN")
    print(f"Capacity:      {'READY' if payload['capacity_ready'] else 'INSUFFICIENT'}")
    print(f"Mac free:      {_gib(payload['operator_free_bytes'])}")
    print(f"New payload:   {_gib(payload['new_payload_bytes'])}")
    print(
        "With pilot:    "
        + _gib(payload["retained_payload_bytes_including_pilot"])
    )
    print(
        "Headroom:      "
        + _gib(payload["estimated_headroom_after_capture_bytes"])
    )
    print(
        "Restore mode:  "
        + (
            "STREAMING REQUIRED"
            if payload["streaming_restore_required"]
            else "EXTRACTED RESTORE FITS CURRENT HEADROOM"
        )
    )

    inventory = payload.get("inventory") or {}
    wolo = inventory.get("wolo") or {}
    print()
    print("Wolo:")
    print(f"  service: {wolo.get('active') or 'unknown'}")
    print(f"  home:    {wolo.get('home') or 'UNRESOLVED'}")
    print(f"  bytes:   {_gib(int(((wolo.get('home_identity') or {}).get('bytes') or 0)))}")
    print(f"  protected listeners observed: {len(inventory.get('listeners') or [])}")

    print()
    print("Stages:")
    for stage in payload["stages"]:
        suffix = ""
        if stage.get("estimated_bytes"):
            suffix = f" · {_gib(int(stage['estimated_bytes']))}"
        print(
            f"  {stage['order']:>2}. {stage['class']} "
            f"— {stage['state']} · {stage['strategy']}{suffix}"
        )
        if stage["class"] == "parser_evidence_corpus":
            print(
                "      include: "
                + ", ".join(stage.get("include_top_level") or [])
            )
            print(
                "      exclude: "
                + ", ".join(stage.get("exclude_top_level") or [])
            )

    print()
    print("Invariants:")
    for item in payload["invariants"]:
        print(f"  - {item}")
    print()
    print("WRITE ACTIONS: NONE")
    print(
        "Next implementation seam: bounded recovery campaign start, "
        "which must require explicit authorization."
    )


def print_status(payload: dict[str, Any]) -> None:
    print("⚔️  AOE2WAR RECOVERY OS")
    print()
    print(f"Status:        {payload['status']}")
    print(f"Authority:     {payload['authority'] or 'NOT CONFIGURED'}")
    print(f"Restore proof: {payload['restore_proof'] or 'NOT CONFIGURED'}")
    verification = payload.get("verification") or {}
    if verification.get("proof_sha256"):
        print(f"Proof SHA:     {verification['proof_sha256']}")
    pilot = payload.get("pilot") or {}
    print(
        "DB pilot:      "
        + (
            "VERIFIED"
            if pilot.get("status") == "PILOT_VERIFIED"
            else "NOT VERIFIED"
        )
    )
    if pilot.get("proof_path"):
        print(f"Pilot proof:   {pilot['proof_path']}")
    if pilot.get("proof_sha256"):
        print(f"Pilot SHA:     {pilot['proof_sha256']}")
    print(f"Mac free:      {payload['operator_free_gib']:.2f} GiB")
    if payload["blockers"]:
        print()
        print("Blocking recovery gaps:")
        for item in payload["blockers"]:
            print(f"  - {item}")


def print_plan(payload: dict[str, Any]) -> None:
    print_status(payload)
    print()
    print("PLAN — FAIL CLOSED")
    pilot = payload.get("pilot") or {}
    remaining = pilot.get("remaining_before_full_recovery_verification")
    if isinstance(remaining, list) and remaining:
        print("Current pilot still declares these recovery classes incomplete:")
        for item in remaining:
            print(f"  - {item}")
        print()
    print("Full verification requires:")
    for item in payload["required_recovery_classes"]:
        print(f"  - {item}")
    print()
    print("Every class must bind to a hashed local proof file in a schema-2")
    print("RECOVERY_VERIFIED receipt, with an isolated restore-drill proof.")
    print("Secrets/key material remain outside the general evidence payload.")
    print()
    print(
        "Host package/reboot maintenance remains blocked until this status is VERIFIED."
    )


def main() -> int:
    parser = argparse.ArgumentParser(prog="aoe2war recovery")
    sub = parser.add_subparsers(dest="command")
    for name in ("status", "plan"):
        q = sub.add_parser(name)
        q.add_argument("--json", action="store_true")

    campaign = sub.add_parser("campaign")
    campaign_sub = campaign.add_subparsers(dest="campaign_command", required=True)
    campaign_plan_parser = campaign_sub.add_parser("plan")
    campaign_plan_parser.add_argument("--json", action="store_true")

    args = parser.parse_args()

    if args.command == "campaign":
        payload = campaign_plan()
        if getattr(args, "json", False):
            print(json.dumps(payload, indent=2, sort_keys=True))
        else:
            print_campaign_plan(payload)
        return 0 if payload["capacity_ready"] else 1

    payload = evaluate()
    if getattr(args, "json", False):
        print(json.dumps(payload, indent=2, sort_keys=True))
    elif args.command == "plan":
        print_plan(payload)
    else:
        print_status(payload)
    return (
        0
        if payload["status"] == "VERIFIED"
        or args.command in (None, "status")
        else 1
    )


if __name__ == "__main__":
    raise SystemExit(main())
