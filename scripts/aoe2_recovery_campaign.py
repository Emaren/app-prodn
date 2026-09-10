#!/usr/bin/env python3
from __future__ import annotations

import argparse
import fcntl
import hashlib
import json
import os
import shlex
import shutil
import tarfile
import tempfile
import time
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    from scripts import aoe2_recovery as recovery
except ImportError:
    import aoe2_recovery as recovery  # type: ignore

ROOT = Path(__file__).resolve().parents[1]
CAMPAIGN_DIR = ROOT / ".aoe2war-release" / "recovery-campaigns"
LOCK_PATH = CAMPAIGN_DIR / "campaign.lock"
RESTORE_DIR = CAMPAIGN_DIR / "restore-drills"
RESTORE_LOCK_PATH = RESTORE_DIR / "restore.lock"
REPRESENTATIVE_MAX_BYTES = 64 * 1024 * 1024
RECOVERY_KEY_ROOT = Path.home() / "Library" / "Application Support" / "AoE2WAR Recovery" / "keys"
CANONICAL_RECOVERY_PRIVATE_KEY = RECOVERY_KEY_ROOT / "recovery-v1-private.pem"
CANONICAL_RECOVERY_CERTIFICATE = RECOVERY_KEY_ROOT / "recovery-v1-recipient.pem"
ORDINARY_CLASSES = (
    "managed_user_media",
    "legacy_direct_message_attachments",
    "radio_wolo_private_media",
    "parser_evidence_corpus",
    "raw_replay_archive",
)

WOLO_MAINNET_HOME = "/var/lib/wolochaind-mainnet"
WOLO_MAINNET_SERVICE = "wolochaind-mainnet.service"
WOLO_SETTLEMENT_SERVICE = "wolochain-mainnet-settlement.service"
WOLO_FOUNDER_REWARDS_SERVICE = "wolochain-founder-rewards-settlement.service"
WOLO_PROTECTED_LISTENER_PORTS = ("8092", "8093")
WOLO_QUIESCE_ORDER = (
    WOLO_FOUNDER_REWARDS_SERVICE,
    WOLO_SETTLEMENT_SERVICE,
    WOLO_MAINNET_SERVICE,
)
WOLO_RESTART_ORDER = (
    WOLO_MAINNET_SERVICE,
    WOLO_SETTLEMENT_SERVICE,
    WOLO_FOUNDER_REWARDS_SERVICE,
)
WOLO_REMOTE_STAGING_ROOT = "/mnt/HC_Volume_105319120/aoe2war/recovery-staging/wolo"
WOLO_REMOTE_MIN_HEADROOM_BYTES = 8 * 1024 * 1024 * 1024
WOLO_SNAPSHOT_STATE_DIR = CAMPAIGN_DIR / "wolo-snapshots"
WOLO_SNAPSHOT_RUNNING_STATUS = "AUTHORIZED_SNAPSHOT_RUNNING"
WOLO_SNAPSHOT_STATUS = "STAGED_PENDING_ENCRYPTED_CAPTURE"
WOLO_SNAPSHOT_UNCERTAIN_STATUS = "UNKNOWN_REQUIRES_RECONCILIATION"
WOLO_RPC_STATUS_URL = "https://rpc-mainnet.aoe2war.com/status"
WOLO_REST_NODE_INFO_URL = "https://rest-mainnet.aoe2war.com/cosmos/base/tendermint/v1beta1/node_info"
WOLO_PROTECTED_KEY_PATHS = (
    "config/priv_validator_key.json",
    "config/node_key.json",
    "keyring-file",
)

# OpenSSL's CMS CLI still buffers inbound CMS content during parse/decrypt.
# Keep every independently encrypted object comfortably below the multi-GiB
# ceiling so Recovery OS scales with the evidence corpus rather than OpenSSL's
# single-message memory behavior.
CMS_CHUNK_PLAINTEXT_BYTES = 256 * 1024 * 1024
CMS_CHUNK_FORMAT = "aoe2war-recovery-chunked-cms-v1"


class CampaignError(RuntimeError):
    pass


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def atomic_write(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.tmp.{os.getpid()}")
    tmp.write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    os.replace(tmp, path)


def write_json_with_sidecar(path: Path, payload: dict[str, Any]) -> str:
    atomic_write(path, payload)
    digest = recovery.sha256(path)
    path.with_name(path.name + ".sha256").write_text(
        f"{digest}  {path.name}\n",
        encoding="utf-8",
    )
    return digest


def git_output(*args: str) -> str:
    proc = subprocess.run(
        ["git", *args],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if proc.returncode != 0:
        raise CampaignError(
            f"git {' '.join(args)} failed: {proc.stderr.strip()}"
        )
    return proc.stdout.strip()


def source_identity() -> str:
    if git_output("branch", "--show-current") != "main":
        raise CampaignError("Recovery campaign requires local branch main")
    if git_output("status", "--porcelain", "--untracked-files=all"):
        raise CampaignError("Recovery campaign requires a clean app-prodn worktree")
    return git_output("rev-parse", "HEAD")


def state_path(campaign_id: str) -> Path:
    if not campaign_id or "/" in campaign_id or ".." in campaign_id:
        raise CampaignError(f"unsafe campaign id: {campaign_id!r}")
    return CAMPAIGN_DIR / f"{campaign_id}.json"


def log_path(campaign_id: str) -> Path:
    return CAMPAIGN_DIR / f"{campaign_id}.log"


def pause_path(campaign_id: str) -> Path:
    state_path(campaign_id)
    return CAMPAIGN_DIR / f"{campaign_id}.pause"


def pause_marker(campaign_id: str) -> dict[str, Any] | None:
    path = pause_path(campaign_id)
    if not path.is_file():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise CampaignError(
            f"invalid recovery pause marker: {path}"
        ) from exc
    if (
        payload.get("schema") != 1
        or payload.get("kind") != "aoe2war-recovery-pause-request"
        or payload.get("campaign_id") != campaign_id
    ):
        raise CampaignError(f"invalid recovery pause marker: {path}")
    return payload


def write_pause_marker(campaign_id: str) -> dict[str, Any]:
    payload = {
        "schema": 1,
        "kind": "aoe2war-recovery-pause-request",
        "campaign_id": campaign_id,
        "requested_at": utc_now(),
    }
    atomic_write(pause_path(campaign_id), payload)
    return payload


def clear_pause_marker(campaign_id: str) -> None:
    path = pause_path(campaign_id)
    if path.exists():
        path.unlink()


def load_state(campaign_id: str) -> dict[str, Any]:
    path = state_path(campaign_id)
    if not path.is_file():
        raise CampaignError(f"campaign state not found: {campaign_id}")
    payload = json.loads(path.read_text(encoding="utf-8"))
    if (
        payload.get("schema") != 1
        or payload.get("kind") != "aoe2war-recovery-campaign"
    ):
        raise CampaignError(f"invalid campaign state: {path}")
    return payload


def save_state(state: dict[str, Any]) -> None:
    state["updated_at"] = utc_now()
    atomic_write(state_path(str(state["campaign_id"])), state)


def latest_campaign_id() -> str | None:
    if not CAMPAIGN_DIR.is_dir():
        return None
    rows = sorted(
        CAMPAIGN_DIR.glob("*.json"),
        key=lambda item: item.stat().st_mtime,
        reverse=True,
    )
    return rows[0].stem if rows else None


def process_alive(pid: int | None) -> bool:
    if not isinstance(pid, int) or pid <= 0:
        return False
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def normalize_fingerprint(value: str | None) -> str:
    if not value:
        return ""
    if "=" in value:
        value = value.split("=", 1)[1]
    return "".join(ch for ch in value.upper() if ch in "0123456789ABCDEF")


def certificate_fingerprint(path: Path) -> str:
    proc = subprocess.run(
        [
            "openssl",
            "x509",
            "-in",
            str(path),
            "-noout",
            "-fingerprint",
            "-sha256",
        ],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    if proc.returncode != 0:
        return ""
    return normalize_fingerprint(proc.stdout.strip())


def private_key_matches_certificate(
    private_key: Path,
    certificate: Path,
) -> bool:
    private_proc = subprocess.run(
        [
            "openssl",
            "pkey",
            "-in",
            str(private_key),
            "-pubout",
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    cert_proc = subprocess.run(
        [
            "openssl",
            "x509",
            "-in",
            str(certificate),
            "-pubkey",
            "-noout",
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    return (
        private_proc.returncode == 0
        and cert_proc.returncode == 0
        and private_proc.stdout == cert_proc.stdout
    )


def verify_canonical_private_key(certificate: Path) -> dict[str, Any]:
    private_key = CANONICAL_RECOVERY_PRIVATE_KEY
    if not private_key.is_file():
        raise CampaignError(
            "canonical recovery private key is missing: "
            f"{private_key}"
        )
    mode = private_key.stat().st_mode & 0o777
    if mode != 0o600:
        raise CampaignError(
            "canonical recovery private key must have mode 0600: "
            f"{private_key} mode={mode:03o}"
        )
    if not private_key_matches_certificate(private_key, certificate):
        raise CampaignError(
            "canonical recovery private key does not match recipient certificate"
        )
    return {
        "path": str(private_key.resolve()),
        "mode": f"{mode:03o}",
        "certificate_match": True,
    }


def resolve_recipient_certificate(
    requested: str | None,
    pilot: dict[str, Any],
) -> tuple[Path, str]:
    expected = normalize_fingerprint(
        str(pilot.get("recipient_certificate_fingerprint") or "")
    )
    if not expected:
        raise CampaignError(
            "verified pilot does not name a recipient certificate fingerprint"
        )

    if requested:
        candidate = Path(requested).expanduser().resolve()
        if not candidate.is_file():
            raise CampaignError(f"recipient certificate not found: {candidate}")
        actual = certificate_fingerprint(candidate)
        if actual != expected:
            raise CampaignError(
                "recipient certificate fingerprint does not match verified pilot"
            )
        return candidate, actual

    canonical = CANONICAL_RECOVERY_CERTIFICATE
    if canonical.is_file():
        actual = certificate_fingerprint(canonical)
        if actual == expected:
            return canonical.resolve(), actual

    matches: list[Path] = []
    if recovery.RECOVERY_VAULT_ROOT.is_dir():
        for candidate in recovery.RECOVERY_VAULT_ROOT.rglob("*"):
            if (
                not candidate.is_file()
                or candidate.suffix.lower() not in {".pem", ".crt", ".cer"}
            ):
                continue
            if certificate_fingerprint(candidate) == expected:
                matches.append(candidate.resolve())

    unique = sorted(set(matches))
    if len(unique) == 1:
        return unique[0], expected
    if not unique:
        raise CampaignError(
            "recipient certificate matching the verified pilot was not found "
            "at the canonical Mac key authority or under ~/aoe2war-recovery; "
            "pass --recipient-cert PATH"
        )
    raise CampaignError(
        "multiple matching recipient certificates found; pass --recipient-cert PATH"
    )


def require_tools() -> None:
    missing = [
        name
        for name in ("ssh", "openssl")
        if shutil.which(name) is None
    ]
    if missing:
        raise CampaignError(
            "required local tools are missing: " + ", ".join(missing)
        )


def ordinary_stages(plan: dict[str, Any]) -> list[dict[str, Any]]:
    by_class = {
        str(stage.get("class")): stage
        for stage in plan.get("stages", [])
        if isinstance(stage, dict)
    }
    result: list[dict[str, Any]] = []
    for class_name in ORDINARY_CLASSES:
        stage = by_class.get(class_name)
        if not stage:
            raise CampaignError(f"plan lacks ordinary class: {class_name}")
        if stage.get("state") != "READY_TO_CAPTURE":
            raise CampaignError(
                f"ordinary class is not ready: {class_name}={stage.get('state')}"
            )
        result.append(stage)
    return result


def preflight(recipient_cert: str | None) -> dict[str, Any]:
    require_tools()
    plan = recovery.campaign_plan()
    stages = ordinary_stages(plan)
    ordinary_payload_bytes = sum(
        int(stage.get("estimated_bytes") or 0) for stage in stages
    )
    operator_free_bytes = int(plan["operator_free_bytes"])
    headroom_after_ordinary_bytes = operator_free_bytes - ordinary_payload_bytes
    if headroom_after_ordinary_bytes <= 0:
        raise CampaignError(
            "Recovery OS ordinary-capture capacity is not ready: "
            f"free={operator_free_bytes} ordinary={ordinary_payload_bytes} "
            f"headroom={headroom_after_ordinary_bytes}"
        )

    status = recovery.evaluate()
    pilot = status.get("pilot")
    if not isinstance(pilot, dict):
        raise CampaignError("verified database/operator pilot is required")
    cert, fingerprint = resolve_recipient_certificate(recipient_cert, pilot)
    private_key = verify_canonical_private_key(cert)
    source = source_identity()

    return {
        "schema": 1,
        "kind": "aoe2war-recovery-campaign-preflight",
        "generated_at": utc_now(),
        "status": "READY",
        "tool_source": source,
        "authority": plan.get("authority"),
        "recipient_certificate": str(cert),
        "recipient_certificate_fingerprint": fingerprint,
        "canonical_private_key": private_key,
        "ordinary_classes": [stage["class"] for stage in stages],
        "ordinary_stage_estimates": {
            str(stage["class"]): int(stage.get("estimated_bytes") or 0)
            for stage in stages
        },
        "ordinary_payload_bytes": ordinary_payload_bytes,
        "operator_free_bytes": operator_free_bytes,
        "headroom_after_ordinary_bytes": headroom_after_ordinary_bytes,
        "full_campaign_capacity_ready": bool(plan.get("capacity_ready")),
        "wolo_mutation_authorized": False,
        "settlement_mutation_authorized": False,
        "key_material_in_general_vault": False,
    }


def _listener_counts(listeners: list[str]) -> dict[str, int]:
    return {
        port: sum(f":{port}" in line for line in listeners)
        for port in WOLO_PROTECTED_LISTENER_PORTS
    }


def build_wolo_preflight(
    inventory: dict[str, Any],
    operator_free_bytes: int,
    *,
    tool_source: str,
    tool_branch: str,
    tool_dirty: bool,
) -> dict[str, Any]:
    blockers: list[str] = []
    classes = inventory.get("classes") or {}
    wolo = inventory.get("wolo") or {}
    listeners = [str(item) for item in inventory.get("listeners") or []]
    listener_counts = _listener_counts(listeners)

    if wolo.get("service") != WOLO_MAINNET_SERVICE:
        blockers.append(
            f"Wolo service identity mismatch: {wolo.get('service')!r}"
        )
    if wolo.get("active") != "active":
        blockers.append(
            f"Wolo service is not active: {wolo.get('active')!r}"
        )
    if int(wolo.get("main_pid") or 0) <= 0:
        blockers.append("Wolo service has no live MainPID")
    if wolo.get("home") != WOLO_MAINNET_HOME:
        blockers.append(
            f"Wolo home mismatch: expected {WOLO_MAINNET_HOME}, got {wolo.get('home')!r}"
        )

    for identity_name in ("home_identity", "data_identity", "config_identity"):
        identity = wolo.get(identity_name) or {}
        if identity.get("exists") is not True:
            blockers.append(f"Wolo {identity_name} is missing")

    for port, count in listener_counts.items():
        if count != 1:
            blockers.append(
                f"protected Wolo listener {port} count must be exactly 1, got {count}"
            )

    services = wolo.get("services") or {}
    protected_services = {}
    for service_name in (
        WOLO_MAINNET_SERVICE,
        WOLO_SETTLEMENT_SERVICE,
        WOLO_FOUNDER_REWARDS_SERVICE,
    ):
        service = services.get(service_name) or {}
        protected_services[service_name] = service
        if service.get("id") != service_name:
            blockers.append(
                f"Wolo service metadata missing or mismatched: {service_name}"
            )
        if service.get("active") != "active" or service.get("sub_state") != "running":
            blockers.append(
                f"Wolo service is not active/running: {service_name} "
                f"active={service.get('active')!r} sub={service.get('sub_state')!r}"
            )
        if int(service.get("main_pid") or 0) <= 0:
            blockers.append(f"Wolo service has no live MainPID: {service_name}")

    for service_name in (WOLO_SETTLEMENT_SERVICE, WOLO_FOUNDER_REWARDS_SERVICE):
        requires = set((protected_services.get(service_name) or {}).get("requires") or [])
        if WOLO_MAINNET_SERVICE not in requires:
            blockers.append(
                f"Wolo settlement dependency mismatch: {service_name} does not require {WOLO_MAINNET_SERVICE}"
            )

    settlement_names = (
        "wolo_settlement_state",
        "wolo_founder_rewards_settlement_state",
    )
    settlement_bytes = 0
    settlement_state: dict[str, Any] = {}
    for class_name in settlement_names:
        identity = classes.get(class_name) or {}
        settlement_state[class_name] = identity
        if identity.get("exists") is not True:
            blockers.append(f"{class_name} is missing")
        settlement_bytes += int(identity.get("bytes") or 0)

    key_metadata = [
        item
        for item in (wolo.get("key_custody_metadata") or [])
        if isinstance(item, dict)
    ]
    by_relative_path: dict[str, dict[str, Any]] = {}
    for item in key_metadata:
        path = str(item.get("path") or "")
        prefix = WOLO_MAINNET_HOME + "/"
        if path.startswith(prefix):
            by_relative_path[path[len(prefix):]] = item

    protected_keys: dict[str, dict[str, Any]] = {}
    for relative in WOLO_PROTECTED_KEY_PATHS:
        metadata = by_relative_path.get(relative) or {
            "path": f"{WOLO_MAINNET_HOME}/{relative}",
            "exists": False,
        }
        protected_keys[relative] = metadata
        if metadata.get("exists") is not True:
            blockers.append(f"protected Wolo custody path is missing: {relative}")
            continue
        expected_mode = "600" if relative.endswith(".json") else "700"
        if str(metadata.get("mode") or "") != expected_mode:
            blockers.append(
                f"protected Wolo custody mode mismatch for {relative}: "
                f"expected {expected_mode}, got {metadata.get('mode')!r}"
            )
        if metadata.get("owner") != "root:root":
            blockers.append(
                f"protected Wolo custody owner mismatch for {relative}: "
                f"{metadata.get('owner')!r}"
            )

    consensus_bytes = int(
        ((wolo.get("home_identity") or {}).get("bytes") or 0)
    )
    estimated_payload_bytes = settlement_bytes + consensus_bytes
    headroom_after = int(operator_free_bytes) - estimated_payload_bytes
    if headroom_after <= 0:
        blockers.append(
            "Mac recovery-vault capacity is insufficient for the estimated Wolo payload: "
            f"free={operator_free_bytes} estimated={estimated_payload_bytes} "
            f"headroom={headroom_after}"
        )

    return {
        "schema": 1,
        "kind": "aoe2war-recovery-wolo-preflight",
        "generated_at": utc_now(),
        "status": "READY" if not blockers else "BLOCKED",
        "blockers": blockers,
        "tool_source": tool_source,
        "tool_branch": tool_branch,
        "tool_dirty": bool(tool_dirty),
        "capture_activation_requires_clean_main": True,
        "inventory_schema": inventory.get("schema"),
        "wolo": {
            "service": wolo.get("service"),
            "active": wolo.get("active"),
            "main_pid": wolo.get("main_pid"),
            "home": wolo.get("home"),
            "home_identity": wolo.get("home_identity"),
            "data_identity": wolo.get("data_identity"),
            "config_identity": wolo.get("config_identity"),
            "listener_counts": listener_counts,
            "services": protected_services,
        },
        "proposed_quiesce_order": list(WOLO_QUIESCE_ORDER),
        "proposed_restart_order": list(WOLO_RESTART_ORDER),
        "settlement_state": settlement_state,
        "settlement_state_bytes": settlement_bytes,
        "consensus_estimated_bytes": consensus_bytes,
        "estimated_encrypted_payload_bytes": estimated_payload_bytes,
        "operator_free_bytes": int(operator_free_bytes),
        "headroom_after_estimated_payload_bytes": headroom_after,
        "capacity_ready": headroom_after > 0,
        "key_custody": {
            "protected_paths": protected_keys,
            "secret_contents_read": False,
            "general_vault_payload": False,
            "separate_custody_required": True,
        },
        "authorization": {
            "settlement_capture": False,
            "wolo_quiesce": False,
            "consensus_capture": False,
            "key_custody": False,
        },
        "requires_quiesce": {
            "wolo_settlement_state": True,
            "wolo_consensus_recovery": True,
            "wolo_key_custody": False,
        },
        "production_mutated": False,
        "wolo_mutated": False,
    }


def wolo_preflight() -> dict[str, Any]:
    if shutil.which("ssh") is None:
        raise CampaignError("required local tool is missing: ssh")
    inventory = recovery.recovery_inventory()
    return build_wolo_preflight(
        inventory,
        int(shutil.disk_usage(Path.home()).free),
        tool_source=git_output("rev-parse", "HEAD"),
        tool_branch=git_output("branch", "--show-current"),
        tool_dirty=bool(
            git_output("status", "--porcelain", "--untracked-files=all")
        ),
    )


def print_wolo_preflight(payload: dict[str, Any]) -> None:
    print("⚔️  AOE2WAR WOLO RECOVERY PREFLIGHT")
    print()
    print(f"Status:       {payload['status']}")
    wolo = payload.get("wolo") or {}
    print(f"Service:      {wolo.get('active') or 'unknown'}")
    print(f"Home:         {wolo.get('home') or 'UNRESOLVED'}")
    counts = wolo.get("listener_counts") or {}
    print(
        "Listeners:    "
        + "  ".join(
            f"{port}={counts.get(port, 0)}"
            for port in WOLO_PROTECTED_LISTENER_PORTS
        )
    )

    print("Stop plan:    " + " -> ".join(payload.get("proposed_quiesce_order") or []))
    print("Start plan:   " + " -> ".join(payload.get("proposed_restart_order") or []))
    print(
        "Payload est:  "
        f"{int(payload.get('estimated_encrypted_payload_bytes') or 0) / (1024 ** 3):.2f} GiB"
    )
    print(
        "Mac headroom: "
        f"{int(payload.get('headroom_after_estimated_payload_bytes') or 0) / (1024 ** 3):.2f} GiB"
    )
    print("Secrets read: NO")
    print("Wolo mutate:  NO")
    print("Quiesce auth: NO")
    if payload.get("blockers"):
        print()
        print("Blocking preflight gaps:")
        for item in payload["blockers"]:
            print(f"  - {item}")
    else:
        print()
        print("READY FOR A SEPARATELY AUTHORIZED WOLO RECOVERY CAPTURE.")


def build_wolo_snapshot_plan(
    preflight: dict[str, Any],
    *,
    remote_volume_free_bytes: int,
) -> dict[str, Any]:
    blockers = list(preflight.get("blockers") or [])
    estimated = int(preflight.get("estimated_encrypted_payload_bytes") or 0)
    headroom = int(remote_volume_free_bytes) - estimated
    if preflight.get("status") != "READY" and not blockers:
        blockers.append("Wolo recovery preflight is not READY")
    if headroom < WOLO_REMOTE_MIN_HEADROOM_BYTES:
        blockers.append(
            "VPS recovery staging would leave insufficient HC-volume headroom: "
            f"free={remote_volume_free_bytes} estimated={estimated} "
            f"headroom={headroom} minimum={WOLO_REMOTE_MIN_HEADROOM_BYTES}"
        )
    return {
        "schema": 1,
        "kind": "aoe2war-recovery-wolo-snapshot-plan",
        "generated_at": utc_now(),
        "status": "READY" if not blockers else "BLOCKED",
        "blockers": blockers,
        "preflight": preflight,
        "remote_staging_root": WOLO_REMOTE_STAGING_ROOT,
        "remote_volume_free_bytes": int(remote_volume_free_bytes),
        "estimated_staged_bytes": estimated,
        "remote_headroom_after_estimate_bytes": headroom,
        "minimum_remote_headroom_bytes": WOLO_REMOTE_MIN_HEADROOM_BYTES,
        "strategy": "LIVE_PRESEED_THEN_CHECKSUM_QUIESCED_CONVERGENCE",
        "consensus_payload_whitelist": ["data/", "config/"],
        "config_secret_exclusions": [
            "priv_validator_key.json",
            "node_key.json",
        ],
        "home_paths_not_in_general_snapshot": [
            ".wolochain/",
            "keyring-file/",
            "keyring-test/",
        ],
        "proposed_quiesce_order": list(WOLO_QUIESCE_ORDER),
        "proposed_restart_order": list(WOLO_RESTART_ORDER),
        "activation_requires_clean_main": True,
        "activation_flag": "--authorize-wolo-quiesced-snapshot",
        "wolo_service_mutation_authorized": False,
        "wolo_data_mutation_authorized": False,
        "recovery_class_proven_after_staging": False,
    }


def wolo_snapshot_plan() -> dict[str, Any]:
    inventory = recovery.recovery_inventory()
    preflight = build_wolo_preflight(
        inventory,
        int(shutil.disk_usage(Path.home()).free),
        tool_source=git_output("rev-parse", "HEAD"),
        tool_branch=git_output("branch", "--show-current"),
        tool_dirty=bool(
            git_output("status", "--porcelain", "--untracked-files=all")
        ),
    )
    remote_capacity = inventory.get("capacity") or {}
    return build_wolo_snapshot_plan(
        preflight,
        remote_volume_free_bytes=int(
            remote_capacity.get("volume_free_bytes") or 0
        ),
    )


def wolo_snapshot_state_path(campaign_id: str) -> Path:
    state_path(campaign_id)
    return WOLO_SNAPSHOT_STATE_DIR / f"{campaign_id}.json"


def wolo_snapshot_lock_path() -> Path:
    return WOLO_SNAPSHOT_STATE_DIR / "snapshot.lock"


def _validate_snapshot_id(value: str) -> str:
    if (
        not value
        or any(
            ch
            not in "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_."
            for ch in value
        )
        or value in {".", ".."}
        or ".." in value
    ):
        raise CampaignError(f"unsafe Wolo snapshot id: {value!r}")
    return value


def wolo_snapshot_remote_script(
    *,
    snapshot_id: str,
    tool_source: str,
) -> str:
    q = shlex.quote
    snapshot_id = _validate_snapshot_id(snapshot_id)
    stage = f"{WOLO_REMOTE_STAGING_ROOT}/{snapshot_id}"
    return f'''
set -euo pipefail
umask 077

SNAPSHOT_ID={q(snapshot_id)}
TOOL_SOURCE={q(tool_source)}
STAGING_ROOT={q(WOLO_REMOTE_STAGING_ROOT)}
STAGE={q(stage)}
WOLO_HOME={q(WOLO_MAINNET_HOME)}
SETTLEMENT=/mnt/HC_Volume_105319120/wolochain-mainnet/settlement-state
FOUNDER=/mnt/HC_Volume_105319120/wolochain-mainnet/founder-rewards-settlement-state
NODE={q(WOLO_MAINNET_SERVICE)}
SETTLE={q(WOLO_SETTLEMENT_SERVICE)}
FOUNDER_UNIT={q(WOLO_FOUNDER_REWARDS_SERVICE)}
RPC_URL={q(WOLO_RPC_STATUS_URL)}
REST_URL={q(WOLO_REST_NODE_INFO_URL)}
MIN_HEADROOM={WOLO_REMOTE_MIN_HEADROOM_BYTES}
QUIESCED=0
QUIESCE_STARTED=0

fail() {{ echo "FAIL: $*" >&2; exit 1; }}
listener_count() {{ ss -ltn | grep -Ec ":$1[[:space:]]" || true; }}
require_listener_owner() {{
  port="$1"
  unit="$2"
  pid="$(systemctl show "$unit" -p MainPID --value)"
  [ "${{pid:-0}}" -gt 0 ] || fail "$unit has no MainPID for port $port"
  ss -ltnp \
    | grep -E ":$port[[:space:]]" \
    | grep -F "pid=$pid," >/dev/null \
    || fail "port $port is not owned by $unit pid=$pid"
}}
require_active() {{ systemctl is-active --quiet "$1" || fail "$1 inactive"; }}
require_inactive() {{
  if systemctl is-active --quiet "$1"; then
    fail "$1 still active"
  fi
}}

restart_all() {{
  [ "$QUIESCED" = 1 ] || return 0
  restart_rc=0
  systemctl start "$NODE" || restart_rc=1
  systemctl start "$SETTLE" || restart_rc=1
  systemctl start "$FOUNDER_UNIT" || restart_rc=1
  for unit in "$NODE" "$SETTLE" "$FOUNDER_UNIT"; do
    systemctl is-active --quiet "$unit" || restart_rc=1
  done
  if [ "$restart_rc" = 0 ]; then
    QUIESCED=0
    return 0
  fi
  return 1
}}
emergency_restart() {{
  rc=$?
  trap - EXIT HUP INT TERM
  if ! restart_all; then
    echo "FATAL: emergency Wolo restart failed" >&2
    exit 125
  fi
  exit "$rc"
}}
trap emergency_restart EXIT HUP INT TERM

for tool in rsync systemctl ss curl python3 sha256sum sync find du df seq; do
  command -v "$tool" >/dev/null || fail "missing required tool: $tool"
done

case "$STAGE" in
  "$STAGING_ROOT"/*) ;;
  *) fail "unsafe staging path" ;;
esac
[ ! -e "$STAGE" ] || fail "staging path already exists: $STAGE"

mkdir -p \
  "$STAGE/consensus/data" \
  "$STAGE/consensus/config" \
  "$STAGE/settlement-state" \
  "$STAGE/founder-rewards-settlement-state"
chmod 0700 \
  "$STAGE" \
  "$STAGE/consensus" \
  "$STAGE/settlement-state" \
  "$STAGE/founder-rewards-settlement-state"

for unit in "$NODE" "$SETTLE" "$FOUNDER_UNIT"; do
  require_active "$unit"
done
[ "$(listener_count 8092)" = 1 ] || fail "8092 listener count is not 1 before snapshot"
[ "$(listener_count 8093)" = 1 ] || fail "8093 listener count is not 1 before snapshot"
require_listener_owner 8092 "$SETTLE"
require_listener_owner 8093 "$FOUNDER_UNIT"

for unit in "$SETTLE" "$FOUNDER_UNIT"; do
  systemctl show "$unit" -p Requires --value \
    | tr ' ' '\n' \
    | grep -Fx "$NODE" >/dev/null \
    || fail "$unit no longer requires $NODE"
done

FREE_BYTES="$(df -B1 --output=avail "$STAGING_ROOT" | tail -1 | tr -d ' ')"
ESTIMATED_BYTES="$(
  du -sb "$WOLO_HOME" "$SETTLEMENT" "$FOUNDER" \
    | awk '{{s+=$1}} END{{print s+0}}'
)"
[ $((FREE_BYTES - ESTIMATED_BYTES)) -ge "$MIN_HEADROOM" ] \
  || fail "insufficient HC-volume staging headroom"

live_rsync() {{
  set +e
  rsync "$@"
  rc=$?
  set -e
  [ "$rc" = 0 ] || [ "$rc" = 24 ] || return "$rc"
}}

sync_live_seed() {{
  live_rsync -a --delete \
    "$WOLO_HOME/data/" \
    "$STAGE/consensus/data/"
  live_rsync -a --delete --delete-excluded \
    --exclude='priv_validator_key.json' \
    --exclude='node_key.json' \
    "$WOLO_HOME/config/" \
    "$STAGE/consensus/config/"
  live_rsync -a --delete \
    "$SETTLEMENT/" \
    "$STAGE/settlement-state/"
  live_rsync -a --delete \
    "$FOUNDER/" \
    "$STAGE/founder-rewards-settlement-state/"
}}

sync_final_checksum() {{
  rsync -a --checksum --delete \
    "$WOLO_HOME/data/" \
    "$STAGE/consensus/data/"
  rsync -a --checksum --delete --delete-excluded \
    --exclude='priv_validator_key.json' \
    --exclude='node_key.json' \
    "$WOLO_HOME/config/" \
    "$STAGE/consensus/config/"
  rsync -a --checksum --delete \
    "$SETTLEMENT/" \
    "$STAGE/settlement-state/"
  rsync -a --checksum --delete \
    "$FOUNDER/" \
    "$STAGE/founder-rewards-settlement-state/"
}}

# Phase 1: most bytes move while all Wolo services remain online.
sync_live_seed

# Phase 2: establish one consistency seam, converge by checksum, flush, restart.
QUIESCED=1
QUIESCE_STARTED="$(date +%s)"
systemctl stop "$FOUNDER_UNIT"
systemctl stop "$SETTLE"
systemctl stop "$NODE"

require_inactive "$FOUNDER_UNIT"
require_inactive "$SETTLE"
require_inactive "$NODE"
[ "$(listener_count 8092)" = 0 ] || fail "8092 remained live during quiesce"
[ "$(listener_count 8093)" = 0 ] || fail "8093 remained live during quiesce"

sync_final_checksum
sync -f "$STAGE"

STAGED_VALIDATOR_HEIGHT="$(
  python3 - "$STAGE/consensus/data/priv_validator_state.json" <<'PYHEIGHT'
import json
import sys
value = json.load(open(sys.argv[1], encoding="utf-8")).get("height")
print(int(value))
PYHEIGHT
)"
[ "$STAGED_VALIDATOR_HEIGHT" -ge 0 ] \
  || fail "staged priv-validator height is invalid"

restart_all || fail "dependency-safe Wolo restart failed"
for unit in "$NODE" "$SETTLE" "$FOUNDER_UNIT"; do
  require_active "$unit"
done
QUIESCE_ENDED="$(date +%s)"

for _ in $(seq 1 30); do
  if [ "$(listener_count 8092)" = 1 ] && [ "$(listener_count 8093)" = 1 ]; then
    break
  fi
  sleep 1
done
[ "$(listener_count 8092)" = 1 ] || fail "8092 did not return exactly once"
[ "$(listener_count 8093)" = 1 ] || fail "8093 did not return exactly once"
require_listener_owner 8092 "$SETTLE"
require_listener_owner 8093 "$FOUNDER_UNIT"

RPC_JSON="$(
  curl -fsS \
    --retry 8 \
    --retry-delay 1 \
    --retry-all-errors \
    --max-time 8 \
    "$RPC_URL"
)" || fail "Wolo RPC health is unreachable after restart"
curl -fsS \
  --retry 8 \
  --retry-delay 1 \
  --retry-all-errors \
  --max-time 8 \
  "$REST_URL" >/dev/null \
  || fail "Wolo REST health is unreachable after restart"

NETWORK="$(
  printf '%s' "$RPC_JSON" \
    | python3 -c 'import json,sys; print(json.load(sys.stdin)["result"]["node_info"]["network"])'
)"
HEIGHT="$(
  printf '%s' "$RPC_JSON" \
    | python3 -c 'import json,sys; print(json.load(sys.stdin)["result"]["sync_info"]["latest_block_height"])'
)"
CATCHING="$(
  printf '%s' "$RPC_JSON" \
    | python3 -c 'import json,sys; print(json.load(sys.stdin)["result"]["sync_info"]["catching_up"])'
)"
[ "$NETWORK" = wolo-1 ] || fail "network is $NETWORK after restart"
[ "$CATCHING" = False ] || fail "catching_up is $CATCHING after restart"
[ "$HEIGHT" -ge "$STAGED_VALIDATOR_HEIGHT" ] \
  || fail "post-restart chain height $HEIGHT is below staged validator height $STAGED_VALIDATOR_HEIGHT"

# General recovery staging must not contain protected or ambiguous key material.
[ ! -e "$STAGE/consensus/config/priv_validator_key.json" ] \
  || fail "validator key leaked into staging"
[ ! -e "$STAGE/consensus/config/node_key.json" ] \
  || fail "node key leaked into staging"
[ ! -e "$STAGE/keyring-file" ] \
  || fail "keyring-file leaked into staging"
[ ! -e "$STAGE/keyring-test" ] \
  || fail "keyring-test leaked into staging"
[ ! -e "$STAGE/.wolochain" ] \
  || fail "nested .wolochain leaked into staging"

DATA_BYTES="$(du -sb "$STAGE/consensus/data" | awk '{{print $1}}')"
CONFIG_BYTES="$(du -sb "$STAGE/consensus/config" | awk '{{print $1}}')"
SETTLEMENT_BYTES="$(du -sb "$STAGE/settlement-state" | awk '{{print $1}}')"
FOUNDER_BYTES="$(du -sb "$STAGE/founder-rewards-settlement-state" | awk '{{print $1}}')"
RECEIPT="$STAGE/stage-receipt.json"

python3 - \
  "$RECEIPT" \
  "$SNAPSHOT_ID" \
  "$TOOL_SOURCE" \
  "$STAGE" \
  "$QUIESCE_STARTED" \
  "$QUIESCE_ENDED" \
  "$STAGED_VALIDATOR_HEIGHT" \
  "$HEIGHT" \
  "$DATA_BYTES" \
  "$CONFIG_BYTES" \
  "$SETTLEMENT_BYTES" \
  "$FOUNDER_BYTES" <<'PYREC'
import json
import pathlib
import sys

(
    receipt,
    snapshot_id,
    tool_source,
    stage,
    started,
    ended,
    staged_validator_height,
    height,
    data_bytes,
    config_bytes,
    settlement_bytes,
    founder_bytes,
) = sys.argv[1:]

payload = {{
    "schema": 1,
    "kind": "aoe2war-recovery-wolo-staged-snapshot",
    "status": "STAGED_PENDING_ENCRYPTED_CAPTURE",
    "snapshot_id": snapshot_id,
    "tool_source": tool_source,
    "remote_stage": stage,
    "strategy": "LIVE_PRESEED_THEN_CHECKSUM_QUIESCED_CONVERGENCE",
    "quiesce_seconds": max(0, int(ended) - int(started)),
    "staged_priv_validator_height": int(staged_validator_height),
    "post_restart_network": "wolo-1",
    "post_restart_height": int(height),
    "post_restart_catching_up": False,
    "service_restarted": True,
    "wolo_service_quiesced": True,
    "wolo_chain_data_mutated": False,
    "settlement_state_mutated": False,
    "checksum_convergence": True,
    "general_vault_secret_contents_included": False,
    "consensus_whitelist": ["data/", "config/"],
    "config_secret_exclusions": [
        "priv_validator_key.json",
        "node_key.json",
    ],
    "staged_bytes": {{
        "consensus_data": int(data_bytes),
        "consensus_config": int(config_bytes),
        "settlement_state": int(settlement_bytes),
        "founder_rewards_settlement_state": int(founder_bytes),
    }},
}}

path = pathlib.Path(receipt)
path.write_text(
    json.dumps(payload, indent=2, sort_keys=True) + "\n",
    encoding="utf-8",
)
print(json.dumps(payload, sort_keys=True))
PYREC

sha256sum "$RECEIPT" \
  | awk '{{print $1 "  stage-receipt.json"}}' \
  > "$RECEIPT.sha256"

trap - EXIT HUP INT TERM
'''


def execute_wolo_snapshot_remote(script: str) -> dict[str, Any]:
    proc = subprocess.run(
        [
            "ssh",
            "-o",
            "BatchMode=yes",
            "-o",
            "ConnectTimeout=8",
            recovery._root_maintenance_host(),
            "bash -s",
        ],
        cwd=ROOT,
        input=script,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=1800,
        check=False,
    )
    if proc.returncode != 0:
        raise CampaignError(
            "Wolo snapshot remote controller failed: "
            + (proc.stdout.strip()[-4000:] or f"exit={proc.returncode}")
        )
    lines = [line for line in proc.stdout.splitlines() if line.strip()]
    for line in reversed(lines):
        try:
            payload = json.loads(line)
        except json.JSONDecodeError:
            continue
        if (
            isinstance(payload, dict)
            and payload.get("kind")
            == "aoe2war-recovery-wolo-staged-snapshot"
        ):
            return payload
    raise CampaignError(
        "Wolo snapshot controller returned no staged-snapshot receipt"
    )


def start_wolo_snapshot(
    campaign_id: str,
    *,
    authorize_wolo_quiesced_snapshot: bool,
) -> dict[str, Any]:
    if not authorize_wolo_quiesced_snapshot:
        raise CampaignError(
            "Wolo snapshot start requires --authorize-wolo-quiesced-snapshot"
        )

    WOLO_SNAPSHOT_STATE_DIR.mkdir(parents=True, exist_ok=True)
    lock_file = wolo_snapshot_lock_path().open("a+")
    locked = False
    try:
        try:
            fcntl.flock(
                lock_file.fileno(),
                fcntl.LOCK_EX | fcntl.LOCK_NB,
            )
            locked = True
        except BlockingIOError as exc:
            raise CampaignError(
                "another Wolo Recovery snapshot transaction is active"
            ) from exc

        source = source_identity()
        state = load_state(campaign_id)
        if (
            state.get("status") != "COMPLETE"
            or state.get("completion_reason")
            != "ORDINARY_CAPTURE_COMPLETE_WOLO_AUTHORIZATION_REQUIRED"
        ):
            raise CampaignError(
                "Wolo snapshot requires a completed ordinary capture campaign"
            )

        restore = restore_status_payload(campaign_id)
        if (
            restore.get("status") != "COMPLETE"
            or restore.get("completion_reason")
            != "ORDINARY_RESTORE_VERIFIED_WOLO_AUTHORIZATION_REQUIRED"
        ):
            raise CampaignError(
                "Wolo snapshot requires ORDINARY_RESTORE_VERIFIED first"
            )

        plan = wolo_snapshot_plan()
        if plan.get("status") != "READY":
            raise CampaignError(
                "Wolo snapshot plan is not READY: "
                + "; ".join(
                    str(item) for item in plan.get("blockers") or []
                )
            )

        snapshot_path = wolo_snapshot_state_path(campaign_id)
        if snapshot_path.exists():
            raise CampaignError(
                f"Wolo snapshot state already exists for campaign: {campaign_id}"
            )

        snapshot_id = _validate_snapshot_id(
            f"{campaign_id}-wolo-{stamp()}-{source[:12]}"
        )
        remote_stage = f"{WOLO_REMOTE_STAGING_ROOT}/{snapshot_id}"
        transaction = {
            "schema": 1,
            "kind": "aoe2war-recovery-wolo-snapshot-state",
            "campaign_id": campaign_id,
            "snapshot_id": snapshot_id,
            "status": WOLO_SNAPSHOT_RUNNING_STATUS,
            "created_at": utc_now(),
            "tool_source": source,
            "remote_stage": remote_stage,
            "authorization": {
                "wolo_quiesced_snapshot": True,
                "wolo_chain_data_mutation": False,
                "settlement_state_mutation": False,
                "key_custody": False,
            },
            "encrypted_capture_complete": False,
            "recovery_class_proven": False,
            "wolo_chain_data_mutated": False,
            "settlement_state_mutated": False,
            "requires_operator_reconciliation": False,
            "last_error": None,
        }
        write_json_with_sidecar(snapshot_path, transaction)

        try:
            remote = execute_wolo_snapshot_remote(
                wolo_snapshot_remote_script(
                    snapshot_id=snapshot_id,
                    tool_source=source,
                )
            )
        except Exception as exc:
            transaction["status"] = WOLO_SNAPSHOT_UNCERTAIN_STATUS
            transaction["last_error"] = str(exc)
            transaction["failed_at"] = utc_now()
            transaction["requires_operator_reconciliation"] = True
            write_json_with_sidecar(snapshot_path, transaction)
            raise

        transaction.update(
            {
                "status": WOLO_SNAPSHOT_STATUS,
                "remote": remote,
                "finished_at": utc_now(),
                "requires_operator_reconciliation": False,
            }
        )
        write_json_with_sidecar(snapshot_path, transaction)
        return transaction
    finally:
        try:
            if locked:
                fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)
        finally:
            lock_file.close()


def wolo_snapshot_status(campaign_id: str) -> dict[str, Any]:
    path = wolo_snapshot_state_path(campaign_id)
    payload, digest, error = recovery._load_hashed_json(path)
    if error or payload is None:
        raise CampaignError(
            error or "Wolo snapshot state is unavailable"
        )
    if (
        payload.get("kind")
        != "aoe2war-recovery-wolo-snapshot-state"
    ):
        raise CampaignError("invalid Wolo snapshot state kind")
    result = dict(payload)
    result["proof_path"] = str(path)
    result["proof_sha256"] = digest
    return result


def print_wolo_snapshot_plan(payload: dict[str, Any]) -> None:
    print("⚔️  AOE2WAR WOLO SNAPSHOT PLAN")
    print()
    print(f"Status:       {payload['status']}")
    print(f"Strategy:     {payload['strategy']}")
    print(f"Staging:      {payload['remote_staging_root']}")
    print(
        "HC headroom:  "
        f"{int(payload['remote_headroom_after_estimate_bytes']) / (1024 ** 3):.2f} GiB"
    )
    print(
        "Stop plan:    "
        + " -> ".join(payload["proposed_quiesce_order"])
    )
    print(
        "Start plan:   "
        + " -> ".join(payload["proposed_restart_order"])
    )
    print(
        "Authorization: REQUIRED — plan performs no service action"
    )
    if payload.get("blockers"):
        print()
        print("Blocking gaps:")
        for item in payload["blockers"]:
            print(f"  - {item}")


def _stage_source(
    plan: dict[str, Any],
    stage: dict[str, Any],
) -> tuple[str, list[str]]:
    class_name = str(stage["class"])
    inventory = plan.get("inventory") or {}
    classes = inventory.get("classes") or {}

    if class_name == "parser_evidence_corpus":
        source = str(
            (classes.get(class_name) or {}).get("path") or ""
        )
        names = [str(item) for item in stage.get("include_top_level") or []]
        if not source or not names:
            raise CampaignError("parser source/include set is incomplete")
        return source, names

    source = str((classes.get(class_name) or {}).get("path") or "")
    if not source:
        raise CampaignError(f"source path missing for {class_name}")
    source_path = Path(source)
    return str(source_path.parent), [source_path.name]


def remote_tar_command(
    plan: dict[str, Any],
    stage: dict[str, Any],
) -> list[str]:
    base, names = _stage_source(plan, stage)
    if not base.startswith("/"):
        raise CampaignError(f"unsafe remote base path: {base!r}")
    if any(
        not name
        or name.startswith("/")
        or "/" in name
        or name in {".", ".."}
        for name in names
    ):
        raise CampaignError(f"unsafe remote archive members: {names!r}")
    return [
        "tar",
        "--numeric-owner",
        "-C",
        base,
        "-cf",
        "-",
        "--",
        *names,
    ]


def cms_encrypt_command(
    recipient_cert: Path,
    output: Path,
) -> list[str]:
    return [
        "openssl",
        "cms",
        "-encrypt",
        "-binary",
        "-stream",
        "-outform",
        "DER",
        "-aes256",
        "-recip",
        str(recipient_cert),
        "-out",
        str(output),
    ]



def cms_decrypt_command(
    recipient_cert: Path,
    private_key: Path,
    input_path: Path,
) -> list[str]:
    return [
        "openssl",
        "cms",
        "-decrypt",
        "-binary",
        "-inform",
        "DER",
        "-in",
        str(input_path),
        "-recip",
        str(recipient_cert),
        "-inkey",
        str(private_key),
    ]


def _chunk_root(bundle_root: Path, class_name: str) -> Path:
    return bundle_root / f"{class_name}.cms.chunks"


def _chunk_dir(root: Path, index: int) -> Path:
    return root / f"chunk-{index:06d}"


def _chunk_partial_dir(root: Path, index: int) -> Path:
    return root / f".chunk-{index:06d}.partial"


def _read_chunk_receipt(
    path: Path,
    expected_index: int,
    *,
    verify_ciphertext: bool = True,
) -> dict[str, Any]:
    proof_path = path / "proof.json"
    payload, _, error = recovery._load_hashed_json(proof_path)
    if error or payload is None:
        raise CampaignError(
            f"invalid sealed recovery chunk {path.name}: {error or 'missing proof'}"
        )
    if payload.get("kind") != "aoe2war-recovery-cms-chunk":
        raise CampaignError(f"invalid recovery chunk kind: {path.name}")
    if int(payload.get("index", -1)) != expected_index:
        raise CampaignError(
            f"recovery chunk sequence mismatch: expected={expected_index} "
            f"actual={payload.get('index')}"
        )
    cms_path = path / "payload.cms"
    if not cms_path.is_file():
        raise CampaignError(f"sealed recovery chunk is missing payload: {path.name}")
    expected_ciphertext = str(payload.get("ciphertext_sha256") or "")
    if len(expected_ciphertext) != 64:
        raise CampaignError(f"sealed recovery chunk SHA-256 is invalid: {path.name}")
    if verify_ciphertext and recovery.sha256(cms_path) != expected_ciphertext:
        raise CampaignError(f"sealed recovery chunk SHA-256 mismatch: {path.name}")
    if int(payload.get("ciphertext_bytes") or 0) != cms_path.stat().st_size:
        raise CampaignError(f"sealed recovery chunk byte-size mismatch: {path.name}")
    plaintext_bytes = int(payload.get("plaintext_bytes") or 0)
    if plaintext_bytes <= 0 or plaintext_bytes > CMS_CHUNK_PLAINTEXT_BYTES:
        raise CampaignError(
            f"sealed recovery chunk plaintext size is invalid: {path.name}"
        )
    plaintext_sha = str(payload.get("plaintext_sha256") or "")
    if len(plaintext_sha) != 64:
        raise CampaignError(
            f"sealed recovery chunk plaintext SHA-256 is invalid: {path.name}"
        )
    return dict(payload)


def _load_existing_chunk_receipts(
    root: Path,
    *,
    verify_ciphertext: bool = True,
) -> list[dict[str, Any]]:
    if not root.is_dir():
        return []
    chunk_dirs = sorted(
        item
        for item in root.iterdir()
        if item.is_dir() and item.name.startswith("chunk-")
    )
    receipts: list[dict[str, Any]] = []
    for index, path in enumerate(chunk_dirs):
        if path.name != f"chunk-{index:06d}":
            raise CampaignError(
                "recovery chunk sequence has a gap or unexpected directory: "
                f"{path.name}"
            )
        receipts.append(
            _read_chunk_receipt(
                path,
                index,
                verify_ciphertext=verify_ciphertext,
            )
        )
    return receipts


def _verify_source_prefix(
    source: Any,
    receipt: dict[str, Any],
    whole_digest: Any,
) -> None:
    remaining = int(receipt["plaintext_bytes"])
    digest = hashlib.sha256()
    while remaining:
        chunk = source.read(min(1024 * 1024, remaining))
        if not chunk:
            raise CampaignError(
                "recovery resume source ended before sealed chunk prefix "
                f"{receipt['index']}"
            )
        digest.update(chunk)
        whole_digest.update(chunk)
        remaining -= len(chunk)
    if digest.hexdigest() != receipt["plaintext_sha256"]:
        raise CampaignError(
            "recovery resume source prefix changed; refusing to splice mutable "
            f"source at sealed chunk {receipt['index']}"
        )


def _verify_cms_chunk(
    cms_path: Path,
    *,
    recipient_cert: Path,
    private_key: Path,
    expected_bytes: int,
    expected_sha256: str,
) -> None:
    proc = subprocess.Popen(
        cms_decrypt_command(recipient_cert, private_key, cms_path),
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if proc.stdout is None:
        raise CampaignError("failed to open CMS chunk decrypt stream")
    digest = hashlib.sha256()
    total = 0
    while True:
        chunk = proc.stdout.read(1024 * 1024)
        if not chunk:
            break
        digest.update(chunk)
        total += len(chunk)
    proc.stdout.close()
    stderr = proc.stderr.read() if proc.stderr is not None else b""
    if proc.stderr is not None:
        proc.stderr.close()
    rc = proc.wait()
    if rc != 0:
        raise CampaignError(
            "CMS chunk restore verification failed: "
            + stderr.decode(errors="replace").strip()
        )
    if total != expected_bytes or digest.hexdigest() != expected_sha256:
        raise CampaignError(
            "CMS chunk restore verification plaintext mismatch: "
            f"bytes={total}/{expected_bytes} sha={digest.hexdigest()}/{expected_sha256}"
        )


def _capture_new_chunk(
    *,
    source: Any,
    root: Path,
    index: int,
    recipient_cert: Path,
    private_key: Path,
    recipient_fingerprint: str,
    whole_digest: Any,
) -> dict[str, Any] | None:
    first = source.read(min(1024 * 1024, CMS_CHUNK_PLAINTEXT_BYTES))
    if not first:
        return None

    final_dir = _chunk_dir(root, index)
    partial_dir = _chunk_partial_dir(root, index)
    if final_dir.exists():
        raise CampaignError(f"recovery chunk already exists unexpectedly: {final_dir}")
    if partial_dir.exists():
        shutil.rmtree(partial_dir)
    partial_dir.mkdir(parents=True, exist_ok=False)
    partial_cms = partial_dir / "payload.cms"

    encrypt = subprocess.Popen(
        cms_encrypt_command(recipient_cert, partial_cms),
        cwd=ROOT,
        stdin=subprocess.PIPE,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
    )
    if encrypt.stdin is None:
        raise CampaignError("failed to create CMS chunk encryption stream")

    digest = hashlib.sha256()
    plaintext_bytes = 0
    stream_error: Exception | None = None
    try:
        pending = first
        while pending:
            digest.update(pending)
            whole_digest.update(pending)
            plaintext_bytes += len(pending)
            encrypt.stdin.write(pending)
            if plaintext_bytes >= CMS_CHUNK_PLAINTEXT_BYTES:
                break
            pending = source.read(
                min(
                    1024 * 1024,
                    CMS_CHUNK_PLAINTEXT_BYTES - plaintext_bytes,
                )
            )
    except Exception as exc:
        stream_error = exc
    finally:
        try:
            encrypt.stdin.close()
        except Exception:
            pass

    stderr = encrypt.stderr.read() if encrypt.stderr is not None else b""
    if encrypt.stderr is not None:
        encrypt.stderr.close()
    rc = encrypt.wait()
    if stream_error is not None:
        raise CampaignError(f"CMS chunk stream failed: {stream_error}")
    if rc != 0:
        raise CampaignError(
            "CMS chunk encryption failed: "
            + stderr.decode(errors="replace").strip()
        )
    if not partial_cms.is_file() or partial_cms.stat().st_size <= 0:
        raise CampaignError("CMS chunk encryption produced no payload")

    plaintext_sha = digest.hexdigest()
    _verify_cms_chunk(
        partial_cms,
        recipient_cert=recipient_cert,
        private_key=private_key,
        expected_bytes=plaintext_bytes,
        expected_sha256=plaintext_sha,
    )

    ciphertext_sha = recovery.sha256(partial_cms)
    proof = {
        "schema": 1,
        "kind": "aoe2war-recovery-cms-chunk",
        "format": CMS_CHUNK_FORMAT,
        "index": index,
        "created_at": utc_now(),
        "plaintext_bytes": plaintext_bytes,
        "plaintext_sha256": plaintext_sha,
        "ciphertext_file": "payload.cms",
        "ciphertext_bytes": partial_cms.stat().st_size,
        "ciphertext_sha256": ciphertext_sha,
        "recipient_certificate_fingerprint": recipient_fingerprint,
        "cms_restore_test": "PASS",
    }
    write_json_with_sidecar(partial_dir / "proof.json", proof)
    os.replace(partial_dir, final_dir)
    return proof


def _verify_chunked_tar_restore(
    root: Path,
    receipts: list[dict[str, Any]],
    *,
    recipient_cert: Path,
    private_key: Path,
) -> tuple[int, str]:
    tar = subprocess.Popen(
        ["tar", "-tf", "-"],
        cwd=ROOT,
        stdin=subprocess.PIPE,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
    )
    if tar.stdin is None:
        raise CampaignError("failed to create streamed tar restore verifier")

    whole = hashlib.sha256()
    total = 0
    try:
        for index, receipt in enumerate(receipts):
            cms_path = _chunk_dir(root, index) / "payload.cms"
            decrypt = subprocess.Popen(
                cms_decrypt_command(recipient_cert, private_key, cms_path),
                cwd=ROOT,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            if decrypt.stdout is None:
                raise CampaignError("failed to create chunk decrypt stream")
            chunk_digest = hashlib.sha256()
            chunk_bytes = 0
            while True:
                data = decrypt.stdout.read(1024 * 1024)
                if not data:
                    break
                chunk_digest.update(data)
                whole.update(data)
                chunk_bytes += len(data)
                total += len(data)
                tar.stdin.write(data)
            decrypt.stdout.close()
            decrypt_stderr = (
                decrypt.stderr.read() if decrypt.stderr is not None else b""
            )
            if decrypt.stderr is not None:
                decrypt.stderr.close()
            decrypt_rc = decrypt.wait()
            if decrypt_rc != 0:
                raise CampaignError(
                    f"chunk {index} restore failed: "
                    + decrypt_stderr.decode(errors="replace").strip()
                )
            if (
                chunk_bytes != int(receipt["plaintext_bytes"])
                or chunk_digest.hexdigest() != receipt["plaintext_sha256"]
            ):
                raise CampaignError(
                    f"chunk {index} restore plaintext does not match sealed proof"
                )
    except Exception:
        try:
            tar.stdin.close()
        except Exception:
            pass
        tar.kill()
        tar.wait()
        raise

    tar.stdin.close()
    tar_stderr = tar.stderr.read() if tar.stderr is not None else b""
    if tar.stderr is not None:
        tar.stderr.close()
    tar_rc = tar.wait()
    if tar_rc != 0:
        raise CampaignError(
            "chunked recovery payload failed streamed tar structural restore: "
            + tar_stderr.decode(errors="replace").strip()
        )
    return total, whole.hexdigest()


def chunk_capture_has_checkpoint(state: dict[str, Any]) -> bool:
    class_name = str(state.get("current_class") or "")
    bundle = str(state.get("bundle_root") or "")
    if class_name not in ORDINARY_CLASSES or not bundle:
        return False
    root = _chunk_root(Path(bundle).expanduser().resolve(), class_name)
    if not root.is_dir():
        return False
    if (root / "manifest.json").is_file():
        return True
    return any(
        item.is_dir() and item.name.startswith("chunk-")
        for item in root.iterdir()
    )


def capture_stage(
    *,
    campaign_id: str,
    bundle_root: Path,
    plan: dict[str, Any],
    stage: dict[str, Any],
    recipient_cert: Path,
    recipient_fingerprint: str,
) -> dict[str, Any]:
    class_name = str(stage["class"])
    tar_args = remote_tar_command(plan, stage)
    stderr_log = bundle_root / f"{class_name}.source.stderr.log"
    proof_path = bundle_root / "proofs" / f"{class_name}.json"
    root = _chunk_root(bundle_root, class_name)
    manifest_path = root / "manifest.json"

    # Legacy giant-single-CMS artifacts are deliberately not reused by the
    # chunked format. They remain forensic evidence from the failed generation.
    legacy_artifact = bundle_root / f"{class_name}.cms"
    legacy_partial = bundle_root / f"{class_name}.cms.partial"
    if legacy_artifact.exists() or legacy_partial.exists():
        raise CampaignError(
            f"legacy single-CMS artifact exists for {class_name}; "
            "start a fresh chunked campaign rather than mixing formats"
        )
    if proof_path.exists():
        raise CampaignError(
            f"campaign proof already exists for {class_name}; "
            "refusing ambiguous overwrite"
        )

    bundle_root.mkdir(parents=True, exist_ok=True)
    proof_path.parent.mkdir(parents=True, exist_ok=True)
    root.mkdir(parents=True, exist_ok=True)
    private_key = CANONICAL_RECOVERY_PRIVATE_KEY
    if not private_key.is_file():
        raise CampaignError("canonical recovery private key disappeared after preflight")

    started = utc_now()

    # If all chunks and the manifest were already sealed before a controller
    # interruption, finish from local encrypted evidence without touching the
    # remote source again.
    if manifest_path.is_file():
        manifest, _, error = recovery._load_hashed_json(manifest_path)
        if error or manifest is None:
            raise CampaignError(
                f"invalid chunked class manifest for {class_name}: {error}"
            )
        receipts = _load_existing_chunk_receipts(root)
        restored_bytes, restored_sha = _verify_chunked_tar_restore(
            root,
            receipts,
            recipient_cert=recipient_cert,
            private_key=private_key,
        )
        if (
            restored_bytes != int(manifest.get("plaintext_tar_bytes") or 0)
            or restored_sha != manifest.get("plaintext_tar_sha256")
        ):
            raise CampaignError(
                f"{class_name} sealed manifest does not match streamed restore"
            )
    else:
        receipts = _load_existing_chunk_receipts(root)
        whole_plaintext = hashlib.sha256()
        plaintext_bytes = 0

        ssh_cmd = [
            "ssh",
            "-o",
            "BatchMode=yes",
            "-o",
            "ConnectTimeout=8",
            recovery._root_maintenance_host(),
            shlex.join(tar_args),
        ]

        with stderr_log.open("ab") as source_stderr:
            source = subprocess.Popen(
                ssh_cmd,
                cwd=ROOT,
                stdout=subprocess.PIPE,
                stderr=source_stderr,
            )
            if source.stdout is None:
                raise CampaignError("failed to create recovery capture stream")

            try:
                for receipt in receipts:
                    _verify_source_prefix(
                        source.stdout,
                        receipt,
                        whole_plaintext,
                    )
                    plaintext_bytes += int(receipt["plaintext_bytes"])

                if receipts and int(receipts[-1]["plaintext_bytes"]) < CMS_CHUNK_PLAINTEXT_BYTES:
                    if source.stdout.read(1):
                        raise CampaignError(
                            f"{class_name} source grew or changed after a sealed "
                            "short terminal chunk; refusing unsafe resume"
                        )
                else:
                    while True:
                        receipt = _capture_new_chunk(
                            source=source.stdout,
                            root=root,
                            index=len(receipts),
                            recipient_cert=recipient_cert,
                            private_key=private_key,
                            recipient_fingerprint=recipient_fingerprint,
                            whole_digest=whole_plaintext,
                        )
                        if receipt is None:
                            break
                        receipts.append(receipt)
                        plaintext_bytes += int(receipt["plaintext_bytes"])
            finally:
                try:
                    source.stdout.close()
                except Exception:
                    pass

            source_rc = source.wait()

        if source_rc != 0:
            # A failed producer can look like EOF to the consumer and therefore
            # leave one short, individually valid CMS chunk. That short tail is
            # not a proven archive boundary. Discard only that tail so a later
            # resume can revalidate the sealed full-chunk prefix and continue.
            if (
                receipts
                and int(receipts[-1]["plaintext_bytes"])
                < CMS_CHUNK_PLAINTEXT_BYTES
            ):
                shutil.rmtree(
                    _chunk_dir(root, int(receipts[-1]["index"])),
                    ignore_errors=True,
                )
            raise CampaignError(
                f"{class_name} remote tar failed with exit={source_rc}; "
                f"see {stderr_log}"
            )
        if not receipts:
            raise CampaignError(f"{class_name} produced no encrypted chunks")

        plaintext_sha = whole_plaintext.hexdigest()
        restored_bytes, restored_sha = _verify_chunked_tar_restore(
            root,
            receipts,
            recipient_cert=recipient_cert,
            private_key=private_key,
        )
        if restored_bytes != plaintext_bytes or restored_sha != plaintext_sha:
            raise CampaignError(
                f"{class_name} streamed restore does not match captured tar identity"
            )

        manifest = {
            "schema": 1,
            "kind": "aoe2war-recovery-cms-chunk-manifest",
            "format": CMS_CHUNK_FORMAT,
            "campaign_id": campaign_id,
            "class": class_name,
            "created_at": utc_now(),
            "chunk_plaintext_limit_bytes": CMS_CHUNK_PLAINTEXT_BYTES,
            "chunk_count": len(receipts),
            "plaintext_tar_bytes": plaintext_bytes,
            "plaintext_tar_sha256": plaintext_sha,
            "ciphertext_bytes": sum(
                int(item.get("ciphertext_bytes") or 0) for item in receipts
            ),
            "recipient_certificate_fingerprint": recipient_fingerprint,
            "chunks": [
                {
                    "index": int(item["index"]),
                    "directory": f"chunk-{int(item['index']):06d}",
                    "plaintext_bytes": int(item["plaintext_bytes"]),
                    "plaintext_sha256": item["plaintext_sha256"],
                    "ciphertext_bytes": int(item["ciphertext_bytes"]),
                    "ciphertext_sha256": item["ciphertext_sha256"],
                }
                for item in receipts
            ],
            "streamed_tar_restore_test": "PASS",
        }
        write_json_with_sidecar(manifest_path, manifest)

    # Reload the sealed manifest after either the normal or interrupted-complete
    # path so the class proof is generated from one immutable object.
    manifest, manifest_sha, error = recovery._load_hashed_json(manifest_path)
    if error or manifest is None or manifest_sha is None:
        raise CampaignError(
            f"{class_name} manifest seal is invalid: {error or 'missing SHA'}"
        )
    receipts = _load_existing_chunk_receipts(root)

    proof = {
        "schema": 1,
        "kind": "aoe2war-recovery-capture-proof",
        "campaign_id": campaign_id,
        "class": class_name,
        "status": "CAPTURED_PENDING_RESTORE",
        "strategy": stage.get("strategy"),
        "created_at": utc_now(),
        "started_at": started,
        "source_tar_command": tar_args,
        "artifact_format": CMS_CHUNK_FORMAT,
        "chunk_plaintext_limit_bytes": CMS_CHUNK_PLAINTEXT_BYTES,
        "chunk_count": len(receipts),
        "chunk_manifest_file": str(manifest_path.relative_to(bundle_root)),
        "chunk_manifest_sha256": manifest_sha,
        "plaintext_tar_bytes": int(manifest["plaintext_tar_bytes"]),
        "plaintext_tar_sha256": manifest["plaintext_tar_sha256"],
        "ciphertext_bytes": int(manifest["ciphertext_bytes"]),
        "cms_structure_test": "PASS_PER_CHUNK_DECRYPT",
        "cms_streaming": True,
        "cms_encoding": "BER_INDEFINITE_LENGTH_PER_CHUNK",
        "recipient_certificate_fingerprint": recipient_fingerprint,
        "source_inventory": (
            (plan.get("inventory") or {}).get("classes", {}).get(class_name)
        ),
        "parser_include_top_level": (
            stage.get("include_top_level")
            if class_name == "parser_evidence_corpus"
            else None
        ),
        "parser_exclude_top_level": (
            stage.get("exclude_top_level")
            if class_name == "parser_evidence_corpus"
            else None
        ),
        "restore_test": "PASS_STREAMED_TAR_LIST",
        "secrets_policy": {
            "private_recovery_key_transmitted_to_vps": False,
            "validator_private_keys_included": False,
            "wolo_keyrings_included": False,
        },
    }
    proof_sha = write_json_with_sidecar(proof_path, proof)
    return {
        "class": class_name,
        "artifact": str(manifest_path),
        "artifact_format": CMS_CHUNK_FORMAT,
        "chunk_count": len(receipts),
        "ciphertext_bytes": int(manifest["ciphertext_bytes"]),
        "plaintext_tar_bytes": int(manifest["plaintext_tar_bytes"]),
        "plaintext_tar_sha256": manifest["plaintext_tar_sha256"],
        "manifest_path": str(manifest_path),
        "manifest_sha256": manifest_sha,
        "proof_path": str(proof_path),
        "proof_sha256": proof_sha,
        "completed_at": utc_now(),
    }



def cms_stream_restore_decrypt_command(
    artifact: Path,
    recipient_cert: Path,
    private_key: Path,
) -> list[str]:
    return [
        "openssl",
        "cms",
        "-decrypt",
        "-binary",
        "-inform",
        "DER",
        "-in",
        str(artifact),
        "-recip",
        str(recipient_cert),
        "-inkey",
        str(private_key),
    ]


def restore_state_path(campaign_id: str) -> Path:
    state_path(campaign_id)
    return RESTORE_DIR / f"{campaign_id}.json"


def restore_log_path(campaign_id: str) -> Path:
    state_path(campaign_id)
    return RESTORE_DIR / f"{campaign_id}.log"


def restore_pause_path(campaign_id: str) -> Path:
    restore_state_path(campaign_id)
    return RESTORE_DIR / f"{campaign_id}.pause"


def restore_pause_marker(campaign_id: str) -> dict[str, Any] | None:
    path = restore_pause_path(campaign_id)
    if not path.is_file():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise CampaignError(
            f"invalid restore pause marker: {path}"
        ) from exc
    if (
        payload.get("schema") != 1
        or payload.get("kind") != "aoe2war-recovery-restore-pause-request"
        or payload.get("campaign_id") != campaign_id
    ):
        raise CampaignError(f"invalid restore pause marker: {path}")
    return payload


def write_restore_pause_marker(campaign_id: str) -> dict[str, Any]:
    payload = {
        "schema": 1,
        "kind": "aoe2war-recovery-restore-pause-request",
        "campaign_id": campaign_id,
        "requested_at": utc_now(),
    }
    atomic_write(restore_pause_path(campaign_id), payload)
    return payload


def clear_restore_pause_marker(campaign_id: str) -> None:
    path = restore_pause_path(campaign_id)
    if path.exists():
        path.unlink()


def load_restore_state(campaign_id: str) -> dict[str, Any]:
    path = restore_state_path(campaign_id)
    if not path.is_file():
        raise CampaignError(f"restore drill state not found: {campaign_id}")
    payload = json.loads(path.read_text(encoding="utf-8"))
    if (
        payload.get("schema") != 1
        or payload.get("kind") != "aoe2war-recovery-ordinary-restore-drill"
        or payload.get("campaign_id") != campaign_id
    ):
        raise CampaignError(f"invalid restore drill state: {path}")
    return payload


def save_restore_state(state: dict[str, Any]) -> None:
    state["updated_at"] = utc_now()
    atomic_write(
        restore_state_path(str(state["campaign_id"])),
        state,
    )


def _chunk_capture_source(
    bundle_root: Path,
    campaign_id: str,
    class_name: str,
    capture: dict[str, Any],
    *,
    verify_ciphertext: bool,
) -> dict[str, Any]:
    manifest_name = capture.get("chunk_manifest_file")
    if not isinstance(manifest_name, str) or not manifest_name:
        raise CampaignError(
            f"{class_name} chunked capture proof has no manifest file"
        )
    manifest_path = recovery._safe_bundle_file(bundle_root, manifest_name)
    if manifest_path is None or not manifest_path.is_file():
        raise CampaignError(
            f"{class_name} chunked manifest is missing or escapes the bundle"
        )
    expected_root = _chunk_root(bundle_root, class_name).resolve()
    if manifest_path.parent.resolve() != expected_root:
        raise CampaignError(
            f"{class_name} chunked manifest is outside the canonical class root"
        )

    manifest, manifest_sha, error = recovery._load_hashed_json(manifest_path)
    if error or manifest is None or manifest_sha is None:
        raise CampaignError(
            f"{class_name} chunked manifest is invalid: {error or 'unknown error'}"
        )
    expected_manifest_sha = str(capture.get("chunk_manifest_sha256") or "")
    if len(expected_manifest_sha) != 64 or manifest_sha != expected_manifest_sha:
        raise CampaignError(
            f"{class_name} chunked manifest SHA-256 does not match capture proof"
        )
    if (
        manifest.get("schema") != 1
        or manifest.get("kind") != "aoe2war-recovery-cms-chunk-manifest"
        or manifest.get("format") != CMS_CHUNK_FORMAT
        or manifest.get("campaign_id") != campaign_id
        or manifest.get("class") != class_name
    ):
        raise CampaignError(
            f"{class_name} chunked manifest does not match the authorized campaign"
        )

    receipts = _load_existing_chunk_receipts(
        expected_root,
        verify_ciphertext=verify_ciphertext,
    )
    chunk_count = int(capture.get("chunk_count") or 0)
    manifest_chunks = manifest.get("chunks")
    if (
        chunk_count <= 0
        or int(manifest.get("chunk_count") or 0) != chunk_count
        or not isinstance(manifest_chunks, list)
        or len(manifest_chunks) != chunk_count
        or len(receipts) != chunk_count
    ):
        raise CampaignError(f"{class_name} chunked capture count is inconsistent")

    for index, (sealed, receipt) in enumerate(zip(manifest_chunks, receipts)):
        if not isinstance(sealed, dict):
            raise CampaignError(f"{class_name} chunk manifest entry {index} is invalid")
        expected = {
            "index": index,
            "directory": f"chunk-{index:06d}",
            "plaintext_bytes": int(receipt["plaintext_bytes"]),
            "plaintext_sha256": receipt["plaintext_sha256"],
            "ciphertext_bytes": int(receipt["ciphertext_bytes"]),
            "ciphertext_sha256": receipt["ciphertext_sha256"],
        }
        for key, value in expected.items():
            if sealed.get(key) != value:
                raise CampaignError(
                    f"{class_name} chunk manifest entry {index} disagrees on {key}"
                )

    checks = (
        ("ciphertext_bytes", int(capture.get("ciphertext_bytes") or 0)),
        ("plaintext_tar_bytes", int(capture.get("plaintext_tar_bytes") or 0)),
        ("plaintext_tar_sha256", str(capture.get("plaintext_tar_sha256") or "")),
    )
    for key, expected in checks:
        if manifest.get(key) != expected:
            raise CampaignError(
                f"{class_name} chunked manifest {key} does not match capture proof"
            )
    if int(capture.get("ciphertext_bytes") or 0) != sum(
        int(item["ciphertext_bytes"]) for item in receipts
    ):
        raise CampaignError(
            f"{class_name} chunked ciphertext total does not match sealed receipts"
        )

    capture_fingerprint = normalize_fingerprint(
        str(capture.get("recipient_certificate_fingerprint") or "")
    )
    manifest_fingerprint = normalize_fingerprint(
        str(manifest.get("recipient_certificate_fingerprint") or "")
    )
    for index, receipt in enumerate(receipts):
        receipt_fingerprint = normalize_fingerprint(
            str(receipt.get("recipient_certificate_fingerprint") or "")
        )
        if receipt_fingerprint != capture_fingerprint:
            raise CampaignError(
                f"{class_name} chunk {index} certificate fingerprint mismatch"
            )
    if not capture_fingerprint or manifest_fingerprint != capture_fingerprint:
        raise CampaignError(
            f"{class_name} chunked certificate fingerprint is inconsistent"
        )

    return {
        "format": CMS_CHUNK_FORMAT,
        "manifest_path": manifest_path,
        "manifest_sha256": manifest_sha,
        "chunk_root": expected_root,
        "receipts": receipts,
    }


def _capture_proof(
    bundle_root: Path,
    campaign_id: str,
    class_name: str,
    *,
    verify_ciphertext: bool,
) -> tuple[dict[str, Any], str, dict[str, Any]]:
    proof_path = bundle_root / "proofs" / f"{class_name}.json"
    payload, proof_sha, error = recovery._load_hashed_json(proof_path)
    if error or payload is None or proof_sha is None:
        raise CampaignError(
            f"{class_name} capture proof is invalid: {error or 'unknown error'}"
        )
    if (
        payload.get("schema") != 1
        or payload.get("kind") != "aoe2war-recovery-capture-proof"
        or payload.get("campaign_id") != campaign_id
        or payload.get("class") != class_name
        or payload.get("status") != "CAPTURED_PENDING_RESTORE"
    ):
        raise CampaignError(
            f"{class_name} capture proof does not match the authorized campaign"
        )
    if payload.get("cms_streaming") is not True:
        raise CampaignError(
            f"{class_name} capture proof does not prove CMS streaming"
        )

    if payload.get("artifact_format") == CMS_CHUNK_FORMAT:
        source = _chunk_capture_source(
            bundle_root,
            campaign_id,
            class_name,
            payload,
            verify_ciphertext=verify_ciphertext,
        )
        return payload, proof_sha, source

    artifact_name = payload.get("ciphertext_file")
    if not isinstance(artifact_name, str) or not artifact_name:
        raise CampaignError(f"{class_name} capture proof has no ciphertext file")
    artifact = recovery._safe_bundle_file(bundle_root, artifact_name)
    if artifact is None or not artifact.is_file():
        raise CampaignError(
            f"{class_name} encrypted artifact is missing or escapes the bundle"
        )

    expected_bytes = payload.get("ciphertext_bytes")
    if (
        not isinstance(expected_bytes, int)
        or expected_bytes <= 0
        or artifact.stat().st_size != expected_bytes
    ):
        raise CampaignError(
            f"{class_name} encrypted artifact byte size does not match capture proof"
        )

    expected_sha = payload.get("ciphertext_sha256")
    if not isinstance(expected_sha, str) or len(expected_sha) != 64:
        raise CampaignError(
            f"{class_name} capture proof has no valid ciphertext SHA-256"
        )
    if verify_ciphertext and recovery.sha256(artifact) != expected_sha:
        raise CampaignError(
            f"{class_name} encrypted artifact SHA-256 does not match capture proof"
        )

    return payload, proof_sha, {
        "format": "legacy-single-cms",
        "artifact": artifact,
    }


def restore_preflight(campaign_id: str | None) -> dict[str, Any]:
    selected = campaign_id or latest_campaign_id()
    if not selected:
        raise CampaignError("no recovery campaign exists")

    require_tools()
    restore_source = source_identity()
    state = load_state(selected)
    if (
        state.get("status") != "COMPLETE"
        or state.get("completion_reason")
        != "ORDINARY_CAPTURE_COMPLETE_WOLO_AUTHORIZATION_REQUIRED"
        or list(state.get("completed_classes") or []) != list(ORDINARY_CLASSES)
    ):
        raise CampaignError(
            "ordinary restore drill requires a complete five-class capture campaign"
        )

    bundle_root = Path(str(state.get("bundle_root") or "")).expanduser().resolve()
    try:
        bundle_root.relative_to(recovery.RECOVERY_VAULT_ROOT.resolve())
    except ValueError as exc:
        raise CampaignError(
            "capture bundle is outside the independent recovery vault"
        ) from exc

    summary_path = bundle_root / "ordinary-capture-summary.json"
    summary, summary_sha, summary_error = recovery._load_hashed_json(summary_path)
    if summary_error or summary is None or summary_sha is None:
        raise CampaignError(
            "ordinary capture summary is missing or invalid: "
            + str(summary_error or "unknown error")
        )
    if (
        summary.get("campaign_id") != selected
        or summary.get("status") != "ORDINARY_CAPTURE_COMPLETE"
        or list(summary.get("completed_classes") or []) != list(ORDINARY_CLASSES)
    ):
        raise CampaignError("ordinary capture summary does not close all five classes")

    cert = Path(str(state.get("recipient_certificate") or "")).expanduser().resolve()
    if not cert.is_file():
        raise CampaignError("campaign recipient certificate is missing")
    expected_fingerprint = normalize_fingerprint(
        str(state.get("recipient_certificate_fingerprint") or "")
    )
    if certificate_fingerprint(cert) != expected_fingerprint:
        raise CampaignError(
            "campaign recipient certificate fingerprint no longer matches"
        )
    key = verify_canonical_private_key(cert)

    capture_proofs: dict[str, dict[str, Any]] = {}
    ciphertext_bytes = 0
    for class_name in ORDINARY_CLASSES:
        proof, proof_sha, source = _capture_proof(
            bundle_root,
            selected,
            class_name,
            verify_ciphertext=False,
        )
        entry: dict[str, Any] = {
            "proof_file": str(
                (bundle_root / "proofs" / f"{class_name}.json").relative_to(
                    bundle_root
                )
            ),
            "proof_sha256": proof_sha,
            "artifact_format": source["format"],
            "ciphertext_bytes": int(proof["ciphertext_bytes"]),
        }
        if source["format"] == CMS_CHUNK_FORMAT:
            manifest_path = Path(source["manifest_path"])
            entry.update(
                {
                    "chunk_manifest_file": str(manifest_path.relative_to(bundle_root)),
                    "chunk_manifest_sha256": source["manifest_sha256"],
                    "chunk_count": len(source["receipts"]),
                }
            )
        else:
            entry["ciphertext_file"] = Path(source["artifact"]).name
        capture_proofs[class_name] = entry
        ciphertext_bytes += int(proof["ciphertext_bytes"])

    free_bytes = shutil.disk_usage(Path.home()).free
    if free_bytes < REPRESENTATIVE_MAX_BYTES * 2:
        raise CampaignError(
            "insufficient Mac headroom for isolated representative restore workspace"
        )

    return {
        "schema": 1,
        "kind": "aoe2war-recovery-ordinary-restore-preflight",
        "generated_at": utc_now(),
        "status": "READY",
        "campaign_id": selected,
        "capture_tool_source": state.get("tool_source"),
        "restore_tool_source": restore_source,
        "authority": state.get("authority"),
        "bundle_root": str(bundle_root),
        "capture_summary_sha256": summary_sha,
        "recipient_certificate": str(cert),
        "recipient_certificate_fingerprint": expected_fingerprint,
        "canonical_private_key": key,
        "ordinary_classes": list(ORDINARY_CLASSES),
        "capture_proofs": capture_proofs,
        "ciphertext_bytes": ciphertext_bytes,
        "operator_free_bytes": free_bytes,
        "representative_max_bytes": REPRESENTATIVE_MAX_BYTES,
        "production_mutation_authorized": False,
        "wolo_mutation_authorized": False,
        "plaintext_full_archive_staging": False,
    }



class ChunkedCMSReader:
    """Bounded file-like plaintext stream over sealed CMS chunks.

    The reader never stages the full plaintext archive. Each encrypted chunk is
    already size/hash verified by `_load_existing_chunk_receipts` before this
    reader is constructed; this layer additionally verifies each decrypted
    plaintext chunk against its sealed receipt while presenting one continuous
    tar stream to `inspect_plaintext_tar`.
    """

    def __init__(
        self,
        root: Path,
        receipts: list[dict[str, Any]],
        *,
        recipient_cert: Path,
        private_key: Path,
    ):
        self.root = root
        self.receipts = receipts
        self.recipient_cert = recipient_cert
        self.private_key = private_key
        self.index = 0
        self.proc: subprocess.Popen[bytes] | None = None
        self.chunk_digest: Any | None = None
        self.chunk_bytes = 0
        self.closed = False

    def _start_chunk(self) -> bool:
        if self.index >= len(self.receipts):
            return False
        cms_path = _chunk_dir(self.root, self.index) / "payload.cms"
        self.proc = subprocess.Popen(
            cms_decrypt_command(
                self.recipient_cert,
                self.private_key,
                cms_path,
            ),
            cwd=ROOT,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        if self.proc.stdout is None:
            raise CampaignError(
                f"failed to open chunk {self.index} CMS plaintext stream"
            )
        self.chunk_digest = hashlib.sha256()
        self.chunk_bytes = 0
        return True

    def _finish_chunk(self) -> None:
        if self.proc is None or self.chunk_digest is None:
            return
        if self.proc.stdout is not None:
            self.proc.stdout.close()
        stderr = self.proc.stderr.read() if self.proc.stderr is not None else b""
        if self.proc.stderr is not None:
            self.proc.stderr.close()
        rc = self.proc.wait()
        receipt = self.receipts[self.index]
        if rc != 0:
            raise CampaignError(
                f"chunk {self.index} restore failed: "
                + stderr.decode(errors="replace").strip()
            )
        if (
            self.chunk_bytes != int(receipt["plaintext_bytes"])
            or self.chunk_digest.hexdigest() != receipt["plaintext_sha256"]
        ):
            raise CampaignError(
                f"chunk {self.index} restore plaintext does not match sealed proof"
            )
        self.index += 1
        self.proc = None
        self.chunk_digest = None
        self.chunk_bytes = 0

    def read(self, size: int = -1) -> bytes:
        if self.closed or size == 0:
            return b""
        # This reader is internal to tar streaming. Keep an unbounded/default
        # request bounded rather than ever materializing a multi-GiB archive.
        if size is None or size < 0:
            size = 1024 * 1024

        output = bytearray()
        while len(output) < size:
            if self.proc is None and not self._start_chunk():
                break
            assert self.proc is not None
            assert self.proc.stdout is not None
            assert self.chunk_digest is not None
            data = self.proc.stdout.read(size - len(output))
            if data:
                self.chunk_digest.update(data)
                self.chunk_bytes += len(data)
                output.extend(data)
                continue
            self._finish_chunk()
        return bytes(output)

    def close(self) -> None:
        if self.closed:
            return
        self.closed = True
        if self.proc is not None:
            try:
                if self.proc.stdout is not None:
                    self.proc.stdout.close()
            except Exception:
                pass
            try:
                self.proc.kill()
            except Exception:
                pass
            try:
                self.proc.wait()
            except Exception:
                pass
            if self.proc.stderr is not None:
                try:
                    self.proc.stderr.close()
                except Exception:
                    pass
            self.proc = None

class HashingReader:
    def __init__(self, raw: Any):
        self.raw = raw
        self.digest = hashlib.sha256()
        self.bytes_read = 0

    def read(self, size: int = -1) -> bytes:
        data = self.raw.read(size)
        if data:
            self.digest.update(data)
            self.bytes_read += len(data)
        return data


def _member_kind(member: tarfile.TarInfo) -> str:
    if member.isfile():
        return "file"
    if member.isdir():
        return "directory"
    if member.issym():
        return "symlink"
    if member.islnk():
        return "hardlink"
    if member.ischr():
        return "character_device"
    if member.isblk():
        return "block_device"
    if member.isfifo():
        return "fifo"
    return "other"


def inspect_plaintext_tar(
    raw: Any,
    *,
    representative_max_bytes: int = REPRESENTATIVE_MAX_BYTES,
) -> dict[str, Any]:
    reader = HashingReader(raw)
    index_digest = hashlib.sha256()
    counts: dict[str, int] = {}
    member_count = 0
    logical_bytes = 0
    representative: dict[str, Any] | None = None

    with tempfile.TemporaryDirectory(
        prefix="aoe2war-ordinary-restore-"
    ) as temporary:
        workspace = Path(temporary)
        with tarfile.open(fileobj=reader, mode="r|*") as archive:
            for member in archive:
                member_count += 1
                kind = _member_kind(member)
                counts[kind] = counts.get(kind, 0) + 1
                logical_bytes += int(member.size or 0)

                name_sha = hashlib.sha256(
                    member.name.encode("utf-8", errors="surrogateescape")
                ).hexdigest()
                index_digest.update(
                    (
                        f"{name_sha}|{kind}|{int(member.size or 0)}|"
                        f"{int(member.mode or 0)}\n"
                    ).encode("ascii")
                )

                if (
                    representative is None
                    and member.isfile()
                    and 0 <= member.size <= representative_max_bytes
                ):
                    source = archive.extractfile(member)
                    if source is not None:
                        target = workspace / "representative.bin"
                        digest = hashlib.sha256()
                        written = 0
                        with target.open("wb") as output:
                            while True:
                                chunk = source.read(1024 * 1024)
                                if not chunk:
                                    break
                                digest.update(chunk)
                                written += len(chunk)
                                output.write(chunk)
                        if written != member.size:
                            raise CampaignError(
                                "representative restore byte size does not match tar member"
                            )
                        representative = {
                            "status": "PASS",
                            "member_name_sha256": name_sha,
                            "bytes": written,
                            "sha256": digest.hexdigest(),
                            "workspace": "DISPOSABLE_ISOLATED_DIRECTORY",
                        }

        while reader.read(1024 * 1024):
            pass

        if representative is not None:
            representative["workspace_removed_after_drill"] = False

    if representative is None:
        representative = {
            "status": "NOT_APPLICABLE_NO_SAFE_SMALL_REGULAR_FILE",
            "max_bytes": representative_max_bytes,
            "workspace_removed_after_drill": True,
        }
    else:
        representative["workspace_removed_after_drill"] = True

    return {
        "plaintext_tar_bytes": reader.bytes_read,
        "plaintext_tar_sha256": reader.digest.hexdigest(),
        "tar_structure": "PASS",
        "member_count": member_count,
        "member_type_counts": counts,
        "logical_member_bytes": logical_bytes,
        "tar_member_index_sha256": index_digest.hexdigest(),
        "representative_restore": representative,
    }



def inspect_capture_source(
    source: dict[str, Any],
    *,
    class_name: str,
    recipient_cert: Path,
    private_key: Path,
) -> dict[str, Any]:
    if source["format"] == CMS_CHUNK_FORMAT:
        stream = ChunkedCMSReader(
            Path(source["chunk_root"]),
            list(source["receipts"]),
            recipient_cert=recipient_cert,
            private_key=private_key,
        )
        try:
            return inspect_plaintext_tar(stream)
        except Exception as exc:
            raise CampaignError(
                f"{class_name} isolated chunked restore inspection failed: {exc}"
            ) from exc
        finally:
            stream.close()

    artifact = Path(source["artifact"])
    command = cms_stream_restore_decrypt_command(
        artifact,
        recipient_cert,
        private_key,
    )
    decrypt = subprocess.Popen(
        command,
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if decrypt.stdout is None:
        raise CampaignError(f"failed to open {class_name} CMS plaintext stream")

    inspection: dict[str, Any] | None = None
    inspection_error: Exception | None = None
    try:
        inspection = inspect_plaintext_tar(decrypt.stdout)
    except Exception as exc:
        inspection_error = exc
    finally:
        try:
            decrypt.stdout.close()
        except Exception:
            pass

    stderr = b""
    if decrypt.stderr is not None:
        stderr = decrypt.stderr.read()
        decrypt.stderr.close()
    decrypt_rc = decrypt.wait()
    if inspection_error is not None:
        raise CampaignError(
            f"{class_name} isolated restore inspection failed: {inspection_error}"
        )
    if decrypt_rc != 0:
        detail = stderr.decode(errors="replace").strip()
        raise CampaignError(
            f"{class_name} CMS decryption failed with exit={decrypt_rc}: {detail}"
        )
    if inspection is None:
        raise CampaignError(f"{class_name} restore inspection produced no evidence")
    return inspection


def restore_stage(
    *,
    campaign_id: str,
    bundle_root: Path,
    class_name: str,
    recipient_cert: Path,
    private_key: Path,
    capture_tool_source: str,
    restore_tool_source: str,
) -> dict[str, Any]:
    bundle_root = bundle_root.expanduser().resolve()
    capture, capture_proof_sha, source = _capture_proof(
        bundle_root,
        campaign_id,
        class_name,
        verify_ciphertext=True,
    )
    proof_path = bundle_root / "restore-proofs" / f"{class_name}.json"
    if proof_path.exists() or proof_path.with_name(
        proof_path.name + ".sha256"
    ).exists():
        raise CampaignError(
            f"restore proof already exists for {class_name}; refusing overwrite"
        )
    proof_path.parent.mkdir(parents=True, exist_ok=True)

    started_at = utc_now()
    started = time.monotonic()
    inspection = inspect_capture_source(
        source,
        class_name=class_name,
        recipient_cert=recipient_cert,
        private_key=private_key,
    )

    expected_plaintext_bytes = capture.get("plaintext_tar_bytes")
    expected_plaintext_sha = capture.get("plaintext_tar_sha256")
    if (
        inspection["plaintext_tar_bytes"] != expected_plaintext_bytes
        or inspection["plaintext_tar_sha256"] != expected_plaintext_sha
    ):
        raise CampaignError(
            f"{class_name} restored plaintext does not match capture hash/size"
        )

    proof = {
        "schema": 1,
        "kind": "aoe2war-recovery-ordinary-restore-class-proof",
        "status": "PASS",
        "campaign_id": campaign_id,
        "class": class_name,
        "started_at": started_at,
        "completed_at": utc_now(),
        "elapsed_seconds": round(time.monotonic() - started, 3),
        "capture_tool_source": capture_tool_source,
        "restore_tool_source": restore_tool_source,
        "capture_proof_file": f"proofs/{class_name}.json",
        "capture_proof_sha256": capture_proof_sha,
        "artifact_format": source["format"],
        "ciphertext_bytes": capture["ciphertext_bytes"],
        "ciphertext_hash_verified_before_decryption": True,
        "plaintext_tar_bytes": inspection["plaintext_tar_bytes"],
        "plaintext_tar_sha256": inspection["plaintext_tar_sha256"],
        "plaintext_matches_capture": True,
        "tar_structure": inspection["tar_structure"],
        "member_count": inspection["member_count"],
        "member_type_counts": inspection["member_type_counts"],
        "logical_member_bytes": inspection["logical_member_bytes"],
        "tar_member_index_sha256": inspection["tar_member_index_sha256"],
        "representative_restore": inspection["representative_restore"],
        "full_plaintext_archive_staged": False,
        "production_mutated": False,
        "wolo_mutated": False,
        "secrets_policy": {
            "private_recovery_key_transmitted_to_vps": False,
            "validator_private_keys_included": False,
            "wolo_keyrings_included": False,
        },
    }
    if source["format"] == CMS_CHUNK_FORMAT:
        manifest_path = Path(source["manifest_path"])
        proof.update(
            {
                "chunk_manifest_file": str(manifest_path.relative_to(bundle_root)),
                "chunk_manifest_sha256": source["manifest_sha256"],
                "chunk_count": len(source["receipts"]),
            }
        )
    else:
        artifact = Path(source["artifact"])
        proof.update(
            {
                "ciphertext_file": artifact.name,
                "ciphertext_sha256": capture["ciphertext_sha256"],
            }
        )
    proof_sha = write_json_with_sidecar(proof_path, proof)
    return {
        "class": class_name,
        "proof_path": str(proof_path),
        "proof_file": str(proof_path.relative_to(bundle_root)),
        "proof_sha256": proof_sha,
        "representative_restore": inspection["representative_restore"],
        "completed_at": proof["completed_at"],
        "elapsed_seconds": proof["elapsed_seconds"],
    }


def create_restore_state(
    campaign_id: str | None,
    *,
    authorize_ordinary_restore_drill: bool,
) -> dict[str, Any]:
    if not authorize_ordinary_restore_drill:
        raise CampaignError(
            "ordinary restore drill requires --authorize-ordinary-restore-drill"
        )
    check = restore_preflight(campaign_id)
    selected = str(check["campaign_id"])
    path = restore_state_path(selected)
    if path.exists():
        raise CampaignError(
            f"ordinary restore drill already exists for campaign {selected}"
        )

    state = {
        "schema": 1,
        "kind": "aoe2war-recovery-ordinary-restore-drill",
        "campaign_id": selected,
        "status": "CREATED",
        "created_at": utc_now(),
        "updated_at": utc_now(),
        "capture_tool_source": check["capture_tool_source"],
        "restore_tool_source": check["restore_tool_source"],
        "authority": check["authority"],
        "bundle_root": check["bundle_root"],
        "recipient_certificate": check["recipient_certificate"],
        "recipient_certificate_fingerprint": check[
            "recipient_certificate_fingerprint"
        ],
        "ordinary_classes": list(check["ordinary_classes"]),
        "completed_classes": [],
        "current_class": None,
        "current_class_started_at": None,
        "pid": None,
        "pause_requested": False,
        "pause_requested_at": None,
        "history": [],
        "last_error": None,
        "completion_reason": None,
        "authorization": {
            "ordinary_restore_drill": True,
            "production_mutation": False,
            "wolo_mutation": False,
            "full_schema2_verification": False,
        },
        "log_path": str(restore_log_path(selected)),
    }
    save_restore_state(state)
    return state


def spawn_restore(campaign_id: str) -> int:
    state = load_restore_state(campaign_id)
    pid = state.get("pid")
    if process_alive(pid if isinstance(pid, int) else None):
        raise CampaignError(f"restore drill already running with pid={pid}")

    RESTORE_DIR.mkdir(parents=True, exist_ok=True)
    log = restore_log_path(campaign_id).open("a", encoding="utf-8")
    proc = subprocess.Popen(
        [
            sys.executable,
            str(Path(__file__).resolve()),
            "_restore_run",
            campaign_id,
        ],
        cwd=ROOT,
        stdin=subprocess.DEVNULL,
        stdout=log,
        stderr=subprocess.STDOUT,
        start_new_session=True,
        close_fds=True,
    )
    log.close()
    return int(proc.pid)


def validate_restore_source(state: dict[str, Any]) -> None:
    current = source_identity()
    if current != state.get("restore_tool_source"):
        raise CampaignError(
            "app-prodn source changed since restore drill authorization: "
            f"drill={state.get('restore_tool_source')} current={current}"
        )


def run_restore(campaign_id: str) -> int:
    RESTORE_DIR.mkdir(parents=True, exist_ok=True)
    lock_file = RESTORE_LOCK_PATH.open("a+")
    try:
        fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError as exc:
        raise CampaignError(
            "another Recovery OS restore drill is active"
        ) from exc

    state = load_restore_state(campaign_id)
    state["status"] = "RUNNING"
    state["pid"] = os.getpid()
    state["started_at"] = utc_now()
    save_restore_state(state)

    try:
        validate_restore_source(state)
        capture_state = load_state(campaign_id)
        if capture_state.get("status") != "COMPLETE":
            raise CampaignError(
                "capture campaign is no longer complete"
            )

        bundle_root = Path(str(state["bundle_root"])).expanduser().resolve()
        cert = Path(str(state["recipient_certificate"])).expanduser().resolve()
        key_info = verify_canonical_private_key(cert)
        private_key = Path(str(key_info["path"])).expanduser().resolve()

        completed = set(str(item) for item in state.get("completed_classes", []))
        representative_count = 0
        for receipt in state.get("history") or []:
            representative = receipt.get("representative_restore") or {}
            if representative.get("status") == "PASS":
                representative_count += 1

        for class_name in state["ordinary_classes"]:
            if class_name in completed:
                continue

            state = load_restore_state(campaign_id)
            validate_restore_source(state)
            pause = restore_pause_marker(campaign_id)
            if pause is not None:
                state["pause_requested"] = True
                state["pause_requested_at"] = pause.get("requested_at")
                state["status"] = "PAUSED"
                state["completion_reason"] = "OPERATOR_PAUSE_BETWEEN_RESTORE_CLASSES"
                state["current_class"] = None
                state["current_class_started_at"] = None
                state["pid"] = None
                state["finished_at"] = utc_now()
                save_restore_state(state)
                return 0

            state["status"] = "RUNNING_RESTORE"
            state["current_class"] = class_name
            state["current_class_started_at"] = utc_now()
            save_restore_state(state)

            print()
            print("=" * 68, flush=True)
            print(
                f"RECOVERY RESTORE DRILL {campaign_id} · {class_name}",
                flush=True,
            )
            print("=" * 68, flush=True)

            receipt = restore_stage(
                campaign_id=campaign_id,
                bundle_root=bundle_root,
                class_name=str(class_name),
                recipient_cert=cert,
                private_key=private_key,
                capture_tool_source=str(state["capture_tool_source"]),
                restore_tool_source=str(state["restore_tool_source"]),
            )

            state = load_restore_state(campaign_id)
            history = list(state.get("history") or [])
            history.append(receipt)
            completed.add(str(class_name))
            if (
                (receipt.get("representative_restore") or {}).get("status")
                == "PASS"
            ):
                representative_count += 1
            state["history"] = history
            state["completed_classes"] = [
                item
                for item in state["ordinary_classes"]
                if item in completed
            ]
            state["current_class"] = None
            state["current_class_started_at"] = None
            state["status"] = "RUNNING"
            save_restore_state(state)

        if representative_count < 1:
            raise CampaignError(
                "ordinary restore drill found no safe representative regular file"
            )

        coverage = {
            str(item["class"]): {
                "status": "PASS",
                "proof_file": item["proof_file"],
                "proof_sha256": item["proof_sha256"],
            }
            for item in state.get("history") or []
        }
        summary_path = bundle_root / "ordinary-restore-summary.json"
        summary = {
            "schema": 1,
            "kind": "aoe2war-recovery-ordinary-restore-summary",
            "campaign_id": campaign_id,
            "status": "ORDINARY_RESTORE_VERIFIED",
            "created_at": utc_now(),
            "capture_tool_source": state["capture_tool_source"],
            "restore_tool_source": state["restore_tool_source"],
            "authority": state["authority"],
            "coverage": coverage,
            "representative_restores": representative_count,
            "full_plaintext_archive_staged": False,
            "production_mutated": False,
            "wolo_mutated": False,
            "remaining_before_full_recovery_verification": [
                "wolo_settlement_state",
                "wolo_consensus_recovery",
                "wolo_key_custody",
                "full_schema2_restore_proof",
            ],
            "secrets_policy": {
                "database_credentials_included": False,
                "environment_files_included": False,
                "private_recovery_key_transmitted_to_vps": False,
                "validator_private_keys_included": False,
                "wolo_keyrings_included": False,
            },
        }
        summary_sha = write_json_with_sidecar(summary_path, summary)
        state = load_restore_state(campaign_id)
        state["summary_path"] = str(summary_path)
        state["summary_sha256"] = summary_sha
        state["status"] = "COMPLETE"
        state["completion_reason"] = (
            "ORDINARY_RESTORE_VERIFIED_WOLO_AUTHORIZATION_REQUIRED"
        )
        state["current_class"] = None
        state["current_class_started_at"] = None
        state["pid"] = None
        state["finished_at"] = utc_now()
        save_restore_state(state)
        return 0
    except Exception as exc:
        state = load_restore_state(campaign_id)
        state["status"] = "FAILED"
        state["last_error"] = str(exc)
        state["pid"] = None
        state["failed_at"] = utc_now()
        save_restore_state(state)
        print(f"STOP: {exc}", file=sys.stderr, flush=True)
        return 2
    finally:
        try:
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)
        finally:
            lock_file.close()


def start_restore(
    campaign_id: str | None,
    *,
    authorize_ordinary_restore_drill: bool,
) -> dict[str, Any]:
    state = create_restore_state(
        campaign_id,
        authorize_ordinary_restore_drill=authorize_ordinary_restore_drill,
    )
    pid = spawn_restore(str(state["campaign_id"]))
    return {**state, "spawned_pid": pid}


def restore_status_payload(campaign_id: str | None) -> dict[str, Any]:
    selected = campaign_id
    if not selected:
        candidates = sorted(
            RESTORE_DIR.glob("*.json"),
            key=lambda item: item.stat().st_mtime,
            reverse=True,
        ) if RESTORE_DIR.is_dir() else []
        selected = candidates[0].stem if candidates else None
    if not selected:
        return {
            "schema": 1,
            "kind": "aoe2war-recovery-ordinary-restore-status",
            "status": "NONE",
        }
    state = load_restore_state(selected)
    pause = restore_pause_marker(selected)
    state["pause_requested"] = pause is not None
    state["pause_requested_at"] = (
        pause.get("requested_at") if pause is not None else None
    )
    pid = state.get("pid")
    state["process_alive"] = process_alive(pid if isinstance(pid, int) else None)
    return state


def request_restore_pause(campaign_id: str) -> dict[str, Any]:
    state = load_restore_state(campaign_id)
    if state.get("status") in {"COMPLETE", "FAILED", "PAUSED"}:
        return state
    pause = write_restore_pause_marker(campaign_id)
    state["pause_requested"] = True
    state["pause_requested_at"] = pause["requested_at"]
    save_restore_state(state)
    return state


def resume_restore(campaign_id: str) -> dict[str, Any]:
    state = load_restore_state(campaign_id)
    if state.get("status") == "COMPLETE":
        raise CampaignError("completed restore drill cannot be resumed")
    pid = state.get("pid")
    if process_alive(pid if isinstance(pid, int) else None):
        raise CampaignError(f"restore drill is still active with pid={pid}")

    current = state.get("current_class")
    if isinstance(current, str) and current:
        proof_path = (
            Path(str(state["bundle_root"])).expanduser().resolve()
            / "restore-proofs"
            / f"{current}.json"
        )
        if proof_path.exists():
            raise CampaignError(
                "interrupted restore class already has an immutable proof; "
                "inspect state before resume"
            )

    validate_restore_source(state)
    clear_restore_pause_marker(campaign_id)
    state["pause_requested"] = False
    state["pause_requested_at"] = None
    state["status"] = "RESUME_REQUESTED"
    state["current_class"] = None
    state["current_class_started_at"] = None
    state["pid"] = None
    save_restore_state(state)
    new_pid = spawn_restore(campaign_id)
    return {**load_restore_state(campaign_id), "spawned_pid": new_pid}


def print_restore_preflight(payload: dict[str, Any]) -> None:
    print("⚔️  AOE2WAR ORDINARY RESTORE DRILL PREFLIGHT")
    print()
    print(f"Status:         {payload['status']}")
    print(f"Campaign:       {payload['campaign_id']}")
    print(f"Capture source: {str(payload['capture_tool_source'])[:12]}")
    print(f"Restore source: {str(payload['restore_tool_source'])[:12]}")
    print(
        "Encrypted data: "
        f"{payload['ciphertext_bytes'] / (1024 ** 3):.2f} GiB"
    )
    print(
        "Mac free:       "
        f"{payload['operator_free_bytes'] / (1024 ** 3):.2f} GiB"
    )
    print(
        "Restore mode:   STREAM VERIFY + DISPOSABLE REPRESENTATIVE"
    )
    print("Full staging:   NO")
    print("Production:     READ-ONLY")
    print("Wolo mutation:  NOT AUTHORIZED")


def print_restore_status(payload: dict[str, Any]) -> None:
    print("⚔️  AOE2WAR ORDINARY RESTORE DRILL")
    print()
    if payload.get("status") == "NONE":
        print("Status: NONE")
        return
    print(f"Campaign:    {payload['campaign_id']}")
    print(f"Status:      {payload['status']}")
    print(
        f"Progress:    {len(payload.get('completed_classes') or [])}/"
        f"{len(payload.get('ordinary_classes') or [])}"
    )
    print(f"PID:         {payload.get('pid') or '—'}")
    print(f"Alive:       {payload.get('process_alive', False)}")
    print(f"Current:     {payload.get('current_class') or '—'}")
    print(f"Reason:      {payload.get('completion_reason') or '—'}")
    print(f"Last error:  {payload.get('last_error') or '—'}")
    print(f"Bundle:      {payload.get('bundle_root') or '—'}")
    print(f"Log:         {payload.get('log_path') or '—'}")


def create_state(
    *,
    recipient_cert: str | None,
    authorize_ordinary_capture: bool,
) -> dict[str, Any]:
    if not authorize_ordinary_capture:
        raise CampaignError(
            "ordinary recovery capture requires --authorize-ordinary-capture"
        )
    check = preflight(recipient_cert)
    source = str(check["tool_source"])
    campaign_id = f"{stamp()}-ordinary-{source[:12]}"
    bundle_root = recovery.RECOVERY_VAULT_ROOT / campaign_id
    state = {
        "schema": 1,
        "kind": "aoe2war-recovery-campaign",
        "campaign_id": campaign_id,
        "status": "CREATED",
        "created_at": utc_now(),
        "updated_at": utc_now(),
        "tool_source": source,
        "authority": check["authority"],
        "recipient_certificate": check["recipient_certificate"],
        "recipient_certificate_fingerprint": check[
            "recipient_certificate_fingerprint"
        ],
        "authorization": {
            "ordinary_capture": True,
            "settlement_mutation": False,
            "wolo_quiesce": False,
            "key_custody": False,
        },
        "bundle_root": str(bundle_root),
        "ordinary_classes": list(check["ordinary_classes"]),
        "ordinary_stage_estimates": dict(
            check.get("ordinary_stage_estimates") or {}
        ),
        "completed_classes": [],
        "current_class": None,
        "current_class_started_at": None,
        "pid": None,
        "pause_requested": False,
        "history": [],
        "last_error": None,
        "completion_reason": None,
        "log_path": str(log_path(campaign_id)),
    }
    save_state(state)
    return state


def spawn(campaign_id: str) -> int:
    state = load_state(campaign_id)
    pid = state.get("pid")
    if process_alive(pid if isinstance(pid, int) else None):
        raise CampaignError(f"campaign already running with pid={pid}")

    CAMPAIGN_DIR.mkdir(parents=True, exist_ok=True)
    log = log_path(campaign_id).open("a", encoding="utf-8")
    proc = subprocess.Popen(
        [
            sys.executable,
            str(Path(__file__).resolve()),
            "_run",
            campaign_id,
        ],
        cwd=ROOT,
        stdin=subprocess.DEVNULL,
        stdout=log,
        stderr=subprocess.STDOUT,
        start_new_session=True,
        close_fds=True,
    )
    log.close()
    return int(proc.pid)


def validate_campaign_source(state: dict[str, Any]) -> None:
    current = source_identity()
    if current != state.get("tool_source"):
        raise CampaignError(
            "app-prodn source changed since recovery campaign authorization: "
            f"campaign={state.get('tool_source')} current={current}"
        )


def mark_terminal(
    state: dict[str, Any],
    *,
    status: str,
    reason: str,
    error: str | None = None,
) -> None:
    state["status"] = status
    state["completion_reason"] = reason
    state["last_error"] = error
    state["current_class"] = None
    state["current_class_started_at"] = None
    state["pid"] = None
    state["finished_at"] = utc_now()
    save_state(state)


def run_campaign(campaign_id: str) -> int:
    CAMPAIGN_DIR.mkdir(parents=True, exist_ok=True)
    lock_file = LOCK_PATH.open("a+")
    try:
        fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError as exc:
        raise CampaignError(
            "another Recovery OS capture campaign is active"
        ) from exc

    state = load_state(campaign_id)
    state["status"] = "RUNNING"
    state["pid"] = os.getpid()
    state["started_at"] = utc_now()
    save_state(state)

    try:
        validate_campaign_source(state)
        plan = recovery.campaign_plan()
        stages = {
            str(stage["class"]): stage
            for stage in ordinary_stages(plan)
        }
        bundle_root = Path(str(state["bundle_root"])).expanduser().resolve()
        cert = Path(str(state["recipient_certificate"])).expanduser().resolve()

        completed = set(str(item) for item in state.get("completed_classes", []))
        for class_name in state["ordinary_classes"]:
            if class_name in completed:
                continue

            state = load_state(campaign_id)
            validate_campaign_source(state)
            pause = pause_marker(campaign_id)
            if pause is not None:
                state["pause_requested"] = True
                state["pause_requested_at"] = pause.get("requested_at")
                mark_terminal(
                    state,
                    status="PAUSED",
                    reason="OPERATOR_PAUSE_BETWEEN_CLASSES",
                )
                return 0

            stage = stages.get(str(class_name))
            if not stage:
                raise CampaignError(
                    f"current plan no longer exposes class {class_name}"
                )

            state["status"] = "RUNNING_CAPTURE"
            state["current_class"] = class_name
            state["current_class_started_at"] = utc_now()
            save_state(state)

            print()
            print("=" * 68, flush=True)
            print(
                f"RECOVERY CAMPAIGN {campaign_id} · {class_name}",
                flush=True,
            )
            print("=" * 68, flush=True)

            receipt = capture_stage(
                campaign_id=campaign_id,
                bundle_root=bundle_root,
                plan=plan,
                stage=stage,
                recipient_cert=cert,
                recipient_fingerprint=str(
                    state["recipient_certificate_fingerprint"]
                ),
            )

            state = load_state(campaign_id)
            pause = pause_marker(campaign_id)
            if pause is not None:
                state["pause_requested"] = True
                state["pause_requested_at"] = pause.get("requested_at")
            history = list(state.get("history") or [])
            history.append(receipt)
            completed.add(str(class_name))
            state["history"] = history
            state["completed_classes"] = [
                item
                for item in state["ordinary_classes"]
                if item in completed
            ]
            state["current_class"] = None
            state["current_class_started_at"] = None
            state["status"] = "RUNNING"
            save_state(state)

        summary_path = bundle_root / "ordinary-capture-summary.json"
        summary = {
            "schema": 1,
            "kind": "aoe2war-recovery-ordinary-capture-summary",
            "campaign_id": campaign_id,
            "status": "ORDINARY_CAPTURE_COMPLETE",
            "created_at": utc_now(),
            "tool_source": state["tool_source"],
            "authority": state["authority"],
            "recipient_certificate_fingerprint": state[
                "recipient_certificate_fingerprint"
            ],
            "completed_classes": state["completed_classes"],
            "history": state["history"],
            "remaining_authorization_gates": [
                "wolo_settlement_state",
                "wolo_consensus_recovery",
                "wolo_key_custody",
                "restore_drill",
            ],
            "wolo_mutated": False,
        }
        state["summary_sha256"] = write_json_with_sidecar(summary_path, summary)
        state["summary_path"] = str(summary_path)
        mark_terminal(
            state,
            status="COMPLETE",
            reason="ORDINARY_CAPTURE_COMPLETE_WOLO_AUTHORIZATION_REQUIRED",
        )
        return 0
    except Exception as exc:
        state = load_state(campaign_id)
        state["status"] = "FAILED"
        state["last_error"] = str(exc)
        state["pid"] = None
        state["failed_at"] = utc_now()
        save_state(state)
        print(f"STOP: {exc}", file=sys.stderr, flush=True)
        return 2
    finally:
        try:
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)
        finally:
            lock_file.close()


def start(
    *,
    recipient_cert: str | None,
    authorize_ordinary_capture: bool,
) -> dict[str, Any]:
    state = create_state(
        recipient_cert=recipient_cert,
        authorize_ordinary_capture=authorize_ordinary_capture,
    )
    pid = spawn(str(state["campaign_id"]))
    return {**state, "spawned_pid": pid}


def request_pause(campaign_id: str) -> dict[str, Any]:
    state = load_state(campaign_id)
    if state.get("status") in {"COMPLETE", "FAILED", "PAUSED"}:
        return state
    pause = write_pause_marker(campaign_id)
    state["pause_requested"] = True
    state["pause_requested_at"] = pause["requested_at"]
    save_state(state)
    return state


def resume(campaign_id: str) -> dict[str, Any]:
    state = load_state(campaign_id)
    if state.get("status") == "COMPLETE":
        raise CampaignError("completed recovery campaign cannot be resumed")
    if state.get("current_class") and not chunk_capture_has_checkpoint(state):
        raise CampaignError(
            "campaign stopped inside a non-resumable or legacy capture class; "
            "create a fresh campaign rather than guessing around partial evidence"
        )
    pid = state.get("pid")
    if process_alive(pid if isinstance(pid, int) else None):
        raise CampaignError(f"campaign is still active with pid={pid}")
    validate_campaign_source(state)
    clear_pause_marker(campaign_id)
    state["pause_requested"] = False
    state["pause_requested_at"] = None
    state["status"] = "RESUME_REQUESTED"
    state["pid"] = None
    save_state(state)
    new_pid = spawn(campaign_id)
    return {**load_state(campaign_id), "spawned_pid": new_pid}


def _parse_iso_epoch(value: object) -> float | None:
    if not isinstance(value, str) or not value.strip():
        return None
    text = value.strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.timestamp()


def _live_capture_progress(state: dict[str, Any]) -> dict[str, Any] | None:
    class_name = str(state.get("current_class") or "")
    bundle = str(state.get("bundle_root") or "")
    if class_name not in ORDINARY_CLASSES or not bundle:
        return None

    root = _chunk_root(Path(bundle).expanduser().resolve(), class_name)
    if not root.is_dir():
        return None

    try:
        receipts = _load_existing_chunk_receipts(root)
    except Exception:
        receipts = []

    sealed_bytes = sum(
        int(item.get("plaintext_bytes") or 0)
        for item in receipts
    )
    partial_bytes = 0
    for item in root.iterdir():
        if (
            item.is_dir()
            and item.name.startswith(".chunk-")
            and item.name.endswith(".partial")
        ):
            payload = item / "payload.cms"
            try:
                partial_bytes = max(
                    partial_bytes,
                    min(payload.stat().st_size, CMS_CHUNK_PLAINTEXT_BYTES),
                )
            except OSError:
                continue

    observed_bytes = sealed_bytes + partial_bytes
    estimates = state.get("ordinary_stage_estimates") or {}
    expected_bytes = int(estimates.get(class_name) or 0)

    completed = len(state.get("completed_classes") or [])
    total = len(state.get("ordinary_classes") or [])
    class_fraction = (
        max(0.0, min(1.0, observed_bytes / expected_bytes))
        if expected_bytes > 0
        else None
    )
    overall_percent = (
        round(((completed + class_fraction) / total) * 100, 1)
        if total > 0 and class_fraction is not None
        else round((completed / total) * 100, 1)
        if total > 0
        else None
    )

    candidates = [
        _parse_iso_epoch(state.get("current_class_started_at")),
        *[
            _parse_iso_epoch(item.get("created_at"))
            for item in receipts
        ],
    ]
    starts = [item for item in candidates if item is not None]
    started_epoch = min(starts) if starts else None
    elapsed_seconds = (
        max(0.0, datetime.now(timezone.utc).timestamp() - started_epoch)
        if started_epoch is not None
        else None
    )
    throughput = (
        observed_bytes / elapsed_seconds
        if elapsed_seconds is not None
        and elapsed_seconds > 30
        and observed_bytes > 0
        else None
    )
    eta_seconds = (
        max(0.0, (expected_bytes - observed_bytes) / throughput)
        if throughput
        and throughput > 0
        and expected_bytes > observed_bytes
        else 0.0
        if expected_bytes > 0 and observed_bytes >= expected_bytes
        else None
    )

    return {
        "current_class": class_name,
        "sealed_chunks": len(receipts),
        "sealed_bytes": sealed_bytes,
        "partial_bytes": partial_bytes,
        "observed_bytes": observed_bytes,
        "expected_bytes": expected_bytes if expected_bytes > 0 else None,
        "class_percent": (
            round(class_fraction * 100, 1)
            if class_fraction is not None
            else None
        ),
        "overall_percent": overall_percent,
        "elapsed_seconds": (
            round(elapsed_seconds)
            if elapsed_seconds is not None
            else None
        ),
        "eta_seconds": (
            round(eta_seconds)
            if eta_seconds is not None
            else None
        ),
        "throughput_bytes_per_second": throughput,
        "progress_basis": "sealed + active encrypted chunk bytes",
    }


def status_payload(campaign_id: str | None) -> dict[str, Any]:
    selected = campaign_id or latest_campaign_id()
    if not selected:
        return {
            "schema": 1,
            "kind": "aoe2war-recovery-campaign-status",
            "status": "NONE",
        }
    state = load_state(selected)
    pause = pause_marker(selected)
    state["pause_requested"] = pause is not None
    state["pause_requested_at"] = (
        pause.get("requested_at") if pause is not None else None
    )
    pid = state.get("pid")
    state["process_alive"] = process_alive(pid if isinstance(pid, int) else None)
    state["live_capture"] = _live_capture_progress(state)
    return state


def print_preflight(payload: dict[str, Any]) -> None:
    print("⚔️  AOE2WAR RECOVERY CAMPAIGN PREFLIGHT")
    print()
    print(f"Status:        {payload['status']}")
    print(f"Tool source:   {payload['tool_source'][:12]}")
    print(f"Authority:     {payload['authority']}")
    print(f"Certificate:   {payload['recipient_certificate']}")
    key = payload.get("canonical_private_key") or {}
    print(
        "Private key:   "
        + (
            f"READY · mode={key.get('mode')} · certificate_match=PASS"
            if key.get("certificate_match")
            else "NOT VERIFIED"
        )
    )
    print(
        "Ordinary data: "
        f"{payload['ordinary_payload_bytes'] / (1024 ** 3):.2f} GiB"
    )
    print(
        "Headroom:      "
        f"{payload['headroom_after_ordinary_bytes'] / (1024 ** 3):.2f} GiB"
    )
    print("Wolo mutation: NOT AUTHORIZED")
    print("Key custody:   OUTSIDE GENERAL VAULT")


def print_status(payload: dict[str, Any]) -> None:
    print("⚔️  AOE2WAR RECOVERY CAPTURE CAMPAIGN")
    print()
    if payload.get("status") == "NONE":
        print("Status: NONE")
        return
    print(f"Campaign:    {payload['campaign_id']}")
    print(f"Status:      {payload['status']}")
    print(
        f"Progress:    {len(payload.get('completed_classes') or [])}/"
        f"{len(payload.get('ordinary_classes') or [])}"
    )
    print(f"PID:         {payload.get('pid') or '—'}")
    print(f"Alive:       {payload.get('process_alive', False)}")
    print(f"Current:     {payload.get('current_class') or '—'}")
    print(f"Reason:      {payload.get('completion_reason') or '—'}")
    print(f"Last error:  {payload.get('last_error') or '—'}")
    print(f"Bundle:      {payload.get('bundle_root') or '—'}")
    print(f"Log:         {payload.get('log_path') or '—'}")


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="AoE2WAR bounded ordinary recovery capture campaign"
    )
    sub = p.add_subparsers(dest="command", required=True)

    q = sub.add_parser("preflight")
    q.add_argument("--recipient-cert")
    q.add_argument("--json", action="store_true")

    q = sub.add_parser("start")
    q.add_argument("--recipient-cert")
    q.add_argument("--authorize-ordinary-capture", action="store_true")
    q.add_argument("--json", action="store_true")

    q = sub.add_parser("status")
    q.add_argument("campaign_id", nargs="?")
    q.add_argument("--json", action="store_true")

    q = sub.add_parser("pause")
    q.add_argument("campaign_id", nargs="?")
    q.add_argument("--json", action="store_true")

    q = sub.add_parser("resume")
    q.add_argument("campaign_id", nargs="?")
    q.add_argument("--json", action="store_true")

    q = sub.add_parser("restore-preflight")
    q.add_argument("campaign_id", nargs="?")
    q.add_argument("--json", action="store_true")


    q = sub.add_parser("wolo-preflight")
    q.add_argument("--json", action="store_true")

    q = sub.add_parser("wolo-snapshot-plan")
    q.add_argument("--json", action="store_true")

    q = sub.add_parser("wolo-snapshot-start")
    q.add_argument("campaign_id")
    q.add_argument(
        "--authorize-wolo-quiesced-snapshot",
        action="store_true",
    )
    q.add_argument("--json", action="store_true")

    q = sub.add_parser("wolo-snapshot-status")
    q.add_argument("campaign_id")
    q.add_argument("--json", action="store_true")

    q = sub.add_parser("restore-start")
    q.add_argument("campaign_id", nargs="?")
    q.add_argument("--authorize-ordinary-restore-drill", action="store_true")
    q.add_argument("--json", action="store_true")

    q = sub.add_parser("restore-status")
    q.add_argument("campaign_id", nargs="?")
    q.add_argument("--json", action="store_true")

    q = sub.add_parser("restore-pause")
    q.add_argument("campaign_id", nargs="?")
    q.add_argument("--json", action="store_true")

    q = sub.add_parser("restore-resume")
    q.add_argument("campaign_id", nargs="?")
    q.add_argument("--json", action="store_true")

    q = sub.add_parser("_run")
    q.add_argument("campaign_id")

    q = sub.add_parser("_restore_run")
    q.add_argument("campaign_id")

    return p


def main() -> int:
    args = parser().parse_args()

    if args.command == "_run":
        return run_campaign(args.campaign_id)
    if args.command == "_restore_run":
        return run_restore(args.campaign_id)

    if args.command == "preflight":
        payload = preflight(args.recipient_cert)
        if args.json:
            print(json.dumps(payload, indent=2, sort_keys=True))
        else:
            print_preflight(payload)
        return 0

    if args.command == "restore-preflight":
        payload = restore_preflight(args.campaign_id)
        if args.json:
            print(json.dumps(payload, indent=2, sort_keys=True))
        else:
            print_restore_preflight(payload)
        return 0


    if args.command == "wolo-preflight":
        payload = wolo_preflight()
        if args.json:
            print(json.dumps(payload, indent=2, sort_keys=True))
        else:
            print_wolo_preflight(payload)
        return 0

    if args.command == "wolo-snapshot-plan":
        payload = wolo_snapshot_plan()
        if args.json:
            print(json.dumps(payload, indent=2, sort_keys=True))
        else:
            print_wolo_snapshot_plan(payload)
        return 0 if payload.get("status") == "READY" else 1

    if args.command == "wolo-snapshot-start":
        payload = start_wolo_snapshot(
            args.campaign_id,
            authorize_wolo_quiesced_snapshot=(
                args.authorize_wolo_quiesced_snapshot
            ),
        )
        print(json.dumps(payload, indent=2, sort_keys=True))
        return 0

    if args.command == "wolo-snapshot-status":
        payload = wolo_snapshot_status(args.campaign_id)
        print(json.dumps(payload, indent=2, sort_keys=True))
        return 0

    if args.command == "restore-start":
        payload = start_restore(
            args.campaign_id,
            authorize_ordinary_restore_drill=(
                args.authorize_ordinary_restore_drill
            ),
        )
        if args.json:
            print(json.dumps(payload, indent=2, sort_keys=True))
        else:
            print_restore_status(
                restore_status_payload(str(payload["campaign_id"]))
            )
            if payload.get("spawned_pid"):
                print(f"Spawned PID: {payload['spawned_pid']}")
        return 0

    if args.command == "restore-status":
        payload = restore_status_payload(args.campaign_id)
        if args.json:
            print(json.dumps(payload, indent=2, sort_keys=True))
        else:
            print_restore_status(payload)
        return 0

    if args.command == "restore-pause":
        campaign_id = args.campaign_id
        if not campaign_id:
            latest = restore_status_payload(None)
            campaign_id = latest.get("campaign_id")
        if not campaign_id:
            raise CampaignError("no restore drill exists")
        payload = request_restore_pause(str(campaign_id))
        if args.json:
            print(json.dumps(payload, indent=2, sort_keys=True))
        else:
            print_restore_status(restore_status_payload(str(campaign_id)))
        return 0

    if args.command == "restore-resume":
        campaign_id = args.campaign_id
        if not campaign_id:
            latest = restore_status_payload(None)
            campaign_id = latest.get("campaign_id")
        if not campaign_id:
            raise CampaignError("no restore drill exists")
        payload = resume_restore(str(campaign_id))
        if args.json:
            print(json.dumps(payload, indent=2, sort_keys=True))
        else:
            print_restore_status(restore_status_payload(str(campaign_id)))
            if payload.get("spawned_pid"):
                print(f"Spawned PID: {payload['spawned_pid']}")
        return 0

    if args.command == "start":
        payload = start(
            recipient_cert=args.recipient_cert,
            authorize_ordinary_capture=args.authorize_ordinary_capture,
        )
    elif args.command == "status":
        payload = status_payload(args.campaign_id)
    elif args.command == "pause":
        campaign_id = args.campaign_id or latest_campaign_id()
        if not campaign_id:
            raise CampaignError("no recovery campaign exists")
        payload = request_pause(campaign_id)
    elif args.command == "resume":
        campaign_id = args.campaign_id or latest_campaign_id()
        if not campaign_id:
            raise CampaignError("no recovery campaign exists")
        payload = resume(campaign_id)
    else:
        raise CampaignError(f"unknown command: {args.command}")

    if getattr(args, "json", False):
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        print_status(
            status_payload(str(payload.get("campaign_id")))
            if payload.get("campaign_id")
            else payload
        )
        if payload.get("spawned_pid"):
            print(f"Spawned PID: {payload['spawned_pid']}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (CampaignError, subprocess.TimeoutExpired) as exc:
        print(f"STOP: {exc}", file=sys.stderr)
        raise SystemExit(2)
