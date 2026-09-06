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
            "under ~/aoe2war-recovery; pass --recipient-cert PATH"
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
    openssl_cmd = [
        "openssl",
        "cms",
        "-encrypt",
        "-binary",
        "-outform",
        "DER",
        "-aes256",
        "-recip",
        str(recipient_cert),
        "-out",
        str(partial),
    ]

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

            validate_campaign_source(state)
            if state.get("pause_requested"):
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
    state["pause_requested"] = True
    state["pause_requested_at"] = utc_now()
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
    state["pause_requested"] = False
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
