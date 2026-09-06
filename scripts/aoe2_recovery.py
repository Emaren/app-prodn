#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
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
    args = parser.parse_args()

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
