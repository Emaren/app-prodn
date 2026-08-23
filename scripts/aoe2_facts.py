#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "config" / "aoe2war-operations.json"


class FactsError(RuntimeError):
    pass


def run(
    args: list[str],
    *,
    cwd: Path,
) -> tuple[int, str]:
    result = subprocess.run(
        args,
        cwd=cwd,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=False,
    )
    return result.returncode, result.stdout.strip()


def git_value(
    repo: Path,
    *args: str,
) -> str | None:
    rc, output = run(
        ["git", *args],
        cwd=repo,
    )
    return output if rc == 0 and output else None


def current_worktree() -> Path | None:
    rc, output = run(
        ["git", "rev-parse", "--show-toplevel"],
        cwd=Path.cwd(),
    )
    if rc != 0 or not output:
        return None
    return Path(output).resolve()


def collect() -> dict[str, Any]:
    contract = json.loads(CONTRACT.read_text())

    canonical = dict(contract["canonical"])
    protected = dict(contract["protected"])
    development = dict(
        contract.get("development") or {}
    )
    toolchain = dict(contract["toolchain"])

    current = current_worktree()

    current_branch = None
    current_head = None

    if current is not None:
        current_branch = git_value(
            current,
            "branch",
            "--show-current",
        )
        current_head = git_value(
            current,
            "rev-parse",
            "HEAD",
        )

    operator_repo = Path(
        canonical["operator_repo"]
    ).expanduser()

    operator_head = git_value(
        operator_repo,
        "rev-parse",
        "HEAD",
    )
    operator_branch = git_value(
        operator_repo,
        "branch",
        "--show-current",
    )

    return {
        "schema": 1,
        "project": contract.get("project"),
        "current": {
            "worktree": (
                str(current)
                if current is not None
                else None
            ),
            "branch": current_branch,
            "head": current_head,
        },
        "operator": {
            "repo": str(operator_repo),
            "branch": operator_branch,
            "head": operator_head,
        },
        "production": {
            "host": canonical["production_host"],
            "repo": canonical["production_repo"],
            "service": canonical["service"],
            "bind": canonical["web_bind"],
            "public_base_url": (
                canonical["public_base_url"]
            ),
            "volume_mount": (
                canonical["volume_mount"]
            ),
            "managed_media_root": (
                canonical["managed_media_root"]
            ),
            "deployment_receipt_root": (
                canonical["deployment_receipt_root"]
            ),
            "durable_rollback_root": (
                canonical["durable_rollback_root"]
            ),
        },
        "development": development,
        "protected": {
            "wolo_listener_ports": protected[
                "wolo_listener_ports"
            ],
            "wolo_runtime_mutation_policy": protected[
                "wolo_runtime_mutation_policy"
            ],
            "database_automatic_migration_policy": (
                protected[
                    "database_automatic_migration_policy"
                ]
            ),
        },
        "toolchain": toolchain,
    }


def print_human(data: dict[str, Any]) -> None:
    current = data["current"]
    operator = data["operator"]
    production = data["production"]
    development = data["development"]
    protected = data["protected"]

    print("⚔️  AOE2WAR MACHINE FACTS")
    print()
    print(
        "Current worktree: "
        + str(current.get("worktree") or "—")
    )
    print(
        "Current branch:   "
        + str(current.get("branch") or "—")
    )
    print(
        "Current HEAD:     "
        + str(current.get("head") or "—")
    )
    print()
    print(
        "Operator repo:    "
        + str(operator.get("repo") or "—")
    )
    print(
        "Operator branch:  "
        + str(operator.get("branch") or "—")
    )
    print(
        "Operator HEAD:    "
        + str(operator.get("head") or "—")
    )
    print()
    print(
        "Production host:  "
        + production["host"]
    )
    print(
        "Production repo:  "
        + production["repo"]
    )
    print(
        "Web service:      "
        + production["service"]
    )
    print(
        "Web bind:         "
        + production["bind"]
    )
    print(
        "Volume:           "
        + production["volume_mount"]
    )
    print(
        "Managed media:    "
        + production["managed_media_root"]
    )
    print()
    print(
        "Shadow DB:        "
        + development["shadow_database"]
    )
    print(
        "Preview identity: "
        + development["preview_user_name"]
    )
    print(
        "Dependency mode:  "
        + development["dependency_strategy"]
    )
    print()
    print(
        "Wolo listeners:   "
        + ", ".join(
            str(value)
            for value in protected[
                "wolo_listener_ports"
            ]
        )
        + "  OBSERVE ONLY"
    )
    print(
        "Prod DB mutation: "
        + (
            "DISABLED"
            if not development[
                "production_database_mutation"
            ]
            else "ENABLED"
        )
    )


def main() -> int:
    parser = argparse.ArgumentParser(
        prog="aoe2war facts"
    )
    parser.add_argument(
        "--json",
        action="store_true",
    )
    args = parser.parse_args()

    try:
        data = collect()
    except Exception as exc:
        raise SystemExit(
            f"STOP: cannot resolve AoE2WAR facts: {exc}"
        )

    if args.json:
        print(
            json.dumps(
                data,
                indent=2,
                sort_keys=True,
            )
        )
    else:
        print_human(data)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
