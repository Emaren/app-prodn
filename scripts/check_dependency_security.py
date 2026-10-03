#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from collections import Counter
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
SEVERITIES = ("critical", "high", "moderate", "low", "info")
WAIVER_FILE = Path("config/dependency-security-waivers.json")


def dependency_digest(root: Path = ROOT) -> str:
    digest = hashlib.sha256()
    for name in ("package.json", "yarn.lock"):
        path = root / name
        digest.update(name.encode())
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def load_package_scopes(root: Path) -> tuple[set[str], set[str]]:
    package_path = root / "package.json"
    try:
        package = json.loads(package_path.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"cannot read package dependency scopes: {exc}") from exc
    runtime = set((package.get("dependencies") or {}).keys())
    development = set((package.get("devDependencies") or {}).keys())
    return runtime, development


def installed_module_version(root: Path, module: str) -> str | None:
    package_path = root / "node_modules" / Path(module) / "package.json"
    try:
        package = json.loads(package_path.read_text())
    except (OSError, json.JSONDecodeError):
        return None
    version = package.get("version")
    return str(version) if version else None


def load_waivers(root: Path) -> list[dict[str, Any]]:
    path = root / WAIVER_FILE
    if not path.is_file():
        return []
    try:
        payload = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"cannot parse dependency security waivers: {exc}") from exc
    if payload.get("schema") != 1 or not isinstance(payload.get("waivers"), list):
        raise RuntimeError("dependency security waiver file has invalid schema")
    waivers: list[dict[str, Any]] = []
    ids: set[int] = set()
    for index, waiver in enumerate(payload["waivers"]):
        if not isinstance(waiver, dict):
            raise RuntimeError(f"dependency security waiver #{index} is not an object")
        required = {
            "advisory_id",
            "module",
            "version",
            "scope",
            "dependency_digest",
            "expires_on",
            "reason",
            "upstream",
        }
        missing = sorted(required - set(waiver))
        if missing:
            raise RuntimeError(
                f"dependency security waiver #{index} missing fields: {', '.join(missing)}"
            )
        try:
            advisory_id = int(waiver["advisory_id"])
        except (TypeError, ValueError) as exc:
            raise RuntimeError(
                f"dependency security waiver #{index} has invalid advisory_id"
            ) from exc
        if advisory_id in ids:
            raise RuntimeError(
                f"dependency security waiver advisory_id duplicated: {advisory_id}"
            )
        ids.add(advisory_id)
        if waiver["scope"] != "dev-only":
            raise RuntimeError(
                f"dependency security waiver {advisory_id} has unsupported scope"
            )
        try:
            date.fromisoformat(str(waiver["expires_on"]))
        except ValueError as exc:
            raise RuntimeError(
                f"dependency security waiver {advisory_id} has invalid expires_on"
            ) from exc
        waivers.append({**waiver, "advisory_id": advisory_id})
    return waivers


def evaluate_waiver(
    *,
    root: Path,
    advisory: dict[str, Any],
    waiver: dict[str, Any],
    current_digest: str,
    runtime_dependencies: set[str],
    dev_dependencies: set[str],
    today: date,
) -> tuple[bool, str, dict[str, Any]]:
    advisory_id = int(advisory["id"])
    module = str(advisory["module"])
    installed_version = installed_module_version(root, module)
    evidence = {
        "advisory_id": advisory_id,
        "module": module,
        "installed_version": installed_version,
        "scope": waiver.get("scope"),
        "expires_on": waiver.get("expires_on"),
        "dependency_digest": current_digest,
        "path_roots": sorted(
            {
                path.split(">", 1)[0]
                for path in advisory.get("paths") or []
                if path
            }
        ),
    }

    if int(waiver["advisory_id"]) != advisory_id:
        return False, "advisory_id_mismatch", evidence
    if str(waiver["module"]) != module:
        return False, "module_mismatch", evidence
    if installed_version != str(waiver["version"]):
        return False, "installed_version_mismatch", evidence
    if str(waiver["dependency_digest"]) != current_digest:
        return False, "dependency_digest_mismatch", evidence
    expires = date.fromisoformat(str(waiver["expires_on"]))
    if today > expires:
        return False, "expired", evidence

    path_roots = evidence["path_roots"]
    if not path_roots:
        return False, "missing_resolution_paths", evidence
    runtime_roots = sorted(root_name for root_name in path_roots if root_name in runtime_dependencies)
    unknown_roots = sorted(
        root_name
        for root_name in path_roots
        if root_name not in runtime_dependencies and root_name not in dev_dependencies
    )
    non_dev_roots = sorted(
        root_name for root_name in path_roots if root_name not in dev_dependencies
    )
    evidence["runtime_roots"] = runtime_roots
    evidence["unknown_roots"] = unknown_roots
    evidence["dev_only"] = not runtime_roots and not unknown_roots and not non_dev_roots
    if runtime_roots:
        return False, "runtime_dependency_path", evidence
    if unknown_roots or non_dev_roots:
        return False, "unproven_dev_only_path", evidence

    evidence["reason"] = str(waiver["reason"])
    evidence["upstream"] = str(waiver["upstream"])
    return True, "accepted", evidence


def collect(
    root: Path = ROOT,
    timeout: int = 90,
    *,
    today: date | None = None,
) -> dict[str, Any]:
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
    current_digest = dependency_digest(root)
    runtime_dependencies, dev_dependencies = load_package_scopes(root)
    waivers = load_waivers(root)
    waiver_by_id = {int(item["advisory_id"]): item for item in waivers}
    evaluation_date = today or datetime.now(timezone.utc).date()

    normalized = []
    for entry in advisories.values():
        item = dict(entry)
        item["paths"] = sorted(item["paths"])
        normalized.append(item)
    normalized.sort(
        key=lambda item: (
            SEVERITIES.index(item["severity"]),
            item["module"],
            item["id"],
        )
    )

    waived_advisories: list[dict[str, Any]] = []
    waiver_rejections: list[dict[str, Any]] = []
    actionable_advisories: list[dict[str, Any]] = []

    for advisory in normalized:
        waiver = waiver_by_id.get(int(advisory["id"]))
        if waiver is None:
            actionable_advisories.append(advisory)
            continue
        accepted, rejection_reason, evidence = evaluate_waiver(
            root=root,
            advisory=advisory,
            waiver=waiver,
            current_digest=current_digest,
            runtime_dependencies=runtime_dependencies,
            dev_dependencies=dev_dependencies,
            today=evaluation_date,
        )
        if accepted:
            waived_advisories.append(
                {
                    **advisory,
                    "waiver": evidence,
                }
            )
        else:
            actionable_advisories.append(advisory)
            waiver_rejections.append(
                {
                    "advisory_id": advisory["id"],
                    "module": advisory["module"],
                    "reason": rejection_reason,
                    "evidence": evidence,
                }
            )

    raw_unique = Counter(item["severity"] for item in normalized)
    actionable_unique = Counter(
        item["severity"] for item in actionable_advisories
    )
    path_counts = {
        severity: int((summary.get("vulnerabilities") or {}).get(severity, 0))
        for severity in SEVERITIES
    }
    actionable_path_counts = {
        severity: sum(
            len(item["paths"])
            for item in actionable_advisories
            if item["severity"] == severity
        )
        for severity in SEVERITIES
    }

    status = "PASS" if not actionable_advisories else "FAIL"
    return {
        "schema": 2,
        "kind": "aoe2war-dependency-security",
        "status": status,
        "raw_status": "PASS" if not normalized else "FAIL",
        "dependency_digest": current_digest,
        "audit_returncode": process.returncode,
        "audit_date_utc": evaluation_date.isoformat(),
        "malformed_stdout_lines": malformed,
        "dependency_count": int(summary.get("dependencies", 0)),
        "path_vulnerabilities": path_counts,
        "actionable_path_vulnerabilities": actionable_path_counts,
        "unique_advisories": {
            severity: int(raw_unique.get(severity, 0))
            for severity in SEVERITIES
        },
        "actionable_unique_advisories": {
            severity: int(actionable_unique.get(severity, 0))
            for severity in SEVERITIES
        },
        "advisories": normalized,
        "actionable_advisories": actionable_advisories,
        "waived_advisories": waived_advisories,
        "waiver_rejections": waiver_rejections,
        "waiver_file": str(WAIVER_FILE),
    }


def print_human(payload: dict[str, Any]) -> None:
    raw = payload["unique_advisories"]
    actionable = payload.get("actionable_unique_advisories") or raw
    waived_ids = {
        int(item["id"]) for item in payload.get("waived_advisories") or []
    }
    print(
        "DEPENDENCY SECURITY: "
        + payload["status"]
        + " · actionable "
        + " · ".join(f"{key}={actionable[key]}" for key in SEVERITIES)
        + " · raw "
        + " · ".join(f"{key}={raw[key]}" for key in SEVERITIES)
        + f" · waived={len(waived_ids)}"
        + f" · installed_packages={payload['dependency_count']}"
    )
    for item in payload["advisories"]:
        disposition = "WAIVED" if int(item["id"]) in waived_ids else item["severity"].upper()
        print(
            f"{disposition} {item['module']} "
            f"#{item['id']} · {item['title']} · paths={len(item['paths'])}"
        )
    for item in payload.get("waiver_rejections") or []:
        print(
            f"WAIVER_REJECTED {item['module']} #{item['advisory_id']} "
            f"· {item['reason']}"
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
