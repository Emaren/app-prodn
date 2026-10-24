#!/usr/bin/env python3
"""Offline app <-> WoloChain private Satchel source-contract crosswalk.

Use checked-out HELD integration trees; GitHub main can lack both the client
and signer. No RPC, HTTP requests, keys, binaries, SQL or financial actions.
All source matches are observations; independently provisioned capabilities
and a genuine mainnet release still require private operator evidence.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

MAX_SOURCE = 512_000
APP_PATH = "lib/warSatchelDedicatedSignerClient.ts"
APP_HOLD_PATH = "lib/warSatchelFinancialBridgeHold.ts"
WOLO_PATH = "internal/satchelservice/http.go"
SHARED = {
    "health_endpoint": (r'"/satchel/v1/health"', r'"/satchel/v1/health"'),
    "one_shot_endpoint": (r'"/satchel/v2/one-shot"', r'"/satchel/v2/one-shot"'),
    "protocol_v2": (r"health\.execution_protocol\s*!==\s*2", r'"execution_protocol":\s*2'),
    "owner_wager_binding": (r"health\.owner_bound_wager_reservation_required\s*!==\s*true",
                            r'"owner_bound_wager_reservation_required":\s*true'),
    "exact_chain": (r'health\.chain_id\s*!==\s*"wolo-1"', r'"chain_id":\s*"wolo-1"'),
    "exclusive_role": (r'health\.signer_role\s*!==\s*"exclusive-war-satchel-v1"',
                       r'"signer_role":\s*httpCustodyRole'),
    "durable_one_shot": (r'health\.durable_one_shot\s*!==\s*true', r'"durable_one_shot":\s*true'),
    "no_replay_after_restart": (r'health\.replay_after_restart_forbidden\s*!==\s*true',
                                r'"replay_after_restart_forbidden":\s*true'),
    "chain_proven_refunds": (r'health\.refunds_require_chain_proof\s*!==\s*true',
                            r'"refunds_require_chain_proof":\s*true'),
    "exclusive_mnemonic": (r'health\.custody_mnemonic_shared_with_other_roles\s*!==\s*false',
                           r'"custody_mnemonic_shared_with_other_roles"\]\s*=\s*false'),
}
VERSIONED = (
    ("capability_state", r'health\.custody_capability\s*!==\s*"AVAILABLE"',
     r'response\["custody_capability"\]\s*=\s*"AVAILABLE"'),
    ("default_hold", r'SATCHEL_DEDICATED_SIGNER_UNAVAILABLE',
     r'"custody_capability":\s*"UNAVAILABLE"'),
)
REVIEW_ITEMS = (
    ("capability_version_checked_in_app", r'health\.custody_capability_version\b',
     r'"custody_capability_version"\]\s*=\s*"war-satchel-runtime-custody-v1"'),
    ("capability_expiration_checked_in_app", r'health\.custody_capability_expires_at\b',
     r'"custody_capability_expires_at"\]'),
)


def safe_source(path: Path) -> dict:
    try:
        if path.is_symlink() or not path.is_file() or path.stat().st_size > MAX_SOURCE:
            raise ValueError("unknown_or_unsafe")
        data = path.read_bytes()
        if len(data) > MAX_SOURCE:
            raise ValueError("oversize")
        content = data.decode("utf-8")
        return {"content": content, "sha256": hashlib.sha256(data).hexdigest(),
                "status": "READ"}
    except (OSError, UnicodeError, ValueError):
        return {"content": None, "sha256": None, "status": "UNKNOWN_SOURCE"}


def observed(app: str, wolo: str, patterns: dict | tuple, expected: bool) -> list[dict]:
    rows = []
    iterator = patterns.items() if isinstance(patterns, dict) else patterns
    for name, app_rule, wolo_rule in (
        ((name, *rules) for name, rules in iterator) if isinstance(patterns, dict)
        else iterator
    ):
        app_ok = re.search(app_rule, app) is not None
        wolo_ok = re.search(wolo_rule, wolo) is not None
        rows.append({"contract": name, "app_declares": app_ok, "wolo_declares": wolo_ok,
                     "status": "BOTH_OBSERVED" if app_ok and wolo_ok else
                               "SOURCE_REVIEW_REQUIRED" if expected else "OPTIONAL_REVIEW_REQUIRED"})
    return rows


def inspect(app_root: Path, wolo_root: Path) -> dict:
    app = safe_source(app_root / APP_PATH)
    hold = safe_source(app_root / APP_HOLD_PATH)
    wolo = safe_source(wolo_root / WOLO_PATH)
    identities = {
        "app_signer_client": {"path": APP_PATH, "sha256": app["sha256"], "status": app["status"]},
        "app_bridge_hold": {"path": APP_HOLD_PATH, "sha256": hold["sha256"], "status": hold["status"]},
        "wolo_private_http": {"path": WOLO_PATH, "sha256": wolo["sha256"], "status": wolo["status"]},
    }
    if app["content"] is None or wolo["content"] is None or hold["content"] is None:
        return {"schema": "aoe2war.app_wolo_custody_crosswalk.v1",
                "status": "INCOMPLETE_SOURCE", "source": identities,
                "observations": [], "versioned_capability_review": [],
                "financial_bridge_held": None, "cross_repo_runtime_attested": False,
                "safe_to_enable_custody": False}
    app_src = app["content"]
    wolo_src = wolo["content"]
    core = observed(app_src, wolo_src, SHARED, True)
    mode = observed(app_src, wolo_src, VERSIONED, True)
    review = observed(app_src, wolo_src, REVIEW_ITEMS, False)
    is_held = bool(re.search(r"SATCHEL_FINANCIAL_BRIDGE_READY\s*=\s*false\b", hold["content"]))
    missing = [entry["contract"] for entry in core + mode if entry["status"] != "BOTH_OBSERVED"]
    review_required = [entry["contract"] for entry in review
                       if entry["status"] != "BOTH_OBSERVED"]
    return {
        "schema": "aoe2war.app_wolo_custody_crosswalk.v1",
        "status": "SOURCE_DECLARATION_MISMATCH" if missing or not is_held else
                  "HANDSHAKE_REVIEW_GAPS" if review_required else
                  "OBSERVED_DECLARATIONS_NOT_RUNTIME_PROOF",
        "source": identities, "observations": core + mode,
        "versioned_capability_review": review,
        "missing_core_contracts": missing,
        "missing_explicit_capability_checks": review_required,
        "financial_bridge_held": is_held,
        "cross_repo_runtime_attested": False,
        "bank_reserve_attested": False,
        "operator_signed_permit_attested": False,
        "safe_to_enable_custody": False,
        "notes": [
            "Go source uses a conditional capability grant; AVAILABLE in code is not active custody.",
            "Cross-repo source markers do not prove semantics, actual identities, source-to-running-binary parity or health response authenticity.",
            "Client must fail closed on grant rotation/expiry; never enable the bridge merely because text matches.",
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--app-root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--wolo-root", type=Path, required=True,
                        help="read-only path to separately checked-out held Wolo source")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--check", action="store_true",
                        help="fail if source missing, mismatched or review gaps; never authorize finance")
    args = parser.parse_args()
    report = inspect(args.app_root, args.wolo_root)
    data = json.dumps(report, sort_keys=True, indent=2) + "\n"
    if args.output:
        args.output.write_text(data, encoding="utf-8")
    print(data, end="")
    return 2 if args.check and report["status"] != "OBSERVED_DECLARATIONS_NOT_RUNTIME_PROOF" else 0


if __name__ == "__main__":
    raise SystemExit(main())
