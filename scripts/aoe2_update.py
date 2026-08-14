#!/usr/bin/env python3
from __future__ import annotations

import argparse
import fcntl
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from collections import Counter
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import aoe2_audit
import aoe2_release

ROOT = Path(__file__).resolve().parents[1]
WORKSPACE = aoe2_audit.WORKSPACE
VPSSENTRY = aoe2_audit.VPSSENTRY
WOLOCHAIN = aoe2_audit.WOLOCHAIN
DOCS = aoe2_audit.DOCS
PROJECTS_ROOT = aoe2_audit.PROJECTS_ROOT
SOURCES = aoe2_audit.CORE_SOURCES

REPO_TO_CONTEXT = {
    "app-prodn": "AoE2HDBets",
    "api-prodn": "AoE2HDBets",
    "aoe2-watcher": "AoE2HDBets",
    "vpssentry": "VPSSentry",
    "wolochain": "WoloChain-wolo-1",
}

FIELDS = (
    "id", "title", "type", "status", "owner", "systems", "audience",
    "source_of_truth", "authority", "reviewed_at", "review_interval_days",
    "sensitivity",
)

AUTO_P1_KEYS = {
    "documentation-drift",
    "central-source-snapshot-stale",
    "central-federation-drift",
    "archive-stale",
}

RECEIPT_DIR = ROOT / ".aoe2war-release" / "update-receipts"
UPDATE_LOCK = ROOT / ".aoe2war-release" / "update.lock"

GIB = 1024 ** 3
CONTEXT_CAPTURE_MIN_FREE_BYTES = 4 * GIB
CONTEXT_CAPTURE_MARGIN_BYTES = 1 * GIB

ESTATE_MAP_BEGIN = "<!-- BEGIN AOE2WAR GENERATED CURRENT STATE -->"
ESTATE_MAP_END = "<!-- END AOE2WAR GENERATED CURRENT STATE -->"
ESTATE_MAP_SOURCE_RE = re.compile(
    r"^- Current-state source SHA: `([0-9a-f]{40})`$", re.MULTILINE
)
ESTATE_MAP_FILES = ("SYSTEM_MAP.md", "SERVER_STORAGE_MAP.md")
ESTATE_MAP_ALLOWED_PATHS = {
    "context/SYSTEM_MAP.md",
    "context/SERVER_STORAGE_MAP.md",
    "docs/DOCUMENTATION_CONTROL_PLANE.md",
    "docs/document-registry.json",
}

CENTRAL_ALLOWED_EXACT = {
    "catalog/document-taxonomy.json",
    "catalog/runtime/repository-state.json",
    "docs-index.json",
    "documentation-corpus.json",
    "knowledge-graph.json",
    "llms.txt",
    "migration-matrix.csv",
    "taxonomy-audit.json",
}


class UpdateError(RuntimeError):
    pass


def format_elapsed(seconds: float) -> str:
    total = max(0, int(seconds))
    hours, remainder = divmod(total, 3600)
    minutes, secs = divmod(remainder, 60)
    if hours:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes:02d}:{secs:02d}"


class Progress:
    def __init__(
        self,
        *,
        stream=None,
        clock=time.monotonic,
    ) -> None:
        self.stream = stream if stream is not None else sys.stdout
        self.clock = clock
        self.started = clock()

    def emit(self, symbol: str, message: str) -> None:
        elapsed = format_elapsed(self.clock() - self.started)
        print(
            f"[{elapsed}] {symbol} {message}",
            file=self.stream,
            flush=True,
        )

    def start(self, message: str) -> None:
        self.emit("→", message)

    def done(self, message: str) -> None:
        self.emit("✓", message)

    def wait(self, message: str, step_seconds: float) -> None:
        self.emit(
            "…",
            f"{message} ({format_elapsed(step_seconds)} in this step)",
        )


def run_with_heartbeat(
    args: list[str],
    *,
    cwd: Path,
    progress: Progress,
    label: str,
    timeout: int,
    env: dict[str, str] | None = None,
    heartbeat_seconds: float = 15.0,
) -> tuple[int, str]:
    step_started = time.monotonic()

    with tempfile.TemporaryFile(mode="w+t", encoding="utf-8") as capture:
        try:
            process = subprocess.Popen(
                args,
                cwd=str(cwd),
                text=True,
                stdout=capture,
                stderr=subprocess.STDOUT,
                env=env,
            )
        except Exception as exc:
            return 127, str(exc)

        deadline = step_started + timeout

        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                process.kill()
                process.wait()
                capture.seek(0)
                captured = capture.read().rstrip()
                suffix = f"\\nTimed out after {timeout}s"
                return 124, (captured + suffix).strip()

            try:
                returncode = process.wait(
                    timeout=min(heartbeat_seconds, remaining)
                )
                break
            except subprocess.TimeoutExpired:
                progress.wait(
                    label,
                    time.monotonic() - step_started,
                )

        capture.seek(0)
        return returncode, capture.read().rstrip()


def run(
    args: list[str],
    *,
    cwd: Path,
    timeout: int = 180,
    env: dict[str, str] | None = None,
) -> tuple[int, str]:
    try:
        p = subprocess.run(
            args,
            cwd=str(cwd),
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=timeout,
            env=env,
            check=False,
        )
        return p.returncode, p.stdout.rstrip()
    except Exception as exc:
        return 127, str(exc)


def git(repo: Path, *args: str, timeout: int = 60) -> tuple[int, str]:
    return run(["git", *args], cwd=repo, timeout=timeout)


def git_output(repo: Path, *args: str) -> str:
    rc, out = git(repo, *args)
    if rc != 0:
        raise UpdateError(f"git {' '.join(args)} failed in {repo}: {out}")
    return out.strip()


def status_paths(repo: Path) -> set[str]:
    rc, out = git(repo, "status", "--porcelain=v1", "--untracked-files=all")
    if rc != 0:
        raise UpdateError(f"cannot inspect worktree: {repo}")
    paths: set[str] = set()
    for line in out.splitlines():
        if not line:
            continue
        path = line[3:]
        if " -> " in path:
            path = path.split(" -> ", 1)[1]
        paths.add(path)
    return paths


def remote_sha(repo: Path, branch: str) -> str | None:
    rc, out = git(
        repo,
        "ls-remote",
        "--exit-code",
        "origin",
        f"refs/heads/{branch}",
    )
    if rc != 0 or not out:
        return None
    return out.split()[0]


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def docs_owned_path(path: str) -> bool:
    pure = Path(path)
    if path == "catalog-info.yaml":
        return True
    if pure.suffix.lower() in {".md", ".mdx"}:
        return True
    if pure.parts and pure.parts[0] == "docs":
        return True
    return False


def central_owned_path(path: str) -> bool:
    if path in CENTRAL_ALLOWED_EXACT:
        return True
    if path.startswith("catalog/registries/") and path.endswith(".json"):
        return True
    if path.startswith("docs/generated/") and path.endswith(".md"):
        return True
    return False


@contextmanager
def update_lock():
    UPDATE_LOCK.parent.mkdir(parents=True, exist_ok=True)
    with UPDATE_LOCK.open("a+", encoding="utf-8") as handle:
        try:
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            handle.seek(0)
            holder = handle.read().strip() or "holder metadata unavailable"
            raise UpdateError(
                "another AoE2WAR update already holds the update lock: "
                + holder.replace("\n", "; ")
            ) from exc

        handle.seek(0)
        handle.truncate()
        handle.write(f"pid={os.getpid()}\n")
        handle.write("command=" + " ".join(os.sys.argv) + "\n")
        handle.flush()

        try:
            with aoe2_release.deployment_lock():
                yield
        finally:
            handle.seek(0)
            handle.truncate()
            handle.write("released\n")
            handle.flush()
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def source_checker(repo: Path) -> tuple[int, str]:
    checker = repo / "scripts" / "docs_v2_check.py"
    if not checker.is_file():
        return 127, f"missing documentation checker: {checker}"
    return run(["python3", str(checker)], cwd=repo, timeout=120)


def baseline_refresh_needed(output: str) -> bool:
    return "implementation changed after the recorded baseline" in output


def archive_project_from_finding(detail: str) -> str | None:
    for project in (
        "AoE2HDBets",
        "WoloChain-wolo-1",
        "VPSSentry",
        "AoE2WAR-docs",
    ):
        if detail.startswith(project + ":"):
            return project
    return None


def certified_source_ready(
    release_data: dict[str, Any],
) -> tuple[bool, str, str | None]:
    """Prove that intended Git source is the active certified production source."""
    local = release_data.get("local")
    github = release_data.get("github")
    production = release_data.get("production")
    certification = release_data.get("certification")
    if not all(
        isinstance(item, dict)
        for item in (local, github, production, certification)
    ):
        return False, "release evidence is incomplete", None

    intended = github.get("main_sha")
    if not isinstance(intended, str) or re.fullmatch(r"[0-9a-f]{40}", intended) is None:
        return False, "GitHub source is unresolved", None
    if local.get("head") != intended:
        return False, "local and GitHub source are not exact", intended
    if local.get("dirty_count") != 0:
        return False, "local source worktree is not clean", intended
    if not production.get("reachable"):
        return False, "production inspection is unavailable", intended
    if production.get("source_sha") != intended:
        return (
            False,
            "production is not yet at intended Git source; defer until post-deploy",
            intended,
        )
    if production.get("dirty_count") != 0:
        return False, "production source worktree is not clean", intended
    if production.get("service") != "active":
        return False, "production service is not active", intended
    if production.get("staged_build_id") not in (None, ""):
        return False, "a staged candidate exists; defer until activation completes", intended
    if production.get("version_parity") is not True:
        return False, "internal/public build version parity is not proven", intended

    if certification.get("status") != "CERTIFIED":
        return False, "active runtime lacks certified provenance", intended
    if certification.get("release_sha") != intended:
        return False, "certified receipt source does not match intended source", intended
    if certification.get("active_build_id") != production.get("active_build_id"):
        return False, "certified and active BUILD_ID values differ", intended
    versions = {
        production.get("internal_build_version"),
        production.get("public_build_version"),
        certification.get("build_version"),
    }
    if None in versions or len(versions) != 1:
        return False, "certified/internal/public build versions differ", intended
    if production.get("wolo_8092_count") != 1:
        return False, "protected Wolo listener 8092 count is not exactly 1", intended
    if production.get("wolo_8093_count") != 1:
        return False, "protected Wolo listener 8093 count is not exactly 1", intended
    return True, "exact intended source is active and receipt-certified", intended


def estate_map_source(path: Path) -> str:
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise UpdateError(f"estate map cannot be read: {path}: {exc}") from exc
    if text.count(ESTATE_MAP_BEGIN) != 1 or text.count(ESTATE_MAP_END) != 1:
        raise UpdateError(
            f"estate map must contain exactly one bounded current-state block: {path}"
        )
    begin = text.index(ESTATE_MAP_BEGIN)
    end = text.index(ESTATE_MAP_END, begin) + len(ESTATE_MAP_END)
    matches = ESTATE_MAP_SOURCE_RE.findall(text[begin:end])
    if len(matches) != 1:
        raise UpdateError(
            f"estate map current-state block has invalid source identity: {path}"
        )
    return matches[0]


def estate_map_refresh_plan(
    release_data: dict[str, Any],
    *,
    vpssentry: Path = VPSSENTRY,
    projects_root: Path = PROJECTS_ROOT,
) -> dict[str, Any]:
    ready, reason, intended = certified_source_ready(release_data)
    if not ready:
        return {
            "status": "deferred",
            "reason": reason,
            "intended_source_sha": intended,
        }

    sources: set[str] = set()
    try:
        for name in ESTATE_MAP_FILES:
            authoritative = vpssentry / "context" / name
            mirror = projects_root / name
            if not mirror.is_file():
                raise UpdateError(f"estate-map workspace mirror is missing: {mirror}")
            if authoritative.read_bytes() != mirror.read_bytes():
                raise UpdateError(
                    f"estate-map workspace mirror differs from Git authority: {mirror}"
                )
            sources.add(estate_map_source(authoritative))
    except (OSError, UpdateError) as exc:
        return {
            "status": "blocked",
            "reason": str(exc),
            "intended_source_sha": intended,
        }

    if len(sources) != 1:
        return {
            "status": "blocked",
            "reason": "estate-map generated blocks disagree on current source",
            "intended_source_sha": intended,
        }

    current = next(iter(sources))
    return {
        "status": "current" if current == intended else "refresh",
        "reason": (
            "generated blocks already match certified source"
            if current == intended
            else "generated blocks lag exact certified production source"
        ),
        "intended_source_sha": intended,
        "current_source_sha": current,
    }


def certification_receipt(release_data: dict[str, Any]) -> dict[str, Any]:
    certification = release_data.get("certification", {})
    relative = certification.get("receipt_path")
    if not isinstance(relative, str) or not relative:
        raise UpdateError("certified activation receipt path is unavailable")
    try:
        path = (ROOT / relative).resolve()
        path.relative_to(ROOT.resolve())
    except (OSError, ValueError) as exc:
        raise UpdateError(
            f"certified activation receipt escapes application root: {relative!r}"
        ) from exc
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise UpdateError(f"certified activation receipt is unreadable: {path}") from exc
    if not isinstance(payload, dict):
        raise UpdateError("certified activation receipt must contain an object")
    if payload.get("schema") != 1:
        raise UpdateError("certified activation receipt schema must be 1")
    if payload.get("kind") != "aoe2war-activation-result":
        raise UpdateError("certified activation receipt kind is invalid")
    if payload.get("status") != "CERTIFIED":
        raise UpdateError("activation receipt is not CERTIFIED")
    if payload.get("release_sha") != certification.get("release_sha"):
        raise UpdateError("activation receipt source differs from certified runtime")
    if payload.get("active_build_id") != certification.get("active_build_id"):
        raise UpdateError("activation receipt BUILD_ID differs from certified runtime")
    if payload.get("candidate_build_version") != certification.get("build_version"):
        raise UpdateError("activation receipt build version differs from certified runtime")
    if payload.get("artifact_sha256") != certification.get("artifact_sha256"):
        raise UpdateError("activation receipt artifact differs from certified runtime")
    if payload.get("wolo_mutated") is not False:
        raise UpdateError("activation receipt does not prove wolo_mutated=false")
    return payload


def _utc_z(value: object, label: str) -> str:
    if not isinstance(value, str) or not value:
        raise UpdateError(f"{label} is missing")
    normalized = value[:-6] + "Z" if value.endswith("+00:00") else value
    if re.fullmatch(
        r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z",
        normalized,
    ) is None:
        raise UpdateError(f"{label} is not an ISO-8601 UTC timestamp")
    return normalized


def build_estate_map_snapshot(
    release_data: dict[str, Any],
    receipt: dict[str, Any],
    *,
    observed_at: str | None = None,
) -> dict[str, Any]:
    ready, reason, intended = certified_source_ready(release_data)
    if not ready or intended is None:
        raise UpdateError(f"estate-map refresh is not eligible: {reason}")
    production = release_data["production"]
    certification = release_data["certification"]
    observed = observed_at or datetime.now(timezone.utc).replace(
        microsecond=0
    ).isoformat().replace("+00:00", "Z")
    return {
        "schema": 1,
        "kind": "aoe2war-certified-current-state",
        "observed_at": _utc_z(observed, "estate-map observation time"),
        "intended_source_sha": intended,
        "production": {
            "host": production.get("host"),
            "repo": production.get("repo"),
            "branch": production.get("branch"),
            "source_sha": production.get("source_sha"),
            "dirty_count": production.get("dirty_count"),
            "service": production.get("service"),
            "active_build_id": production.get("active_build_id"),
            "staged_build_id": production.get("staged_build_id"),
            "internal_build_version": production.get("internal_build_version"),
            "public_build_version": production.get("public_build_version"),
            "version_parity": production.get("version_parity"),
            "root_free_kb": production.get("root_free_kb"),
            "volume_free_kb": production.get("volume_free_kb"),
            "rollback_count": production.get("rollback_count"),
            "latest_rollback": (
                production.get("latest_rollback") or receipt.get("fast_rollback")
            ),
        },
        "certification": {
            "status": certification.get("status"),
            "release_sha": certification.get("release_sha"),
            "certified_at": _utc_z(
                receipt.get("generated_at"), "activation certification time"
            ),
            "implementation_sha": receipt.get("implementation_sha"),
            "active_build_id": certification.get("active_build_id"),
            "build_version": certification.get("build_version"),
            "artifact_sha256": certification.get("artifact_sha256"),
            "receipt_path": certification.get("receipt_path"),
            "durable_receipt_dir": receipt.get("remote_receipt_dir"),
            "durable_rollback": receipt.get("durable_rollback"),
            "fast_rollback": receipt.get("fast_rollback"),
            "risk_class": receipt.get("risk_class"),
            "wolo_mutated": receipt.get("wolo_mutated"),
        },
        "wolo": {
            "listener_8092_count": production.get("wolo_8092_count"),
            "listener_8093_count": production.get("wolo_8093_count"),
        },
    }


def collect_plan(
    release_data: dict[str, Any] | None = None,
) -> dict[str, Any]:
    audit = aoe2_audit.collect_audit()
    payload = audit.payload()

    if release_data is None:
        try:
            release_data = aoe2_release.collect()
        except Exception as exc:
            release_data = {}
            estate_maps = {
                "status": "deferred",
                "reason": f"release evidence collection failed: {exc}",
                "intended_source_sha": None,
            }
        else:
            estate_maps = estate_map_refresh_plan(release_data)
    else:
        estate_maps = estate_map_refresh_plan(release_data)

    baseline_refreshes: list[str] = []
    blocked_source_docs: list[dict[str, str]] = []

    for repo_id, repo in SOURCES.items():
        rc, out = source_checker(repo)
        if rc == 0:
            continue
        if baseline_refresh_needed(out):
            baseline_refreshes.append(repo_id)
        else:
            blocked_source_docs.append(
                {
                    "repo": repo_id,
                    "detail": aoe2_audit.checker_summary(out),
                }
            )

    unknown_p1 = [
        finding
        for finding in payload["findings"]
        if finding["severity"] == "P1"
        and finding["key"] not in AUTO_P1_KEYS
    ]

    context_projects: set[str] = set()
    for finding in payload["findings"]:
        if finding["severity"] == "P1" and finding["key"] == "archive-stale":
            project = archive_project_from_finding(finding["detail"])
            if project:
                context_projects.add(project)

    for repo_id in baseline_refreshes:
        context_projects.add(REPO_TO_CONTEXT[repo_id])

    central_sync_needed = bool(
        baseline_refreshes
        or estate_maps["status"] == "refresh"
        or any(
            finding["key"] in {
                "central-source-snapshot-stale",
                "central-federation-drift",
            }
            for finding in payload["findings"]
        )
    )
    if central_sync_needed:
        context_projects.add("AoE2WAR-docs")

    if estate_maps["status"] == "refresh":
        context_projects.add("VPSSentry")

    blocked = bool(
        payload["p0"]
        or blocked_source_docs
        or unknown_p1
        or estate_maps["status"] == "blocked"
    )

    return {
        "schema": 1,
        "audit": payload,
        "baseline_refreshes": sorted(baseline_refreshes),
        "blocked_source_docs": blocked_source_docs,
        "unknown_p1": unknown_p1,
        "estate_maps": estate_maps,
        "central_sync": central_sync_needed,
        "context_projects": sorted(context_projects),
        "blocked": blocked,
        "changes_needed": bool(
            baseline_refreshes
            or central_sync_needed
            or context_projects
            or estate_maps["status"] == "refresh"
        ),
    }


def print_plan(plan: dict[str, Any]) -> None:
    audit = plan["audit"]
    print("⚔️  AOE2WAR UPDATE PLAN")
    print()
    print(f"Estate audit: P0={audit['p0']} P1={audit['p1']}")
    print()

    print("Source documentation:")
    if plan["baseline_refreshes"]:
        for repo_id in plan["baseline_refreshes"]:
            print(f"  REFRESH BASELINE  {repo_id}")
    else:
        print("  CURRENT")
    for item in plan["blocked_source_docs"]:
        print(f"  BLOCKED  {item['repo']}: {item['detail']}")

    print()
    print("Central federation: " + ("SYNCHRONIZE" if plan["central_sync"] else "CURRENT"))

    estate_maps = plan["estate_maps"]
    print()
    if estate_maps["status"] == "refresh":
        map_label = "REFRESH FROM CERTIFIED SOURCE"
    elif estate_maps["status"] == "current":
        map_label = "CURRENT"
    elif estate_maps["status"] == "deferred":
        map_label = "DEFERRED UNTIL POST-DEPLOY"
    else:
        map_label = "BLOCKED"
    print(f"Estate-map generated state: {map_label}")
    print(f"  {estate_maps['reason']}")

    print()
    print("Context capture:")
    if plan["context_projects"]:
        for project in plan["context_projects"]:
            print(f"  CAPTURE  {project}")
    else:
        print("  CURRENT")

    print()
    print("Runtime mutations:        NONE")
    print("Production deployment:    NONE")
    print("Database mutations:       NONE")
    print("Wolo runtime mutations:   NONE")
    print("Dependency upgrades:      NONE")

    if plan["unknown_p1"]:
        print()
        print("Unrecognized maintenance findings:")
        for finding in plan["unknown_p1"]:
            print(f"  {finding['area']} / {finding['key']}: {finding['detail']}")

    print()
    if plan["blocked"]:
        print("UPDATE: BLOCKED")
    elif not plan["changes_needed"]:
        print("UPDATE: ALREADY CURRENT")
    else:
        print("UPDATE: READY")
        print("Run: aoe2war update --apply")


def require_clean_remote(repo_id: str, repo: Path) -> tuple[str, str]:
    if not repo.is_dir():
        raise UpdateError(f"{repo_id} missing: {repo}")
    branch = git_output(repo, "branch", "--show-current")
    if not branch:
        raise UpdateError(f"{repo_id} is detached")
    head = git_output(repo, "rev-parse", "HEAD")
    dirty = status_paths(repo)
    if dirty:
        raise UpdateError(f"{repo_id} worktree is dirty: {sorted(dirty)}")
    remote = remote_sha(repo, branch)
    if remote is None:
        raise UpdateError(f"cannot resolve origin/{branch} for {repo_id}")
    if remote != head:
        raise UpdateError(
            f"{repo_id} local/remote mismatch: local={head} origin/{branch}={remote}"
        )
    return branch, head


def push_and_verify(repo_id: str, repo: Path, branch: str) -> None:
    rc, out = run(["git", "push", "origin", branch], cwd=repo, timeout=120)
    if rc != 0:
        raise UpdateError(f"push failed for {repo_id}: {out}")
    remote = remote_sha(repo, branch)
    head = git_output(repo, "rev-parse", "HEAD")
    if remote != head:
        raise UpdateError(
            f"post-push parity failed for {repo_id}: local={head} remote={remote}"
        )


def refresh_source_documentation(
    repo_id: str,
    repo: Path,
    progress: Progress | None = None,
) -> dict[str, str]:
    branch, implementation_head = require_clean_remote(repo_id, repo)

    rc, out = source_checker(repo)
    if rc == 0:
        return {
            "repo": repo_id,
            "status": "already-current",
            "implementation_head": implementation_head,
            "documentation_commit": implementation_head,
        }

    if not baseline_refresh_needed(out):
        raise UpdateError(
            f"{repo_id} documentation failure is not safe to auto-refresh: "
            f"{aoe2_audit.checker_summary(out)}"
        )

    rc, out = run(
        ["python3", "scripts/docs_v2_check.py", "--write", "--refresh-baseline"],
        cwd=repo,
        timeout=120,
    )
    if rc != 0:
        raise UpdateError(
            f"{repo_id} baseline refresh failed: {aoe2_audit.checker_summary(out)}"
        )

    changed = status_paths(repo)
    if not changed:
        raise UpdateError(f"{repo_id} checker requested baseline refresh but wrote nothing")

    unsafe = sorted(path for path in changed if not docs_owned_path(path))
    if unsafe:
        raise UpdateError(
            f"{repo_id} documentation refresh touched non-document paths: {unsafe}"
        )

    rc, out = source_checker(repo)
    if rc != 0:
        raise UpdateError(
            f"{repo_id} checker still fails after refresh: "
            f"{aoe2_audit.checker_summary(out)}"
        )

    rc, out = git(repo, "diff", "--check")
    if rc != 0:
        raise UpdateError(f"{repo_id} diff check failed: {out}")

    rc, out = run(["git", "add", "--", *sorted(changed)], cwd=repo)
    if rc != 0:
        raise UpdateError(f"{repo_id} staging failed: {out}")

    rc, out = run(
        ["git", "commit", "-m", f"Refresh {repo_id} documentation baseline"],
        cwd=repo,
    )
    if rc != 0:
        raise UpdateError(f"{repo_id} documentation commit failed: {out}")

    documentation_commit = git_output(repo, "rev-parse", "HEAD")
    push_and_verify(repo_id, repo, branch)

    rc, out = source_checker(repo)
    if rc != 0:
        raise UpdateError(
            f"{repo_id} checker failed after commit: "
            f"{aoe2_audit.checker_summary(out)}"
        )

    return {
        "repo": repo_id,
        "status": "refreshed",
        "implementation_head": implementation_head,
        "documentation_commit": documentation_commit,
    }


def refresh_estate_maps(
    progress: Progress | None = None,
) -> dict[str, Any]:
    """Refresh VPSSentry map blocks only from exact certified production source."""
    if progress:
        progress.start("Re-proving certified source for estate-map refresh...")
    try:
        release_data = aoe2_release.collect()
    except Exception as exc:
        return {
            "status": "deferred",
            "reason": f"release evidence collection failed: {exc}",
        }

    map_plan = estate_map_refresh_plan(release_data)
    if map_plan["status"] == "blocked":
        raise UpdateError(f"estate-map refresh is blocked: {map_plan['reason']}")
    if map_plan["status"] == "deferred":
        if progress:
            progress.done(
                "Estate-map refresh deferred until post-deploy certification"
            )
        return map_plan
    if map_plan["status"] == "current":
        if progress:
            progress.done("Estate-map generated state already matches certification")
        return map_plan

    branch, before_head = require_clean_remote("vpssentry", VPSSENTRY)
    receipt = certification_receipt(release_data)
    snapshot = build_estate_map_snapshot(release_data, receipt)
    tool = VPSSENTRY / "scripts" / "estate_map_current_state.py"
    if not tool.is_file():
        raise UpdateError(f"VPSSentry estate-map renderer is missing: {tool}")

    if progress:
        progress.done(
            "Certified source is exact across Git, production, and activation receipt"
        )
        progress.start("Rendering bounded estate-map current-state blocks...")

    with tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        suffix=".json",
    ) as handle:
        json.dump(snapshot, handle, indent=2, sort_keys=True)
        handle.write("\n")
        handle.flush()
        rc, out = run(
            [
                "python3",
                str(tool),
                "--write",
                "--snapshot",
                handle.name,
                "--mirror-root",
                str(PROJECTS_ROOT),
                "--require-mirrors",
            ],
            cwd=VPSSENTRY,
            timeout=120,
        )
    if rc != 0:
        raise UpdateError(
            "estate-map rendering failed: " + aoe2_audit.checker_summary(out)
        )

    rc, out = run(
        [
            "python3",
            "scripts/docs_v2_check.py",
            "--write",
            "--mirror-root",
            str(PROJECTS_ROOT),
            "--require-map-mirrors",
        ],
        cwd=VPSSENTRY,
        timeout=120,
    )
    if rc != 0:
        raise UpdateError(
            "VPSSentry registry refresh failed after map rendering: "
            + aoe2_audit.checker_summary(out)
        )

    changed = status_paths(VPSSENTRY)
    unsafe = sorted(path for path in changed if path not in ESTATE_MAP_ALLOWED_PATHS)
    if unsafe:
        raise UpdateError(
            "estate-map refresh touched paths outside its documentation allowlist: "
            f"{unsafe}"
        )

    if not changed:
        return {
            **map_plan,
            "status": "already-current",
            "before": before_head,
            "after": before_head,
        }

    rc, out = source_checker(VPSSENTRY)
    if rc != 0:
        raise UpdateError(
            "VPSSentry checker failed after map refresh: "
            + aoe2_audit.checker_summary(out)
        )
    rc, out = git(VPSSENTRY, "diff", "--check")
    if rc != 0:
        raise UpdateError(f"VPSSentry estate-map diff check failed: {out}")

    rc, out = run(
        ["git", "add", "--", *sorted(changed)],
        cwd=VPSSENTRY,
    )
    if rc != 0:
        raise UpdateError(f"VPSSentry estate-map staging failed: {out}")
    rc, out = git(VPSSENTRY, "diff", "--cached", "--check")
    if rc != 0:
        raise UpdateError(f"VPSSentry staged estate-map diff check failed: {out}")

    rc, out = run(
        ["git", "commit", "-m", "Refresh certified estate-map current state"],
        cwd=VPSSENTRY,
    )
    if rc != 0:
        raise UpdateError(f"VPSSentry estate-map commit failed: {out}")
    after_head = git_output(VPSSENTRY, "rev-parse", "HEAD")
    push_and_verify("vpssentry", VPSSENTRY, branch)

    rc, out = source_checker(VPSSENTRY)
    if rc != 0:
        raise UpdateError(
            "VPSSentry checker failed after estate-map commit: "
            + aoe2_audit.checker_summary(out)
        )
    final_plan = estate_map_refresh_plan(release_data)
    if final_plan["status"] != "current":
        raise UpdateError(
            "estate-map current source did not converge after refresh: "
            f"{final_plan}"
        )
    if progress:
        progress.done(
            f"Certified estate-map state pushed ({after_head[:10]})"
        )
    return {
        **final_plan,
        "status": "refreshed",
        "before": before_head,
        "after": after_head,
        "observed_at": snapshot["observed_at"],
    }


def recompute_taxonomy_counts(payload: dict[str, Any]) -> None:
    documents = payload["documents"]
    ids = [
        item["id"] for item in documents
        if item.get("semantic_indexed") and isinstance(item.get("id"), str)
    ]
    counts = payload["expected_counts"]
    counts["corpus_total"] = len(documents)
    counts["semantic_index_total"] = sum(bool(item.get("semantic_indexed")) for item in documents)
    counts["intentionally_unindexed_count"] = sum(not bool(item.get("semantic_indexed")) for item in documents)
    counts["unique_indexed_ids"] = len(set(ids))
    counts["by_repository"] = dict(sorted(Counter(str(item["repository"]) for item in documents).items()))
    counts["by_type"] = dict(sorted(Counter(str(item["type"]) for item in documents).items()))
    counts["by_status"] = dict(sorted(Counter(str(item["status"]) for item in documents).items()))


def reconcile_taxonomy(
    taxonomy: dict[str, Any],
    registries: dict[str, dict[str, Any]],
) -> tuple[dict[str, Any], list[str]]:
    documents = taxonomy["documents"]
    by_key = {
        (str(item["repository"]), str(item["path"])): item
        for item in documents
    }
    changes: list[str] = []

    for repo_id, registry in registries.items():
        registry_docs = {str(item["path"]): item for item in registry["documents"]}
        existing_paths = {
            path for (repository, path) in by_key if repository == repo_id
        }

        removed = sorted(existing_paths - set(registry_docs))
        if removed:
            raise UpdateError(
                f"{repo_id} removed governed documents; manual taxonomy review required: {removed}"
            )

        for path, source in sorted(registry_docs.items()):
            key = (repo_id, path)
            target = by_key.get(key)

            if target is None:
                target = {field: source[field] for field in FIELDS}
                target.update(
                    {
                        "repository": repo_id,
                        "path": path,
                        "semantic_indexed": True,
                        "migration_action": "federate-source-document",
                        "rationale": (
                            f"Federated from {repo_id} repository-local documentation registry."
                        ),
                        "source_sha256": source["sha256"],
                        "phase2_decomposition": "",
                    }
                )
                documents.append(target)
                by_key[key] = target
                changes.append(f"ADD {repo_id}:{path}")
                continue

            before = json.dumps(target, sort_keys=True)
            for field in FIELDS:
                target[field] = source[field]
            target["source_sha256"] = source["sha256"]
            after = json.dumps(target, sort_keys=True)
            if before != after:
                changes.append(f"REFRESH {repo_id}:{path}")

    recompute_taxonomy_counts(taxonomy)

    indexed_ids = [item["id"] for item in documents if item.get("semantic_indexed")]
    if len(indexed_ids) != len(set(indexed_ids)):
        raise UpdateError("taxonomy reconciliation created duplicate indexed IDs")

    return taxonomy, changes


def central_sync(
    progress: Progress | None = None,
) -> dict[str, Any]:
    branch, before_head = require_clean_remote("AoE2WAR-docs", DOCS)

    venv_python = DOCS / ".venv-docs" / "bin" / "python"
    if not venv_python.is_file():
        raise UpdateError(f"central documentation venv missing: {venv_python}")

    if progress:
        progress.start("Synchronizing five repository registries...")

    sync_args = [
        str(venv_python),
        "scripts/sync_workspace.py",
        "--workspace", str(WORKSPACE),
        "--vpssentry", str(VPSSENTRY),
        "--wolochain", str(WOLOCHAIN),
    ]
    rc, out = (
        run_with_heartbeat(
            sync_args,
            cwd=DOCS,
            progress=progress,
            label="Synchronizing repository registries",
            timeout=180,
        )
        if progress
        else run(sync_args, cwd=DOCS, timeout=180)
    )
    if rc != 0:
        raise UpdateError(
            "central raw registry synchronization failed: "
            + aoe2_audit.checker_summary(out)
        )
    if progress:
        progress.done("Five repository registries synchronized")

    registries: dict[str, dict[str, Any]] = {}
    for path in sorted((DOCS / "catalog" / "registries").glob("*.json")):
        payload = json.loads(path.read_text(encoding="utf-8"))
        repo_id = payload.get("repo")
        if isinstance(repo_id, str):
            registries[repo_id] = payload

    if set(registries) != set(SOURCES):
        raise UpdateError(
            "central registry membership mismatch: "
            f"actual={sorted(registries)} expected={sorted(SOURCES)}"
        )

    if progress:
        progress.start("Reconciling central taxonomy...")

    taxonomy_path = DOCS / "catalog" / "document-taxonomy.json"
    taxonomy = json.loads(taxonomy_path.read_text(encoding="utf-8"))
    taxonomy, taxonomy_changes = reconcile_taxonomy(taxonomy, registries)
    taxonomy_path.write_text(
        json.dumps(taxonomy, indent=2) + "\n",
        encoding="utf-8",
    )
    if progress:
        progress.done(
            f"Central taxonomy reconciled "
            f"({len(taxonomy_changes)} source document change(s))"
        )

    gate_labels = {
        "docs-check": "central docs-check",
        "audit-taxonomy": "central taxonomy audit",
        "build": "strict MkDocs build",
    }
    for target in ("docs-check", "audit-taxonomy", "build"):
        label = gate_labels[target]
        if progress:
            progress.start(f"Running {label}...")
            rc, out = run_with_heartbeat(
                ["make", target],
                cwd=DOCS,
                progress=progress,
                label=f"Running {label}",
                timeout=240,
            )
        else:
            rc, out = run(["make", target], cwd=DOCS, timeout=240)
        if rc != 0:
            raise UpdateError(
                f"central {target} failed: {aoe2_audit.checker_summary(out)}"
            )
        if progress:
            progress.done(f"{label} passed")

    rc, out = git(DOCS, "diff", "--check")
    if rc != 0:
        raise UpdateError(f"central diff check failed: {out}")

    changed = status_paths(DOCS)
    unsafe = sorted(path for path in changed if not central_owned_path(path))
    if unsafe:
        raise UpdateError(
            "central synchronization touched paths outside the generated/control-plane "
            f"allowlist: {unsafe}"
        )

    if not changed:
        return {
            "status": "already-current",
            "before": before_head,
            "after": before_head,
            "taxonomy_changes": taxonomy_changes,
        }

    rc, out = run(["git", "add", "--", *sorted(changed)], cwd=DOCS)
    if rc != 0:
        raise UpdateError(f"central staging failed: {out}")

    rc, out = git(DOCS, "diff", "--cached", "--check")
    if rc != 0:
        raise UpdateError(f"central staged diff check failed: {out}")

    if progress:
        progress.start("Committing central documentation synchronization...")

    rc, out = run(
        ["git", "commit", "-m", "Synchronize AoE2WAR documentation estate"],
        cwd=DOCS,
    )
    if rc != 0:
        raise UpdateError(f"central commit failed: {out}")

    after_head = git_output(DOCS, "rev-parse", "HEAD")
    push_and_verify("AoE2WAR-docs", DOCS, branch)
    if progress:
        progress.done(
            f"Central documentation pushed ({after_head[:10]})"
        )

    for target in ("docs-check", "audit-taxonomy", "build"):
        label = gate_labels[target]
        if progress:
            progress.start(f"Rechecking {label} after commit...")
            rc, out = run_with_heartbeat(
                ["make", target],
                cwd=DOCS,
                progress=progress,
                label=f"Rechecking {label}",
                timeout=240,
            )
        else:
            rc, out = run(["make", target], cwd=DOCS, timeout=240)
        if rc != 0:
            raise UpdateError(
                f"central post-commit {target} failed: "
                f"{aoe2_audit.checker_summary(out)}"
            )
        if progress:
            progress.done(f"Post-commit {label} passed")

    if status_paths(DOCS):
        raise UpdateError(
            "central generated state changed after commit; determinism contract failed"
        )

    return {
        "status": "synchronized",
        "before": before_head,
        "after": after_head,
        "taxonomy_changes": taxonomy_changes,
    }


def prune_context_before_capture(
    projects: list[str],
    progress: Progress | None = None,
) -> None:
    context_root = VPSSENTRY / "context"
    tool = VPSSENTRY / "bin" / "context-prune-latest"
    if not tool.is_file():
        raise UpdateError(f"context retention tool missing: {tool}")

    env = os.environ.copy()
    env.update(
        {
            "DRY_RUN": "0",
            "KEEP_N": "1",
            "KEEP_CODE": "0",
            "KEEP_LOGS": "1",
            "PROJECTS": " ".join(projects),
        }
    )
    if progress:
        progress.start("Applying bounded context retention before capture...")
    rc, out = run(
        [str(tool), str(context_root)],
        cwd=VPSSENTRY,
        timeout=180,
        env=env,
    )
    if rc != 0:
        raise UpdateError(
            "pre-capture context retention failed: "
            + aoe2_audit.checker_summary(out)
        )
    if progress:
        progress.done("Pre-capture context retention passed")


def context_capture_headroom(
    projects: list[str],
    progress: Progress | None = None,
) -> dict[str, int]:
    context_root = VPSSENTRY / "context"
    tgz_dir = context_root / "tgz"
    sizes: list[int] = []

    for project in projects:
        matches = sorted(
            tgz_dir.glob(f"{project}-context-*.tgz"),
            key=lambda path: path.stat().st_mtime_ns,
            reverse=True,
        )
        if matches:
            sizes.append(matches[0].stat().st_size)

    largest = max(sizes, default=0)
    expected_outputs = sum(sizes)
    if largest:
        required = max(
            CONTEXT_CAPTURE_MIN_FREE_BYTES,
            (2 * largest) + expected_outputs + CONTEXT_CAPTURE_MARGIN_BYTES,
        )
    else:
        required = CONTEXT_CAPTURE_MIN_FREE_BYTES

    free = shutil.disk_usage(context_root).free
    if free < required:
        raise UpdateError(
            "insufficient Mac context-capture headroom after bounded retention: "
            f"free={free / GIB:.2f} GiB required={required / GIB:.2f} GiB "
            f"projects={projects}"
        )

    result = {
        "free_bytes": free,
        "required_bytes": required,
        "largest_prior_archive_bytes": largest,
        "expected_output_bytes": expected_outputs,
    }
    if progress:
        progress.done(
            "Context capture headroom passed · "
            f"{free / GIB:.1f} GiB free · {required / GIB:.1f} GiB required"
        )
    return result


def capture_context(
    projects: list[str],
    progress: Progress | None = None,
) -> dict[str, dict[str, Any]]:
    if not projects:
        return {}

    tool = VPSSENTRY / "bin" / "full-context-tgz"
    if not tool.is_file():
        raise UpdateError(f"context tool missing: {tool}")

    prune_context_before_capture(projects, progress)
    context_capture_headroom(projects, progress)

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    env = os.environ.copy()
    env["CTX_TS"] = stamp
    env["PRUNE_LATEST"] = "1"
    env["PRUNE_DRY_RUN"] = "0"
    env["KEEP_N"] = "1"
    env["CONTEXT_PROFILE"] = "ops"

    capture_label = "Capturing context: " + ", ".join(projects)
    if progress:
        progress.start(capture_label + "...")

    capture_args = [
        str(tool),
        "--only-projects",
        "--projects",
        " ".join(projects),
    ]
    rc, out = (
        run_with_heartbeat(
            capture_args,
            cwd=VPSSENTRY,
            progress=progress,
            label=capture_label,
            timeout=900,
            env=env,
            heartbeat_seconds=20.0,
        )
        if progress
        else run(
            capture_args,
            cwd=VPSSENTRY,
            timeout=900,
            env=env,
        )
    )
    if rc != 0:
        raise UpdateError(
            "context capture failed: " + aoe2_audit.checker_summary(out)
        )
    if progress:
        progress.done("Context capture command completed")

    tgz_dir = VPSSENTRY / "context" / "tgz"
    sha_dir = VPSSENTRY / "context" / "sha256"
    result: dict[str, dict[str, Any]] = {}

    for project in projects:
        if progress:
            progress.start(f"Verifying {project} context archive...")

        matches = sorted(tgz_dir.glob(f"{project}-context-*-{stamp}.tgz"))
        if len(matches) != 1:
            raise UpdateError(
                f"expected exactly one {project} context archive for {stamp}, "
                f"found {len(matches)}"
            )

        archive = matches[0]
        manifest = sha_dir / f"{archive.name}.sha256"
        if not manifest.is_file():
            raise UpdateError(f"manifest missing for {archive}")

        parsed = aoe2_audit.manifest_entry(manifest.read_text(encoding="utf-8"))
        if parsed is None:
            raise UpdateError(f"malformed manifest: {manifest}")

        expected_sha, manifest_name = parsed
        actual_sha = sha256(archive)

        if manifest_name != archive.name or "/" in manifest_name:
            raise UpdateError(f"non-portable context manifest: {manifest_name!r}")
        if expected_sha != actual_sha:
            raise UpdateError(
                f"context SHA mismatch for {project}: "
                f"manifest={expected_sha} actual={actual_sha}"
            )

        rc, verify = run(
            ["shasum", "-a", "256", "-c", str(manifest)],
            cwd=archive.parent,
            timeout=120,
        )
        if rc != 0:
            raise UpdateError(
                f"context manifest verification failed for {project}: {verify}"
            )

        result[project] = {
            "archive": str(archive),
            "manifest": str(manifest),
            "sha256": actual_sha,
            "bytes": archive.stat().st_size,
        }
        if progress:
            mib = archive.stat().st_size / (1024 * 1024)
            progress.done(
                f"{project} context verified · "
                f"{mib:.1f} MiB · {actual_sha[:12]}"
            )

    return result


def write_receipt(payload: dict[str, Any]) -> Path:
    RECEIPT_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = RECEIPT_DIR / f"{stamp}.json"
    path.write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return path


def apply_update(
    plan: dict[str, Any],
    progress: Progress | None = None,
) -> int:
    if plan["blocked"]:
        raise UpdateError("update plan is blocked; resolve findings manually")

    if not plan["changes_needed"]:
        if plan["estate_maps"]["status"] == "deferred":
            print(
                "AOE2WAR UPDATE: maintenance current; estate-map refresh "
                "deferred until post-deploy certification"
            )
            print(plan["estate_maps"]["reason"])
        else:
            print("AOE2WAR UPDATE: already current")
        return 0

    if progress:
        progress.start("Revalidating repository parity and clean worktrees...")

    for repo_id, repo in SOURCES.items():
        require_clean_remote(repo_id, repo)
    require_clean_remote("AoE2WAR-docs", DOCS)

    if progress:
        progress.done("All source authorities clean and remote-synchronized")
        progress.done(
            "Safety boundary confirmed — "
            "no runtime/database/Wolo/dependency mutation"
        )

    before = plan["audit"]
    source_results: list[dict[str, str]] = []
    estate_map_result: dict[str, Any] = dict(plan["estate_maps"])
    central_result: dict[str, Any] = {"status": "not-needed"}
    archives: dict[str, dict[str, Any]] = {}

    receipt_payload: dict[str, Any] = {
        "schema": 1,
        "kind": "aoe2war-update-result",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "status": "RUNNING",
        "runtime_mutated": False,
        "production_deployed": False,
        "database_mutated": False,
        "wolo_mutated": False,
        "dependency_upgraded": False,
        "before_audit": before,
        "source_results": source_results,
        "estate_map_result": estate_map_result,
        "central_result": central_result,
        "context_archives": archives,
    }

    try:
        for repo_id in plan["baseline_refreshes"]:
            if progress:
                progress.start(
                    f"Refreshing {repo_id} documentation baseline..."
                )
            result = refresh_source_documentation(
                repo_id,
                SOURCES[repo_id],
                progress=progress,
            )
            source_results.append(result)
            if progress:
                progress.done(
                    f"{repo_id} documentation refreshed "
                    f"({result['documentation_commit'][:10]})"
                )

        if plan["estate_maps"]["status"] == "refresh":
            estate_map_result = refresh_estate_maps(progress=progress)
            receipt_payload["estate_map_result"] = estate_map_result

        if (
            plan["central_sync"]
            or source_results
            or estate_map_result.get("status") == "refreshed"
        ):
            central_result = central_sync(progress=progress)
            receipt_payload["central_result"] = central_result

        projects = set(plan["context_projects"])
        for result in source_results:
            if result["status"] == "refreshed":
                projects.add(REPO_TO_CONTEXT[result["repo"]])
        if estate_map_result.get("status") == "refreshed":
            projects.add("VPSSentry")
        if central_result.get("status") == "synchronized":
            projects.add("AoE2WAR-docs")

        ordered = [
            project
            for project in (
                "AoE2HDBets",
                "WoloChain-wolo-1",
                "VPSSentry",
                "AoE2WAR-docs",
            )
            if project in projects
        ]

        archives = capture_context(ordered, progress=progress)
        receipt_payload["context_archives"] = archives

        if progress:
            progress.start("Running final full estate audit...")

        after_audit = aoe2_audit.collect_audit().payload()
        receipt_payload["after_audit"] = after_audit

        if after_audit["p0"] or after_audit["p1"]:
            raise UpdateError(
                "final estate audit is not clean: "
                f"P0={after_audit['p0']} P1={after_audit['p1']}"
            )

        if progress:
            progress.done("Final estate audit passed — P0=0 P1=0")

        receipt_payload["status"] = "VERIFIED"
        receipt_payload["completed_at"] = datetime.now(timezone.utc).isoformat()
        receipt = write_receipt(receipt_payload)

        print("⚔️  AOE2WAR UPDATE COMPLETE")
        print()
        for result in source_results:
            print(
                f"{result['repo']}: {result['status']} "
                f"docs={result['documentation_commit'][:10]}"
            )
        print(
            "Estate maps: "
            f"{estate_map_result.get('status')} · "
            f"{estate_map_result.get('reason')}"
        )
        print(
            "Central: "
            f"{central_result.get('status')} "
            f"{str(central_result.get('after') or '')[:10]}"
        )
        for project, item in archives.items():
            print(
                f"Context: {project} {item['sha256'][:12]} "
                f"{item['bytes']} bytes"
            )
        print()
        print("P0  0")
        print("P1  0")
        print("Runtime mutations: NONE")
        print("Wolo mutations: NONE")
        print(f"Receipt: {receipt}")
        print()
        print("ESTATE: HEALTHY")
        return 0

    except Exception as exc:
        receipt_payload["status"] = "FAILED"
        receipt_payload["failed_at"] = datetime.now(timezone.utc).isoformat()
        receipt_payload["error"] = str(exc)
        receipt = write_receipt(receipt_payload)
        raise UpdateError(
            f"{exc}\nupdate failure receipt: {receipt}"
        ) from exc


def main() -> int:
    parser = argparse.ArgumentParser(
        prog="aoe2war update",
        description=(
            "Plan or apply documentation/control-plane/context reconciliation "
            "without deploying or mutating runtime state."
        ),
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="apply the safe maintenance plan",
    )
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    if not args.apply:
        plan = collect_plan()
        if args.json:
            print(json.dumps(plan, indent=2, sort_keys=True))
        else:
            print_plan(plan)
        if plan["blocked"]:
            return 2
        return 1 if plan["changes_needed"] else 0

    if args.json:
        parser.error("--json is currently plan-only; omit it with --apply")

    progress = Progress()
    print("⚔️  AOE2WAR UPDATE", flush=True)
    print(flush=True)

    try:
        progress.start("Acquiring maintenance + release locks...")
        with update_lock():
            progress.done("Maintenance + release locks acquired")

            progress.start("Auditing estate and building locked update plan...")
            locked_plan = collect_plan()
            locked_audit = locked_plan["audit"]
            progress.done(
                "Locked update plan built — "
                f"P0={locked_audit['p0']} P1={locked_audit['p1']}"
            )

            if locked_plan["blocked"]:
                raise UpdateError(
                    "locked update plan is blocked; "
                    "run `aoe2war update` for details"
                )

            if not locked_plan["changes_needed"]:
                if locked_plan["estate_maps"]["status"] == "deferred":
                    progress.done(
                        "Maintenance is current; estate-map refresh deferred "
                        "until post-deploy certification"
                    )
                else:
                    progress.done("Estate is already current")
                print()
                print("UPDATE: ALREADY CURRENT")
                if locked_plan["estate_maps"]["status"] == "deferred":
                    print(
                        "Estate maps: DEFERRED — "
                        + locked_plan["estate_maps"]["reason"]
                    )
                return 0

            return apply_update(locked_plan, progress=progress)
    except (UpdateError, aoe2_release.DeployLockBusy) as exc:
        print(f"STOP: {exc}", file=os.sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
