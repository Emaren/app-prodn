#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shlex
import stat
import subprocess
import sys
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import aoe2_audit
import aoe2_release

ROOT = Path(__file__).resolve().parents[1]
PROJECTS_ROOT = ROOT.parents[1]
VPSSENTRY = Path(
    os.getenv("AOE2_DOCTOR_VPSSENTRY", str(PROJECTS_ROOT / "VPSSentry"))
).resolve()
CONTRACT_PATH = ROOT / "config" / "aoe2war-operations.json"

CATEGORIES = (
    "Estate",
    "Production",
    "Operator Bridge",
    "Toolchain",
    "Host",
    "Architecture",
    "Disaster Recovery",
)

SEVERITY_ORDER = {"INFO": 0, "WARN": 1, "BLOCKER": 2}


@dataclass(frozen=True)
class Finding:
    severity: str
    category: str
    key: str
    detail: str
    deduction: int = 0


class Doctor:
    def __init__(self) -> None:
        self.findings: list[Finding] = []
        self.info: dict[str, Any] = {}

    def add(
        self,
        severity: str,
        category: str,
        key: str,
        detail: str,
        deduction: int = 0,
    ) -> None:
        if severity not in SEVERITY_ORDER:
            raise ValueError(f"unsupported severity: {severity}")
        if category not in CATEGORIES:
            raise ValueError(f"unsupported category: {category}")
        self.findings.append(
            Finding(
                severity=severity,
                category=category,
                key=key,
                detail=detail,
                deduction=max(0, int(deduction)),
            )
        )

    def count(self, severity: str) -> int:
        return sum(item.severity == severity for item in self.findings)

    def category_status(self, category: str) -> str:
        items = [item for item in self.findings if item.category == category]
        if any(item.severity == "BLOCKER" for item in items):
            return "FAIL"
        if any(item.severity == "WARN" for item in items):
            return "WARN"
        return "PASS"

    def score(self) -> int:
        return max(0, 100 - sum(item.deduction for item in self.findings))

    def status(self) -> str:
        if self.count("BLOCKER"):
            return "UNSAFE"
        if self.count("WARN"):
            return "ATTENTION"
        return "HEALTHY"

    def payload(self) -> dict[str, Any]:
        return {
            "schema": 1,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "status": self.status(),
            "score": self.score(),
            "blockers": self.count("BLOCKER"),
            "warnings": self.count("WARN"),
            "categories": {
                category: self.category_status(category)
                for category in CATEGORIES
            },
            "findings": [asdict(item) for item in self.findings],
            "info": self.info,
        }


def run(
    args: list[str],
    *,
    cwd: Path = ROOT,
    timeout: int = 30,
) -> tuple[int, str]:
    try:
        process = subprocess.run(
            args,
            cwd=str(cwd),
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=timeout,
            check=False,
        )
        return process.returncode, process.stdout.rstrip()
    except Exception as exc:
        return 127, str(exc)


def ssh(host: str, command: str, timeout: int = 20) -> tuple[int, str]:
    return run(
        [
            "ssh",
            "-o",
            "BatchMode=yes",
            "-o",
            "ConnectTimeout=8",
            host,
            f"bash -lc {shlex.quote(command)}",
        ],
        timeout=timeout,
    )


def load_contract(path: Path = CONTRACT_PATH) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict) or value.get("schema") != 1:
        raise ValueError(f"invalid operations contract: {path}")
    return value


def semver_core(value: str | None) -> str | None:
    if not value:
        return None
    match = re.search(r"(\d+)\.(\d+)(?:\.(\d+))?", value)
    if not match:
        return None
    patch = match.group(3)
    return ".".join(
        part
        for part in (match.group(1), match.group(2), patch)
        if part is not None
    )


def dependency_core(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    return semver_core(value)


def version_prefix_matches(actual: str | None, expected: str) -> bool:
    core = semver_core(actual)
    if core is None:
        return False
    return core == expected or core.startswith(expected + ".")


def version_at_least(actual: str | None, minimum: str | None) -> bool:
    actual_core = semver_core(actual)
    minimum_core = semver_core(minimum)
    if actual_core is None or minimum_core is None:
        return False

    def parts(value: str) -> tuple[int, int, int]:
        numbers = [int(part) for part in value.split(".")]
        padded = numbers + [0, 0, 0]
        return padded[0], padded[1], padded[2]

    return parts(actual_core) >= parts(minimum_core)


def parse_percent(value: str | None) -> int | None:
    if not value:
        return None
    match = re.search(r"(\d+)%?", value)
    return int(match.group(1)) if match else None


def parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        normalized = value.replace("Z", "+00:00")
        parsed = datetime.fromisoformat(normalized)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except ValueError:
        return None


def map_missing_terms(text: str, terms: list[str]) -> list[str]:
    return [term for term in terms if term not in text]


def check_estate(
    doctor: Doctor,
    supplied_payload: dict[str, Any] | None,
    *,
    include_estate: bool,
    progress: bool,
) -> dict[str, Any] | None:
    payload = supplied_payload
    if payload is None and include_estate:
        if progress:
            print("→ Estate: running exhaustive read-only audit...", flush=True)
        payload = aoe2_audit.collect_audit().payload()

    if payload is None:
        doctor.info["estate"] = {"included": False}
        return None

    doctor.info["estate"] = payload
    p0 = int(payload.get("p0") or 0)
    p1 = int(payload.get("p1") or 0)
    if p0:
        doctor.add(
            "BLOCKER",
            "Estate",
            "estate-p0",
            f"estate audit reports P0={p0}",
            min(30, 12 + p0 * 4),
        )
    if p1:
        doctor.add(
            "WARN",
            "Estate",
            "estate-p1",
            f"estate audit reports P1={p1}",
            min(10, p1 * 2),
        )
    return payload


def check_contract(doctor: Doctor, contract: dict[str, Any]) -> None:
    canonical = contract.get("canonical")
    protected = contract.get("protected")
    toolchain = contract.get("toolchain")
    if not isinstance(canonical, dict):
        doctor.add(
            "BLOCKER",
            "Architecture",
            "contract-canonical",
            "operations contract has no canonical authority block",
            8,
        )
    if not isinstance(protected, dict):
        doctor.add(
            "BLOCKER",
            "Architecture",
            "contract-protected",
            "operations contract has no protected-services block",
            8,
        )
    if not isinstance(toolchain, dict):
        doctor.add(
            "BLOCKER",
            "Toolchain",
            "contract-toolchain",
            "operations contract has no toolchain block",
            5,
        )
    doctor.info["operations_contract"] = {
        "path": str(CONTRACT_PATH),
        "schema": contract.get("schema"),
    }


def check_toolchain(doctor: Doctor, contract: dict[str, Any]) -> None:
    expected = contract.get("toolchain", {})
    results: dict[str, Any] = {}

    for label, command in (
        ("node", ["node", "--version"]),
        ("python", ["python3", "--version"]),
        ("yarn", ["yarn", "--version"]),
    ):
        rc, output = run(command, timeout=15)
        results[label] = {"rc": rc, "version": output.strip()}
        if rc != 0:
            doctor.add(
                "WARN",
                "Toolchain",
                f"{label}-missing",
                f"{label} is unavailable on the operator machine: {output}",
                2,
            )

    node_expected = str(expected.get("node_major") or "")
    allowed_operator_majors = {
        str(value)
        for value in expected.get("operator_node_majors", [])
        if str(value).isdigit()
    }
    if not allowed_operator_majors and node_expected:
        allowed_operator_majors.add(node_expected)
    operator_node = (
        semver_core(results["node"]["version"])
        if results.get("node", {}).get("rc") == 0
        else None
    )
    if node_expected:
        operator_major = operator_node.split(".", 1)[0] if operator_node else None
        if not operator_major or operator_major not in allowed_operator_majors:
            doctor.add(
                "WARN",
                "Toolchain",
                "node-version",
                f"operator Node={operator_node or 'unknown'} allowed majors="
                f"{sorted(allowed_operator_majors)}; canonical build/production "
                f"major={node_expected}",
                2,
            )
    else:
        doctor.add(
            "WARN",
            "Toolchain",
            "node-major-unpinned",
            "Node major is not yet explicitly pinned in the operations contract; "
            "doctor currently requires Mac/VPS major parity",
            1,
        )

    python_expected = str(expected.get("python_major_minor") or "")
    if python_expected and results.get("python", {}).get("rc") == 0:
        if not version_prefix_matches(results["python"]["version"], python_expected):
            doctor.add(
                "WARN",
                "Toolchain",
                "python-version",
                f"operator Python={results['python']['version']} "
                f"expected {python_expected}.x",
                1,
            )

    yarn_expected = str(expected.get("yarn") or "")
    if yarn_expected and results.get("yarn", {}).get("rc") == 0:
        actual = semver_core(results["yarn"]["version"])
        if actual != yarn_expected:
            doctor.add(
                "WARN",
                "Toolchain",
                "yarn-version",
                f"operator Yarn={actual or 'unknown'} expected {yarn_expected}",
                1,
            )

    try:
        package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    except Exception as exc:
        doctor.add(
            "BLOCKER",
            "Toolchain",
            "package-json",
            f"cannot load package.json: {exc}",
            5,
        )
        package = {}

    dependencies = package.get("dependencies", {})
    dev_dependencies = package.get("devDependencies", {})
    next_actual = dependency_core(dependencies.get("next"))
    prisma_actual = dependency_core(
        dev_dependencies.get("prisma") or dependencies.get("@prisma/client")
    )
    next_expected = str(expected.get("next") or "")
    prisma_expected = str(expected.get("prisma") or "")

    if next_expected and next_actual != next_expected:
        doctor.add(
            "WARN",
            "Toolchain",
            "next-contract",
            f"package Next={next_actual or 'unknown'} contract={next_expected}",
            1,
        )
    if prisma_expected and prisma_actual != prisma_expected:
        doctor.add(
            "WARN",
            "Toolchain",
            "prisma-contract",
            f"package Prisma={prisma_actual or 'unknown'} contract={prisma_expected}",
            1,
        )

    engines = package.get("engines", {}) if isinstance(package, dict) else {}
    node_engine = str(engines.get("node") or "") if isinstance(engines, dict) else ""
    if node_expected and node_expected not in node_engine:
        doctor.add(
            "WARN",
            "Toolchain",
            "package-node-engine",
            f"package.json Node engine={node_engine or 'missing'} does not expose "
            f"canonical major {node_expected}",
            1,
        )

    canonical = contract.get("canonical", {})
    host = str(canonical.get("production_host") or "hel1")
    rc, remote_node = ssh(host, "node --version 2>/dev/null || true")
    remote_core = semver_core(remote_node)
    results["production_node"] = {"rc": rc, "version": remote_node.strip()}
    if node_expected and (
        rc != 0
        or remote_core is None
        or remote_core.split(".", 1)[0] != node_expected
    ):
        doctor.add(
            "WARN",
            "Toolchain",
            "production-node-version",
            f"production Node={remote_core or 'unavailable'} "
            f"expected major={node_expected}",
            2,
        )
    elif (
        not node_expected
        and operator_node is not None
        and remote_core is not None
        and operator_node.split(".", 1)[0] != remote_core.split(".", 1)[0]
    ):
        doctor.add(
            "WARN",
            "Toolchain",
            "node-major-parity",
            f"operator Node={operator_node} production Node={remote_core}; "
            "major versions differ",
            2,
        )

    doctor.info["toolchain"] = results


def host_snapshot(contract: dict[str, Any]) -> dict[str, Any]:
    canonical = contract["canonical"]
    host = str(canonical.get("production_host") or "hel1")
    service = str(canonical["service"])
    volume = str(canonical["volume_mount"])
    envfile = str(canonical["bridge_env_file"])
    dropin = str(canonical["bridge_systemd_dropin"])
    store = str(canonical["control_store"])

    script = f"""
set +e
root_line="$(df -Pk / 2>/dev/null | awk 'NR==2 {{print $2" "$3" "$4" "$5}}')"
volume_line="$(df -Pk {shlex.quote(volume)} 2>/dev/null | awk 'NR==2 {{print $2" "$3" "$4" "$5}}')"
updates="$(apt list --upgradable 2>/dev/null | tail -n +2 | sed '/^[[:space:]]*$/d' | wc -l | tr -d ' ')"
failed="$(systemctl --failed --no-legend --plain 2>/dev/null | sed '/^[[:space:]]*$/d' | wc -l | tr -d ' ')"
reboot=0
test -e /var/run/reboot-required && reboot=1
envfile_exists=0
test -e {shlex.quote(envfile)} && envfile_exists=1
dropin_exists=0
test -e {shlex.quote(dropin)} && dropin_exists=1
store_exists=0
test -d {shlex.quote(store)} && store_exists=1
runtime_token=0
pid="$(systemctl show {shlex.quote(service)} -p MainPID --value 2>/dev/null)"
if [ -n "$pid" ] && [ "$pid" != "0" ] && [ -r "/proc/$pid/environ" ]; then
  tr '\\0' '\\n' < "/proc/$pid/environ" | cut -d= -f1 | grep -qx AOE2WAR_OS_BRIDGE_TOKEN && runtime_token=1
fi
effective_envfile=0
if systemctl cat {shlex.quote(service)} 2>/dev/null | grep -Fqx -- {shlex.quote('EnvironmentFile=' + envfile)}; then
  effective_envfile=1
elif systemctl cat {shlex.quote(service)} 2>/dev/null | grep -Fqx -- {shlex.quote('EnvironmentFile=-' + envfile)}; then
  effective_envfile=1
fi
printf 'service\\t%s\\n' "$(systemctl is-active {shlex.quote(service)} 2>/dev/null)"
printf 'root\\t%s\\n' "$root_line"
printf 'volume\\t%s\\n' "$volume_line"
printf 'updates\\t%s\\n' "$updates"
printf 'failed_units\\t%s\\n' "$failed"
printf 'reboot_required\\t%s\\n' "$reboot"
printf 'envfile_exists\\t%s\\n' "$envfile_exists"
printf 'dropin_exists\\t%s\\n' "$dropin_exists"
printf 'store_exists\\t%s\\n' "$store_exists"
printf 'runtime_token\\t%s\\n' "$runtime_token"
printf 'effective_envfile\\t%s\\n' "$effective_envfile"
printf 'environment_files\\t%s\\n' "$(systemctl show {shlex.quote(service)} -p EnvironmentFiles --value 2>/dev/null)"
printf 'store_meta\\t%s\\n' "$(stat -c '%U:%G:%a' {shlex.quote(store)} 2>/dev/null)"
""".strip()

    rc, output = ssh(host, script, timeout=30)
    result: dict[str, Any] = {"rc": rc}
    if rc != 0:
        result["error"] = output
        return result

    for line in output.splitlines():
        if "\t" not in line:
            continue
        key, value = line.split("\t", 1)
        result[key] = value.strip()
    return result


def parse_df_line(value: str | None) -> dict[str, int | None]:
    parts = (value or "").split()
    if len(parts) != 4:
        return {"total_kb": None, "used_kb": None, "free_kb": None, "used_percent": None}
    try:
        return {
            "total_kb": int(parts[0]),
            "used_kb": int(parts[1]),
            "free_kb": int(parts[2]),
            "used_percent": parse_percent(parts[3]),
        }
    except ValueError:
        return {"total_kb": None, "used_kb": None, "free_kb": None, "used_percent": None}


def check_host_and_server_bridge(
    doctor: Doctor,
    contract: dict[str, Any],
) -> None:
    snap = host_snapshot(contract)
    doctor.info["host"] = snap
    if snap.get("rc") != 0:
        doctor.add(
            "BLOCKER",
            "Host",
            "host-unreachable",
            str(snap.get("error") or "production host inspection failed"),
            15,
        )
        return

    if snap.get("service") != "active":
        doctor.add(
            "BLOCKER",
            "Production",
            "web-service",
            f"service state={snap.get('service')!r}",
            15,
        )

    if snap.get("envfile_exists") != "1":
        doctor.add(
            "WARN",
            "Operator Bridge",
            "bridge-envfile",
            "dedicated server bridge EnvironmentFile is missing",
            3,
        )
    if snap.get("dropin_exists") != "1":
        doctor.add(
            "WARN",
            "Operator Bridge",
            "bridge-dropin",
            "dedicated server bridge systemd drop-in is missing",
            3,
        )
    if snap.get("store_exists") != "1":
        doctor.add(
            "WARN",
            "Operator Bridge",
            "control-store",
            "AoE2WAR OS control store is missing",
            3,
        )
    if snap.get("runtime_token") != "1":
        doctor.add(
            "WARN",
            "Operator Bridge",
            "runtime-token",
            "web runtime does not expose the bridge token variable by name",
            2,
        )

    canonical = contract["canonical"]
    expected_env = str(canonical["bridge_env_file"])
    if snap.get("effective_envfile") != "1":
        doctor.add(
            "WARN",
            "Operator Bridge",
            "environment-authority",
            f"effective merged systemd unit does not include {expected_env}",
            1,
        )

    if snap.get("store_meta") not in {"tony:tony:750", "tony:tony:0750"}:
        doctor.add(
            "WARN",
            "Operator Bridge",
            "control-store-mode",
            f"control store metadata={snap.get('store_meta') or 'unavailable'} "
            "expected tony:tony:750",
            1,
        )

    root = parse_df_line(str(snap.get("root") or ""))
    volume = parse_df_line(str(snap.get("volume") or ""))
    doctor.info["capacity"] = {"root": root, "volume": volume}

    capacity = contract.get("capacity", {})
    root_free_warn_gib = float(capacity.get("root_free_warn_gib") or 5.0)
    root_free_kb = root.get("free_kb")
    if isinstance(root_free_kb, int) and root_free_kb < root_free_warn_gib * 1024 * 1024:
        doctor.add(
            "WARN",
            "Host",
            "root-capacity",
            f"root free={root_free_kb / 1024 / 1024:.1f} GiB "
            f"below {root_free_warn_gib:.1f} GiB warning floor",
            2,
        )

    volume_warn = int(capacity.get("volume_used_warn_percent") or 85)
    volume_critical = int(capacity.get("volume_used_critical_percent") or 92)
    volume_used = volume.get("used_percent")
    if isinstance(volume_used, int) and volume_used >= volume_critical:
        doctor.add(
            "BLOCKER",
            "Disaster Recovery",
            "volume-capacity-critical",
            f"mounted evidence volume is {volume_used}% used",
            8,
        )
    elif isinstance(volume_used, int) and volume_used >= volume_warn:
        doctor.add(
            "WARN",
            "Disaster Recovery",
            "volume-capacity",
            f"mounted evidence volume is {volume_used}% used; "
            "off-host retention is now high ROI",
            2,
        )

    if snap.get("reboot_required") == "1":
        doctor.add(
            "WARN",
            "Host",
            "reboot-required",
            "production host reports that a system restart is required",
            1,
        )

    try:
        updates = int(str(snap.get("updates") or "0"))
    except ValueError:
        updates = 0
    if updates:
        doctor.add(
            "WARN",
            "Host",
            "updates-pending",
            f"{updates} apt package update(s) are available",
            0,
        )

    try:
        failed_units = int(str(snap.get("failed_units") or "0"))
    except ValueError:
        failed_units = 0
    if failed_units:
        doctor.add(
            "WARN",
            "Host",
            "failed-units",
            f"{failed_units} systemd unit(s) are failed",
            2,
        )


def check_local_bridge(doctor: Doctor, contract: dict[str, Any]) -> None:
    canonical = contract["canonical"]
    token = Path(os.path.expanduser(str(canonical["bridge_token_file"])))
    plist = Path(os.path.expanduser(str(canonical["bridge_launchagent"])))
    result: dict[str, Any] = {
        "token_file": str(token),
        "launchagent": str(plist),
    }

    if not token.is_file():
        doctor.add(
            "WARN",
            "Operator Bridge",
            "local-token",
            f"bridge token file is missing: {token}",
            3,
        )
    else:
        mode = stat.S_IMODE(token.stat().st_mode)
        result["token_mode"] = oct(mode)
        if mode != 0o600:
            doctor.add(
                "WARN",
                "Operator Bridge",
                "local-token-mode",
                f"bridge token mode={oct(mode)} expected 0o600",
                2,
            )

    if not plist.is_file():
        doctor.add(
            "WARN",
            "Operator Bridge",
            "launchagent-missing",
            f"persistent Operator Bridge LaunchAgent is missing: {plist}",
            3,
        )
    elif sys.platform == "darwin":
        label = str(canonical["bridge_launchagent_label"])
        target = f"gui/{os.getuid()}/{label}"
        rc, output = run(["launchctl", "print", target], timeout=15)
        result["launchctl_rc"] = rc
        if rc != 0 or "state = running" not in output:
            doctor.add(
                "WARN",
                "Operator Bridge",
                "launchagent-state",
                f"{label} is not confirmed running",
                3,
            )

    host = str(canonical.get("production_host") or "hel1")
    state_path = str(canonical["control_store"]).rstrip("/") + "/state/bridge.json"
    rc, output = ssh(host, f"cat {shlex.quote(state_path)} 2>/dev/null || true")
    if rc == 0 and output.strip():
        try:
            state = json.loads(output)
            result["remote_state"] = state
            bridge_policy = contract.get("operator_bridge", {})
            minimum_version = str(bridge_policy.get("minimum_version") or "")
            actual_version = semver_core(str(state.get("version") or ""))
            if minimum_version and not version_at_least(
                actual_version,
                minimum_version,
            ):
                doctor.add(
                    "WARN",
                    "Operator Bridge",
                    "bridge-version",
                    f"running Operator Bridge={actual_version or 'unknown'} "
                    f"expected {minimum_version}",
                    2,
                )
            capabilities = {
                str(value)
                for value in state.get("capabilities", [])
                if isinstance(value, str)
            }
            required_capabilities = {
                str(value)
                for value in bridge_policy.get("required_capabilities", [])
                if isinstance(value, str)
            }
            missing_capabilities = sorted(required_capabilities - capabilities)
            if missing_capabilities:
                doctor.add(
                    "WARN",
                    "Operator Bridge",
                    "bridge-capabilities",
                    f"running Operator Bridge is missing fixed capabilities: "
                    f"{missing_capabilities}",
                    2,
                )
            seen = parse_iso(str(state.get("lastSeenAt") or ""))
            if seen is None:
                raise ValueError("lastSeenAt unavailable")
            age = max(
                0.0,
                (datetime.now(timezone.utc) - seen).total_seconds(),
            )
            result["heartbeat_age_seconds"] = round(age, 1)
            threshold = int(
                contract.get("operator_bridge", {}).get(
                    "online_threshold_seconds", 45
                )
            )
            if age > threshold:
                doctor.add(
                    "WARN",
                    "Operator Bridge",
                    "heartbeat-stale",
                    f"Operator Bridge heartbeat is {age:.0f}s old "
                    f"(threshold {threshold}s)",
                    3,
                )
        except Exception as exc:
            doctor.add(
                "WARN",
                "Operator Bridge",
                "bridge-state",
                f"cannot parse bridge heartbeat state: {exc}",
                2,
            )
    else:
        doctor.add(
            "WARN",
            "Operator Bridge",
            "bridge-state-missing",
            "no durable Operator Bridge heartbeat state is readable",
            3,
        )

    doctor.info["operator_bridge"] = result


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def maintenance_safety_problems(
    policy: dict[str, Any],
    snapshot: dict[str, Any],
) -> list[str]:
    problems: list[str] = []

    expected_text = {
        "node_service": str(policy.get("wolo_service") or ""),
        "service_state": "active",
        "systemd_oom": str(policy.get("wolo_oom_score_adjust")),
        "live_oom": str(policy.get("wolo_oom_score_adjust")),
    }
    for key, expected in expected_text.items():
        actual = str(snapshot.get(key) or "")
        if actual != expected:
            problems.append(f"{key}={actual!r} expected {expected!r}")

    if snapshot.get("runner_sha") != snapshot.get("runner_source_sha"):
        problems.append("installed maintenance runner does not match source authority")
    if snapshot.get("dropin_sha") != snapshot.get("dropin_source_sha"):
        problems.append("installed Wolo OOM drop-in does not match source authority")
    if snapshot.get("runner_mode") != "755":
        problems.append(
            f"maintenance runner mode={snapshot.get('runner_mode')!r} expected '755'"
        )
    if snapshot.get("dropin_mode") != "644":
        problems.append(
            f"Wolo OOM drop-in mode={snapshot.get('dropin_mode')!r} expected '644'"
        )

    return problems


def check_maintenance_safety(
    doctor: Doctor,
    contract: dict[str, Any],
) -> None:
    policy = contract.get("maintenance_safety")
    if not isinstance(policy, dict):
        doctor.add(
            "WARN",
            "Host",
            "maintenance-safety-contract",
            "operations contract has no maintenance_safety block",
            3,
        )
        return

    required = {
        "wolo_service": "wolochaind-mainnet.service",
        "wolo_rpc_status_url": "http://127.0.0.1:27657/status",
        "wolo_oom_score_adjust": -900,
        "runner_source": "scripts/aoe2_maintenance_run.sh",
        "runner_installed": "/usr/local/sbin/aoe2war-maintenance-run",
        "wolo_dropin_source": (
            "ops/systemd/wolochaind-mainnet.service.d/20-oom-protection.conf"
        ),
        "wolo_dropin_installed": (
            "/etc/systemd/system/wolochaind-mainnet.service.d/"
            "20-oom-protection.conf"
        ),
        "maintenance_oom_score_adjust": 800,
        "memory_high_mib": 256,
        "memory_max_mib": 384,
        "memory_swap_max_mib": 128,
        "cpu_quota_percent": 20,
        "io_weight": 1,
        "minimum_mem_available_mib": 2048,
        "emergency_mem_available_mib": 1024,
        "max_block_age_seconds": 20,
        "max_no_progress_seconds": 15,
        "policy": "maintenance-dies-before-sole-validator",
    }

    bad_contract = [
        f"{key}={policy.get(key)!r} expected {value!r}"
        for key, value in required.items()
        if policy.get(key) != value
    ]
    if bad_contract:
        doctor.add(
            "WARN",
            "Host",
            "maintenance-safety-contract",
            "maintenance safety contract drift: " + "; ".join(bad_contract),
            3,
        )
        doctor.info["maintenance_safety"] = {
            "policy": policy,
            "contract_problems": bad_contract,
        }
        return

    runner_source = ROOT / str(policy["runner_source"])
    dropin_source = ROOT / str(policy["wolo_dropin_source"])

    source_problems: list[str] = []
    if not runner_source.is_file():
        source_problems.append(f"missing source runner {runner_source}")
    if not dropin_source.is_file():
        source_problems.append(f"missing source Wolo drop-in {dropin_source}")

    if source_problems:
        doctor.add(
            "WARN",
            "Host",
            "maintenance-safety-source",
            "; ".join(source_problems),
            3,
        )
        doctor.info["maintenance_safety"] = {
            "policy": policy,
            "source_problems": source_problems,
        }
        return

    runner_source_sha = _sha256_file(runner_source)
    dropin_source_sha = _sha256_file(dropin_source)

    host = str(contract.get("canonical", {}).get("production_host") or "hel1")
    service = str(policy["wolo_service"])
    runner = str(policy["runner_installed"])
    dropin = str(policy["wolo_dropin_installed"])

    remote_script = f"""
set -euo pipefail
pid="$(systemctl show {shlex.quote(service)} -p MainPID --value)"
printf 'node_service\\t%s\\n' {shlex.quote(service)}
printf 'service_state\\t%s\\n' "$(systemctl is-active {shlex.quote(service)})"
printf 'systemd_oom\\t%s\\n' "$(systemctl show {shlex.quote(service)} -p OOMScoreAdjust --value)"
printf 'live_oom\\t%s\\n' "$(cat "/proc/$pid/oom_score_adj" 2>/dev/null || true)"
printf 'runner_sha\\t%s\\n' "$(sha256sum {shlex.quote(runner)} 2>/dev/null | awk '{{print $1}}')"
printf 'dropin_sha\\t%s\\n' "$(sha256sum {shlex.quote(dropin)} 2>/dev/null | awk '{{print $1}}')"
printf 'runner_mode\\t%s\\n' "$(stat -c '%a' {shlex.quote(runner)} 2>/dev/null)"
printf 'dropin_mode\\t%s\\n' "$(stat -c '%a' {shlex.quote(dropin)} 2>/dev/null)"
""".strip()

    rc, output = ssh(host, remote_script, timeout=20)
    snapshot: dict[str, Any] = {
        "rc": rc,
        "runner_source_sha": runner_source_sha,
        "dropin_source_sha": dropin_source_sha,
    }
    for line in output.splitlines():
        if "\t" in line:
            key, value = line.split("\t", 1)
            snapshot[key] = value.strip()

    if rc != 0:
        doctor.add(
            "WARN",
            "Host",
            "maintenance-safety-proof",
            "cannot inspect live Wolo/maintenance safety rails",
            3,
        )
        snapshot["error"] = output
        doctor.info["maintenance_safety"] = snapshot
        return

    problems = maintenance_safety_problems(policy, snapshot)
    snapshot["problems"] = problems
    doctor.info["maintenance_safety"] = snapshot

    if problems:
        doctor.add(
            "WARN",
            "Host",
            "maintenance-safety-drift",
            "; ".join(problems),
            3,
        )


def check_architecture(
    doctor: Doctor,
    contract: dict[str, Any],
    release_data: dict[str, Any],
) -> None:
    semantics = contract.get("semantic_maps", {})
    required_terms = [
        str(value)
        for value in semantics.get("required_terms", [])
        if isinstance(value, str)
    ]

    map_results: dict[str, Any] = {}
    production = release_data.get("production", {})
    prod_sha = str(production.get("source_sha") or "")

    for name in ("SYSTEM_MAP.md", "SERVER_STORAGE_MAP.md"):
        authoritative = VPSSENTRY / "context" / name
        result: dict[str, Any] = {"path": str(authoritative)}
        if not authoritative.is_file():
            doctor.add(
                "BLOCKER",
                "Architecture",
                "semantic-map-missing",
                f"authoritative map is missing: {authoritative}",
                6,
            )
            map_results[name] = result
            continue

        text = authoritative.read_text(encoding="utf-8", errors="replace")
        missing = map_missing_terms(text, required_terms)
        result["missing_terms"] = missing
        if missing:
            doctor.add(
                "WARN",
                "Architecture",
                "semantic-map-incomplete",
                f"{name} is byte-consistent but omits current operating "
                f"surfaces: {missing}",
                2,
            )

        leading = "\n".join(text.splitlines()[:180])
        if prod_sha and re.search(r"\b(?:production|certified) (?:release|source)", leading):
            if prod_sha not in leading:
                doctor.add(
                    "WARN",
                    "Architecture",
                    "semantic-map-runtime-stale",
                    f"{name} presents a current runtime seal but does not "
                    f"contain active production source {prod_sha[:10]}",
                    1,
                )
        map_results[name] = result

    legacy = contract.get("legacy_deployment_artifacts", {})
    for relative, policy in legacy.items() if isinstance(legacy, dict) else []:
        candidate = ROOT / str(relative)
        if policy == "must-be-absent" and candidate.exists():
            doctor.add(
                "WARN",
                "Architecture",
                "legacy-deployment-artifact",
                f"retired deployment artifact reappeared: {relative}",
                2,
            )

    ecosystem = ROOT / "ecosystem.config.js"
    if ecosystem.is_file():
        text = ecosystem.read_text(encoding="utf-8", errors="replace")
        if "/var/www/app-prodn" in text or "-p 3004" in text:
            doctor.add(
                "WARN",
                "Architecture",
                "legacy-pm2-config",
                "ecosystem.config.js still describes obsolete PM2 path/port "
                "instead of canonical systemd production",
                1,
            )

    dockerfile = ROOT / "Dockerfile"
    package = ROOT / "package.json"
    if dockerfile.is_file() and package.is_file():
        docker_text = dockerfile.read_text(encoding="utf-8", errors="replace")
        try:
            package_payload = json.loads(package.read_text(encoding="utf-8"))
        except Exception:
            package_payload = {}
        manager = str(package_payload.get("packageManager") or "")
        if manager.startswith("yarn@") and "npm ci" in docker_text:
            doctor.add(
                "WARN",
                "Architecture",
                "docker-package-manager",
                "Dockerfile uses npm ci while package.json declares Yarn; "
                "classify or retire this non-canonical deployment artifact",
                1,
            )

    doctor.info["semantic_maps"] = map_results


def check_disaster_recovery(doctor: Doctor, contract: dict[str, Any]) -> None:
    offsite = contract.get("offsite_evidence", {})
    enabled = bool(offsite.get("enabled"))
    doctor.info["offsite_evidence"] = offsite
    if not enabled:
        doctor.add(
            "WARN",
            "Disaster Recovery",
            "offsite-evidence",
            "encrypted off-host production evidence/restore proof is not yet "
            "configured; VPS root and mounted volume still share a failure domain",
            3,
        )


def check_replay_api(doctor: Doctor, contract: dict[str, Any]) -> None:
    component = contract.get("components", {}).get("replay_api", {})
    if not isinstance(component, dict):
        doctor.add(
            "BLOCKER",
            "Architecture",
            "api-contract",
            "operations contract has no replay_api component",
            5,
        )
        return

    local_repo = (ROOT / str(component.get("local_repo") or "")).resolve()
    expected_local = (ROOT.parent / "api-prodn").resolve()
    remote_repo = str(component.get("production_repo") or "")
    service = str(component.get("service") or "")
    branch = str(component.get("branch") or "main")
    health_url = str(component.get("health_url") or "")
    host = str(contract.get("canonical", {}).get("production_host") or "hel1")
    result: dict[str, Any] = {
        "local_repo": str(local_repo),
        "production_repo": remote_repo,
        "release_automation": component.get("release_automation"),
    }

    if local_repo != expected_local or not local_repo.is_dir():
        doctor.add(
            "BLOCKER",
            "Architecture",
            "api-local-repo",
            f"replay API local authority is unavailable or non-canonical: {local_repo}",
            6,
        )
        doctor.info["replay_api"] = result
        return

    commands = {
        "head": ["git", "rev-parse", "HEAD"],
        "branch": ["git", "branch", "--show-current"],
        "dirty": ["git", "status", "--porcelain", "--untracked-files=all"],
        "origin": [
            "git",
            "ls-remote",
            "--exit-code",
            "origin",
            f"refs/heads/{branch}",
        ],
        "migration_head": [str(local_repo / ".venv" / "bin" / "alembic"), "heads"],
    }
    for key, command in commands.items():
        rc, output = run(command, cwd=local_repo, timeout=30)
        result[key] = output.strip()
        result[key + "_rc"] = rc

    local_head = result.get("head") if result.get("head_rc") == 0 else None
    origin_output = str(result.get("origin") or "")
    origin_head = origin_output.split()[0] if origin_output else None
    local_migration = str(result.get("migration_head") or "").split()[0] or None

    remote_script = f"""
set +e
cd {shlex.quote(remote_repo)} || exit 10
printf 'head\\t%s\\n' "$(git rev-parse HEAD 2>/dev/null)"
printf 'branch\\t%s\\n' "$(git branch --show-current 2>/dev/null)"
printf 'dirty\\t%s\\n' "$(git status --porcelain --untracked-files=all 2>/dev/null | wc -l | tr -d ' ')"
printf 'service\\t%s\\n' "$(systemctl is-active {shlex.quote(service)} 2>/dev/null)"
printf 'port_count\\t%s\\n' "$(ss -ltnH sport = :3330 2>/dev/null | wc -l | tr -d ' ')"
printf 'health\\t%s\\n' "$(curl -fsS --max-time 5 {shlex.quote(health_url)} 2>/dev/null)"
printf 'migration_current\\t%s\\n' "$(venv/bin/alembic current 2>/dev/null | tail -n 1 | awk '{{print $1}}')"
""".strip()
    remote_rc, remote_output = ssh(host, remote_script, timeout=45)
    remote: dict[str, str] = {}
    for line in remote_output.splitlines():
        if "\t" in line:
            key, value = line.split("\t", 1)
            remote[key] = value.strip()
    remote["rc"] = str(remote_rc)
    result["production"] = remote

    problems: list[str] = []
    if result.get("branch") != branch:
        problems.append(f"local branch={result.get('branch')!r}")
    if str(result.get("dirty") or "").strip():
        problems.append("local worktree is dirty")
    if not local_head or local_head != origin_head:
        problems.append(
            f"local/origin mismatch local={str(local_head)[:10]} origin={str(origin_head)[:10]}"
        )
    if remote_rc != 0:
        problems.append("production inspection failed")
    if remote.get("head") != local_head:
        problems.append(
            f"production source={str(remote.get('head'))[:10]} local={str(local_head)[:10]}"
        )
    if remote.get("branch") != branch:
        problems.append(f"production branch={remote.get('branch')!r}")
    if remote.get("dirty") != "0":
        problems.append(f"production dirty_count={remote.get('dirty')!r}")
    if remote.get("service") != "active":
        problems.append(f"service={remote.get('service')!r}")
    if remote.get("port_count") != "1":
        problems.append(f"port 3330 listeners={remote.get('port_count')!r}")
    try:
        health = json.loads(remote.get("health") or "")
    except json.JSONDecodeError:
        health = None
    if not isinstance(health, dict) or health.get("status") != "ok":
        problems.append("health endpoint did not return status=ok")
    if not local_migration or remote.get("migration_current") != local_migration:
        problems.append(
            f"migration current={remote.get('migration_current')!r} "
            f"source head={local_migration!r}"
        )

    if problems:
        doctor.add(
            "BLOCKER",
            "Production",
            "replay-api-proof",
            "replay API is not exact: " + "; ".join(problems),
            10,
        )
    doctor.info["replay_api"] = result


def check_production_summary(
    doctor: Doctor,
    data: dict[str, Any],
) -> None:
    doctor.info["release"] = data
    production = data.get("production", {})
    certification = data.get("certification", {})

    if not production.get("reachable"):
        doctor.add(
            "BLOCKER",
            "Production",
            "production-unreachable",
            str(production.get("error") or "production is unreachable"),
            15,
        )
        return
    if production.get("service") != "active":
        doctor.add(
            "BLOCKER",
            "Production",
            "service-not-active",
            f"service={production.get('service')!r}",
            10,
        )
    if not production.get("version_parity"):
        doctor.add(
            "BLOCKER",
            "Production",
            "version-parity",
            "internal/public deployment version parity is false",
            8,
        )
    if certification.get("status") != "CERTIFIED":
        doctor.add(
            "BLOCKER",
            "Production",
            "certification",
            f"runtime provenance={certification.get('status')!r}",
            10,
        )
    if production.get("wolo_8092_count") != 1:
        doctor.add(
            "BLOCKER",
            "Production",
            "wolo-8092",
            f"protected listener 8092 count={production.get('wolo_8092_count')}",
            10,
        )
    if production.get("wolo_8093_count") != 1:
        doctor.add(
            "BLOCKER",
            "Production",
            "wolo-8093",
            f"protected listener 8093 count={production.get('wolo_8093_count')}",
            10,
        )


def collect_doctor(
    *,
    estate_payload: dict[str, Any] | None = None,
    include_estate: bool = True,
    progress: bool = False,
) -> Doctor:
    doctor = Doctor()
    try:
        contract = load_contract()
    except Exception as exc:
        doctor.add(
            "BLOCKER",
            "Architecture",
            "operations-contract",
            str(exc),
            15,
        )
        return doctor

    check_contract(doctor, contract)
    check_estate(
        doctor,
        estate_payload,
        include_estate=include_estate,
        progress=progress,
    )

    if progress:
        print("→ Production: verifying certified runtime and Wolo boundary...", flush=True)
    release_data = aoe2_release.collect()
    check_production_summary(doctor, release_data)
    check_replay_api(doctor, contract)

    if progress:
        print("→ Bridge: verifying Mac LaunchAgent + server control plane...", flush=True)
    check_local_bridge(doctor, contract)
    check_host_and_server_bridge(doctor, contract)
    check_maintenance_safety(doctor, contract)

    if progress:
        print("→ Toolchain: comparing operator/VPS/package contract...", flush=True)
    check_toolchain(doctor, contract)

    if progress:
        print("→ Architecture: checking semantic maps and legacy deployment seams...", flush=True)
    check_architecture(doctor, contract, release_data)

    if progress:
        print("→ Recovery: checking off-host failure-domain coverage...", flush=True)
    check_disaster_recovery(doctor, contract)

    return doctor


def print_human(doctor: Doctor) -> None:
    payload = doctor.payload()
    print("⚔️  AOE2WAR DOCTOR")
    print()
    print(f"Score:     {payload['score']}/100")
    print(f"Status:    {payload['status']}")
    print(f"Blockers:  {payload['blockers']}")
    print(f"Warnings:  {payload['warnings']}")
    print()

    for category in CATEGORIES:
        status = doctor.category_status(category)
        mark = {"PASS": "✓", "WARN": "!", "FAIL": "✗"}[status]
        print(f"{category:<20} {mark} {status}")

    if doctor.findings:
        print()
        print("Findings:")
        for finding in doctor.findings:
            impact = f" -{finding.deduction}" if finding.deduction else ""
            print(
                f"{finding.severity:<7} [{finding.category}] "
                f"{finding.key}{impact}: {finding.detail}"
            )

    print()
    if doctor.count("BLOCKER"):
        print("DOCTOR: UNSAFE — resolve blockers before trusting a release.")
    elif doctor.count("WARN"):
        print(
            "DOCTOR: ATTENTION — core release safety is intact; "
            "remaining items are upgrade/maintenance work."
        )
    else:
        print("DOCTOR: HEALTHY — no remaining operational findings.")


def main() -> int:
    parser = argparse.ArgumentParser(
        prog="aoe2war doctor",
        description=(
            "Read-only operator-grade health check beyond the estate audit: "
            "host hygiene, toolchains, bridge, capacity, architecture and DR."
        ),
    )
    parser.add_argument("--json", action="store_true")
    parser.add_argument(
        "--strict",
        action="store_true",
        help="return 1 when warnings remain; blockers always return 2",
    )
    args = parser.parse_args()

    doctor = collect_doctor(
        include_estate=True,
        progress=not args.json,
    )
    if args.json:
        print(json.dumps(doctor.payload(), indent=2, sort_keys=True))
    else:
        print_human(doctor)

    if doctor.count("BLOCKER"):
        return 2
    if args.strict and doctor.count("WARN"):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
