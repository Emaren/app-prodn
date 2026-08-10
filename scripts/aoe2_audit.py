#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import tarfile
import tempfile
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
WORKSPACE = Path(os.getenv("AOE2_AUDIT_WORKSPACE", str(ROOT.parent))).resolve()
PROJECTS_ROOT = Path(
    os.getenv("AOE2_AUDIT_PROJECTS_ROOT", str(WORKSPACE.parent))
).resolve()

APP = ROOT
API = Path(os.getenv("AOE2_AUDIT_API", str(WORKSPACE / "api-prodn"))).resolve()
WATCHER = Path(
    os.getenv("AOE2_AUDIT_WATCHER", str(WORKSPACE / "aoe2-watcher"))
).resolve()
VPSSENTRY = Path(
    os.getenv("AOE2_AUDIT_VPSSENTRY", str(PROJECTS_ROOT / "VPSSentry"))
).resolve()
WOLOCHAIN = Path(
    os.getenv("AOE2_AUDIT_WOLOCHAIN", str(PROJECTS_ROOT / "WoloChain-wolo-1"))
).resolve()
DOCS = Path(
    os.getenv("AOE2_AUDIT_DOCS", str(PROJECTS_ROOT / "AoE2WAR-docs"))
).resolve()

CORE_SOURCES = {
    "app-prodn": APP,
    "api-prodn": API,
    "aoe2-watcher": WATCHER,
    "vpssentry": VPSSENTRY,
    "wolochain": WOLOCHAIN,
}

AREA_BY_REPO = {
    "app-prodn": "Application",
    "api-prodn": "API / Parser",
    "aoe2-watcher": "Watcher",
    "vpssentry": "VPSSentry",
    "wolochain": "WoloChain",
}

AREAS = [
    "Git",
    "Application",
    "API / Parser",
    "Watcher",
    "WoloChain",
    "VPSSentry",
    "Documentation",
    "Release Engine",
    "Production",
    "Context Durability",
    "Estate Maps",
]

ARCHIVE_SERIES = {
    "AoE2HDBets": [APP, API, WATCHER],
    "WoloChain-wolo-1": [WOLOCHAIN],
    "VPSSentry": [VPSSENTRY],
    "AoE2WAR-docs": [DOCS],
}

ARCHIVE_TS_RE = re.compile(r"-(\d{8}-\d{6})\.tgz$")


@dataclass(frozen=True)
class Finding:
    severity: str
    area: str
    key: str
    detail: str


class Audit:
    def __init__(self) -> None:
        self.findings: list[Finding] = []
        self.info: dict[str, Any] = {}
        self.notes: list[str] = []

    def add(self, severity: str, area: str, key: str, detail: str) -> None:
        if severity not in {"P0", "P1"}:
            raise ValueError(f"unsupported severity {severity}")
        self.findings.append(Finding(severity, area, key, detail))

    def note(self, text: str) -> None:
        self.notes.append(text)

    def count(self, severity: str) -> int:
        return sum(item.severity == severity for item in self.findings)

    def area_status(self, area: str) -> str:
        items = [item for item in self.findings if item.area == area]
        if any(item.severity == "P0" for item in items):
            return "FAIL"
        if any(item.severity == "P1" for item in items):
            return "WARN"
        return "PASS"

    def exit_code(self) -> int:
        if self.count("P0"):
            return 2
        if self.count("P1"):
            return 1
        return 0

    def estate_status(self) -> str:
        if self.count("P0"):
            return "UNSAFE"
        if self.count("P1"):
            return "ATTENTION_REQUIRED"
        return "HEALTHY"

    def payload(self) -> dict[str, Any]:
        return {
            "schema": 1,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "estate": self.estate_status(),
            "p0": self.count("P0"),
            "p1": self.count("P1"),
            "areas": {area: self.area_status(area) for area in AREAS},
            "findings": [asdict(item) for item in self.findings],
            "notes": self.notes,
            "info": self.info,
        }


def run(args: list[str], *, cwd: Path, timeout: int = 120) -> tuple[int, str]:
    try:
        p = subprocess.run(
            args,
            cwd=str(cwd),
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=timeout,
            check=False,
        )
        return p.returncode, p.stdout.rstrip()
    except Exception as exc:
        return 127, str(exc)


def git(repo: Path, *args: str, timeout: int = 30) -> tuple[int, str]:
    return run(["git", *args], cwd=repo, timeout=timeout)


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def remote_branch_sha(repo: Path, branch: str) -> str | None:
    rc, out = git(
        repo,
        "ls-remote",
        "--exit-code",
        "origin",
        f"refs/heads/{branch}",
        timeout=30,
    )
    if rc != 0 or not out:
        return None
    return out.split()[0]


def repo_snapshot(audit: Audit, repo_id: str, repo: Path) -> dict[str, Any] | None:
    area = AREA_BY_REPO.get(repo_id, "Git")
    if not repo.is_dir():
        audit.add("P0", area, "repo-missing", f"{repo_id}: {repo}")
        return None

    rc, branch = git(repo, "branch", "--show-current")
    if rc != 0 or not branch:
        audit.add("P0", "Git", "branch-unresolved", repo_id)
        return None

    rc, head = git(repo, "rev-parse", "HEAD")
    if rc != 0 or len(head) != 40:
        audit.add("P0", "Git", "head-unresolved", repo_id)
        return None

    rc, dirty = git(repo, "status", "--porcelain=v1", "--untracked-files=all")
    if rc != 0:
        audit.add("P0", "Git", "status-failed", repo_id)
        dirty_lines: list[str] = []
    else:
        dirty_lines = [line for line in dirty.splitlines() if line.strip()]
        if dirty_lines:
            audit.add(
                "P1",
                "Git",
                "dirty-worktree",
                f"{repo_id}: {len(dirty_lines)} changed path(s)",
            )

    remote = remote_branch_sha(repo, branch)
    if remote is None:
        audit.add("P1", "Git", "remote-unresolved", f"{repo_id}: origin/{branch}")
    elif remote != head:
        audit.add(
            "P1",
            "Git",
            "remote-parity",
            f"{repo_id}: local={head} origin/{branch}={remote}",
        )

    return {
        "path": str(repo),
        "branch": branch,
        "head": head,
        "remote": remote,
        "dirty_count": len(dirty_lines),
    }


def check_source_repositories(audit: Audit) -> dict[str, dict[str, Any]]:
    snapshots: dict[str, dict[str, Any]] = {}
    for repo_id, repo in CORE_SOURCES.items():
        snap = repo_snapshot(audit, repo_id, repo)
        if snap is not None:
            snapshots[repo_id] = snap
    audit.info["source_repositories"] = snapshots
    return snapshots


def checker_summary(text: str) -> str:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    return " | ".join(lines[-3:])[:1000] if lines else "no checker output"


def check_source_documentation(audit: Audit) -> None:
    results: dict[str, Any] = {}
    for repo_id, repo in CORE_SOURCES.items():
        checker = repo / "scripts" / "docs_v2_check.py"
        area = AREA_BY_REPO[repo_id]
        if not checker.is_file():
            audit.add("P0", area, "docs-checker-missing", f"{repo_id}: {checker}")
            continue
        rc, out = run(["python3", str(checker)], cwd=repo, timeout=90)
        results[repo_id] = {"rc": rc, "summary": checker_summary(out)}
        if rc != 0:
            audit.add(
                "P1",
                area,
                "documentation-drift",
                f"{repo_id}: {checker_summary(out)}",
            )
    audit.info["source_documentation_checkers"] = results


def load_json(path: Path) -> dict[str, Any] | None:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else None
    except Exception:
        return None


def check_central_state(
    audit: Audit,
    snapshots: dict[str, dict[str, Any]],
) -> None:
    if not DOCS.is_dir():
        audit.add("P0", "Documentation", "central-docs-missing", str(DOCS))
        return

    central = repo_snapshot(audit, "AoE2WAR-docs", DOCS)
    if central is not None:
        audit.info["central_repository"] = central

    state_path = DOCS / "catalog" / "runtime" / "repository-state.json"
    state = load_json(state_path)
    if state is None:
        audit.add(
            "P0", "Documentation", "repository-state-invalid", str(state_path)
        )
        return

    items = {
        item.get("id"): item
        for item in state.get("repositories", [])
        if isinstance(item, dict) and isinstance(item.get("id"), str)
    }

    missing = set(CORE_SOURCES) - set(items)
    if missing:
        audit.add(
            "P0",
            "Documentation",
            "federation-membership",
            f"missing source registry state: {sorted(missing)}",
        )

    for repo_id, snap in snapshots.items():
        item = items.get(repo_id)
        if not isinstance(item, dict):
            continue
        expected_snapshot = {"branch": snap["branch"], "commit": snap["head"]}
        if item.get("documentation_snapshot") != expected_snapshot:
            audit.add(
                "P1",
                "Documentation",
                "central-source-snapshot-stale",
                f"{repo_id}: central={item.get('documentation_snapshot')} "
                f"source={expected_snapshot}",
            )

        baseline = item.get("implementation_baseline")
        if not (
            isinstance(baseline, dict)
            and isinstance(baseline.get("branch"), str)
            and isinstance(baseline.get("commit"), str)
            and len(baseline["commit"]) == 40
        ):
            audit.add(
                "P0",
                "Documentation",
                "implementation-baseline-invalid",
                f"{repo_id}: {baseline!r}",
            )

    audit.info["central_repository_state"] = {
        "schema_version": state.get("schema_version"),
        "source_ids": sorted(items),
    }


def check_taxonomy(audit: Audit) -> None:
    taxonomy = load_json(DOCS / "catalog" / "document-taxonomy.json")
    taxonomy_audit = load_json(DOCS / "taxonomy-audit.json")
    if taxonomy is None or taxonomy_audit is None:
        audit.add(
            "P0",
            "Documentation",
            "taxonomy-invalid",
            "document-taxonomy.json or taxonomy-audit.json missing/invalid",
        )
        return

    counts = taxonomy.get("expected_counts")
    if not isinstance(counts, dict):
        audit.add("P0", "Documentation", "taxonomy-counts-missing", "expected_counts")
        return

    for key in (
        "candidate_classifications",
        "unclassified",
        "path_moves",
        "exact_duplicate_content_groups",
        "duplicate_heading_groups",
    ):
        if counts.get(key) != 0:
            audit.add(
                "P0",
                "Documentation",
                f"taxonomy-{key}",
                f"actual={counts.get(key)!r} expected=0",
            )

    if taxonomy_audit.get("duplicate_heading_groups") not in ({}, None):
        audit.add(
            "P0",
            "Documentation",
            "semantic-heading-duplicates",
            repr(taxonomy_audit.get("duplicate_heading_groups")),
        )

    audit.info["taxonomy"] = {
        "corpus_total": counts.get("corpus_total"),
        "semantic_index_total": counts.get("semantic_index_total"),
        "intentionally_unindexed_count": counts.get("intentionally_unindexed_count"),
        "raw_duplicate_heading_groups": len(
            taxonomy_audit.get("raw_duplicate_heading_groups", {}) or {}
        ),
    }


def copy_central_head_to_temp() -> tuple[tempfile.TemporaryDirectory[str], Path]:
    temp = tempfile.TemporaryDirectory(prefix="aoe2war-audit-docs-")
    root = Path(temp.name)
    archive = root / "repo.tar"
    checkout = root / "checkout"
    checkout.mkdir()

    rc, out = run(
        ["git", "archive", "--format=tar", "-o", str(archive), "HEAD"],
        cwd=DOCS,
        timeout=60,
    )
    if rc != 0:
        temp.cleanup()
        raise RuntimeError(f"git archive failed: {out}")

    with tarfile.open(archive, "r") as tar:
        tar.extractall(checkout)

    return temp, checkout


def check_central_quality_gates(audit: Audit) -> None:
    if not DOCS.is_dir():
        return
    venv_python = DOCS / ".venv-docs" / "bin" / "python"
    if not venv_python.is_file():
        audit.add("P0", "Documentation", "docs-venv-missing", str(venv_python))
        return

    try:
        temp, checkout = copy_central_head_to_temp()
    except Exception as exc:
        audit.add("P0", "Documentation", "docs-snapshot-copy-failed", str(exc))
        return

    try:
        venv_mkdocs = DOCS / ".venv-docs" / "bin" / "mkdocs"
        if not venv_mkdocs.is_file():
            audit.add(
                "P0",
                "Documentation",
                "docs-mkdocs-missing",
                str(venv_mkdocs),
            )
            return

        common = [
            f"VENV_PYTHON={venv_python}",
            f"VENV_MKDOCS={venv_mkdocs}",
            f"WORKSPACE={WORKSPACE}",
            f"VPSSENTRY={VPSSENTRY}",
            f"WOLOCHAIN={WOLOCHAIN}",
        ]
        results: dict[str, Any] = {}
        for label, target in (
            ("docs-check", "docs-check"),
            ("audit-taxonomy", "audit-taxonomy"),
            ("strict-build", "build"),
        ):
            rc, out = run(
                ["make", target, *common],
                cwd=checkout,
                timeout=180,
            )
            results[label] = {"rc": rc, "summary": checker_summary(out)}
            if rc != 0:
                severity = "P1" if label == "audit-taxonomy" else "P0"
                key = (
                    "central-federation-drift"
                    if label == "audit-taxonomy"
                    else label
                )
                audit.add(
                    severity,
                    "Documentation",
                    key,
                    checker_summary(out),
                )
        audit.info["central_quality_gates"] = results
    finally:
        temp.cleanup()


def check_maps(audit: Audit) -> None:
    pairs = [
        (
            "SYSTEM_MAP",
            VPSSENTRY / "context" / "SYSTEM_MAP.md",
            PROJECTS_ROOT / "SYSTEM_MAP.md",
        ),
        (
            "SERVER_STORAGE_MAP",
            VPSSENTRY / "context" / "SERVER_STORAGE_MAP.md",
            PROJECTS_ROOT / "SERVER_STORAGE_MAP.md",
        ),
    ]
    results: dict[str, Any] = {}
    for label, authoritative, mirror in pairs:
        if not authoritative.is_file() or not mirror.is_file():
            audit.add(
                "P0",
                "Estate Maps",
                "map-missing",
                f"{label}: authoritative={authoritative.is_file()} "
                f"mirror={mirror.is_file()}",
            )
            continue
        auth_sha = sha256(authoritative)
        mirror_sha = sha256(mirror)
        results[label] = {
            "authoritative_sha256": auth_sha,
            "mirror_sha256": mirror_sha,
        }
        if authoritative.read_bytes() != mirror.read_bytes():
            audit.add(
                "P0",
                "Estate Maps",
                "mirror-drift",
                f"{label}: authoritative={auth_sha} mirror={mirror_sha}",
            )
    audit.info["estate_maps"] = results


def manifest_entry(text: str) -> tuple[str, str] | None:
    parts = text.strip().split(None, 1)
    if len(parts) != 2:
        return None
    digest = parts[0]
    name = parts[1].strip().lstrip("*")
    if not re.fullmatch(r"[0-9a-fA-F]{64}", digest):
        return None
    return digest.lower(), name


def archive_timestamp(name: str) -> datetime | None:
    match = ARCHIVE_TS_RE.search(name)
    if not match:
        return None
    try:
        return datetime.strptime(
            match.group(1), "%Y%m%d-%H%M%S"
        ).replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def commit_epoch(repo: Path) -> int | None:
    rc, out = git(repo, "show", "-s", "--format=%ct", "HEAD")
    return int(out) if rc == 0 and out.isdigit() else None


def latest_archive(series: str) -> Path | None:
    root = VPSSENTRY / "context" / "tgz"
    if not root.is_dir():
        return None
    candidates = list(root.glob(f"{series}-context-*.tgz"))
    return max(candidates, key=lambda path: path.stat().st_mtime) if candidates else None


def check_context_archives(audit: Audit) -> None:
    sha_dir = VPSSENTRY / "context" / "sha256"
    results: dict[str, Any] = {}

    for series, source_repos in ARCHIVE_SERIES.items():
        archive = latest_archive(series)
        if archive is None:
            audit.add("P0", "Context Durability", "archive-missing", series)
            continue

        manifest = sha_dir / f"{archive.name}.sha256"
        if not manifest.is_file():
            audit.add(
                "P0", "Context Durability", "manifest-missing", f"{series}: {manifest}"
            )
            continue

        entry = manifest_entry(manifest.read_text(encoding="utf-8"))
        if entry is None:
            audit.add(
                "P0", "Context Durability", "manifest-format", f"{series}: {manifest}"
            )
            continue

        expected_sha, manifest_name = entry
        actual_sha = sha256(archive)
        portable = manifest_name == archive.name and "/" not in manifest_name

        if not portable:
            audit.add(
                "P0",
                "Context Durability",
                "manifest-portability",
                f"{series}: {manifest_name!r}",
            )
        if expected_sha != actual_sha:
            audit.add(
                "P0",
                "Context Durability",
                "manifest-sha",
                f"{series}: expected={expected_sha} actual={actual_sha}",
            )

        stamp = archive_timestamp(archive.name)
        epochs = [commit_epoch(repo) for repo in source_repos]
        known_epochs = [value for value in epochs if value is not None]
        newest_commit = max(known_epochs) if known_epochs else None
        stale = bool(
            stamp is not None
            and newest_commit is not None
            and int(stamp.timestamp()) < newest_commit
        )
        if stale:
            audit.add(
                "P1",
                "Context Durability",
                "archive-stale",
                f"{series}: archive={stamp.isoformat()} newest_source_commit="
                f"{datetime.fromtimestamp(newest_commit, timezone.utc).isoformat()}",
            )

        results[series] = {
            "archive": str(archive),
            "sha256": actual_sha,
            "manifest": str(manifest),
            "portable": portable,
            "stale": stale,
        }

    audit.info["context_archives"] = results


def check_production(audit: Audit) -> None:
    try:
        import aoe2_release
    except Exception as exc:
        audit.add("P0", "Release Engine", "release-engine-import", str(exc))
        return

    try:
        data = aoe2_release.collect()
    except Exception as exc:
        audit.add("P0", "Release Engine", "release-collect", str(exc))
        return

    prod = data.get("production", {})
    release = data.get("release", {})
    cert = data.get("certification", {})

    if not prod.get("reachable"):
        audit.add(
            "P0",
            "Production",
            "unreachable",
            str(prod.get("error") or "production inspection failed"),
        )
    else:
        if prod.get("dirty_count") not in (0, None):
            audit.add(
                "P0", "Production", "dirty", f"dirty_count={prod.get('dirty_count')}"
            )
        if prod.get("service") != "active":
            audit.add(
                "P0", "Production", "service", f"service={prod.get('service')!r}"
            )
        if not prod.get("version_parity"):
            audit.add(
                "P0",
                "Production",
                "version-parity",
                f"internal={prod.get('internal_build_version')!r} "
                f"public={prod.get('public_build_version')!r}",
            )
        if (prod.get("wolo_8092_count") or 0) < 1:
            audit.add(
                "P0",
                "Production",
                "wolo-8092",
                "protected settlement listener 8092 missing",
            )
        if (prod.get("wolo_8093_count") or 0) < 1:
            audit.add(
                "P0",
                "Production",
                "wolo-8093",
                "protected settlement listener 8093 missing",
            )
        if cert.get("status") != "CERTIFIED":
            audit.add(
                "P0",
                "Release Engine",
                "runtime-provenance",
                f"status={cert.get('status')!r}",
            )

    audit.info["release"] = {
        "state": release.get("state"),
        "next": release.get("next"),
        "production_source": prod.get("source_sha"),
        "service": prod.get("service"),
        "active_build_id": prod.get("active_build_id"),
        "internal_build_version": prod.get("internal_build_version"),
        "public_build_version": prod.get("public_build_version"),
        "root_free_kb": prod.get("root_free_kb"),
        "volume_free_kb": prod.get("volume_free_kb"),
        "wolo_8092_count": prod.get("wolo_8092_count"),
        "wolo_8093_count": prod.get("wolo_8093_count"),
        "certification": cert,
    }


def check_wolo_vps_split(audit: Audit) -> None:
    state = load_json(DOCS / "catalog" / "runtime" / "repository-state.json")
    if state is None:
        return
    item = next(
        (
            value
            for value in state.get("repositories", [])
            if isinstance(value, dict) and value.get("id") == "wolochain"
        ),
        None,
    )
    if not isinstance(item, dict):
        return

    baseline = item.get("implementation_baseline")
    expected = baseline.get("commit") if isinstance(baseline, dict) else None
    if not isinstance(expected, str):
        return

    host = os.getenv("AOE2_RELEASE_HOST", "hel1")
    remote_repo = os.getenv(
        "AOE2_AUDIT_WOLO_VPS_REPO", "/var/www/WoloChain-wolo-1"
    )
    rc, out = run(
        [
            "ssh",
            "-o",
            "BatchMode=yes",
            "-o",
            "ConnectTimeout=6",
            host,
            f"git -C {remote_repo} rev-parse HEAD 2>/dev/null || true",
        ],
        cwd=ROOT,
        timeout=12,
    )
    remote_head = out.splitlines()[-1].strip() if out.strip() else ""
    if rc == 0 and remote_head:
        audit.info["wolo_vps"] = {
            "head": remote_head,
            "expected_implementation_baseline": expected,
        }
        if remote_head != expected:
            audit.add(
                "P1",
                "WoloChain",
                "vps-source-drift",
                f"VPS={remote_head} implementation_baseline={expected}",
            )
    else:
        audit.note(
            "Optional direct WoloChain VPS checkout proof unavailable; "
            "production listener checks still ran."
        )


def print_human(audit: Audit) -> None:
    payload = audit.payload()
    print("⚔️  AOE2WAR ESTATE AUDIT")
    print()
    for area in AREAS:
        status = audit.area_status(area)
        mark = {"PASS": "✓", "WARN": "!", "FAIL": "✗"}[status]
        print(f"{area:<22} {mark} {status}")

    print()
    print(f"P0  {payload['p0']}")
    print(f"P1  {payload['p1']}")
    print()

    for finding in audit.findings:
        print(
            f"{finding.severity}  [{finding.area}] "
            f"{finding.key}: {finding.detail}"
        )
    if audit.findings:
        print()

    release = audit.info.get("release", {})
    if release:
        print(
            "Runtime: "
            f"state={release.get('state')} "
            f"service={release.get('service')} "
            f"source={str(release.get('production_source') or '—')[:10]} "
            f"build={release.get('active_build_id') or '—'}"
        )

    taxonomy = audit.info.get("taxonomy", {})
    if taxonomy:
        print(
            "Docs: "
            f"corpus={taxonomy.get('corpus_total')} "
            f"indexed={taxonomy.get('semantic_index_total')} "
            f"unindexed={taxonomy.get('intentionally_unindexed_count')} "
            f"raw_provenance_h1={taxonomy.get('raw_duplicate_heading_groups')}"
        )

    print()
    print(f"ESTATE: {payload['estate']}")


def main() -> int:
    parser = argparse.ArgumentParser(
        prog="aoe2war audit",
        description=(
            "Read-only audit of AoE2WAR source, documentation, production, "
            "Wolo protection, maps, and context durability."
        ),
    )
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    audit = Audit()
    snapshots = check_source_repositories(audit)
    check_source_documentation(audit)
    check_central_state(audit, snapshots)
    check_taxonomy(audit)
    check_central_quality_gates(audit)
    check_maps(audit)
    check_context_archives(audit)
    check_production(audit)
    check_wolo_vps_split(audit)

    if args.json:
        print(json.dumps(audit.payload(), indent=2, sort_keys=True))
    else:
        print_human(audit)
    return audit.exit_code()


if __name__ == "__main__":
    raise SystemExit(main())
