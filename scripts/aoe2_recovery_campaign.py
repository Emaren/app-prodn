#!/usr/bin/env python3
from __future__ import annotations

import argparse
import fcntl
import hashlib
import json
import os
import shlex
import shutil
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


def _read_chunk_receipt(path: Path, expected_index: int) -> dict[str, Any]:
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
    if len(expected_ciphertext) != 64 or recovery.sha256(cms_path) != expected_ciphertext:
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


def _load_existing_chunk_receipts(root: Path) -> list[dict[str, Any]]:
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
        receipts.append(_read_chunk_receipt(path, index))
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

    q = sub.add_parser("_run")
    q.add_argument("campaign_id")

    return p


def main() -> int:
    args = parser().parse_args()

    if args.command == "_run":
        return run_campaign(args.campaign_id)

    if args.command == "preflight":
        payload = preflight(args.recipient_cert)
        if args.json:
            print(json.dumps(payload, indent=2, sort_keys=True))
        else:
            print_preflight(payload)
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
