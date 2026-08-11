#!/usr/bin/env python3
from __future__ import annotations

import argparse
import fcntl
import json
import os
import re
import select
import shlex
import socket
import subprocess
import sys
import time
import urllib.request
import uuid
from contextlib import contextmanager, nullcontext
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROD_HOST = os.getenv("AOE2_RELEASE_HOST", "hel1")
PROD_REPO = os.getenv("AOE2_RELEASE_PROD_REPO", "/var/www/AoE2HDBets/app-prodn")
SERVICE = os.getenv("AOE2_RELEASE_SERVICE", "aoe2hdbets-web.service")
PUBLIC = os.getenv("AOE2_RELEASE_PUBLIC_BASE", "https://aoe2war.com")
STATE_DIR = ROOT / ".aoe2war-release"
DEPLOY_LOCK = STATE_DIR / "deploy.lock"
GLOBAL_RELEASE_LOCK = Path(
    os.getenv(
        "AOE2_RELEASE_GLOBAL_LOCK",
        "/mnt/HC_Volume_105319120/aoe2war/os-control/locks/release.lock",
    )
)
GLOBAL_LEASE_ENV = "AOE2WAR_GLOBAL_LEASE_HELD"
GLOBAL_LEASE_OWNER_ENV = "AOE2WAR_GLOBAL_LEASE_OWNER_PID"


class DeployLockBusy(RuntimeError):
    pass


def inherited_global_lease() -> bool:
    token = os.getenv(GLOBAL_LEASE_ENV, "").strip()
    owner = os.getenv(GLOBAL_LEASE_OWNER_ENV, "").strip()
    if not token or not owner.isdigit():
        return False
    owner_pid = int(owner)
    return owner_pid in {os.getpid(), os.getppid()}


@contextmanager
def local_global_release_lease(path: Path, holder: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    metadata = path.with_suffix(path.suffix + ".meta")
    with path.open("a+", encoding="utf-8") as handle:
        try:
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            try:
                detail = metadata.read_text(encoding="utf-8").strip()
            except OSError:
                detail = "holder metadata unavailable"
            raise DeployLockBusy(
                "canonical production release lease is already held: "
                + detail.replace("\n", "; ")
            ) from exc
        temporary = metadata.with_name(f".{metadata.name}.{uuid.uuid4().hex}.tmp")
        try:
            temporary.write_text(holder + "\n", encoding="utf-8")
            os.replace(temporary, metadata)
            yield
        finally:
            temporary.unlink(missing_ok=True)
            metadata.unlink(missing_ok=True)
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


@contextmanager
def remote_global_release_lease(path: Path, holder: str):
    metadata = str(path) + ".meta"
    script = f"""
set -euo pipefail
mkdir -p {shlex.quote(str(path.parent))}
exec 9>{shlex.quote(str(path))}
if ! flock -n 9; then
  printf 'BUSY\\t'
  if [ -r {shlex.quote(metadata)} ]; then
    tr '\\n' ';' < {shlex.quote(metadata)}
  else
    printf 'holder metadata unavailable'
  fi
  printf '\\n'
  exit 73
fi
umask 077
tmp={shlex.quote(metadata)}.$$.$RANDOM
printf '%s\\n' {shlex.quote(holder)} > "$tmp"
mv "$tmp" {shlex.quote(metadata)}
printf 'ACQUIRED\\n'
IFS= read -r _ || true
rm -f {shlex.quote(metadata)}
""".strip()
    process = subprocess.Popen(
        [
            "ssh",
            "-o",
            "BatchMode=yes",
            "-o",
            "ConnectTimeout=8",
            PROD_HOST,
            f"bash -lc {shlex.quote(script)}",
        ],
        cwd=ROOT,
        text=True,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    assert process.stdout is not None
    ready, _, _ = select.select([process.stdout], [], [], 15)
    if not ready:
        process.kill()
        _, error = process.communicate(timeout=5)
        raise DeployLockBusy(
            "timed out acquiring canonical production release lease: "
            + error[-1000:]
        )
    handshake = process.stdout.readline().rstrip("\n")
    if handshake != "ACQUIRED":
        try:
            _, error = process.communicate(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            _, error = process.communicate(timeout=5)
        detail = handshake.removeprefix("BUSY\t") or error or "unknown holder"
        raise DeployLockBusy(
            "canonical production release lease is already held: "
            + detail[:2000]
        )
    try:
        yield
    finally:
        if process.stdin is not None:
            try:
                process.stdin.write("release\n")
                process.stdin.flush()
                process.stdin.close()
            except BrokenPipeError:
                pass
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)


@contextmanager
def global_release_lease(path: Path = GLOBAL_RELEASE_LOCK):
    if inherited_global_lease():
        yield
        return

    token = uuid.uuid4().hex
    holder = json.dumps(
        {
            "token": token,
            "host": socket.gethostname(),
            "pid": os.getpid(),
            "started_at": time.time(),
            "command": shlex.join(sys.argv),
        },
        sort_keys=True,
    )
    prior_token = os.environ.get(GLOBAL_LEASE_ENV)
    prior_owner = os.environ.get(GLOBAL_LEASE_OWNER_ENV)
    local_production = ROOT.resolve() == Path(PROD_REPO).resolve()
    lease = (
        local_global_release_lease(path, holder)
        if local_production
        else remote_global_release_lease(path, holder)
    )
    with lease:
        os.environ[GLOBAL_LEASE_ENV] = token
        os.environ[GLOBAL_LEASE_OWNER_ENV] = str(os.getpid())
        try:
            yield
        finally:
            if prior_token is None:
                os.environ.pop(GLOBAL_LEASE_ENV, None)
            else:
                os.environ[GLOBAL_LEASE_ENV] = prior_token
            if prior_owner is None:
                os.environ.pop(GLOBAL_LEASE_OWNER_ENV, None)
            else:
                os.environ[GLOBAL_LEASE_OWNER_ENV] = prior_owner


@contextmanager
def deployment_lock(path: Path = DEPLOY_LOCK):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a+", encoding="utf-8") as handle:
        try:
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            handle.seek(0)
            holder = handle.read().strip() or "holder metadata unavailable"
            raise DeployLockBusy(
                "another mutating AoE2WAR release command already holds the deployment lock: "
                + holder.replace("\n", "; ")
            ) from exc

        handle.seek(0)
        handle.truncate()
        handle.write(f"pid={os.getpid()}\n")
        handle.write("command=" + shlex.join(sys.argv) + "\n")
        handle.flush()
        lease = global_release_lease() if path == DEPLOY_LOCK else nullcontext()
        try:
            with lease:
                yield
        finally:
            handle.seek(0)
            handle.truncate()
            handle.write("released\n")
            handle.flush()
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def run_mutating_release(action) -> int:
    try:
        with deployment_lock():
            return action()
    except DeployLockBusy as exc:
        print(f"STOP: {exc}", file=sys.stderr)
        return 2


def run(args: list[str], timeout: int = 20) -> tuple[int, str, str]:
    try:
        p = subprocess.run(
            args,
            cwd=ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout,
            check=False,
        )
        return p.returncode, p.stdout.rstrip(), p.stderr.rstrip()
    except Exception as exc:
        return 127, "", str(exc)


def git(*args: str) -> str | None:
    rc, out, _ = run(["git", *args])
    return out if rc == 0 and out else None


def dirty_status() -> list[str] | None:
    rc, out, _ = run(["git", "status", "--porcelain", "--untracked-files=all"])
    if rc != 0:
        return None
    return [line for line in out.splitlines() if line.strip()]


def dirty_paths(lines: list[str] | None) -> list[str]:
    if lines is None:
        return []
    paths: list[str] = []
    for line in lines:
        value = line[3:] if len(line) > 3 else line
        if " -> " in value:
            value = value.split(" -> ", 1)[1]
        paths.append(value)
    return paths


def github_main() -> str | None:
    rc, out, _ = run(
        ["git", "ls-remote", "--exit-code", "origin", "refs/heads/main"],
        timeout=20,
    )
    return out.split()[0] if rc == 0 and out else None


def is_ancestor(older: str | None, newer: str | None) -> bool | None:
    if not older or not newer:
        return None
    rc, _, _ = run(["git", "merge-base", "--is-ancestor", older, newer])
    if rc == 0:
        return True
    if rc == 1:
        return False
    return None


def docs_baseline() -> str | None:
    path = ROOT / "docs" / "DOCUMENTATION_CONTROL_PLANE.md"
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return None
    match = re.search(
        r"Implementation baseline:\s*`main`\s+at\s+`([0-9a-f]{40})`",
        text,
    )
    return match.group(1) if match else None


def parse_kv(text: str) -> dict[str, str]:
    result: dict[str, str] = {}
    for line in text.splitlines():
        if "\t" in line:
            key, value = line.split("\t", 1)
            result[key] = value
    return result


def production() -> tuple[dict[str, str], str | None]:
    commands = [
        "set -euo pipefail",
        f"cd {shlex.quote(PROD_REPO)}",
        "head=$(git rev-parse HEAD 2>/dev/null || true)",
        "branch=$(git branch --show-current 2>/dev/null || true)",
        "dirty=$(git status --porcelain --untracked-files=all 2>/dev/null | wc -l | tr -d \" \")",
        f"service=$(systemctl is-active {shlex.quote(SERVICE)} 2>/dev/null || true)",
        "active=$(cat .next/BUILD_ID 2>/dev/null || true)",
        "staged=$(cat .next-release/BUILD_ID 2>/dev/null || true)",
        "version=$(curl -fsS --max-time 4 http://127.0.0.1:3030/api/deployment-version 2>/dev/null || true)",
        "rollbacks=$(find . -maxdepth 1 -type d -name \".next-rollback*\" 2>/dev/null | wc -l | tr -d \" \")",
        "latest=$(ls -1dt .next-rollback* 2>/dev/null | head -n 1 || true)",
        "root_free=$(df -Pk / 2>/dev/null | awk \"NR==2 {print \\$4}\")",
        "volume_free=$(df -Pk /mnt/HC_Volume_105319120 2>/dev/null | awk \"NR==2 {print \\$4}\")",
        "wolo8092=$(ss -ltn 2>/dev/null | grep -Ec \":8092[[:space:]]\" || true)",
        "wolo8093=$(ss -ltn 2>/dev/null | grep -Ec \":8093[[:space:]]\" || true)",
        "printf \"head\\t%s\\nbranch\\t%s\\ndirty\\t%s\\nservice\\t%s\\nactive\\t%s\\nstaged\\t%s\\nversion\\t%s\\nrollbacks\\t%s\\nlatest\\t%s\\nroot_free\\t%s\\nvolume_free\\t%s\\nwolo8092\\t%s\\nwolo8093\\t%s\\n\" \"$head\" \"$branch\" \"$dirty\" \"$service\" \"$active\" \"$staged\" \"$version\" \"$rollbacks\" \"$latest\" \"$root_free\" \"$volume_free\" \"$wolo8092\" \"$wolo8093\"",
    ]
    remote = "; ".join(commands)
    rc, out, err = run(
        [
            "ssh",
            "-o",
            "BatchMode=yes",
            "-o",
            "ConnectTimeout=8",
            PROD_HOST,
            f"bash -lc {shlex.quote(remote)}",
        ],
        timeout=15,
    )
    if rc != 0:
        return {}, err or f"ssh exited {rc}"
    return parse_kv(out), None


def public_version() -> str | None:
    try:
        with urllib.request.urlopen(
            f"{PUBLIC.rstrip('/')}/api/deployment-version",
            timeout=6,
        ) as response:
            payload = json.loads(response.read().decode("utf-8"))
        value = payload.get("buildVersion")
        return str(value) if value else None
    except Exception:
        return None


def version_value(raw: str | None) -> str | None:
    if not raw:
        return None
    try:
        value = json.loads(raw).get("buildVersion")
        return str(value) if value else None
    except Exception:
        return raw


def integer(value: str | None) -> int | None:
    return int(value) if value and value.isdigit() else None


ACTIVATION_RECEIPT_DIR = STATE_DIR / "activation-receipts"


def sha256_path(path: Path) -> str | None:
    try:
        import hashlib
        h = hashlib.sha256()
        with path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                h.update(chunk)
        return h.hexdigest()
    except OSError:
        return None


def receipt_evidence_ok(relative_path: object, expected_sha: object) -> bool:
    if not isinstance(relative_path, str) or not isinstance(expected_sha, str):
        return False
    try:
        path = (ROOT / relative_path).resolve()
        path.relative_to(ROOT.resolve())
    except (OSError, ValueError):
        return False
    return path.is_file() and sha256_path(path) == expected_sha


def certified_runtime(production: dict) -> dict:
    fallback = {
        "status": "legacy-unmanifested",
        "release_sha": None,
        "receipt_path": None,
        "artifact_sha256": None,
    }
    if not production.get("reachable") or not ACTIVATION_RECEIPT_DIR.exists():
        return fallback
    try:
        paths = sorted(
            ACTIVATION_RECEIPT_DIR.glob("*.json"),
            key=lambda item: item.stat().st_mtime,
            reverse=True,
        )
    except OSError:
        return fallback
    for path in paths:
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if payload.get("schema") != 1 or payload.get("kind") != "aoe2war-activation-result":
            continue
        if payload.get("status") != "CERTIFIED" or payload.get("wolo_mutated") is not False:
            continue
        if payload.get("release_sha") != production.get("source_sha"):
            continue
        if payload.get("active_build_id") != production.get("active_build_id"):
            continue
        version = payload.get("candidate_build_version")
        if version != production.get("internal_build_version") or version != production.get("public_build_version"):
            continue
        if int(payload.get("wolo_8092_count") or 0) != int(production.get("wolo_8092_count") or 0):
            continue
        if int(payload.get("wolo_8093_count") or 0) != int(production.get("wolo_8093_count") or 0):
            continue
        evidence = (
            ("stage_receipt_path", "stage_receipt_sha256"),
            ("manifest_path", "manifest_sha256"),
            ("gate_path", "gate_sha256"),
        )
        if not all(receipt_evidence_ok(payload.get(p), payload.get(s)) for p, s in evidence):
            continue
        return {
            "status": "CERTIFIED",
            "release_sha": payload.get("release_sha"),
            "receipt_path": str(path.relative_to(ROOT)),
            "artifact_sha256": payload.get("artifact_sha256"),
            "active_build_id": payload.get("active_build_id"),
            "build_version": version,
        }
    return fallback


def release_history(limit: int = 10) -> list[dict]:
    if limit < 1:
        raise ValueError("release history limit must be at least 1")
    if not ACTIVATION_RECEIPT_DIR.exists():
        return []

    try:
        paths = sorted(
            ACTIVATION_RECEIPT_DIR.glob("*.json"),
            key=lambda item: item.stat().st_mtime,
            reverse=True,
        )
    except OSError:
        return []

    history: list[dict] = []
    for path in paths:
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if payload.get("schema") != 1:
            continue
        if payload.get("kind") != "aoe2war-activation-result":
            continue
        if payload.get("status") != "CERTIFIED":
            continue
        history.append(
            {
                "generated_at": payload.get("generated_at"),
                "release_sha": payload.get("release_sha"),
                "previous_production_sha": payload.get("previous_production_sha"),
                "risk_class": payload.get("risk_class"),
                "active_build_id": payload.get("active_build_id"),
                "build_version": payload.get("candidate_build_version"),
                "fast_rollback": payload.get("fast_rollback"),
                "durable_rollback": payload.get("durable_rollback"),
                "receipt_path": str(path.relative_to(ROOT)),
            }
        )
        if len(history) >= limit:
            break
    return history


def print_release_history(history: list[dict]) -> None:
    print("⚔️  AOE2WAR CERTIFIED RELEASES")
    if not history:
        print("No certified activation receipts found.")
        return
    for index, item in enumerate(history, start=1):
        release_sha = str(item.get("release_sha") or "unknown")
        previous = str(item.get("previous_production_sha") or "unknown")
        print(
            f"#{index:<2} {release_sha[:10]}  "
            f"risk={item.get('risk_class') or 'unknown'}  "
            f"build={item.get('active_build_id') or 'unknown'}"
        )
        print(f"    at={item.get('generated_at') or 'unknown'}  previous={previous[:10]}")
        print(f"    rollback={item.get('fast_rollback') or item.get('durable_rollback') or 'none'}")
        print(f"    receipt={item.get('receipt_path')}")


def derive_state(data: dict) -> tuple[str, str]:
    local = data["local"]
    remote = data["github"]
    docs = data.get("documentation", {})
    prod = data["production"]
    cert = data.get("certification", {})
    if local["dirty_count"] not in (0, None):
        return "DIRTY", "Review and commit local changes before release."
    if docs.get("baseline_is_ancestor_of_local") is False:
        return "DOCS_INVALID", "Refresh or repair the Documentation Baseline."
    if not remote["main_sha"]:
        return "UNKNOWN", "Resolve GitHub main."
    if local["head"] != remote["main_sha"]:
        relation = is_ancestor(remote["main_sha"], local["head"])
        if relation is True:
            return "UNPUBLISHED", "Gate and publish the committed local release."
        return "DIVERGED", "Reconcile Mac HEAD and GitHub main."
    if not prod["reachable"]:
        return "PUBLISHED", "GitHub is sealed; production inspection failed."
    if prod.get("dirty_count") not in (0, None):
        return "PRODUCTION_DIRTY", "Inspect production drift before any deployment."
    if prod["staged_build_id"]:
        return (
            "STAGED",
            "Candidate build exists beside the previous live source; resume its exact receipt with aoe2war deploy.",
        )
    if prod["source_sha"] != remote["main_sha"]:
        if cert.get("status") == "CERTIFIED":
            return "PUBLISHED", "Active runtime is CERTIFIED; GitHub main is newer and ready for the next ship."
        return "PUBLISHED", "Advance production to the sealed GitHub commit."
    if prod["service"] != "active":
        return "RUNTIME_UNHEALTHY", "Production source matches but service is not active."
    if not prod.get("active_build_id") or not prod.get("version_parity"):
        return "RUNTIME_UNVERIFIED", "Repair runtime identity or public version parity."
    if prod.get("wolo_8092_count") == 0 or prod.get("wolo_8093_count") == 0:
        return "PROTECTED_SERVICE_ALERT", "A protected WOLO listener is missing; investigate without mutating it."
    if cert.get("status") == "CERTIFIED":
        return "CERTIFIED", "Release is active, publicly verified, and receipt-certified."
    return "ACTIVE_SOURCE_PARITY", "Runtime is healthy but lacks matching certified provenance."

def collect() -> dict:
    head = git("rev-parse", "HEAD")
    branch = git("branch", "--show-current")
    dirty_lines = dirty_status()
    dirty = len(dirty_lines) if dirty_lines is not None else None
    gh = github_main()
    baseline = docs_baseline()
    baseline_ancestor = is_ancestor(baseline, head)
    raw, error = production()
    internal = version_value(raw.get("version"))
    public = public_version()
    prod = {
        "host": PROD_HOST,
        "repo": PROD_REPO,
        "reachable": error is None,
        "error": error,
        "source_sha": raw.get("head") or None,
        "branch": raw.get("branch") or None,
        "dirty_count": integer(raw.get("dirty")),
        "service": raw.get("service") or None,
        "active_build_id": raw.get("active") or None,
        "staged_build_id": raw.get("staged") or None,
        "internal_build_version": internal,
        "public_build_version": public,
        "version_parity": bool(internal and public and internal == public),
        "rollback_count": integer(raw.get("rollbacks")),
        "latest_rollback": raw.get("latest") or None,
        "root_free_kb": integer(raw.get("root_free")),
        "volume_free_kb": integer(raw.get("volume_free")),
        "wolo_8092_count": integer(raw.get("wolo8092")),
        "wolo_8093_count": integer(raw.get("wolo8093")),
    }
    data = {
        "schema": 1,
        "local": {
            "repo": str(ROOT),
            "head": head,
            "branch": branch,
            "dirty_count": dirty,
            "dirty_paths": dirty_paths(dirty_lines),
        },
        "github": {"main_sha": gh},
        "documentation": {
            "implementation_baseline": baseline,
            "baseline_is_ancestor_of_local": baseline_ancestor,
            "release_head_is_docs_descendant": bool(baseline_ancestor and baseline and head and baseline != head),
        },
        "production": prod,
    }
    cert = certified_runtime(prod)
    data["certification"] = cert
    state, nxt = derive_state(data)
    data["release"] = {
        "state": state,
        "next": nxt,
        "runtime_provenance": cert.get("status"),
        "certified_release_sha": cert.get("release_sha"),
        "certification_receipt": cert.get("receipt_path"),
    }
    return data

def short(value: str | None) -> str:
    return value[:10] if value else "—"


def status(data: dict) -> None:
    l = data["local"]
    g = data["github"]
    d = data["documentation"]
    p = data["production"]
    r = data["release"]
    c = data.get("certification", {})
    print("⚔️  AOE2WAR RELEASE STATUS")
    print(f"State:          {r['state']}")
    print(f"Next:           {r['next']}")
    print()
    print(f"Mac HEAD:       {short(l['head'])}  branch={l['branch'] or '—'}  dirty={l['dirty_count']}")
    print(f"GitHub main:    {short(g['main_sha'])}")
    relation = d["baseline_is_ancestor_of_local"]
    relation_text = "YES" if relation is True else "NO" if relation is False else "UNKNOWN"
    print(f"Docs baseline:  {short(d['implementation_baseline'])}  valid ancestor={relation_text}")
    if not p["reachable"]:
        print(f"Production:     UNREACHABLE  {p['error'] or ''}".rstrip())
        return
    print(f"Prod source:    {short(p['source_sha'])}  dirty={p['dirty_count']}")
    print(f"Service:        {p['service'] or '—'}")
    print(f"Active build:   {p['active_build_id'] or '—'}")
    print(f"Staged build:   {p['staged_build_id'] or '—'}")
    print(f"Build version:  {p['internal_build_version'] or '—'}")
    print(f"Public version: {p['public_build_version'] or '—'}  parity={'YES' if p['version_parity'] else 'NO'}")
    print(f"Rollbacks:      {p['rollback_count']}  latest={p['latest_rollback'] or '—'}")
    print(f"Disk free KB:   root={p['root_free_kb']}  volume={p['volume_free_kb']}")
    w8092 = "UP" if (p["wolo_8092_count"] or 0) > 0 else "MISSING"
    w8093 = "UP" if (p["wolo_8093_count"] or 0) > 0 else "MISSING"
    print(f"WOLO protected: 8092={w8092}  8093={w8093}")
    if c.get("status") == "CERTIFIED":
        print(f"Provenance:     CERTIFIED  release={short(c.get('release_sha'))}  receipt={c.get('receipt_path')}")
    else:
        print("Provenance:     legacy-unmanifested")

def context(data: dict) -> None:
    l = data["local"]
    g = data["github"]
    d = data["documentation"]
    p = data["production"]
    r = data["release"]
    c = data.get("certification", {})
    fields = [
        ("state", r["state"]),
        ("next", r["next"]),
        ("local_head", l["head"]),
        ("local_branch", l["branch"]),
        ("local_dirty_count", l["dirty_count"]),
        ("local_dirty_paths", ",".join(l["dirty_paths"]) or "none"),
        ("github_main", g["main_sha"]),
        ("documentation_baseline", d["implementation_baseline"]),
        ("documentation_baseline_valid", str(d["baseline_is_ancestor_of_local"]).lower()),
        ("production_reachable", str(p["reachable"]).lower()),
        ("production_source", p["source_sha"]),
        ("production_service", p["service"]),
        ("active_build_id", p["active_build_id"]),
        ("staged_build_id", p["staged_build_id"] or "none"),
        ("internal_build_version", p["internal_build_version"]),
        ("public_build_version", p["public_build_version"]),
        ("version_parity", str(p["version_parity"]).lower()),
        ("rollback_count", p["rollback_count"]),
        ("latest_rollback", p["latest_rollback"] or "none"),
        ("root_free_kb", p["root_free_kb"]),
        ("volume_free_kb", p["volume_free_kb"]),
        ("wolo_8092_count", p["wolo_8092_count"]),
        ("wolo_8093_count", p["wolo_8093_count"]),
        ("runtime_provenance", c.get("status") or "legacy-unmanifested"),
        ("certified_release_sha", c.get("release_sha") or "none"),
        ("certification_receipt", c.get("receipt_path") or "none"),
    ]
    print("AOE2WAR RELEASE CONTEXT")
    for key, value in fields:
        print(f"{key}={value if value is not None else 'unknown'}")
    print("policy=exact sealed commit; build beside live; fail closed; preserve rollback; prove internal and public; never mutate WOLO unless explicitly required")

def main() -> int:
    parser = argparse.ArgumentParser(prog="aoe2war-release")
    parser.add_argument(
        "command",
        choices=["status", "context", "releases", "gate", "manifest", "ship", "rollback"],
    )
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--stage", action="store_true")
    parser.add_argument("--activate", metavar="STAGE_RECEIPT")
    parser.add_argument("--limit", type=int, default=10)
    args = parser.parse_args()

    if args.command == "releases":
        if args.dry_run or args.stage or args.activate:
            parser.error("--dry-run, --stage, and --activate are not valid with releases")
        if args.limit < 1:
            parser.error("--limit must be at least 1")
        history = release_history(args.limit)
        if args.json:
            print(json.dumps({"schema": 1, "releases": history}, indent=2, sort_keys=True))
        else:
            print_release_history(history)
        return 0

    if args.limit != 10:
        parser.error("--limit is only valid with releases")

    data = collect()

    if args.command == "rollback":
        if args.stage or args.activate:
            parser.error("--stage and --activate are not valid with rollback")
        from aoe2_release_rollback import rollback_release
        action = lambda: rollback_release(
            data,
            collect=collect,
            dry_run=args.dry_run,
            json_output=args.json,
        )
        if args.dry_run:
            return action()
        return run_mutating_release(action)

    if args.command == "ship":
        if args.stage and args.activate:
            parser.error("ship accepts only one of --stage or --activate")
        if args.dry_run and args.stage:
            parser.error("ship --stage does not accept --dry-run")

        if args.activate:
            from aoe2_release_ship import activate_release
            action = lambda: activate_release(
                data,
                stage_receipt=args.activate,
                dry_run=args.dry_run,
                json_output=args.json,
            )
            if args.dry_run:
                return action()
            return run_mutating_release(action)

        if args.stage:
            from aoe2_release_stage import stage_release
            return run_mutating_release(
                lambda: stage_release(
                    data,
                    json_output=args.json,
                )
            )

        if args.dry_run:
            from aoe2_release_ship import ship_release
            return ship_release(
                data,
                dry_run=True,
                json_output=args.json,
            )

        from aoe2_release_auto import ship_all
        return run_mutating_release(
            lambda: ship_all(
                collect=collect,
                initial=data,
                json_output=args.json,
            )
        )

    if args.dry_run or args.stage or args.activate:
        parser.error(
            "--dry-run, --stage, and --activate are only valid with ship"
        )

    if args.command in {"gate", "manifest"}:
        from aoe2_release_gate import gate_release, manifest_release
        if args.command == "gate":
            return gate_release(data, json_output=args.json)
        return manifest_release(data, json_output=args.json)

    if args.json:
        print(json.dumps(data, indent=2, sort_keys=True))
    elif args.command == "status":
        status(data)
    else:
        context(data)
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
