#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
PARENT = ROOT.parent
CONTRACT_PATH = ROOT / "config" / "aoe2war-operations.json"
RECEIPT_DIR = ROOT / ".aoe2war-release" / "workspace-receipts"
REGISTRY_DIR = ROOT / ".aoe2war-release" / "workspace-registry"
DEFAULT_WORKSPACE_ROOT = PARENT / ".aoe2war-workspaces"
BRANCH_RE = re.compile(r"^[A-Za-z0-9._/-]{1,180}$")
ID_RE = re.compile(r"^[A-Za-z0-9._-]{1,220}$")


class WorkspaceError(RuntimeError):
    pass


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def run(args: list[str], cwd: Path = ROOT) -> tuple[int, str]:
    proc = subprocess.run(
        args,
        cwd=cwd,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=False,
    )
    return proc.returncode, proc.stdout.strip()


def git(*args: str, cwd: Path = ROOT) -> str:
    rc, out = run(["git", *args], cwd=cwd)
    if rc != 0:
        raise WorkspaceError(f"git {' '.join(args)} failed in {cwd}: {out}")
    return out


def load_contract() -> dict[str, Any]:
    payload = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    if payload.get("schema") != 1:
        raise WorkspaceError("unsupported operations contract schema")
    return payload


def repo_specs() -> dict[str, dict[str, Any]]:
    contract = load_contract()
    canonical = contract.get("canonical") or {}
    components = contract.get("components") or {}
    replay = components.get("replay_api") or {}

    app_branch = str(canonical.get("branch") or "main")
    api_branch = str(replay.get("branch") or "main")
    api_rel = str(replay.get("local_repo") or "../api-prodn")

    return {
        "app-prodn": {
            "repo_id": "app-prodn",
            "path": ROOT,
            "branch": app_branch,
            "authority": True,
        },
        "api-prodn": {
            "repo_id": "api-prodn",
            "path": (ROOT / api_rel).resolve(),
            "branch": api_branch,
            "authority": True,
        },
    }


def repo_spec(repo_id: str) -> dict[str, Any]:
    specs = repo_specs()
    if repo_id not in specs:
        raise WorkspaceError(
            f"unknown canonical repository {repo_id!r}; "
            f"expected one of {', '.join(sorted(specs))}"
        )
    spec = specs[repo_id]
    path = Path(spec["path"])
    if not path.is_dir():
        raise WorkspaceError(f"canonical repository is missing: {path}")
    return spec


def safe_slug(value: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9._-]+", "-", value).strip("-._")
    if not slug:
        raise WorkspaceError(f"cannot derive workspace slug from {value!r}")
    return slug[:120]


def workspace_id(repo_id: str, branch: str) -> str:
    return f"{safe_slug(repo_id)}--{safe_slug(branch)}"


def metadata_path(workspace_id_value: str) -> Path:
    if not ID_RE.fullmatch(workspace_id_value):
        raise WorkspaceError(f"unsafe workspace id: {workspace_id_value!r}")
    return REGISTRY_DIR / f"{workspace_id_value}.json"


def write_json_receipt(kind: str, payload: dict[str, Any]) -> str:
    RECEIPT_DIR.mkdir(parents=True, exist_ok=True)
    path = RECEIPT_DIR / f"{stamp()}-{safe_slug(kind)}.json"
    path.write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return str(path)


def write_metadata(payload: dict[str, Any]) -> Path:
    REGISTRY_DIR.mkdir(parents=True, exist_ok=True)
    path = metadata_path(str(payload["workspace_id"]))
    path.write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return path


def load_metadata() -> list[dict[str, Any]]:
    if not REGISTRY_DIR.is_dir():
        return []
    rows: list[dict[str, Any]] = []
    for path in sorted(REGISTRY_DIR.glob("*.json")):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except Exception as exc:
            rows.append(
                {
                    "workspace_id": path.stem,
                    "metadata_path": str(path),
                    "metadata_error": str(exc),
                }
            )
            continue
        if not isinstance(payload, dict):
            payload = {
                "workspace_id": path.stem,
                "metadata_error": "metadata is not an object",
            }
        payload["metadata_path"] = str(path)
        rows.append(payload)
    return rows


def classify(*, main: bool, dirty: bool, merged: bool, detached: bool) -> str:
    if main:
        return "MAIN"
    if dirty:
        return "PRESERVE_DIRTY_REVIEW"
    if not merged:
        return "ACTIVE_UNMERGED"
    if detached:
        return "CLEANUP_CANDIDATE_DETACHED"
    return "CLEANUP_CANDIDATE"


def parse_worktree_porcelain(raw: str) -> list[str]:
    """Split `git worktree list --porcelain` records."""
    return [item for item in raw.split("\n\n") if item.strip()]


def canonical_state(spec: dict[str, Any]) -> dict[str, Any]:
    path = Path(spec["path"])
    expected_branch = str(spec["branch"])
    branch = git("branch", "--show-current", cwd=path)
    head = git("rev-parse", "HEAD", cwd=path)
    rc, dirty_out = run(
        ["git", "status", "--porcelain", "--untracked-files=all"],
        cwd=path,
    )
    dirty = rc != 0 or bool(dirty_out.strip())
    return {
        "repo_id": spec["repo_id"],
        "path": str(path.resolve()),
        "expected_branch": expected_branch,
        "branch": branch,
        "head": head,
        "dirty": dirty,
        "classification": (
            "CANONICAL_CLEAN"
            if branch == expected_branch and not dirty
            else "CANONICAL_DRIFT"
        ),
    }


def worktree_rows(spec: dict[str, Any]) -> list[dict[str, Any]]:
    repo = Path(spec["path"])
    canonical = repo.resolve()
    expected_branch = str(spec["branch"])
    main_head = git("rev-parse", expected_branch, cwd=repo)
    raw = git("worktree", "list", "--porcelain", cwd=repo)
    blocks = parse_worktree_porcelain(raw)
    rows: list[dict[str, Any]] = []

    for block in blocks:
        fields: dict[str, Any] = {}
        for line in block.splitlines():
            if " " in line:
                key, value = line.split(" ", 1)
                fields[key] = value
            else:
                fields[line] = True
        path = Path(str(fields["worktree"])).resolve()
        head = str(fields.get("HEAD") or "")
        branch_raw = fields.get("branch")
        detached = branch_raw is None
        branch = (
            str(branch_raw).replace("refs/heads/", "")
            if branch_raw
            else "DETACHED"
        )
        rc, dirty_out = run(
            ["git", "status", "--porcelain", "--untracked-files=all"],
            cwd=path,
        )
        dirty = rc != 0 or bool(dirty_out.strip())
        merged = False
        if head:
            merged = (
                subprocess.run(
                    ["git", "merge-base", "--is-ancestor", head, main_head],
                    cwd=repo,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    check=False,
                ).returncode
                == 0
            )
        is_canonical = path == canonical
        rows.append(
            {
                "repo_id": spec["repo_id"],
                "path": str(path),
                "head": head,
                "branch": branch,
                "detached": detached,
                "dirty": dirty,
                "merged_into_canonical": merged,
                "canonical": is_canonical,
                "classification": (
                    "CANONICAL_CLEAN"
                    if is_canonical and branch == expected_branch and not dirty
                    else "CANONICAL_DRIFT"
                    if is_canonical
                    else classify(
                        main=False,
                        dirty=dirty,
                        merged=merged,
                        detached=detached,
                    )
                ),
            }
        )
    return rows


def upstream_state(path: Path) -> dict[str, Any]:
    rc, upstream = run(
        [
            "git",
            "rev-parse",
            "--abbrev-ref",
            "--symbolic-full-name",
            "@{upstream}",
        ],
        cwd=path,
    )
    if rc != 0 or not upstream:
        return {
            "upstream": None,
            "fully_pushed": False,
        }
    head = git("rev-parse", "HEAD", cwd=path)
    upstream_head = git("rev-parse", upstream, cwd=path)
    fully_pushed = (
        subprocess.run(
            ["git", "merge-base", "--is-ancestor", head, upstream_head],
            cwd=path,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        ).returncode
        == 0
    )
    return {
        "upstream": upstream,
        "upstream_head": upstream_head,
        "fully_pushed": fully_pushed,
    }


def snapshot() -> dict[str, Any]:
    specs = repo_specs()
    metadata = load_metadata()
    metadata_by_path = {
        str(Path(row["path"]).resolve()): row
        for row in metadata
        if isinstance(row.get("path"), str)
    }
    canonical: list[dict[str, Any]] = []
    worktrees: list[dict[str, Any]] = []
    registered_paths: set[str] = set()

    for spec in specs.values():
        canonical.append(canonical_state(spec))
        for row in worktree_rows(spec):
            registered_paths.add(row["path"])
            if row["canonical"]:
                continue
            meta = metadata_by_path.get(row["path"])
            if meta:
                row["agent_workspace"] = True
                row["workspace_id"] = meta.get("workspace_id")
                row["agent"] = meta.get("agent")
                row["purpose"] = meta.get("purpose")
                row["base_sha"] = meta.get("base_sha")
                row["created_at"] = meta.get("created_at")
                if row["dirty"]:
                    row["classification"] = "AGENT_ACTIVE_DIRTY"
                elif row["merged_into_canonical"]:
                    row["classification"] = "AGENT_RETIREABLE"
                else:
                    row["classification"] = "AGENT_ACTIVE_UNMERGED"
            else:
                row["agent_workspace"] = False
            worktrees.append(row)

    stale_metadata = [
        row
        for row in metadata
        if isinstance(row.get("path"), str)
        and str(Path(row["path"]).resolve()) not in registered_paths
    ]
    cleanup = [
        item
        for item in worktrees
        if item["classification"]
        in {"CLEANUP_CANDIDATE", "CLEANUP_CANDIDATE_DETACHED", "AGENT_RETIREABLE"}
    ]
    canonical_drift = [
        item
        for item in canonical
        if item["classification"] != "CANONICAL_CLEAN"
    ]
    return {
        "schema": 2,
        "kind": "aoe2war-workspace-os-status",
        "generated_at": utc_now(),
        "canonical": canonical,
        "canonical_drift_count": len(canonical_drift),
        "worktrees": worktrees,
        "cleanup_candidates": cleanup,
        "dirty_agent_count": sum(
            item["classification"] == "AGENT_ACTIVE_DIRTY"
            for item in worktrees
        ),
        "active_agent_count": sum(
            bool(item.get("agent_workspace"))
            for item in worktrees
        ),
        "unmerged_count": sum(
            item["classification"] in {"ACTIVE_UNMERGED", "AGENT_ACTIVE_UNMERGED"}
            for item in worktrees
        ),
        "stale_metadata": stale_metadata,
    }


def print_status(payload: dict[str, Any]) -> None:
    print("⚔️  AOE2WAR WORKSPACE OS")
    print()
    print(f"Canonical repos:     {len(payload['canonical'])}")
    print(f"Canonical drift:     {payload['canonical_drift_count']}")
    print(f"Agent workspaces:    {payload['active_agent_count']}")
    print(f"Dirty agents:        {payload['dirty_agent_count']}")
    print(f"Unmerged active:     {payload['unmerged_count']}")
    print(f"Cleanup candidates:  {len(payload['cleanup_candidates'])}")
    print(f"Stale metadata:      {len(payload['stale_metadata'])}")
    print()
    for item in payload["canonical"]:
        print(
            f"{item['classification']:<24} "
            f"{item['repo_id']:<12} "
            f"{item['branch']:<32} {item['head'][:12]}  {item['path']}"
        )
    for item in payload["worktrees"]:
        label = item.get("workspace_id") or "—"
        print(
            f"{item['classification']:<24} "
            f"{item['repo_id']:<12} "
            f"{item['branch']:<32} {item['head'][:12]}  "
            f"{item['path']}  [{label}]"
        )


def ensure_canonical_clean(spec: dict[str, Any]) -> dict[str, Any]:
    state = canonical_state(spec)
    if state["classification"] != "CANONICAL_CLEAN":
        raise WorkspaceError(
            "canonical source authority must be clean before workspace mutation: "
            f"{state['repo_id']} branch={state['branch']!r} dirty={state['dirty']}"
        )
    return state


def default_workspace_path(repo_id: str, branch: str) -> Path:
    return DEFAULT_WORKSPACE_ROOT / safe_slug(repo_id) / safe_slug(branch)


def create_workspace(
    *,
    repo_id: str,
    branch: str,
    purpose: str,
    agent: str,
    path: Path | None,
    base_ref: str | None,
) -> dict[str, Any]:
    if not BRANCH_RE.fullmatch(branch):
        raise WorkspaceError(f"unsafe branch: {branch!r}")
    spec = repo_spec(repo_id)
    canonical = ensure_canonical_clean(spec)
    if branch == spec["branch"]:
        raise WorkspaceError("agent workspace branch cannot be the canonical branch")

    target = (path or default_workspace_path(repo_id, branch)).expanduser().resolve()
    if target.exists():
        raise WorkspaceError(f"workspace path already exists: {target}")

    repo = Path(spec["path"])
    base = base_ref or str(spec["branch"])
    rc, _ = run(["git", "show-ref", "--verify", f"refs/heads/{branch}"], cwd=repo)
    if rc == 0:
        git("worktree", "add", str(target), branch, cwd=repo)
    else:
        git("worktree", "add", "-b", branch, str(target), base, cwd=repo)

    head = git("rev-parse", "HEAD", cwd=target)
    wid = workspace_id(repo_id, branch)
    payload = {
        "schema": 1,
        "kind": "aoe2war-agent-workspace",
        "workspace_id": wid,
        "repo_id": repo_id,
        "path": str(target),
        "branch": branch,
        "base_ref": base,
        "base_sha": canonical["head"],
        "purpose": purpose,
        "agent": agent,
        "created_at": utc_now(),
        "status": "ACTIVE",
    }
    write_metadata(payload)
    payload["receipt_path"] = write_json_receipt("workspace-create", payload)
    return payload


def adopt_workspace(
    *,
    repo_id: str,
    path: Path,
    purpose: str,
    agent: str,
) -> dict[str, Any]:
    spec = repo_spec(repo_id)
    canonical = ensure_canonical_clean(spec)
    target = path.expanduser().resolve()
    rows = {
        str(Path(str(row["path"])).resolve()): row
        for row in worktree_rows(spec)
    }
    row = rows.get(str(target))
    if not row or row["canonical"]:
        raise WorkspaceError(
            f"path is not a non-canonical registered worktree for {repo_id}: {target}"
        )
    if row["detached"]:
        raise WorkspaceError("detached worktree cannot be adopted as agent workspace")
    wid = workspace_id(repo_id, row["branch"])
    meta = metadata_path(wid)
    if meta.exists():
        existing = json.loads(meta.read_text(encoding="utf-8"))
        if str(Path(existing.get("path", "")).resolve()) != str(target):
            raise WorkspaceError(
                f"workspace id {wid} already belongs to {existing.get('path')}"
            )
    payload = {
        "schema": 1,
        "kind": "aoe2war-agent-workspace",
        "workspace_id": wid,
        "repo_id": repo_id,
        "path": str(target),
        "branch": row["branch"],
        "base_ref": spec["branch"],
        "base_sha": canonical["head"],
        "purpose": purpose,
        "agent": agent,
        "created_at": utc_now(),
        "status": "ACTIVE",
    }
    write_metadata(payload)
    payload["receipt_path"] = write_json_receipt("workspace-adopt", payload)
    return payload


def find_workspace(identifier: str) -> dict[str, Any]:
    for row in load_metadata():
        if row.get("workspace_id") == identifier:
            return row
        if isinstance(row.get("path"), str):
            if str(Path(row["path"]).resolve()) == str(Path(identifier).expanduser().resolve()):
                return row
    raise WorkspaceError(f"workspace is not registered: {identifier}")


def retirement_plan(identifier: str) -> dict[str, Any]:
    meta = find_workspace(identifier)
    repo_id = str(meta["repo_id"])
    spec = repo_spec(repo_id)
    target = Path(str(meta["path"])).resolve()
    rows = {
        str(Path(str(row["path"])).resolve()): row
        for row in worktree_rows(spec)
    }
    row = rows.get(str(target))
    if not row:
        return {
            "schema": 1,
            "kind": "aoe2war-workspace-retire-plan",
            "workspace_id": meta.get("workspace_id"),
            "path": str(target),
            "status": "STALE_METADATA",
            "safe": False,
            "reason": "registered worktree no longer exists",
        }
    upstream = upstream_state(target)
    safe = (
        not row["dirty"]
        and (
            bool(row["merged_into_canonical"])
            or bool(upstream.get("fully_pushed"))
        )
    )
    reason = (
        "dirty worktree"
        if row["dirty"]
        else "clean and merged into canonical"
        if row["merged_into_canonical"]
        else "clean and fully pushed to upstream"
        if upstream.get("fully_pushed")
        else "unique local commits are not proven pushed or merged"
    )
    return {
        "schema": 1,
        "kind": "aoe2war-workspace-retire-plan",
        "workspace_id": meta.get("workspace_id"),
        "repo_id": repo_id,
        "path": str(target),
        "branch": row["branch"],
        "head": row["head"],
        "dirty": row["dirty"],
        "merged_into_canonical": row["merged_into_canonical"],
        **upstream,
        "safe": safe,
        "status": "READY" if safe else "BLOCKED",
        "reason": reason,
    }


def retire_workspace(identifier: str, *, apply: bool) -> dict[str, Any]:
    plan = retirement_plan(identifier)
    result = {
        **plan,
        "apply": apply,
        "removed": False,
        "generated_at": utc_now(),
    }
    if not apply:
        return result
    if not plan["safe"]:
        raise WorkspaceError(
            f"workspace retirement blocked: {plan['reason']}"
        )
    spec = repo_spec(str(plan["repo_id"]))
    target = Path(str(plan["path"]))
    rc, out = run(
        ["git", "worktree", "remove", str(target)],
        cwd=Path(spec["path"]),
    )
    if rc != 0:
        raise WorkspaceError(f"git worktree remove failed: {out}")
    meta = metadata_path(str(plan["workspace_id"]))
    if meta.exists():
        meta.unlink()
    result["removed"] = True
    result["status"] = "RETIRED"
    result["receipt_path"] = write_json_receipt("workspace-retire", result)
    return result


def clean(*, apply: bool) -> dict[str, Any]:
    before = snapshot()
    candidates = before["cleanup_candidates"]
    result = {
        "schema": 2,
        "kind": "aoe2war-workspace-clean",
        "generated_at": utc_now(),
        "apply": apply,
        "candidates": candidates,
        "removed": [],
        "failed": [],
        "stale_metadata_untouched": before["stale_metadata"],
    }
    if apply:
        for item in candidates:
            if item.get("agent_workspace") and item.get("workspace_id"):
                try:
                    retired = retire_workspace(
                        str(item["workspace_id"]),
                        apply=True,
                    )
                    result["removed"].append(retired)
                except Exception as exc:
                    result["failed"].append({**item, "error": str(exc)})
                continue
            spec = repo_spec(str(item["repo_id"]))
            path = Path(item["path"])
            rc, out = run(
                ["git", "worktree", "remove", str(path)],
                cwd=Path(spec["path"]),
            )
            if rc == 0:
                result["removed"].append(item)
            else:
                result["failed"].append({**item, "error": out})
        result["receipt_path"] = write_json_receipt("workspace-clean", result)
    return result


def print_mutation(title: str, payload: dict[str, Any]) -> None:
    print(f"⚔️  AOE2WAR {title}")
    print()
    for key in (
        "workspace_id",
        "repo_id",
        "path",
        "branch",
        "agent",
        "purpose",
        "status",
        "reason",
        "receipt_path",
    ):
        if payload.get(key) is not None:
            print(f"{key.replace('_', ' ').title():<16} {payload[key]}")


def main() -> int:
    parser = argparse.ArgumentParser(prog="aoe2war workspace")
    sub = parser.add_subparsers(dest="command")

    for name in ("status", "plan"):
        q = sub.add_parser(name)
        q.add_argument("--json", action="store_true")

    q = sub.add_parser("clean")
    q.add_argument("--apply", action="store_true")
    q.add_argument("--json", action="store_true")

    q = sub.add_parser("create")
    q.add_argument("--repo", required=True)
    q.add_argument("--branch", required=True)
    q.add_argument("--purpose", required=True)
    q.add_argument("--agent", required=True)
    q.add_argument("--path")
    q.add_argument("--base")
    q.add_argument("--json", action="store_true")

    q = sub.add_parser("adopt")
    q.add_argument("--repo", required=True)
    q.add_argument("--path", required=True)
    q.add_argument("--purpose", required=True)
    q.add_argument("--agent", required=True)
    q.add_argument("--json", action="store_true")

    q = sub.add_parser("retire")
    q.add_argument("workspace")
    q.add_argument("--apply", action="store_true")
    q.add_argument("--json", action="store_true")

    args = parser.parse_args()

    try:
        if args.command in (None, "status", "plan"):
            payload = snapshot()
            if getattr(args, "json", False):
                print(json.dumps(payload, indent=2, sort_keys=True))
            else:
                print_status(payload)
                if args.command == "plan":
                    print()
                    print(
                        "PLAN: canonical authority stays clean; agent workspaces are isolated."
                    )
                    print(
                        "Retirement requires a clean worktree and proof that commits are pushed or merged."
                    )
            return 1 if payload["canonical_drift_count"] else 0

        if args.command == "create":
            payload = create_workspace(
                repo_id=args.repo,
                branch=args.branch,
                purpose=args.purpose,
                agent=args.agent,
                path=Path(args.path) if args.path else None,
                base_ref=args.base,
            )
            if args.json:
                print(json.dumps(payload, indent=2, sort_keys=True))
            else:
                print_mutation("WORKSPACE CREATE", payload)
            return 0

        if args.command == "adopt":
            payload = adopt_workspace(
                repo_id=args.repo,
                path=Path(args.path),
                purpose=args.purpose,
                agent=args.agent,
            )
            if args.json:
                print(json.dumps(payload, indent=2, sort_keys=True))
            else:
                print_mutation("WORKSPACE ADOPT", payload)
            return 0

        if args.command == "retire":
            payload = retire_workspace(args.workspace, apply=args.apply)
            if args.json:
                print(json.dumps(payload, indent=2, sort_keys=True))
            else:
                print_mutation("WORKSPACE RETIRE", payload)
                if not args.apply:
                    print()
                    print("READ ONLY: pass --apply only after the plan reports READY.")
            return 0 if payload.get("safe") or payload.get("removed") else 1

        if args.command == "clean":
            payload = clean(apply=args.apply)
            if args.json:
                print(json.dumps(payload, indent=2, sort_keys=True))
            else:
                print("⚔️  AOE2WAR WORKSPACE CLEAN")
                print()
                print(f"Mode:       {'APPLY' if args.apply else 'PREVIEW'}")
                print(f"Candidates: {len(payload['candidates'])}")
                print(f"Removed:    {len(payload['removed'])}")
                print(f"Failed:     {len(payload['failed'])}")
                print(
                    f"Stale meta: {len(payload['stale_metadata_untouched'])} untouched"
                )
                if not args.apply:
                    print(
                        "READ ONLY: pass --apply to remove only proven-safe registered worktrees."
                    )
                elif payload.get("receipt_path"):
                    print(f"Receipt:    {payload['receipt_path']}")
            return 1 if payload["failed"] else 0
    except WorkspaceError as exc:
        print(f"STOP: {exc}")
        return 2

    return 2


if __name__ == "__main__":
    raise SystemExit(main())
