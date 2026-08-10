#!/usr/bin/env python3
from __future__ import annotations

import argparse
import fcntl
import hashlib
import json
import os
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


def collect_plan() -> dict[str, Any]:
    audit = aoe2_audit.collect_audit()
    payload = audit.payload()

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

    blocked = bool(payload["p0"] or blocked_source_docs or unknown_p1)

    return {
        "schema": 1,
        "audit": payload,
        "baseline_refreshes": sorted(baseline_refreshes),
        "blocked_source_docs": blocked_source_docs,
        "unknown_p1": unknown_p1,
        "central_sync": central_sync_needed,
        "context_projects": sorted(context_projects),
        "blocked": blocked,
        "changes_needed": bool(
            baseline_refreshes or central_sync_needed or context_projects
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


def capture_context(
    projects: list[str],
    progress: Progress | None = None,
) -> dict[str, dict[str, Any]]:
    if not projects:
        return {}

    tool = VPSSENTRY / "bin" / "full-context-tgz"
    if not tool.is_file():
        raise UpdateError(f"context tool missing: {tool}")

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    env = os.environ.copy()
    env["CTX_TS"] = stamp
    env["PRUNE_LATEST"] = "0"
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

        if plan["central_sync"] or source_results:
            central_result = central_sync(progress=progress)
            receipt_payload["central_result"] = central_result

        projects = set(plan["context_projects"])
        for result in source_results:
            if result["status"] == "refreshed":
                projects.add(REPO_TO_CONTEXT[result["repo"]])
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
                progress.done("Estate is already current")
                print()
                print("UPDATE: ALREADY CURRENT")
                return 0

            return apply_update(locked_plan, progress=progress)
    except (UpdateError, aoe2_release.DeployLockBusy) as exc:
        print(f"STOP: {exc}", file=os.sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
