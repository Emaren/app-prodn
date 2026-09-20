#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from collections import Counter
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
SEVERITIES = ("critical", "high", "moderate", "low", "info")


def dependency_digest(root: Path = ROOT) -> str:
    digest = hashlib.sha256()
    for name in ("package.json", "yarn.lock"):
        path = root / name
        digest.update(name.encode())
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def collect(root: Path = ROOT, timeout: int = 90) -> dict[str, Any]:
    process = subprocess.run(
        ["yarn", "audit", "--json"],
        cwd=root,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=timeout,
        check=False,
    )
    advisories: dict[int, dict[str, Any]] = {}
    summary: dict[str, Any] | None = None
    malformed = 0

    for raw in process.stdout.splitlines():
        try:
            row = json.loads(raw)
        except json.JSONDecodeError:
            malformed += 1
            continue
        if row.get("type") == "auditAdvisory":
            data = row["data"]
            advisory = data["advisory"]
            advisory_id = int(advisory["id"])
            entry = advisories.setdefault(
                advisory_id,
                {
                    "id": advisory_id,
                    "severity": str(advisory["severity"]).lower(),
                    "module": str(advisory["module_name"]),
                    "title": str(advisory["title"]),
                    "patched_versions": advisory.get("patched_versions"),
                    "paths": set(),
                },
            )
            entry["paths"].add(str(data["resolution"]["path"]))
        elif row.get("type") == "auditSummary":
            summary = row["data"]

    if summary is None:
        raise RuntimeError(
            "yarn audit produced no auditSummary"
            + (f": {process.stderr[-1000:]}" if process.stderr else "")
        )
    unique = Counter(entry["severity"] for entry in advisories.values())
    path_counts = {
        severity: int((summary.get("vulnerabilities") or {}).get(severity, 0))
        for severity in SEVERITIES
    }
    normalized = []
    for entry in advisories.values():
        item = dict(entry)
        item["paths"] = sorted(item["paths"])
        normalized.append(item)

    status = "PASS" if not advisories else "FAIL"
    return {
        "schema": 1,
        "kind": "aoe2war-dependency-security",
        "status": status,
        "dependency_digest": dependency_digest(root),
        "audit_returncode": process.returncode,
        "malformed_stdout_lines": malformed,
        "dependency_count": int(summary.get("dependencies", 0)),
        "path_vulnerabilities": path_counts,
        "unique_advisories": {
            severity: int(unique.get(severity, 0))
            for severity in SEVERITIES
        },
        "advisories": sorted(
            normalized,
            key=lambda item: (
                SEVERITIES.index(item["severity"]),
                item["module"],
                item["id"],
            ),
        ),
    }


def print_human(payload: dict[str, Any]) -> None:
    unique = payload["unique_advisories"]
    print(
        "DEPENDENCY SECURITY: "
        + payload["status"]
        + " · "
        + " · ".join(f"{key}={unique[key]}" for key in SEVERITIES)
        + f" · installed_packages={payload['dependency_count']}"
    )
    for item in payload["advisories"]:
        print(
            f"{item['severity'].upper()} {item['module']} "
            f"#{item['id']} · {item['title']} · paths={len(item['paths'])}"
        )


def main() -> int:
    parser = argparse.ArgumentParser(prog="aoe2war deps-security")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--timeout", type=int, default=90)
    args = parser.parse_args()
    try:
        payload = collect(timeout=max(10, min(args.timeout, 300)))
    except Exception as exc:
        payload = {
            "schema": 1,
            "kind": "aoe2war-dependency-security",
            "status": "ERROR",
            "error": str(exc),
        }
    if args.json:
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        if payload["status"] == "ERROR":
            print("DEPENDENCY SECURITY: ERROR · " + payload["error"])
        else:
            print_human(payload)
    return 0 if payload["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
