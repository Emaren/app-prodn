#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import date
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "config" / "test-contract.json"


class TestContractError(RuntimeError):
    pass


def load_contract(path: Path = CONTRACT) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict) or value.get("schema") != 1:
        raise TestContractError(f"invalid test contract: {path}")
    return value


def resolve_plan(contract: dict[str, Any]) -> dict[str, Any]:
    pattern = str(contract.get("node_test_glob") or "")
    if pattern != "tests/*.test.mts":
        raise TestContractError("node_test_glob must remain tests/*.test.mts")

    discovered = sorted(
        path.relative_to(ROOT).as_posix()
        for path in (ROOT / "tests").glob("*.test.mts")
        if path.is_file()
    )
    quarantine_items = contract.get("quarantine")
    if not isinstance(quarantine_items, list):
        raise TestContractError("quarantine must be a list")

    quarantine: dict[str, dict[str, Any]] = {}
    for item in quarantine_items:
        if not isinstance(item, dict):
            raise TestContractError("every quarantine entry must be an object")
        path = str(item.get("path") or "")
        if path in quarantine:
            raise TestContractError(f"duplicate quarantine entry: {path}")
        if path not in discovered:
            raise TestContractError(f"quarantined test does not exist: {path}")
        if not str(item.get("reason") or "").strip():
            raise TestContractError(f"quarantine reason is missing: {path}")
        if not str(item.get("owner") or "").strip():
            raise TestContractError(f"quarantine owner is missing: {path}")
        try:
            review_by = date.fromisoformat(str(item.get("review_by") or ""))
        except ValueError as exc:
            raise TestContractError(f"invalid review_by for {path}") from exc
        quarantine[path] = {**item, "overdue": review_by < date.today()}

    node_flags = contract.get("runner", {}).get("node_flags")
    if not isinstance(node_flags, list) or not all(
        isinstance(value, str) and value for value in node_flags
    ):
        raise TestContractError("runner.node_flags must be a non-empty string list")

    return {
        "schema": 1,
        "discovered": discovered,
        "active": [path for path in discovered if path not in quarantine],
        "quarantine": [quarantine[path] for path in sorted(quarantine)],
        "node_flags": node_flags,
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Run every non-quarantined Node contract test from one audited inventory."
    )
    parser.add_argument("--list", action="store_true")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    try:
        plan = resolve_plan(load_contract())
    except Exception as exc:
        if args.json:
            print(json.dumps({"status": "ERROR", "error": str(exc)}, indent=2))
        else:
            print(f"TEST CONTRACT ERROR: {exc}", file=sys.stderr)
        return 2

    if args.list or args.json:
        payload = {
            key: value
            for key, value in plan.items()
            if key != "node_flags"
        }
        payload["status"] = "READY"
        payload["active_count"] = len(plan["active"])
        payload["quarantine_count"] = len(plan["quarantine"])
        if args.json:
            print(json.dumps(payload, indent=2, sort_keys=True))
        else:
            print(
                f"Node tests: {payload['active_count']} active, "
                f"{payload['quarantine_count']} quarantined"
            )
            for item in plan["quarantine"]:
                suffix = " OVERDUE" if item["overdue"] else ""
                print(f"  {item['path']} · review {item['review_by']}{suffix}")
        return 1 if any(item["overdue"] for item in plan["quarantine"]) else 0

    print(
        f"Running {len(plan['active'])} active Node test files; "
        f"{len(plan['quarantine'])} explicitly quarantined.",
        flush=True,
    )
    process = subprocess.run(
        ["node", *plan["node_flags"], *plan["active"]],
        cwd=ROOT,
        check=False,
    )
    return process.returncode


if __name__ == "__main__":
    raise SystemExit(main())
