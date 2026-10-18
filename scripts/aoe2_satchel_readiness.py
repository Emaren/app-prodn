#!/usr/bin/env python3
"""Read-only, nonauthorizing Satchel/Mecha integration readiness inventory.

Reports what source code actually contains. No env secrets, DB calls, network,
chain queries, wallet signing, deployment, admission or financial permissions.
Never claim live readiness from filename markers or unsigned observations.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import subprocess
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
SOURCES = {
    "mecha_runtime": "lib/betAutomation.ts",
    "mecha_ui": "components/profile/MechaAutoBetCard.tsx",
    "mecha_shadow_worker": "lib/betAutomationShadowWorker.ts",
    "satchel_intents": "app/api/user/war-satchel/funding-intents/route.ts",
    "satchel_evidence": "app/api/user/war-satchel/deposit-evidence/route.ts",
    "satchel_receipt": "lib/warSatchelUncreditedProofRecorder.ts",
}
REQUIRED_EXTERNAL = (
    "Independent chain finality and settled deposit proof with exact transfer/owner identity",
    "Vault signer control, segregation, withdrawal and insolvency/rollback handling",
    "Installed, independently verified custody ledger migrations and nonnegative double-entry invariants",
    "Real funded consumer: atomic available-to-reserved and accepted ticket/wager idempotency",
    "Producer/signer fencing, chain state reconciliation, claim #889 and WoloChain #5 release authority",
    "Release-bound receipts, browser/runtime/DB checks and operator-approved canary/rollback",
)


def git_identity(root: Path) -> dict[str, Any]:
    """Local Git identity only; never infer the running production revision."""
    def git(*args: str) -> str:
        result = subprocess.run(
            ["git", *args], cwd=root, capture_output=True, text=True,
            timeout=8, check=False,
        )
        if result.returncode:
            raise ValueError("Source identity could not be verified")
        return result.stdout.strip()
    if Path(git("rev-parse", "--show-toplevel")).resolve() != root.resolve():
        raise ValueError("Expected exact repository root")
    head = git("rev-parse", "HEAD")
    if len(head) != 40 or any(c not in "0123456789abcdef" for c in head):
        raise ValueError("Invalid local HEAD")
    if git("status", "--porcelain=v1", "--untracked-files=all"):
        raise ValueError("Dirty checkout: cannot bind source evidence")
    return {"head": head, "clean": True, "provenance": "local-git-only"}


def inspect(root: Path, identity: dict[str, Any]) -> dict[str, Any]:
    source: dict[str, str] = {}
    checksums: dict[str, str | None] = {}
    for key, rel in SOURCES.items():
        path = root / rel
        try:
            raw = path.read_bytes()
            if len(raw) > 512_000:
                raise ValueError("Source file exceeds audit bound")
            source[key] = raw.decode("utf-8")
            checksums[key] = hashlib.sha256(raw).hexdigest()
        except (OSError, UnicodeError, ValueError):
            source[key] = ""
            checksums[key] = None

    def check(key: str, marker: str, id: str, blocked: str, unknown: str) -> dict[str, str]:
        state = blocked if marker in source[key] else unknown
        return {"id": id, "state": state, "source": SOURCES[key]}

    gates = [
        check("mecha_runtime", "const LIVE_EXECUTOR_IMPLEMENTED = false;",
              "funded_executor", "IMPLEMENTATION_BLOCKED", "IMPLEMENTATION_UNVERIFIED"),
        check("mecha_runtime", 'LOCAL_BET_CUSTODY_ENDPOINT =',
              "custody_endpoint_locality", "CODE_GUARD_PRESENT_UNVERIFIED", "GUARD_UNVERIFIED"),
        check("mecha_ui", "const satchelVerifiedBalanceWolo: string | null = null;",
              "custody_spendable_projection", "IMPLEMENTATION_BLOCKED", "IMPLEMENTATION_UNVERIFIED"),
        check("mecha_ui", 'LOAD FROM WALLET · COMING SOON',
              "keplr_deposit_action", "IMPLEMENTATION_BLOCKED", "IMPLEMENTATION_UNVERIFIED"),
        check("mecha_shadow_worker", 'BET_AUTO_SHADOW_READY_STATUS = "shadow_ready"',
              "automatic_wager_consumer", "SHADOW_ONLY_VERIFIED_IN_SOURCE", "IMPLEMENTATION_UNVERIFIED"),
        check("satchel_intents", "depositAuthorized: false",
              "funding_intent_authority", "PREPARATION_ONLY", "IMPLEMENTATION_UNVERIFIED"),
        check("satchel_evidence", "creditAuthorized: false",
              "deposit_credit_authority", "UNCREDITED_PROOF_ONLY", "IMPLEMENTATION_UNVERIFIED"),
        check("satchel_receipt", 'status: "uncredited"',
              "deposit_receipt_persistence", "UNCREDITED_PROOF_ONLY", "IMPLEMENTATION_UNVERIFIED"),
    ]
    return {
        "schema": "aoe2war.satchel-mecha-readiness.v1",
        "kind": "SOURCE_OBSERVATION_NOT_RELEASE_AUTHORITY",
        "source": identity,
        "source_files_sha256": checksums,
        "gates": gates,
        "missing_independent_proof": list(REQUIRED_EXTERNAL),
        "live_satchel_authorized": False,
        "live_auto_bet_authorized": False,
        "website_release_authorized": False,
        "wolo_cutover_authorized": False,
        "state": "FINANCIAL_ACTIVATION_UNPROVEN",
        "next_owner": {
            "app": "Verified custody migrations, wallet funds-to-ledger projection, funded idempotent wager consumer and tests",
            "wolo": "WoloChain #5 protected producer, bank, settlement and chain finality proof",
            "release": "Authenticated exact-candidate authorization through existing protected controller",
        },
        "caveat": "Source diagnostics cannot establish deployed readiness, financial solvency or custody authority.",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    try:
        root = args.root.resolve()
        report = inspect(root, git_identity(root))
    except (OSError, ValueError, subprocess.TimeoutExpired):
        report = {
            "schema": "aoe2war.satchel-mecha-readiness.v1",
            "state": "SOURCE_UNVERIFIED",
            "live_satchel_authorized": False,
            "live_auto_bet_authorized": False,
            "website_release_authorized": False,
            "wolo_cutover_authorized": False,
        }
    if args.json:
        print(json.dumps(report, indent=2, sort_keys=True))
    else:
        print("AOE2WAR WAR SATCHEL + MECHA · READ ONLY")
        print("Source status:", report["state"])
        for item in report.get("gates", []):
            print(" -", item["id"], ":", item["state"])
        print("Release authorization: NONE · Financial authorization: NONE")
    # Read-only observations NEVER signal success as launch readiness.
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
