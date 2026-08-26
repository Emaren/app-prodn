#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "config" / "aoe2war-operations.json"

STATES = {
    "PLANNED",
    "BUILDING",
    "TESTING",
    "READY",
    "PAUSED",
    "BLOCKED",
    "CONFLICT",
    "REVIEW_REQUIRED",
    "RECONCILING",
    "INTEGRATING",
    "CERTIFYING",
    "RELEASED",
    "ABANDONED",
}

CRITICAL_CONTRACTS = {
    "database-schema",
    "financial-truth",
    "replay-finality",
    "battle-identity",
    "watcher-reconciliation",
    "release-engineering",
    "wolo-boundary",
}

CONTRACT_RULES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("database-schema", ("prisma/schema.prisma", "prisma/migrations/")),
    (
        "financial-truth",
        (
            "lib/bets",
            "lib/scheduledMatchSettlement",
            "lib/challengeFinancial",
            "app/api/bets/",
            "app/api/staking/",
            "app/api/challenges/",
        ),
    ),
    (
        "battle-identity",
        (
            "lib/battleIdentity",
            "lib/liveGames",
            "lib/liveSession",
            "app/api/live-games/",
        ),
    ),
    (
        "watcher-reconciliation",
        (
            "lib/watch",
            "lib/liveGames",
            "lib/liveSession",
            "tests/watcher",
            "tests/live-",
        ),
    ),
    (
        "replay-finality",
        (
            "lib/replay",
            "app/api/replay",
            "tests/hd-replay",
            "tests/replay",
        ),
    ),
    ("wargraph", ("lib/wargraph/", "app/wargraph/", "app/api/wargraph/")),
    (
        "release-engineering",
        (
            "bin/aoe2war",
            "scripts/aoe2_",
            "config/aoe2war-operations.json",
            "docs/RELEASE_ENGINEERING.md",
            "DEPLOY.md",
        ),
    ),
    (
        "documentation-control",
        (
            "docs/document-registry.json",
            "docs/DOCUMENTATION_CONTROL_PLANE.md",
        ),
    ),
    ("wolo-boundary", ("lib/wolo", "app/api/wolo", "scripts/wolo")),
)


class ParallelError(RuntimeError):
    pass


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def run(
    args: list[str],
    *,
    cwd: Path = ROOT,
    capture: bool = True,
    env: dict[str, str] | None = None,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        args,
        cwd=cwd,
        env=env,
        text=True,
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.STDOUT if capture else None,
        check=False,
    )


def checked(
    args: list[str],
    *,
    cwd: Path = ROOT,
    capture: bool = True,
    env: dict[str, str] | None = None,
) -> str:
    proc = run(args, cwd=cwd, capture=capture, env=env)
    if proc.returncode != 0:
        tail = (proc.stdout or "")[-5000:] if capture else ""
        raise ParallelError(
            "command failed: "
            + " ".join(args)
            + (f"\n{tail}" if tail else "")
        )
    return (proc.stdout or "").strip() if capture else ""


def git(*args: str, cwd: Path = ROOT) -> str:
    return checked(["git", *args], cwd=cwd)


def load_operations() -> dict[str, Any]:
    return json.loads(CONTRACT.read_text(encoding="utf-8"))


def parallel_policy() -> dict[str, Any]:
    return dict(load_operations().get("parallel_development") or {})


def canonical_repo() -> Path:
    value = load_operations()["canonical"]["operator_repo"]
    return Path(value).expanduser().resolve()


def git_common_dir(repo: Path = ROOT) -> Path:
    raw = git("rev-parse", "--git-common-dir", cwd=repo)
    value = Path(raw)
    if not value.is_absolute():
        value = repo / value
    return value.resolve()


def state_store(repo: Path = ROOT) -> Path:
    relative = str(
        parallel_policy().get("state_store_relative_to_git_common_dir")
        or "aoe2war-dev/lanes"
    )
    path = git_common_dir(repo) / relative
    path.mkdir(parents=True, exist_ok=True)
    return path


def current_branch(repo: Path) -> str:
    return git("branch", "--show-current", cwd=repo)


def manifest_path(branch: str, repo: Path = ROOT) -> Path:
    key = hashlib.sha256(branch.encode("utf-8")).hexdigest()[:16]
    return state_store(repo) / f"{key}.json"


def load_manifest(branch: str, repo: Path = ROOT) -> dict[str, Any] | None:
    path = manifest_path(branch, repo)
    if not path.is_file():
        return None
    payload = json.loads(path.read_text(encoding="utf-8"))
    if payload.get("branch") != branch:
        raise ParallelError(f"lane manifest identity mismatch: {path}")
    return payload


def write_manifest(payload: dict[str, Any], repo: Path = ROOT) -> None:
    branch = str(payload["branch"])
    path = manifest_path(branch, repo)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    tmp.replace(path)


def all_manifests(repo: Path = ROOT) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for path in sorted(state_store(repo).glob("*.json")):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if isinstance(payload, dict) and payload.get("branch"):
            result.append(payload)
    return result


def normalize_state(value: str) -> str:
    state = value.strip().upper().replace("-", "_")
    if state not in STATES:
        raise ParallelError(
            f"invalid lane state {value!r}; expected one of "
            + ", ".join(sorted(STATES))
        )
    return state


def slugify(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    if not value:
        raise ParallelError("feature name contains no usable characters")
    return value


def database_name(branch: str) -> str:
    prefix = str(
        parallel_policy().get("shadow_database_prefix")
        or "aoe2hdbets_shadow_lane_"
    )
    suffix = hashlib.sha256(branch.encode("utf-8")).hexdigest()[:6]
    slug = re.sub(r"[^a-z0-9]+", "_", branch.lower()).strip("_")
    maximum = max(1, 63 - len(prefix) - len(suffix) - 1)
    return f"{prefix}{slug[:maximum]}_{suffix}"


def port_candidates(branch: str) -> list[int]:
    policy = parallel_policy()
    start = int(policy.get("dev_port_start") or 3100)
    end = int(policy.get("dev_port_end") or 3198)
    stride = int(policy.get("dev_port_stride") or 2)
    if start < 1024 or end <= start or stride < 2:
        raise ParallelError("invalid parallel-development port policy")
    pool = list(range(start, end + 1, stride))
    seed = int(hashlib.sha256(branch.encode("utf-8")).hexdigest()[:8], 16)
    offset = seed % len(pool)
    return pool[offset:] + pool[:offset]


def allocate_port(branch: str, repo: Path = ROOT) -> int:
    existing = load_manifest(branch, repo)
    if existing and existing.get("dev_port"):
        return int(existing["dev_port"])

    occupied = {
        int(item["dev_port"])
        for item in all_manifests(repo)
        if item.get("branch") != branch and item.get("dev_port")
    }

    for port in port_candidates(branch):
        if port not in occupied and (port + 1) not in occupied:
            return port

    raise ParallelError("parallel development port pool exhausted")


def parse_worktrees(repo: Path = ROOT) -> list[tuple[Path, str]]:
    raw = git("worktree", "list", "--porcelain", cwd=repo)
    result: list[tuple[Path, str]] = []

    for block in [part for part in raw.split("\n\n") if part.strip()]:
        fields: dict[str, str] = {}
        for line in block.splitlines():
            if " " in line:
                key, value = line.split(" ", 1)
                fields[key] = value
        path = Path(fields["worktree"]).resolve()
        branch = fields.get("branch", "").replace("refs/heads/", "")
        result.append((path, branch))

    return result


def dirty_paths(repo: Path) -> list[str]:
    output = checked(
        ["git", "status", "--porcelain", "--untracked-files=all"],
        cwd=repo,
    )
    result: set[str] = set()
    for line in output.splitlines():
        if len(line) < 4:
            continue
        value = line[3:]
        if " -> " in value:
            value = value.split(" -> ", 1)[1]
        result.add(value)
    return sorted(result)


def changed_paths(repo: Path, base_sha: str) -> list[str]:
    result: set[str] = set()

    for arguments in (
        ["diff", "--name-only", f"{base_sha}...HEAD"],
        ["diff", "--name-only"],
        ["diff", "--cached", "--name-only"],
        ["ls-files", "--others", "--exclude-standard"],
    ):
        proc = run(["git", *arguments], cwd=repo)
        if proc.returncode == 0:
            result.update(
                line.strip()
                for line in (proc.stdout or "").splitlines()
                if line.strip()
            )

    return sorted(result)


def infer_contracts(paths: list[str]) -> list[str]:
    result: set[str] = set()
    for path in paths:
        for contract, needles in CONTRACT_RULES:
            if any(path == needle or path.startswith(needle) for needle in needles):
                result.add(contract)
    return sorted(result)


def owns_database_frontier(paths: list[str]) -> bool:
    return any(
        path == "prisma/schema.prisma" or path.startswith("prisma/migrations/")
        for path in paths
    )


def revision_count(repo: Path, spec: str) -> int:
    proc = run(["git", "rev-list", "--count", spec], cwd=repo)
    if proc.returncode != 0:
        return 0
    try:
        return int((proc.stdout or "").strip())
    except ValueError:
        return 0


def is_ancestor(repo: Path, ancestor: str, descendant: str) -> bool:
    return (
        run(
            ["git", "merge-base", "--is-ancestor", ancestor, descendant],
            cwd=repo,
        ).returncode
        == 0
    )


def register_lane(
    repo: Path,
    *,
    owner: str | None = None,
    state: str | None = None,
    contracts: list[str] | None = None,
    depends_on: list[str] | None = None,
    planned_paths: list[str] | None = None,
    note: str | None = None,
    base_sha: str | None = None,
) -> dict[str, Any]:
    branch = current_branch(repo)
    if not branch or branch == "main":
        raise ParallelError("lane registration requires a named non-main branch")

    payload = load_manifest(branch, repo) or {
        "schema": 1,
        "branch": branch,
        "base_sha": base_sha
        or git("merge-base", "main", "HEAD", cwd=repo),
        "created_at": utc_now(),
    }

    if base_sha is not None:
        payload["base_sha"] = base_sha

    payload["branch"] = branch
    payload["worktree"] = str(repo.resolve())
    payload["head_sha"] = git("rev-parse", "HEAD", cwd=repo)
    payload["updated_at"] = utc_now()
    payload["owner"] = (
        owner
        if owner is not None
        else payload.get("owner")
        or os.environ.get("AOE2WAR_AI_OWNER")
        or "unclaimed"
    )
    payload["state"] = normalize_state(
        state if state is not None else str(payload.get("state") or "BUILDING")
    )
    payload.setdefault("dev_port", allocate_port(branch, repo))
    payload.setdefault("shadow_database", database_name(branch))

    if contracts is not None:
        payload["contracts"] = sorted(
            {value.strip() for value in contracts if value.strip()}
        )
    else:
        payload.setdefault("contracts", [])

    if depends_on is not None:
        payload["depends_on"] = sorted(
            {value.strip() for value in depends_on if value.strip()}
        )
    else:
        payload.setdefault("depends_on", [])

    if planned_paths is not None:
        payload["planned_paths"] = sorted(
            {value.strip() for value in planned_paths if value.strip()}
        )
    else:
        payload.setdefault("planned_paths", [])

    if note is not None:
        payload["note"] = note

    write_manifest(payload, repo)
    return payload


def snapshot_lane(repo: Path, main_head: str) -> dict[str, Any]:
    branch = current_branch(repo)
    head = git("rev-parse", "HEAD", cwd=repo)
    manifest = load_manifest(branch, repo)
    managed = manifest is not None
    base_sha = str(
        (manifest or {}).get("base_sha")
        or git("merge-base", "main", "HEAD", cwd=repo)
    )
    paths = changed_paths(repo, base_sha)
    dirty = dirty_paths(repo)

    return {
        "branch": branch,
        "head": head,
        "base_sha": base_sha,
        "path": str(repo.resolve()),
        "managed": managed,
        "owner": str((manifest or {}).get("owner") or "unclaimed"),
        "state": str((manifest or {}).get("state") or "UNCLAIMED"),
        "changed_paths": paths,
        "dirty_paths": dirty,
        "dirty": bool(dirty),
        "contracts": sorted(
            set(infer_contracts(paths))
            | set((manifest or {}).get("contracts") or [])
        ),
        "depends_on": list((manifest or {}).get("depends_on") or []),
        "database_frontier": owns_database_frontier(paths),
        "dev_port": (manifest or {}).get("dev_port"),
        "shadow_database": (manifest or {}).get("shadow_database"),
        "main_drift": revision_count(repo, f"HEAD..{main_head}"),
        "feature_ahead": revision_count(repo, f"{main_head}..HEAD"),
        "descendant_of_main": is_ancestor(repo, main_head, head),
        "next_step": (manifest or {}).get("next_step"),
        "tests": dict((manifest or {}).get("tests") or {}),
        "note": (manifest or {}).get("note"),
    }


def conflict_severity(
    left: dict[str, Any],
    right: dict[str, Any],
) -> tuple[str, list[str], list[str]]:
    file_overlap = sorted(
        set(left["changed_paths"]) & set(right["changed_paths"])
    )
    semantic_overlap = sorted(
        set(left["contracts"]) & set(right["contracts"])
    )

    if left["database_frontier"] and right["database_frontier"]:
        return (
            "HIGH",
            file_overlap,
            sorted(set(semantic_overlap) | {"database-schema"}),
        )

    if set(semantic_overlap) & CRITICAL_CONTRACTS:
        return "HIGH", file_overlap, semantic_overlap

    if file_overlap or semantic_overlap:
        return "MEDIUM", file_overlap, semantic_overlap

    return "LOW", file_overlap, semantic_overlap


def dependency_satisfied(repo: Path, dependency: str, main_head: str) -> bool:
    probe = run(
        ["git", "rev-parse", "--verify", dependency],
        cwd=repo,
    )
    if probe.returncode != 0:
        return False
    dep_head = (probe.stdout or "").strip()
    return is_ancestor(repo, dep_head, main_head)


def integration_reasons(
    lane: dict[str, Any],
    *,
    canonical_dirty: bool,
    main_head: str,
    repo: Path = ROOT,
) -> list[str]:
    reasons: list[str] = []

    if lane["state"] != "READY":
        reasons.append(f"state={lane['state']}")
    if lane["dirty"]:
        reasons.append("dirty")
    if lane["main_drift"]:
        reasons.append(f"main-drift={lane['main_drift']}")
    if not lane["descendant_of_main"]:
        reasons.append("not-descendant-of-current-main")
    if canonical_dirty:
        reasons.append("canonical-main-occupied")

    missing = [
        dependency
        for dependency in lane["depends_on"]
        if not dependency_satisfied(repo, dependency, main_head)
    ]
    if missing:
        reasons.append("dependency-not-in-main:" + ",".join(missing))

    return reasons


def snapshot() -> dict[str, Any]:
    canonical = canonical_repo()
    main_head = git("rev-parse", "main", cwd=canonical)
    origin_main = git("rev-parse", "origin/main", cwd=canonical)
    canonical_dirty_paths = dirty_paths(canonical)

    main_work = {
        "branch": "canonical-main-working-tree",
        "head": main_head,
        "base_sha": main_head,
        "path": str(canonical),
        "managed": True,
        "owner": "occupied-external-work" if canonical_dirty_paths else "none",
        "state": "OCCUPIED" if canonical_dirty_paths else "CLEAN",
        "changed_paths": canonical_dirty_paths,
        "dirty_paths": canonical_dirty_paths,
        "dirty": bool(canonical_dirty_paths),
        "contracts": infer_contracts(canonical_dirty_paths),
        "depends_on": [],
        "database_frontier": owns_database_frontier(canonical_dirty_paths),
        "dev_port": None,
        "shadow_database": None,
        "main_drift": 0,
        "feature_ahead": 0,
        "descendant_of_main": True,
        "next_step": None,
        "tests": {},
        "note": None,
    }

    managed_lanes: list[dict[str, Any]] = []
    legacy_worktrees: list[dict[str, Any]] = []

    for path, branch in parse_worktrees(canonical):
        if not branch or branch == "main":
            continue
        try:
            lane = snapshot_lane(path, main_head)
        except Exception as exc:
            legacy_worktrees.append(
                {
                    "branch": branch,
                    "path": str(path),
                    "managed": False,
                    "state": "ERROR",
                    "error": str(exc),
                    "changed_paths": [],
                    "contracts": [],
                    "database_frontier": False,
                    "dirty": True,
                    "main_drift": 0,
                    "feature_ahead": 0,
                    "descendant_of_main": False,
                    "dev_port": None,
                    "shadow_database": None,
                    "depends_on": [],
                }
            )
            continue

        if lane["managed"]:
            if lane["state"] not in {"RELEASED", "ABANDONED"}:
                managed_lanes.append(lane)
        else:
            legacy_worktrees.append(lane)

    conflict_inputs: list[dict[str, Any]] = list(managed_lanes)
    if canonical_dirty_paths:
        conflict_inputs.insert(0, main_work)

    conflicts: list[dict[str, Any]] = []
    for index, left in enumerate(conflict_inputs):
        for right in conflict_inputs[index + 1 :]:
            severity, file_overlap, semantic_overlap = conflict_severity(
                left,
                right,
            )
            if severity == "LOW":
                continue
            conflicts.append(
                {
                    "severity": severity,
                    "left": left["branch"],
                    "right": right["branch"],
                    "file_overlap": file_overlap,
                    "semantic_overlap": semantic_overlap,
                }
            )

    readiness = []
    for lane in managed_lanes:
        reasons = integration_reasons(
            lane,
            canonical_dirty=bool(canonical_dirty_paths),
            main_head=main_head,
            repo=canonical,
        )
        readiness.append(
            {
                "branch": lane["branch"],
                "ready": not reasons,
                "reasons": reasons,
            }
        )

    return {
        "schema": 2,
        "generated_at": utc_now(),
        "main_head": main_head,
        "origin_main": origin_main,
        "main_origin_exact": main_head == origin_main,
        "canonical_main": main_work,
        "managed_lanes": managed_lanes,
        "legacy_worktrees": legacy_worktrees,
        "conflicts": sorted(
            conflicts,
            key=lambda item: (
                0 if item["severity"] == "HIGH" else 1,
                item["left"],
                item["right"],
            ),
        ),
        "integration_readiness": readiness,
    }


def print_status(payload: dict[str, Any]) -> None:
    main = payload["canonical_main"]

    print("⚔️  AOE2WAR DEVELOPMENT CONTROL PLANE")
    print()
    print(f"Main:               {payload['main_head'][:12]}")
    print(f"GitHub main:        {payload['origin_main'][:12]}")
    print(
        "Main/GitHub exact:  "
        + ("YES" if payload["main_origin_exact"] else "NO")
    )
    print(
        "Canonical checkout: "
        + ("OCCUPIED" if main["dirty"] else "CLEAN")
    )
    print(f"Managed lanes:      {len(payload['managed_lanes'])}")
    print(f"Legacy worktrees:   {len(payload['legacy_worktrees'])}")
    print(f"Conflicts:          {len(payload['conflicts'])}")
    print()

    if main["dirty"]:
        print("CANONICAL MAIN OCCUPANCY")
        print("-" * 110)
        print(
            f"{len(main['changed_paths'])} uncommitted path(s) are preserved. "
            "Parallel feature development is allowed; main integration is blocked."
        )
        if main["contracts"]:
            print("Contracts: " + ", ".join(main["contracts"]))
        print()

    if payload["managed_lanes"]:
        print("MANAGED ACTIVE LANES")
        print("-" * 110)
        print(
            f"{'STATE':<15} {'OWNER':<16} {'DRIFT':>5} {'Δ':>4} "
            f"{'PORT':>5} {'BRANCH'}"
        )
        for lane in payload["managed_lanes"]:
            print(
                f"{lane['state']:<15} "
                f"{lane['owner'][:15]:<16} "
                f"{lane['main_drift']:>5} "
                f"{len(lane['changed_paths']):>4} "
                f"{str(lane.get('dev_port') or '—'):>5} "
                f"{lane['branch']}"
            )
        print()

    if payload["legacy_worktrees"]:
        print("LEGACY / UNMANAGED WORKTREES")
        print("-" * 110)
        for lane in payload["legacy_worktrees"]:
            print(
                f"{lane['branch']:<56} "
                f"drift={lane['main_drift']:<4} "
                f"dirty={int(bool(lane['dirty']))}"
            )
        print()

    if payload["conflicts"]:
        print("CONFLICT FORECAST")
        print("-" * 110)
        for conflict in payload["conflicts"]:
            print(
                f"{conflict['severity']:<6} "
                f"{conflict['left']} <-> {conflict['right']}"
            )
            if conflict["file_overlap"]:
                print(
                    "       files: "
                    + ", ".join(conflict["file_overlap"][:8])
                )
            if conflict["semantic_overlap"]:
                print(
                    "       contracts: "
                    + ", ".join(conflict["semantic_overlap"])
                )
        print()

    print("INTEGRATION READINESS")
    print("-" * 110)
    if not payload["integration_readiness"]:
        print("No managed feature lanes.")

    for item in payload["integration_readiness"]:
        if item["ready"]:
            print("READY  " + item["branch"])
        else:
            print(
                "WAIT   "
                + item["branch"]
                + " — "
                + ", ".join(item["reasons"])
            )

    print()
    print(
        "RULE: development may be parallel; canonical main integration and "
        "production remain serialized."
    )


def ensure_certificate(repo: Path) -> None:
    names = ("localhost+2.pem", "localhost+2-key.pem")
    if all((repo / name).is_file() for name in names):
        return

    canonical = canonical_repo()
    if all((canonical / name).is_file() for name in names):
        for name in names:
            target = repo / name
            if not target.exists() and not target.is_symlink():
                target.symlink_to(canonical / name)
        return

    checked(["mkcert", "-install"], cwd=repo, capture=False)
    checked(
        ["mkcert", "localhost", "127.0.0.1", "::1"],
        cwd=repo,
        capture=False,
    )


def runtime_environment(repo: Path) -> tuple[dict[str, Any], dict[str, str]]:
    payload = register_lane(repo)
    env = os.environ.copy()
    env["AOE2WAR_DEV_PORT"] = str(payload["dev_port"])
    env["AOE2WAR_SHADOW_DB"] = str(payload["shadow_database"])
    return payload, env


def create_lane(
    name: str,
    *,
    owner: str,
    base_mode: str,
    prepare: bool,
) -> int:
    canonical = canonical_repo()
    slug = slugify(name)
    branch = f"feature/{slug}"
    target = canonical.parent / f"app-prodn-{slug}"

    if target.exists():
        raise ParallelError(f"target already exists: {target}")

    if run(
        [
            "git",
            "show-ref",
            "--verify",
            "--quiet",
            f"refs/heads/{branch}",
        ],
        cwd=canonical,
    ).returncode == 0:
        raise ParallelError(f"branch already exists: {branch}")

    checked(["git", "fetch", "origin", "main"], cwd=canonical, capture=False)
    canonical_head = git("rev-parse", "HEAD", cwd=canonical)
    origin_main = git("rev-parse", "origin/main", cwd=canonical)

    if canonical_head != origin_main:
        raise ParallelError(
            "canonical committed HEAD is not exact with origin/main"
        )

    dependencies: list[str] = []

    if base_mode == "current":
        source_branch = current_branch(ROOT)
        if not source_branch or source_branch == "main":
            raise ParallelError(
                "--base current requires a clean managed feature worktree"
            )
        if dirty_paths(ROOT):
            raise ParallelError(
                "--base current requires the current feature worktree to be clean"
            )
        if load_manifest(source_branch, ROOT) is None:
            raise ParallelError(
                "--base current requires the current branch to be a managed lane"
            )
        base_sha = git("rev-parse", "HEAD", cwd=ROOT)
        dependencies = [source_branch]
    else:
        base_sha = canonical_head
        tooling_probe = run(
            ["git", "cat-file", "-e", f"{base_sha}:scripts/aoe2_parallel.py"],
            cwd=canonical,
        )
        if tooling_probe.returncode != 0:
            raise ParallelError(
                "current main does not contain the parallel control plane yet; "
                "use --base current until this feature is integrated"
            )

    checked(
        [
            "git",
            "worktree",
            "add",
            "-b",
            branch,
            str(target),
            base_sha,
        ],
        cwd=canonical,
        capture=False,
    )

    payload = register_lane(
        target,
        owner=owner,
        state="BUILDING",
        depends_on=dependencies,
        base_sha=base_sha,
        note="Created by AoE2WAR Development Control Plane",
    )

    if prepare:
        proc = run(
            ["python3", "scripts/aoe2_dev.py", "prepare"],
            cwd=target,
            capture=False,
        )
        if proc.returncode != 0:
            payload["state"] = "BLOCKED"
            payload["note"] = (
                "Lane created, but development preparation failed; "
                "worktree preserved for review."
            )
            payload["updated_at"] = utc_now()
            write_manifest(payload, target)
            raise ParallelError(
                "lane worktree was created but development preparation failed"
            )

    print("PASS: parallel feature lane created")
    print(f"Branch:   {branch}")
    print(f"Base:     {base_sha}")
    print(f"Worktree: {target}")
    print(f"HTTPS:    https://localhost:{payload['dev_port']}")
    print(f"Shadow:   {payload['shadow_database']}")
    if dependencies:
        print("Depends:  " + ", ".join(dependencies))
    print()
    print(f'cd "{target}"')
    print("aoe2war parallel status")
    return 0


def parse_tests(values: list[str]) -> dict[str, str]:
    result: dict[str, str] = {}
    for value in values:
        if "=" not in value:
            raise ParallelError("--test expects NAME=RESULT")
        key, item = value.split("=", 1)
        key = key.strip()
        item = item.strip()
        if not key or not item:
            raise ParallelError("--test expects NAME=RESULT")
        result[key] = item
    return result


def main() -> int:
    parser = argparse.ArgumentParser(prog="aoe2war parallel")
    sub = parser.add_subparsers(dest="command")

    for name in ("status", "plan"):
        command = sub.add_parser(name)
        command.add_argument("--json", action="store_true")

    command = sub.add_parser("new")
    command.add_argument("name")
    command.add_argument(
        "--owner",
        default=os.environ.get("AOE2WAR_AI_OWNER", "unclaimed"),
    )
    command.add_argument(
        "--base",
        choices=("current", "main"),
        default="current",
    )
    command.add_argument("--no-prepare", action="store_true")

    command = sub.add_parser("claim")
    command.add_argument("--owner", required=True)
    command.add_argument("--state", default="BUILDING", choices=sorted(STATES))
    command.add_argument("--contract", action="append", default=[])
    command.add_argument("--depends-on", action="append", default=[])
    command.add_argument("--path", action="append", default=[])
    command.add_argument("--note")

    command = sub.add_parser("handoff")
    command.add_argument("--state", required=True, choices=sorted(STATES))
    command.add_argument("--next")
    command.add_argument("--note")
    command.add_argument("--test", action="append", default=[])

    sub.add_parser("runtime")
    sub.add_parser("refresh")
    sub.add_parser("serve")

    args = parser.parse_args()
    command_name = args.command or "status"

    try:
        if command_name in {"status", "plan"}:
            payload = snapshot()
            if getattr(args, "json", False):
                print(json.dumps(payload, indent=2, sort_keys=True))
            else:
                print_status(payload)
                if command_name == "plan":
                    print()
                    print(
                        "PLAN: parallel coding is allowed. Choose one READY lane "
                        "for explicit main reconciliation after canonical main is clean."
                    )
            return 0

        if command_name == "new":
            return create_lane(
                args.name,
                owner=args.owner,
                base_mode=args.base,
                prepare=not args.no_prepare,
            )

        if command_name == "claim":
            payload = register_lane(
                ROOT,
                owner=args.owner,
                state=args.state,
                contracts=args.contract,
                depends_on=args.depends_on,
                planned_paths=args.path,
                note=args.note,
            )
            print(json.dumps(payload, indent=2, sort_keys=True))
            return 0

        if command_name == "handoff":
            payload = register_lane(ROOT, state=args.state)
            payload["next_step"] = args.next
            if args.note is not None:
                payload["note"] = args.note
            payload["tests"] = parse_tests(args.test)
            payload["updated_at"] = utc_now()
            payload["head_sha"] = git("rev-parse", "HEAD", cwd=ROOT)
            write_manifest(payload, ROOT)
            print(json.dumps(payload, indent=2, sort_keys=True))
            return 0

        if command_name == "runtime":
            payload, _ = runtime_environment(ROOT)
            print(f"Branch:   {payload['branch']}")
            print(f"HTTPS:    https://localhost:{payload['dev_port']}")
            print(f"Redirect: http://localhost:{int(payload['dev_port']) + 1}")
            print(f"Shadow:   {payload['shadow_database']}")
            return 0

        if command_name in {"refresh", "serve"}:
            payload, env = runtime_environment(ROOT)
            ensure_certificate(ROOT)
            print(
                f"PASS: lane={payload['branch']} "
                f"port={payload['dev_port']} "
                f"shadow={payload['shadow_database']}"
            )
            return subprocess.run(
                [
                    sys.executable,
                    "scripts/dev-shadow.py",
                    "refresh" if command_name == "refresh" else "serve",
                ],
                cwd=ROOT,
                env=env,
                check=False,
            ).returncode

    except ParallelError as exc:
        print(f"STOP: {exc}", file=sys.stderr)
        return 2

    return 2


if __name__ == "__main__":
    raise SystemExit(main())
