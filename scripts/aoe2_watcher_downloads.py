#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import fcntl
import hashlib
import json
import os
import re
import shlex
import stat
import subprocess
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

ROOT = Path(__file__).resolve().parents[1]
CONTRACT_PATH = ROOT / "config" / "aoe2war-operations.json"
RELEASE_PATH = ROOT / "lib" / "watcherRelease.ts"

CANONICAL_HOST = "hel1"
CANONICAL_APPLY_HOST = "root@hel1"
CANONICAL_REPO = "/var/www/AoE2HDBets/app-prodn"
CANONICAL_SERVICE = "aoe2hdbets-web.service"
CANONICAL_DOWNLOAD_ROOT = "/mnt/HC_Volume_105319120/aoe2-downloads"
CANONICAL_RECEIPT_ROOT = (
    "/mnt/HC_Volume_105319120/aoe2war/os-control/"
    "watcher-download-retention-receipts"
)
CANONICAL_LOCK_PATH = (
    "/mnt/HC_Volume_105319120/aoe2war/os-control/locks/"
    "watcher-download-retention.lock"
)
GITHUB_REPO = "Emaren/aoe2-watcher"
PROTECTED_WOLO_PORTS = (8092, 8093)

VERSION_RE = r"[0-9]+\.[0-9]+\.[0-9]+"
STRICT_PATTERNS = (
    re.compile(rf"AoE2HDBets Watcher Setup (?P<version>{VERSION_RE})\.exe"),
    re.compile(rf"AoE2HDBets Watcher (?P<version>{VERSION_RE})\.exe"),
    re.compile(
        rf"AoE2HDBets Watcher-(?P<version>{VERSION_RE})-arm64\.dmg"
        rf"(?:\.blockmap)?"
    ),
    re.compile(rf"AoE2HDBets Watcher-(?P<version>{VERSION_RE})\.AppImage"),
    re.compile(rf"SHA256SUMS-(?P<version>{VERSION_RE})\.txt"),
    re.compile(rf"watcher-release-manifest-(?P<version>{VERSION_RE})\.json"),
)


class WatcherDownloadRetentionError(RuntimeError):
    pass


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def receipt_timestamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")


def canonical_json(value: Any) -> bytes:
    return json.dumps(
        value, sort_keys=True, separators=(",", ":"), ensure_ascii=True
    ).encode("utf-8")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_contract(path: Path = CONTRACT_PATH) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise WatcherDownloadRetentionError(
            f"cannot read operations contract {path}: {exc}"
        ) from exc
    if not isinstance(payload, dict) or payload.get("schema") != 1:
        raise WatcherDownloadRetentionError("unsupported operations contract")
    return payload


def release_versions(path: Path = RELEASE_PATH) -> tuple[str, str]:
    source = path.read_text(encoding="utf-8")
    current = re.search(r'\bversion:\s*"(' + VERSION_RE + r')"', source)
    previous = re.search(r'\bpreviousVersion:\s*"(' + VERSION_RE + r')"', source)
    if not current or not previous:
        raise WatcherDownloadRetentionError(
            "Watcher release contract must expose current and previous versions"
        )
    return current.group(1), previous.group(1)


def policy_from_contract(contract: dict[str, Any]) -> dict[str, Any]:
    canonical = contract.get("canonical")
    protected = contract.get("protected")
    raw = contract.get("watcher_download_retention")
    rollback = contract.get("rollback_archive")
    if not isinstance(canonical, dict) or not isinstance(protected, dict):
        raise WatcherDownloadRetentionError(
            "operations contract is missing canonical/protected authority"
        )
    if not isinstance(raw, dict):
        raise WatcherDownloadRetentionError(
            "operations contract has no watcher_download_retention block"
        )
    if not isinstance(rollback, dict):
        raise WatcherDownloadRetentionError(
            "operations contract has no rollback_archive authority"
        )
    expected = {
        "default_mode": "preview-read-only",
        "github_repo": GITHUB_REPO,
        "download_root": CANONICAL_DOWNLOAD_ROOT,
        "receipt_root": CANONICAL_RECEIPT_ROOT,
        "lock_path": CANONICAL_LOCK_PATH,
        "protect_current_and_previous": True,
        "require_public_release_digest_match": True,
        "require_plan_digest_recheck": True,
        "require_runtime_identity_recheck": True,
    }
    for key, value in expected.items():
        if raw.get(key) != value:
            raise WatcherDownloadRetentionError(
                f"watcher_download_retention.{key} must be exactly {value!r}"
            )
    for key, value in {
        "production_host": CANONICAL_HOST,
        "production_repo": CANONICAL_REPO,
        "service": CANONICAL_SERVICE,
    }.items():
        if canonical.get(key) != value:
            raise WatcherDownloadRetentionError(
                f"canonical.{key} must be exactly {value!r}"
            )
    if rollback.get("root_maintenance_host") != CANONICAL_APPLY_HOST:
        raise WatcherDownloadRetentionError(
            "rollback_archive.root_maintenance_host must be root@hel1"
        )
    if protected.get("wolo_listener_ports") != list(PROTECTED_WOLO_PORTS):
        raise WatcherDownloadRetentionError(
            "protected Wolo listener ports must remain exactly [8092, 8093]"
        )
    return {
        "production_host": CANONICAL_HOST,
        "apply_host": CANONICAL_APPLY_HOST,
        "production_repo": CANONICAL_REPO,
        "service": CANONICAL_SERVICE,
        "download_root": CANONICAL_DOWNLOAD_ROOT,
        "receipt_root": CANONICAL_RECEIPT_ROOT,
        "lock_path": CANONICAL_LOCK_PATH,
        "github_repo": GITHUB_REPO,
        "wolo_ports": list(PROTECTED_WOLO_PORTS),
    }


def strict_version(name: str) -> str | None:
    for pattern in STRICT_PATTERNS:
        match = pattern.fullmatch(name)
        if match:
            return match.group("version")
    return None


def command_output(args: list[str]) -> str:
    process = subprocess.run(
        args,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=90,
        check=False,
    )
    if process.returncode != 0:
        detail = (process.stderr or process.stdout or "").strip()
        raise WatcherDownloadRetentionError(
            f"command failed ({process.returncode}): {' '.join(args)}: {detail}"
        )
    return process.stdout.strip()


def collect_runtime(policy: dict[str, Any]) -> dict[str, Any]:
    repo = policy["production_repo"]
    source_sha = command_output(["git", "-C", repo, "rev-parse", "HEAD"])
    dirty = command_output(["git", "-C", repo, "status", "--porcelain"])
    service = command_output(["systemctl", "is-active", policy["service"]])
    build_path = Path(repo) / ".next" / "BUILD_ID"
    build_id = build_path.read_text(encoding="utf-8").strip()
    listeners: dict[str, int] = {}
    ss = command_output(["ss", "-ltnH"])
    for port in policy["wolo_ports"]:
        listeners[str(port)] = sum(
            1 for line in ss.splitlines() if re.search(rf":{port}\s", line)
        )
    return {
        "source_sha": source_sha,
        "source_dirty_count": len([line for line in dirty.splitlines() if line]),
        "active_build_id": build_id,
        "service": service,
        "wolo_listener_counts": listeners,
    }


def runtime_differences(before: dict[str, Any], after: dict[str, Any]) -> list[str]:
    differences = []
    for key in ("source_sha", "source_dirty_count", "active_build_id", "service"):
        if before.get(key) != after.get(key):
            differences.append(f"{key}: {before.get(key)!r} -> {after.get(key)!r}")
    if before.get("wolo_listener_counts") != after.get("wolo_listener_counts"):
        differences.append("Wolo listener counts changed")
    return differences


def local_github_release(version: str, repo: str) -> dict[str, Any] | None:
    process = subprocess.run(
        ["gh", "api", f"repos/{repo}/releases/tags/v{version}"],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=60,
        check=False,
    )
    if process.returncode != 0:
        return None
    try:
        payload = json.loads(process.stdout)
    except Exception:
        return None
    if (
        not isinstance(payload, dict)
        or payload.get("tag_name") != f"v{version}"
        or payload.get("draft") is True
        or payload.get("prerelease") is True
        or not isinstance(payload.get("assets"), list)
    ):
        return None
    digests = []
    for asset in payload["assets"]:
        if not isinstance(asset, dict):
            continue
        digest = str(asset.get("digest") or "")
        if digest.startswith("sha256:") and re.fullmatch(
            r"[0-9a-f]{64}", digest.removeprefix("sha256:")
        ):
            digests.append(digest.removeprefix("sha256:"))
    if not digests:
        return None
    return {
        "tag_name": payload["tag_name"],
        "release_id": payload.get("id"),
        "published_at": payload.get("published_at"),
        "asset_digests": sorted(set(digests)),
    }


def github_proofs(versions: list[str], repo: str) -> dict[str, Any]:
    return {
        version: proof
        for version in versions
        if (proof := local_github_release(version, repo)) is not None
    }


def regular_file(path: Path) -> os.stat_result:
    info = path.lstat()
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode):
        raise WatcherDownloadRetentionError(
            f"candidate is not a plain regular file: {path}"
        )
    return info


def build_plan(
    policy: dict[str, Any],
    *,
    current: str,
    previous: str,
    expected_source_sha: str,
    public_proofs: dict[str, Any],
) -> dict[str, Any]:
    runtime = collect_runtime(policy)
    if runtime["source_sha"] != expected_source_sha:
        raise WatcherDownloadRetentionError(
            "production source changed before Watcher download retention"
        )
    if runtime["source_dirty_count"] != 0 or runtime["service"] != "active":
        raise WatcherDownloadRetentionError(
            "production source must be clean and web service active"
        )
    if runtime["wolo_listener_counts"] != {"8092": 1, "8093": 1}:
        raise WatcherDownloadRetentionError(
            "Wolo listener boundary is not exact 1/1"
        )

    root = Path(policy["download_root"])
    root_info = root.lstat()
    if stat.S_ISLNK(root_info.st_mode) or not stat.S_ISDIR(root_info.st_mode):
        raise WatcherDownloadRetentionError(
            "canonical Watcher download root is not a direct directory"
        )

    protected = {current, previous}
    entries: list[dict[str, Any]] = []
    candidate_versions: set[str] = set()
    for path in sorted(root.iterdir(), key=lambda item: item.name):
        version = strict_version(path.name)
        if not version:
            continue
        info = regular_file(path)
        if version in protected:
            entries.append({
                "name": path.name,
                "version": version,
                "bytes": info.st_size,
                "action": "PROTECT_CURRENT_OR_PREVIOUS",
            })
            continue
        candidate_versions.add(version)
        digest = sha256_file(path)
        proof = public_proofs.get(version)
        public_digests = set((proof or {}).get("asset_digests") or [])
        action = (
            "RETIRE_PUBLIC_DUPLICATE"
            if digest in public_digests
            else "KEEP_UNPROVEN_HISTORY"
        )
        entries.append({
            "name": path.name,
            "version": version,
            "bytes": info.st_size,
            "sha256": digest,
            "action": action,
            "public_tag": (proof or {}).get("tag_name"),
        })

    candidates = [
        row for row in entries if row["action"] == "RETIRE_PUBLIC_DUPLICATE"
    ]
    unproven = [
        row for row in entries if row["action"] == "KEEP_UNPROVEN_HISTORY"
    ]
    digest_payload = {
        "current_version": current,
        "previous_version": previous,
        "expected_source_sha": expected_source_sha,
        "runtime_before": runtime,
        "entries": entries,
    }
    return {
        "schema": 1,
        "kind": "aoe2war-watcher-download-retention-plan",
        "generated_at": utc_now(),
        "status": "READY" if candidates else "NOOP",
        "mode": "PREVIEW",
        "current_version": current,
        "previous_version": previous,
        "candidate_versions": sorted(candidate_versions),
        "entry_count": len(entries),
        "candidate_count": len(candidates),
        "unproven_count": len(unproven),
        "eligible_bytes": sum(int(row["bytes"]) for row in candidates),
        "runtime_before": runtime,
        "entries": entries,
        "plan_digest_sha256": sha256_bytes(canonical_json(digest_payload)),
        "wolo_mutation_allowed": False,
    }


@contextmanager
def retention_lock(policy: dict[str, Any]) -> Iterator[None]:
    path = Path(policy["lock_path"])
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor = os.open(
        path,
        os.O_RDWR | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0),
        0o640,
    )
    with os.fdopen(descriptor, "r+", encoding="utf-8") as handle:
        try:
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise WatcherDownloadRetentionError(
                "another Watcher download retention command is active"
            ) from exc
        handle.seek(0)
        handle.truncate()
        handle.write(f"pid={os.getpid()}\nstarted_at={utc_now()}\n")
        handle.flush()
        os.fsync(handle.fileno())
        try:
            yield
        finally:
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def durable_write(path: Path, payload: dict[str, Any]) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    body = json.dumps(payload, indent=2, sort_keys=True) + "\n"
    temporary = path.with_name(path.name + f".tmp-{os.getpid()}")
    temporary.write_text(body, encoding="utf-8")
    with temporary.open("rb") as handle:
        os.fsync(handle.fileno())
    os.replace(temporary, path)
    directory = os.open(path.parent, os.O_RDONLY)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)
    return sha256_file(path)


def apply_plan(
    policy: dict[str, Any],
    *,
    current: str,
    previous: str,
    expected_source_sha: str,
    public_proofs: dict[str, Any],
    expected_plan_digest: str,
) -> dict[str, Any]:
    with retention_lock(policy):
        plan = build_plan(
            policy,
            current=current,
            previous=previous,
            expected_source_sha=expected_source_sha,
            public_proofs=public_proofs,
        )
        if plan["plan_digest_sha256"] != expected_plan_digest:
            raise WatcherDownloadRetentionError(
                "Watcher download retention plan changed before apply"
            )
        receipt_dir = (
            Path(policy["receipt_root"])
            / f"{receipt_timestamp()}-{expected_plan_digest[:12]}"
        )
        plan_path = receipt_dir / "plan.json"
        durable_write(plan_path, {**plan, "mode": "APPLY"})

        root = Path(policy["download_root"])
        before_runtime = plan["runtime_before"]
        deleted: list[dict[str, Any]] = []
        for row in plan["entries"]:
            if row["action"] != "RETIRE_PUBLIC_DUPLICATE":
                continue
            runtime = collect_runtime(policy)
            drift = runtime_differences(before_runtime, runtime)
            if drift:
                raise WatcherDownloadRetentionError(
                    "production identity drifted before unlink: "
                    + "; ".join(drift)
                )
            if row["version"] in {current, previous}:
                raise WatcherDownloadRetentionError(
                    "protected Watcher generation reached unlink path"
                )
            path = root / row["name"]
            info = regular_file(path)
            if info.st_size != row["bytes"] or sha256_file(path) != row["sha256"]:
                raise WatcherDownloadRetentionError(
                    f"Watcher download changed before unlink: {row['name']}"
                )
            proof = public_proofs.get(row["version"]) or {}
            if row["sha256"] not in set(proof.get("asset_digests") or []):
                raise WatcherDownloadRetentionError(
                    f"public release redundancy proof vanished: {row['name']}"
                )
            path.unlink()
            if os.path.lexists(path):
                raise WatcherDownloadRetentionError(
                    f"Watcher download remains after unlink: {path}"
                )
            deleted.append(row)

        directory = os.open(root, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)

        runtime_after = collect_runtime(policy)
        drift = runtime_differences(before_runtime, runtime_after)
        if drift:
            raise WatcherDownloadRetentionError(
                "production identity changed after retention: " + "; ".join(drift)
            )
        remaining = build_plan(
            policy,
            current=current,
            previous=previous,
            expected_source_sha=expected_source_sha,
            public_proofs=public_proofs,
        )
        if remaining["candidate_count"] != 0:
            raise WatcherDownloadRetentionError(
                "reclaimable public-duplicate Watcher files remain"
            )

        result = {
            "schema": 1,
            "kind": "aoe2war-watcher-download-retention-result",
            "generated_at": utc_now(),
            "mode": "APPLY",
            "status": "APPLIED" if deleted else "NOOP",
            "plan_digest_sha256": expected_plan_digest,
            "deleted_count": len(deleted),
            "deleted_bytes": sum(int(row["bytes"]) for row in deleted),
            "deleted": deleted,
            "runtime_before": before_runtime,
            "runtime_after": runtime_after,
            "runtime_identity_unchanged": True,
            "wolo_listener_counts_unchanged": True,
            "remaining_unproven_count": remaining["unproven_count"],
            "wolo_mutation_allowed": False,
        }
        result_path = receipt_dir / "result.json"
        result["result_receipt_path"] = str(result_path)
        result["result_receipt_sha256"] = durable_write(result_path, result)
        return result


def encode_job(job: dict[str, Any]) -> str:
    return base64.urlsafe_b64encode(canonical_json(job)).decode("ascii")


def decode_job(value: str) -> dict[str, Any]:
    try:
        payload = json.loads(
            base64.urlsafe_b64decode(value.encode("ascii")).decode("utf-8")
        )
    except Exception as exc:
        raise WatcherDownloadRetentionError(
            f"cannot decode remote job: {exc}"
        ) from exc
    if not isinstance(payload, dict):
        raise WatcherDownloadRetentionError("remote job is not an object")
    return payload


def invoke_remote(
    policy: dict[str, Any],
    job: dict[str, Any],
    *,
    apply: bool,
) -> dict[str, Any]:
    source = Path(__file__).read_text(encoding="utf-8")
    command = [
        "python3",
        "-",
        "--remote-worker",
        "--job-b64",
        encode_job(job),
    ]
    if apply:
        command.append("--apply")
    host = policy["apply_host"] if apply else policy["production_host"]
    process = subprocess.run(
        [
            "ssh",
            "-o",
            "BatchMode=yes",
            "-o",
            "ConnectTimeout=8",
            host,
            shlex.join(command),
        ],
        input=source,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=1800,
        check=False,
    )
    if process.returncode != 0:
        detail = (process.stderr or process.stdout or "").strip()
        raise WatcherDownloadRetentionError(
            f"Watcher download remote worker exited {process.returncode}: {detail}"
        )
    try:
        payload = json.loads(process.stdout)
    except Exception as exc:
        raise WatcherDownloadRetentionError(
            "Watcher download remote worker returned invalid JSON: "
            + (process.stdout or process.stderr or "")[-1200:]
        ) from exc
    if not isinstance(payload, dict):
        raise WatcherDownloadRetentionError(
            "Watcher download remote worker returned a non-object"
        )
    return payload


def discover_versions(
    policy: dict[str, Any],
    current: str,
    previous: str,
    expected_source_sha: str,
) -> list[str]:
    plan = invoke_remote(
        policy,
        {
            "policy": policy,
            "current": current,
            "previous": previous,
            "expected_source_sha": expected_source_sha,
            "public_proofs": {},
        },
        apply=False,
    )
    return list(plan.get("candidate_versions") or [])


def run_operator(*, apply: bool) -> dict[str, Any]:
    policy = policy_from_contract(load_contract())
    current, previous = release_versions()
    expected_source_sha = command_output(["git", "-C", str(ROOT), "rev-parse", "HEAD"])
    dirty = command_output(["git", "-C", str(ROOT), "status", "--porcelain"])
    if dirty:
        raise WatcherDownloadRetentionError(
            "operator source worktree must be clean before retention"
        )
    versions = discover_versions(policy, current, previous, expected_source_sha)
    proofs = github_proofs(versions, policy["github_repo"])
    job = {
        "policy": policy,
        "current": current,
        "previous": previous,
        "expected_source_sha": expected_source_sha,
        "public_proofs": proofs,
    }
    plan = invoke_remote(policy, job, apply=False)
    if not apply:
        return plan
    job["expected_plan_digest"] = plan["plan_digest_sha256"]
    return invoke_remote(policy, job, apply=True)


def remote_worker(job: dict[str, Any], *, apply: bool) -> dict[str, Any]:
    policy = job["policy"]
    kwargs = {
        "current": str(job["current"]),
        "previous": str(job["previous"]),
        "expected_source_sha": str(job["expected_source_sha"]),
        "public_proofs": dict(job.get("public_proofs") or {}),
    }
    if apply:
        expected = str(job.get("expected_plan_digest") or "")
        if not re.fullmatch(r"[0-9a-f]{64}", expected):
            raise WatcherDownloadRetentionError(
                "apply requires an exact plan digest"
            )
        return apply_plan(
            policy,
            expected_plan_digest=expected,
            **kwargs,
        )
    return build_plan(policy, **kwargs)


def format_bytes(value: int) -> str:
    amount = float(value)
    for unit in ("B", "KiB", "MiB", "GiB", "TiB"):
        if amount < 1024 or unit == "TiB":
            return f"{amount:.1f} {unit}" if unit != "B" else f"{int(amount)} B"
        amount /= 1024
    return f"{amount:.1f} TiB"


def print_human(payload: dict[str, Any]) -> None:
    print("⚔️  AOE2WAR WATCHER DOWNLOAD RETENTION")
    print(f"Mode:        {payload.get('mode', 'UNKNOWN')}")
    print(f"Status:      {payload.get('status', 'ERROR')}")
    if payload.get("error"):
        print(f"STOP: {payload['error']}")
        return
    if payload.get("kind") == "aoe2war-watcher-download-retention-plan":
        print(
            f"Protected:   {payload.get('current_version')} + "
            f"{payload.get('previous_version')}"
        )
        print(f"Candidates:  {payload.get('candidate_count', 0)} file(s)")
        print(f"Unproven:    {payload.get('unproven_count', 0)} file(s)")
        print(f"Eligible:    {format_bytes(int(payload.get('eligible_bytes', 0)))}")
        print(f"Plan SHA:    {payload.get('plan_digest_sha256')}")
        for row in payload.get("entries") or []:
            if row.get("action") == "PROTECT_CURRENT_OR_PREVIOUS":
                continue
            print(
                f"{row.get('action','?'):26} "
                f"{format_bytes(int(row.get('bytes',0))):>10} "
                f"{row.get('name','?')}"
            )
        print("READ ONLY: apply with aoe2war watcher-downloads --apply.")
        return
    print(f"Deleted:     {payload.get('deleted_count', 0)} file(s)")
    print(f"Reclaimed:   {format_bytes(int(payload.get('deleted_bytes', 0)))}")
    print(
        "Runtime:     "
        + ("UNCHANGED" if payload.get("runtime_identity_unchanged") else "FAILED")
    )
    print(
        "Wolo:        "
        + (
            "UNCHANGED"
            if payload.get("wolo_listener_counts_unchanged")
            else "FAILED"
        )
    )
    print(f"Receipt:     {payload.get('result_receipt_path', 'unavailable')}")


def parser() -> argparse.ArgumentParser:
    value = argparse.ArgumentParser(
        description=(
            "Preview or retire obsolete Watcher download-vault files only when "
            "their bytes are proven redundant to immutable public GitHub releases."
        )
    )
    value.add_argument("--apply", action="store_true")
    value.add_argument("--json", action="store_true")
    value.add_argument("--remote-worker", action="store_true", help=argparse.SUPPRESS)
    value.add_argument("--job-b64", help=argparse.SUPPRESS)
    return value


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        if args.remote_worker:
            if not args.job_b64:
                raise WatcherDownloadRetentionError("remote worker requires job")
            payload = remote_worker(decode_job(args.job_b64), apply=args.apply)
        else:
            payload = run_operator(apply=args.apply)
    except Exception as exc:
        payload = {
            "schema": 1,
            "kind": "aoe2war-watcher-download-retention-error",
            "generated_at": utc_now(),
            "mode": "APPLY" if args.apply else "PREVIEW",
            "status": "ERROR",
            "error": str(exc),
        }
    if args.json or args.remote_worker:
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        print_human(payload)
    return 0 if payload.get("status") in {"READY", "NOOP", "APPLIED"} else 2


if __name__ == "__main__":
    raise SystemExit(main())
