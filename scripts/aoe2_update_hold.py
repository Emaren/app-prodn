#!/usr/bin/env python3
"""Read-only identity proof for independent documentation/context maintenance.

This proof records an unresolved Wolo source hold. It never authorizes a release,
settlement promotion, or any mutation of the protected runtime.
"""
from __future__ import annotations

import copy
import hashlib
import json
import re
import shlex
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

WOLO_BRANCH = "wolo-1-mainnet-prep"
WOLO_HOST = "root@hel1"
WOLO_VPS_REPO = "/var/www/WoloChain-wolo-1"
UNITS = {
    "consensus": "wolochaind-mainnet.service",
    "settlement": "wolochain-mainnet-settlement.service",
    "founder": "wolochain-founder-rewards-settlement.service",
}
SHA = re.compile(r"[0-9a-f]{40}\Z")
DIGEST = re.compile(r"[0-9a-f]{64}\Z")


class HoldError(RuntimeError):
    pass


def _run(args: list[str], *, cwd: Path, timeout: int = 60) -> tuple[int, str]:
    try:
        result = subprocess.run(
            args, cwd=cwd, text=True, stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT, timeout=timeout, check=False,
        )
        return result.returncode, result.stdout.rstrip()
    except (OSError, subprocess.SubprocessError) as exc:
        return 127, str(exc)


def _origin_valid(value: str) -> bool:
    return isinstance(value, str) and value in {
        "https://github.com/Emaren/wolochain.git",
        "https://github.com/Emaren/wolochain",
        "git@github.com:Emaren/wolochain.git",
        "ssh://git@github.com/Emaren/wolochain.git",
    }


def _checked(run: Callable, args: list[str], repo: Path) -> str:
    rc, output = run(args, cwd=repo, timeout=90)
    if rc != 0:
        # Arbitrary Git/SSH errors can contain credential-bearing remote URLs.
        raise HoldError(f"Wolo hold evidence command failed: {args[0]}")
    return output.strip()


def _local_source(repo: Path, run: Callable) -> dict[str, Any]:
    def git(*args: str) -> str:
        return _checked(run, ["git", *args], repo)

    if Path(git("rev-parse", "--show-toplevel")).resolve() != repo.resolve():
        raise HoldError("Wolo source root identity is not exact")
    branch = git("branch", "--show-current")
    if branch != WOLO_BRANCH:
        raise HoldError("Wolo source is not on its canonical reviewed branch")
    head = git("rev-parse", "HEAD")
    if SHA.fullmatch(head) is None:
        raise HoldError("Wolo source HEAD is unresolved")
    if git("status", "--porcelain=v1", "--untracked-files=all"):
        raise HoldError("Wolo source worktree is dirty")
    if not _origin_valid(git("remote", "get-url", "origin")):
        raise HoldError("Wolo source origin identity is not canonical")
    remote = git("ls-remote", "--exit-code", "origin", f"refs/heads/{WOLO_BRANCH}")
    if remote.split() != [head, f"refs/heads/{WOLO_BRANCH}"]:
        raise HoldError("Wolo source local/remote identity is not exact")
    path = repo / "docs" / "document-registry.json"
    if path.is_symlink():
        raise HoldError("Wolo source registry must not be a symlink")
    try:
        registry_bytes = path.read_bytes()
        registry = json.loads(registry_bytes)
    except (OSError, ValueError) as exc:
        raise HoldError("Wolo source registry is unavailable or malformed") from exc
    baseline = registry.get("implementation_baseline") if isinstance(registry, dict) else None
    if (
        not isinstance(registry, dict) or registry.get("repo") != "wolochain"
        or not isinstance(baseline, dict)
        or not isinstance(baseline.get("branch"), str)
        or not baseline["branch"].strip()
        or not isinstance(baseline.get("commit"), str)
        or SHA.fullmatch(baseline["commit"]) is None
    ):
        raise HoldError("Wolo reviewed implementation baseline is invalid")
    return {
        "branch": branch, "head": head, "remote": head,
        "reviewed_baseline": baseline["commit"],
        "reviewed_baseline_branch": baseline["branch"],
        "registry_sha256": hashlib.sha256(registry_bytes).hexdigest(),
    }


# Fixed program: Git metadata, systemd properties, /proc build identities and
# socket ownership only. No environment/keyring/state reads or service actions.
REMOTE_PROGRAM = r'''
import json, re, subprocess
from datetime import datetime, timezone
from pathlib import Path
REPO = "/var/www/WoloChain-wolo-1"
UNITS = {
    "consensus": "wolochaind-mainnet.service",
    "settlement": "wolochain-mainnet-settlement.service",
    "founder": "wolochain-founder-rewards-settlement.service",
}
def checked(args):
    return subprocess.check_output(args, text=True, stderr=subprocess.DEVNULL).strip()
def source():
    def git(*args):
        return checked(["git", "-C", REPO, *args])
    return {"root": git("rev-parse", "--show-toplevel"),
            "branch": git("branch", "--show-current"),
            "head": git("rev-parse", "HEAD"),
            "dirty": bool(git("status", "--porcelain=v1", "--untracked-files=all")),
            "origin": git("remote", "get-url", "origin")}
def service(unit):
    raw = checked(["systemctl", "show", unit, "-p", "ActiveState", "-p", "MainPID",
                   "-p", "NRestarts", "-p", "ExecMainStartTimestampMonotonic"])
    return dict(line.split("=", 1) for line in raw.splitlines())
initial_source = source()
initial_services = {key: service(unit) for key, unit in UNITS.items()}
services = {}
for key, properties in initial_services.items():
    pid = properties["MainPID"]
    if not pid.isdigit() or int(pid) <= 0:
        raise RuntimeError("unresolved protected service PID")
    proc = "/proc/" + pid + "/exe"
    executable = checked(["sudo", "-n", "readlink", proc])
    digest = checked(["sudo", "-n", "sha256sum", proc]).split()[0]
    build = checked(["sudo", "-n", "/usr/local/bin/go", "version", "-m", proc])
    revision = re.findall(r"\bvcs\.revision=([0-9a-f]{40})(?:\s|$)", build)
    modified = re.findall(r"\bvcs\.modified=(true|false)(?:\s|$)", build)
    if (len(revision) != 1 or len(modified) != 1
        or (key != "consensus" and modified != ["false"])):
        raise RuntimeError("unproven protected executable build identity")
    services[key] = {"unit": UNITS[key], "active": properties["ActiveState"],
                     "pid": int(pid), "restarts": int(properties["NRestarts"]),
                     "started_monotonic": properties["ExecMainStartTimestampMonotonic"],
                     "executable": executable, "sha256": digest,
                     "revision": revision[0], "modified": modified[0] == "true"}
raw = checked(["sudo", "-n", "ss", "-H", "-ltnp"])
listeners = {}
for port in (8092, 8093):
    rows = [line for line in raw.splitlines()
            if len(line.split()) >= 5 and line.split()[3].endswith(":" + str(port))]
    listeners[str(port)] = [{"address": line.split()[3],
                             "pids": sorted({int(pid) for pid in re.findall(r"pid=(\d+)", line)})}
                            for line in rows]
for identity in services.values():
    proc = "/proc/" + str(identity["pid"]) + "/exe"
    if (checked(["sudo", "-n", "sha256sum", proc]).split()[0] != identity["sha256"]
        or checked(["sudo", "-n", "readlink", proc]) != identity["executable"]):
        raise RuntimeError("protected executable changed during observation")
if initial_source != source() or initial_services != {key: service(unit) for key, unit in UNITS.items()}:
    raise RuntimeError("protected source or services changed during observation")
print(json.dumps({"source": initial_source, "services": services, "listeners": listeners,
                  "boot_id": Path("/proc/sys/kernel/random/boot_id").read_text().strip(),
                  "observed_at": datetime.now(timezone.utc).isoformat()}, sort_keys=True))
'''


def _validate_runtime(observation: dict[str, Any], finding: dict[str, Any]) -> None:
    source = observation.get("source")
    if not isinstance(source, dict):
        raise HoldError("Wolo VPS source observation is missing")
    if (
        source.get("root") != WOLO_VPS_REPO
        or source.get("branch") != WOLO_BRANCH
        or source.get("dirty") is not False
        or not _origin_valid(source.get("origin", ""))
        or source.get("head") != finding["vps_source"]
    ):
        raise HoldError("Wolo VPS source identity is dirty, changed or noncanonical")
    if not isinstance(observation.get("boot_id"), str) or re.fullmatch(
        r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}", observation["boot_id"]
    ) is None:
        raise HoldError("Wolo host boot identity is missing")
    services = observation.get("services")
    if not isinstance(services, dict) or set(services) != set(UNITS):
        raise HoldError("Wolo protected service observation is incomplete")
    for key, unit in UNITS.items():
        item = services[key]
        if (
            not isinstance(item, dict) or item.get("unit") != unit
            or item.get("active") != "active"
            or type(item.get("pid")) is not int or item["pid"] <= 0
            or type(item.get("restarts")) is not int or item["restarts"] < 0
            or not isinstance(item.get("started_monotonic"), str)
            or not item["started_monotonic"].isdigit()
            or int(item["started_monotonic"]) <= 0
            or not isinstance(item.get("executable"), str)
            or item["executable"] != ("/usr/local/bin/wolochaind-mainnet-node-prewartrophy"
                                       if key == "consensus" else "/usr/local/bin/wolochaind-mainnet")
            or item["executable"].endswith(" (deleted)")
            or not isinstance(item.get("sha256"), str)
            or DIGEST.fullmatch(item["sha256"]) is None
            or not isinstance(item.get("revision"), str)
            or SHA.fullmatch(item["revision"]) is None
            or type(item.get("modified")) is not bool
            or (key != "consensus" and item["modified"] is not False)
        ):
            raise HoldError(f"Wolo {key} process/build evidence is unproven")
    if len({item["pid"] for item in services.values()}) != 3:
        raise HoldError("Wolo protected services do not have distinct process identities")
    consensus = services["consensus"]
    for key in ("settlement", "founder"):
        if services[key]["revision"] != source["head"]:
            raise HoldError("Wolo settlement build identity differs from its protected checkout")
        for field in ("executable", "sha256", "revision"):
            if services[key][field] == consensus[field]:
                raise HoldError("Wolo consensus and settlement identities are not separate")
    listeners = observation.get("listeners")
    if not isinstance(listeners, dict) or set(listeners) != {"8092", "8093"}:
        raise HoldError("Wolo protected listener observation is incomplete")
    for port, key in (("8092", "settlement"), ("8093", "founder")):
        if listeners[port] != [{"address": "127.0.0.1:" + port, "pids": [services[key]["pid"]]}]:
            raise HoldError(f"Wolo protected listener {port} is not exact and loopback-only")


def classify_wolo_hold(payload: dict[str, Any], local: dict[str, Any]) -> dict[str, Any]:
    """Classify only the one real, unresolved source split; never waive a P0."""
    findings = [item for item in payload.get("findings", [])
                if isinstance(item, dict) and item.get("area") == "WoloChain"
                and item.get("severity") in {"P0", "P1"}]
    if len(findings) != 1 or any(
        findings[0].get(key) != value
        for key, value in {"severity": "P1", "area": "WoloChain", "key": "vps-source-drift"}.items()
    ):
        raise HoldError("independent maintenance requires exactly the unresolved Wolo source P1")
    info = payload.get("info", {})
    vps = info.get("wolo_vps") if isinstance(info, dict) else None
    if (
        not isinstance(vps, dict)
        or not isinstance(vps.get("head"), str)
        or SHA.fullmatch(vps["head"]) is None
        or not isinstance(vps.get("expected_implementation_baseline"), str)
        or SHA.fullmatch(vps["expected_implementation_baseline"]) is None
        or vps["head"] in {local["reviewed_baseline"], vps["expected_implementation_baseline"]}
    ):
        raise HoldError("Wolo finding is stale or lacks a distinct reviewed/VPS source binding")
    expected_detail = (f"VPS={vps['head']} "
                       f"implementation_baseline={vps['expected_implementation_baseline']}")
    if findings[0].get("detail") != expected_detail:
        raise HoldError("Wolo finding detail is not bound to the observed source split")
    return {"finding": copy.deepcopy(findings[0]), "vps_source": vps["head"],
            "central_baseline": vps["expected_implementation_baseline"],
            "reviewed_baseline": local["reviewed_baseline"]}


def collect_wolo_hold(
    payload: dict[str, Any], *, wolo_repo: Path, run: Callable = _run,
) -> dict[str, Any]:
    """Collect fresh, read-only evidence for the exact unresolved financial hold."""
    repo = Path(wolo_repo).resolve()
    local = _local_source(repo, run)
    finding = classify_wolo_hold(payload, local)
    checker = repo / "scripts" / "docs_v2_check.py"
    if not checker.is_file() or checker.is_symlink():
        raise HoldError("Wolo source documentation checker is unavailable")
    _checked(run, ["python3", str(checker)], repo)
    for baseline in (local["reviewed_baseline"], finding["central_baseline"]):
        _checked(run, ["git", "merge-base", "--is-ancestor", baseline, local["head"]], repo)
    raw = _checked(run, ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=6",
                         WOLO_HOST, "python3 -c " + shlex.quote(REMOTE_PROGRAM)], repo)
    try:
        observation = json.loads(raw)
    except ValueError as exc:
        raise HoldError("Wolo runtime evidence is not valid JSON") from exc
    if not isinstance(observation, dict):
        raise HoldError("Wolo runtime evidence is not an object")
    _validate_runtime(observation, finding)
    try:
        observed = datetime.fromisoformat(observation["observed_at"])
    except (KeyError, TypeError, ValueError) as exc:
        raise HoldError("Wolo runtime observation timestamp is missing") from exc
    now = datetime.now(timezone.utc)
    # A live cross-host observation tolerates only five seconds of clock skew.
    if observed.tzinfo is None or not -5 <= (now - observed).total_seconds() <= 120:
        raise HoldError("Wolo runtime observation is stale or future-dated")
    for item in observation["services"].values():
        _checked(run, ["git", "merge-base", "--is-ancestor", item["revision"],
                       local["reviewed_baseline"]], repo)
    if local != _local_source(repo, run):
        raise HoldError("Wolo reviewed source changed during observation")
    return {"schema": 1, "kind": "independent-maintenance-wolo-hold",
            "status": "UNRESOLVED", "host": WOLO_HOST, "source": local,
            **finding, "runtime": observation, "wolo_mutated": False}


def verify_wolo_hold(
    expected: dict[str, Any], current: dict[str, Any], *,
    allow_federated_baseline: bool = False,
) -> None:
    """Reject any source, executable, process, host or listener change in flight."""
    before, after = copy.deepcopy(expected), copy.deepcopy(current)
    for item in (before, after):
        if (item.get("schema") != 1
            or item.get("kind") != "independent-maintenance-wolo-hold"
            or item.get("status") != "UNRESOLVED"
            or item.get("host") != WOLO_HOST
            or item.get("wolo_mutated") is not False
            or not isinstance(item.get("runtime"), dict)
            or not isinstance(item.get("vps_source"), str)):
            raise HoldError("Wolo hold proof is incomplete")
        _validate_runtime(item["runtime"], item)
        item["runtime"].pop("observed_at", None)
    if allow_federated_baseline and before.get("central_baseline") != after.get("central_baseline"):
        # Successful federation may advance only the central copy to the exact
        # source baseline already bound before maintenance; the hold remains.
        reviewed = before.get("reviewed_baseline")
        if (after.get("central_baseline") != reviewed
            or after.get("reviewed_baseline") != reviewed):
            raise HoldError("Wolo federated baseline advanced outside the bound source")
        before["central_baseline"] = reviewed
        before["finding"]["detail"] = (f"VPS={before['vps_source']} "
                                        f"implementation_baseline={reviewed}")
    if before != after:
        raise HoldError("Wolo hold evidence changed during independent maintenance")
