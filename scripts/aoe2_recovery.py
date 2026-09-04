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


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def latest_verified_pilot() -> dict[str, Any] | None:
    if not RECOVERY_VAULT_ROOT.is_dir():
        return None

    candidates: list[dict[str, Any]] = []

    for proof in RECOVERY_VAULT_ROOT.glob("*/restore-proof.json"):
        sidecar = proof.with_name("restore-proof.json.sha256")

        if not sidecar.is_file():
            continue

        try:
            expected = sidecar.read_text(
                encoding="utf-8"
            ).strip().split()[0]

            if expected != sha256(proof):
                continue

            payload = json.loads(
                proof.read_text(
                    encoding="utf-8"
                )
            )
        except Exception:
            continue

        if (
            not isinstance(payload, dict)
            or payload.get("status") != "PILOT_VERIFIED"
        ):
            continue

        payload = dict(payload)
        payload["proof_path"] = str(proof)
        payload["proof_sha256"] = expected
        candidates.append(payload)

    if not candidates:
        return None

    candidates.sort(
        key=lambda item: str(
            item.get("created_at") or ""
        ),
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
    usage = shutil.disk_usage(Path.home())
    blockers: list[str] = []
    if not evidence.get("enabled"):
        blockers.append("off-host evidence vault is disabled")
    if not evidence.get("authority"):
        blockers.append("off-host authority is not named")
    if not evidence.get("restore_proof"):
        blockers.append("verified restore-proof receipt is not named")
    return {
        "schema": 1,
        "kind": "aoe2war-recovery-status",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "status": "VERIFIED" if not blockers else "NOT_VERIFIED",
        "enabled": bool(evidence.get("enabled")),
        "authority": evidence.get("authority"),
        "restore_proof": evidence.get("restore_proof"),
        "pilot": pilot,
        "note": evidence.get("note"),
        "blockers": blockers,
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
    print("  1. Choose a genuinely off-host authority.")
    print(
        "  2. Use client-side encryption; keep the recovery key in an independent location."
    )
    print("  3. Capture only approved recovery evidence; never raw credentials.")
    print("  4. Upload with hashes + manifest.")
    print("  5. Retrieve into an isolated restore workspace.")
    print(
        "  6. Decrypt, rehash, inspect and exercise a safe representative restore."
    )
    print(
        "  7. Record the dated restore-proof receipt in the operations contract."
    )
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
