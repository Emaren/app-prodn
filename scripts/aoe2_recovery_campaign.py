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
    if not plan.get("capacity_ready"):
        raise CampaignError("Recovery OS campaign capacity is not ready")
    status = recovery.evaluate()
    pilot = status.get("pilot")
    if not isinstance(pilot, dict):
        raise CampaignError("verified database/operator pilot is required")
    cert, fingerprint = resolve_recipient_certificate(recipient_cert, pilot)
    private_key = verify_canonical_private_key(cert)
    stages = ordinary_stages(plan)
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
        "ordinary_payload_bytes": sum(
            int(stage.get("estimated_bytes") or 0) for stage in stages
        ),
        "operator_free_bytes": int(plan["operator_free_bytes"]),
        "headroom_after_ordinary_bytes": int(plan["operator_free_bytes"])
        - sum(int(stage.get("estimated_bytes") or 0) for stage in stages),
        "wolo_mutation_authorized": False,
        "settlement_mutation_authorized": False,
        "key_material_in_general_vault": False,
    }


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
    artifact = bundle_root / f"{class_name}.cms"
    partial = bundle_root / f"{class_name}.cms.partial"
    stderr_log = bundle_root / f"{class_name}.source.stderr.log"
    proof_path = bundle_root / "proofs" / f"{class_name}.json"

    if artifact.exists() or partial.exists() or proof_path.exists():
        raise CampaignError(
            f"campaign artifact already exists for {class_name}; "
            "refusing ambiguous overwrite"
        )

    bundle_root.mkdir(parents=True, exist_ok=True)
    proof_path.parent.mkdir(parents=True, exist_ok=True)

    started = utc_now()
    plaintext = hashlib.sha256()
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
    openssl_cmd = cms_encrypt_command(
        recipient_cert,
        partial,
    )

    with stderr_log.open("wb") as source_stderr:
        source = subprocess.Popen(
            ssh_cmd,
            cwd=ROOT,
            stdout=subprocess.PIPE,
            stderr=source_stderr,
        )
        encrypt = subprocess.Popen(
            openssl_cmd,
            cwd=ROOT,
            stdin=subprocess.PIPE,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
        )
        if source.stdout is None or encrypt.stdin is None:
            raise CampaignError("failed to create recovery capture stream")

        stream_error: Exception | None = None
        try:
            while True:
                chunk = source.stdout.read(1024 * 1024)
                if not chunk:
                    break
                plaintext.update(chunk)
                plaintext_bytes += len(chunk)
                encrypt.stdin.write(chunk)
        except Exception as exc:
            stream_error = exc
        finally:
            try:
                source.stdout.close()
            except Exception:
                pass
            try:
                encrypt.stdin.close()
            except Exception:
                pass

        source_rc = source.wait()
        encrypt_stderr = b""
        if encrypt.stderr is not None:
            encrypt_stderr = encrypt.stderr.read()
        encrypt_rc = encrypt.wait()

    if stream_error is not None:
        raise CampaignError(f"{class_name} stream failed: {stream_error}")
    if source_rc != 0:
        raise CampaignError(
            f"{class_name} remote tar failed with exit={source_rc}; "
            f"see {stderr_log}"
        )
    if encrypt_rc != 0:
        detail = encrypt_stderr.decode(errors="replace").strip()
        raise CampaignError(
            f"{class_name} CMS encryption failed with exit={encrypt_rc}: {detail}"
        )
    if not partial.is_file() or partial.stat().st_size <= 0:
        raise CampaignError(f"{class_name} produced no encrypted artifact")

    cms_check = subprocess.run(
        [
            "openssl",
            "cms",
            "-cmsout",
            "-inform",
            "DER",
            "-in",
            str(partial),
            "-out",
            os.devnull,
        ],
        cwd=ROOT,
        text=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        check=False,
    )
    if cms_check.returncode != 0:
        raise CampaignError(
            f"{class_name} encrypted artifact failed CMS structural parse: "
            f"{cms_check.stderr.strip()}"
        )

    os.replace(partial, artifact)
    ciphertext_sha = recovery.sha256(artifact)
    ciphertext_bytes = artifact.stat().st_size

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
        "plaintext_tar_bytes": plaintext_bytes,
        "plaintext_tar_sha256": plaintext.hexdigest(),
        "ciphertext_file": artifact.name,
        "ciphertext_bytes": ciphertext_bytes,
        "ciphertext_sha256": ciphertext_sha,
        "cms_structure_test": "PASS",
        "cms_streaming": True,
        "cms_encoding": "BER_INDEFINITE_LENGTH",
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
        "restore_test": "PENDING",
        "secrets_policy": {
            "private_recovery_key_transmitted_to_vps": False,
            "validator_private_keys_included": False,
            "wolo_keyrings_included": False,
        },
    }
    proof_sha = write_json_with_sidecar(proof_path, proof)
    return {
        "class": class_name,
        "artifact": str(artifact),
        "ciphertext_bytes": ciphertext_bytes,
        "ciphertext_sha256": ciphertext_sha,
        "plaintext_tar_bytes": plaintext_bytes,
        "plaintext_tar_sha256": plaintext.hexdigest(),
        "proof_path": str(proof_path),
        "proof_sha256": proof_sha,
        "completed_at": utc_now(),
    }



def cms_decrypt_command(
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


def _capture_proof(
    bundle_root: Path,
    campaign_id: str,
    class_name: str,
    *,
    verify_ciphertext: bool,
) -> tuple[dict[str, Any], str, Path]:
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

    return payload, proof_sha, artifact


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
        proof, proof_sha, artifact = _capture_proof(
            bundle_root,
            selected,
            class_name,
            verify_ciphertext=False,
        )
        capture_proofs[class_name] = {
            "proof_file": str(
                (bundle_root / "proofs" / f"{class_name}.json").relative_to(
                    bundle_root
                )
            ),
            "proof_sha256": proof_sha,
            "ciphertext_file": artifact.name,
            "ciphertext_bytes": int(proof["ciphertext_bytes"]),
        }
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


def restore_stage(
    *,
    campaign_id: str,
    bundle_root: Path,
    class_name: str,
    recipient_cert: Path,
    private_key: Path,
    restore_tool_source: str,
) -> dict[str, Any]:
    capture, capture_proof_sha, artifact = _capture_proof(
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
    command = cms_decrypt_command(
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
        "capture_tool_source": capture.get("tool_source"),
        "restore_tool_source": restore_tool_source,
        "capture_proof_file": f"proofs/{class_name}.json",
        "capture_proof_sha256": capture_proof_sha,
        "ciphertext_file": artifact.name,
        "ciphertext_bytes": capture["ciphertext_bytes"],
        "ciphertext_sha256": capture["ciphertext_sha256"],
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
    pid = state.get("pid")
    state["process_alive"] = process_alive(pid if isinstance(pid, int) else None)
    return state


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
    if state.get("current_class"):
        raise CampaignError(
            "campaign stopped inside a capture class; create a fresh campaign "
            "rather than guessing around a partial artifact"
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

    q = sub.add_parser("restore-start")
    q.add_argument("campaign_id", nargs="?")
    q.add_argument("--authorize-ordinary-restore-drill", action="store_true")
    q.add_argument("--json", action="store_true")

    q = sub.add_parser("restore-status")
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
