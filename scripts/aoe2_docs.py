#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

import aoe2_audit
import aoe2_release_gate

ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / "docs" / "document-registry.json"
LOCAL_CHECKER = ROOT / "scripts" / "docs_v2_check.py"
UPDATE_SCRIPT = ROOT / "scripts" / "aoe2_update.py"
DOCS_REPO = aoe2_audit.DOCS
CENTRAL_REGISTRY = DOCS_REPO / "catalog" / "registries" / "app-prodn.json"
CENTRAL_TAXONOMY = DOCS_REPO / "catalog" / "document-taxonomy.json"
CENTRAL_STATE = DOCS_REPO / "catalog" / "runtime" / "repository-state.json"
ENGINEERING_MEMORY_PATH = "docs/ENGINEERING_MEMORY.md"

SEMANTIC_REVIEW_RISKS = {
    "INFRASTRUCTURE",
    "WATCHER",
    "REPLAY_TRUTH",
    "FINANCIAL",
    "DATABASE",
}

GENERIC_TOKENS = {
    "app", "apps", "api", "aoe2", "aoe2war", "lib", "src", "scripts",
    "script", "test", "tests", "route", "page", "index", "ts", "tsx",
    "js", "jsx", "json", "py", "sh", "md", "config", "components",
}

RISK_TOPICS = {
    "INFRASTRUCTURE": {
        "architecture", "deploy", "deployment", "documentation", "operator",
        "release", "recovery", "storage", "system", "workspace",
    },
    "WATCHER": {"watcher", "release", "download", "desktop", "replay"},
    "REPLAY_TRUTH": {"replay", "parser", "game", "result", "identity", "evidence"},
    "FINANCIAL": {"wolo", "settlement", "staking", "bet", "financial", "market"},
    "DATABASE": {"database", "schema", "migration", "prisma", "marketplace"},
    "APPLICATION": {"application", "architecture", "feature"},
    "PRESENTATION": {"presentation", "design", "ui", "theme"},
    "DOCUMENTATION": {"documentation"},
    "NO_CHANGE": set(),
}

ALIASES = {
    "docs": "documentation",
    "doc": "documentation",
    "db": "database",
    "migrations": "migration",
    "replays": "replay",
    "rollbacks": "recovery",
    "rollback": "recovery",
    "releases": "release",
    "settlements": "settlement",
    "bets": "bet",
}


def run(
    command: list[str],
    *,
    cwd: Path | None = None,
    timeout: int = 120,
    check: bool = False,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        cwd=str(cwd) if cwd else None,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=timeout,
        check=check,
    )


def git(*args: str, cwd: Path = ROOT, timeout: int = 60) -> str:
    proc = run(["git", *args], cwd=cwd, timeout=timeout)
    if proc.returncode != 0:
        raise RuntimeError(proc.stdout.strip() or f"git {' '.join(args)} failed")
    return proc.stdout.strip()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_json(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise RuntimeError(f"{path} must contain a JSON object")
    return payload


def docs_owned_path(path: str) -> bool:
    pure = Path(path)
    if path in {
        "catalog-info.yaml",
        "docs/document-registry.json",
        "scripts/docs_v2_check.py",
    }:
        return True
    if pure.suffix.lower() in {".md", ".mdx"}:
        return True
    return bool(pure.parts and pure.parts[0] == "docs")


def registry() -> dict[str, Any]:
    if not REGISTRY.is_file():
        raise RuntimeError(f"missing documentation registry: {REGISTRY}")
    return load_json(REGISTRY)


def baseline() -> tuple[str, str]:
    payload = registry().get("implementation_baseline")
    if not isinstance(payload, dict):
        raise RuntimeError("documentation registry implementation_baseline is missing")
    branch = payload.get("branch")
    commit = payload.get("commit")
    if not isinstance(branch, str) or not branch:
        raise RuntimeError("documentation baseline branch is invalid")
    if not isinstance(commit, str) or not re.fullmatch(r"[0-9a-f]{40}", commit):
        raise RuntimeError("documentation baseline commit is invalid")
    return branch, commit


def git_lines(*args: str) -> list[str]:
    out = git(*args)
    return [line for line in out.splitlines() if line.strip()]


def change_scope(base: str | None = None) -> dict[str, Any]:
    baseline_branch, baseline_commit = baseline()
    if base is None:
        base = baseline_commit
    head = git("rev-parse", "HEAD")

    committed: set[str] = set()
    if base != head:
        proc = run(["git", "merge-base", "--is-ancestor", base, head], cwd=ROOT)
        if proc.returncode != 0:
            raise RuntimeError(f"impact base {base} is not an ancestor of HEAD {head}")
        committed.update(git_lines("diff", "--name-only", f"{base}..{head}"))

    worktree = set(git_lines("diff", "--name-only"))
    staged = set(git_lines("diff", "--cached", "--name-only"))
    untracked = set(git_lines("ls-files", "--others", "--exclude-standard"))

    changed = sorted(committed | worktree | staged | untracked)
    implementation = sorted(path for path in changed if not docs_owned_path(path))
    documentation = sorted(path for path in changed if docs_owned_path(path))

    return {
        "baseline_branch": baseline_branch,
        "baseline_commit": baseline_commit,
        "base": base,
        "head": head,
        "committed": sorted(committed),
        "worktree": sorted(worktree),
        "staged": sorted(staged),
        "untracked": sorted(untracked),
        "changed": changed,
        "implementation": implementation,
        "documentation": documentation,
    }


def words(value: str) -> set[str]:
    values = re.findall(r"[a-z0-9]+", value.lower())
    result: set[str] = set()
    for token in values:
        if token in GENERIC_TOKENS or len(token) < 3:
            continue
        result.add(ALIASES.get(token, token))
    return result


def impact_topics(paths: list[str], risk: str) -> set[str]:
    result = set(RISK_TOPICS.get(risk, set()))
    for path in paths:
        result.update(words(path))
    return result


def candidate_documents(paths: list[str], risk: str, limit: int = 12) -> list[dict[str, Any]]:
    payload = registry()
    documents = payload.get("documents")
    if not isinstance(documents, list):
        raise RuntimeError("documentation registry documents must be a list")

    topics = impact_topics(paths, risk)
    scored: list[tuple[int, str, dict[str, Any], list[str]]] = []

    for item in documents:
        if not isinstance(item, dict):
            continue
        if item.get("status") in {"historical", "superseded", "generated"}:
            continue

        haystack = " ".join(
            str(item.get(key, ""))
            for key in ("id", "title", "path", "authority", "type")
        )
        doc_words = words(haystack)
        overlap = sorted(topics & doc_words)
        systems = item.get("systems") if isinstance(item.get("systems"), list) else []
        score = len(overlap) * 5
        if "app-prodn" in systems:
            score += 3
        if item.get("authority") in {
            "implementation-contract",
            "operational-procedure",
            "architecture-explanation",
            "repository-entrypoint",
            "documentation-operations-contract",
        }:
            score += 2
        if item.get("type") in {"runbook", "reference", "explanation"}:
            score += 1

        if not overlap and risk not in {"APPLICATION", "PRESENTATION"}:
            continue
        if score <= 0:
            continue

        scored.append((score, str(item.get("path", "")), item, overlap))

    if not scored:
        for item in documents:
            if not isinstance(item, dict):
                continue
            if item.get("path") in {"ARCHITECTURE.md", "README.md"}:
                scored.append((1, str(item.get("path")), item, []))

    scored.sort(key=lambda row: (-row[0], row[1]))
    return [
        {
            "score": score,
            "path": item.get("path"),
            "title": item.get("title"),
            "authority": item.get("authority"),
            "systems": item.get("systems"),
            "matched_topics": overlap,
        }
        for score, _path, item, overlap in scored[:limit]
    ]


def semantic_documentation(paths: list[str]) -> list[str]:
    generated = {
        "docs/DOCUMENTATION_CONTROL_PLANE.md",
        "docs/document-registry.json",
    }
    return sorted(
        path
        for path in paths
        if docs_owned_path(path)
        and path not in generated
        and (path.endswith(".md") or path.endswith(".mdx"))
    )


def impact_payload(base: str | None = None) -> dict[str, Any]:
    scope = change_scope(base)
    implementation = scope["implementation"]
    risk = aoe2_release_gate.classify_risk(implementation)
    semantic_review = bool(implementation and risk in SEMANTIC_REVIEW_RISKS)
    semantic_changed = semantic_documentation(scope["documentation"])
    memory_changed = ENGINEERING_MEMORY_PATH in semantic_changed
    candidates = candidate_documents(implementation, risk) if implementation else []

    if not implementation:
        state = "NONE"
    elif semantic_review and semantic_changed and memory_changed:
        state = "SEMANTIC_REVIEW_COVERED"
    elif semantic_review:
        state = "SEMANTIC_REVIEW_DUE"
    else:
        state = "GENERATED_REFRESH_ONLY"

    return {
        "schema": 1,
        "state": state,
        "risk": risk,
        "semantic_review_required": semantic_review,
        "semantic_docs_changed": semantic_changed,
        "engineering_memory_required": semantic_review,
        "engineering_memory_changed": memory_changed,
        "candidate_documents": candidates,
        "scope": scope,
    }


def checker_state() -> dict[str, Any]:
    proc = run([sys.executable, str(LOCAL_CHECKER)], cwd=ROOT, timeout=120)
    output = proc.stdout.strip()
    baseline_due = (
        "implementation changed after the recorded baseline" in output
        or "--refresh-baseline" in output
    )
    return {
        "ok": proc.returncode == 0,
        "baseline_due": baseline_due,
        "summary": output.splitlines()[-1] if output else "no checker output",
    }


def central_state() -> dict[str, Any]:
    result: dict[str, Any] = {
        "repo_exists": DOCS_REPO.is_dir(),
        "registry_present": CENTRAL_REGISTRY.is_file(),
        "registry_current": False,
        "taxonomy_current": False,
        "repository_state_current": False,
    }
    if not DOCS_REPO.is_dir():
        return result

    if CENTRAL_REGISTRY.is_file() and REGISTRY.is_file():
        result["registry_current"] = sha256(CENTRAL_REGISTRY) == sha256(REGISTRY)
        result["local_registry_sha256"] = sha256(REGISTRY)
        result["central_registry_sha256"] = sha256(CENTRAL_REGISTRY)

    local_paths = {
        str(item.get("path"))
        for item in registry().get("documents", [])
        if isinstance(item, dict)
    }

    if CENTRAL_TAXONOMY.is_file():
        taxonomy = load_json(CENTRAL_TAXONOMY)
        taxonomy_paths = {
            str(item.get("path"))
            for item in taxonomy.get("documents", [])
            if isinstance(item, dict) and item.get("repository") == "app-prodn"
        }
        result["taxonomy_current"] = local_paths == taxonomy_paths
        result["taxonomy_local_count"] = len(local_paths)
        result["taxonomy_central_count"] = len(taxonomy_paths)

    if CENTRAL_STATE.is_file() and CENTRAL_REGISTRY.is_file():
        state = load_json(CENTRAL_STATE)
        rows = state.get("repositories") if isinstance(state.get("repositories"), list) else []
        app = next(
            (item for item in rows if isinstance(item, dict) and item.get("id") == "app-prodn"),
            None,
        )
        if isinstance(app, dict):
            result["documentation_snapshot"] = app.get("documentation_snapshot")
            result["central_implementation_baseline"] = app.get("implementation_baseline")
            result["repository_state_current"] = (
                app.get("registry_sha256") == sha256(CENTRAL_REGISTRY)
            )

    try:
        result["central_head"] = git("rev-parse", "HEAD", cwd=DOCS_REPO)
        result["central_dirty"] = bool(git("status", "--porcelain", cwd=DOCS_REPO))
    except Exception as exc:
        result["git_error"] = str(exc)

    return result


def review_health() -> dict[str, Any]:
    today = datetime.now(timezone.utc).date()
    overdue: list[dict[str, Any]] = []
    due_soon: list[dict[str, Any]] = []
    documents = registry().get("documents", [])
    if not isinstance(documents, list):
        return {"overdue": overdue, "due_soon": due_soon}

    for item in documents:
        if not isinstance(item, dict):
            continue
        interval = item.get("review_interval_days")
        reviewed = item.get("reviewed_at")
        if not isinstance(interval, int) or interval <= 0 or not isinstance(reviewed, str):
            continue
        try:
            reviewed_date = date.fromisoformat(reviewed)
        except ValueError:
            continue
        age = (today - reviewed_date).days
        remaining = interval - age
        row = {
            "path": item.get("path"),
            "title": item.get("title"),
            "days_remaining": remaining,
        }
        if remaining < 0:
            overdue.append(row)
        elif remaining <= 7:
            due_soon.append(row)

    overdue.sort(key=lambda item: item["days_remaining"])
    due_soon.sort(key=lambda item: item["days_remaining"])
    return {"overdue": overdue, "due_soon": due_soon}


def status_payload() -> dict[str, Any]:
    scope = change_scope()
    checker = checker_state()
    central = central_state()
    impact = impact_payload()
    reviews = review_health()

    if reviews["overdue"]:
        health = "BLOCKED"
    elif impact["state"] == "SEMANTIC_REVIEW_DUE":
        health = "IMPACT_PENDING"
    elif scope["implementation"] or checker["baseline_due"]:
        health = "BASELINE_DUE"
    elif not checker["ok"]:
        health = "BLOCKED"
    elif not central.get("registry_current") or not central.get("taxonomy_current"):
        health = "FEDERATION_DUE"
    elif not central.get("repository_state_current"):
        health = "ATTENTION"
    else:
        health = "HEALTHY"

    return {
        "schema": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "health": health,
        "repository": {
            "head": scope["head"],
            "branch": git("branch", "--show-current"),
            "dirty": bool(git("status", "--porcelain", "--untracked-files=all")),
            "document_count": len(registry().get("documents", [])),
            "implementation_baseline": {
                "branch": scope["baseline_branch"],
                "commit": scope["baseline_commit"],
            },
        },
        "checker": checker,
        "impact": impact,
        "central": central,
        "reviews": reviews,
    }


def print_status(payload: dict[str, Any]) -> None:
    repo = payload["repository"]
    impact = payload["impact"]
    central = payload["central"]
    reviews = payload["reviews"]

    print("⚔️  AOE2WAR DOCUMENTATION OS")
    print()
    print(f"Health:              {payload['health']}")
    print(f"Documents:           {repo['document_count']} explicit app-prodn docs")
    print(f"HEAD:                {repo['head'][:12]} · branch={repo['branch']} · dirty={int(repo['dirty'])}")
    print(
        "Implementation:      "
        f"{repo['implementation_baseline']['commit'][:12]} baseline → "
        f"{len(impact['scope']['implementation'])} changed implementation paths"
    )
    print(f"Impact:              {impact['state']} · risk={impact['risk']}")
    print(
        "Local checker:       "
        + ("PASS" if payload["checker"]["ok"] else "ATTENTION")
    )
    print(
        "Central registry:    "
        + ("CURRENT" if central.get("registry_current") else "SYNC DUE")
    )
    print(
        "Central taxonomy:    "
        + ("CURRENT" if central.get("taxonomy_current") else "RECONCILE DUE")
    )
    print(
        "Central state:       "
        + ("CURRENT" if central.get("repository_state_current") else "REFRESH DUE")
    )
    print(f"Review overdue:      {len(reviews['overdue'])}")
    print(f"Review due ≤7 days:  {len(reviews['due_soon'])}")

    if impact["state"] == "SEMANTIC_REVIEW_DUE":
        print()
        print("Semantic review candidates:")
        for item in impact["candidate_documents"][:8]:
            topics = ",".join(item["matched_topics"]) or "broad-contract"
            print(f"  {item['path']}  [{topics}]")
        print()
        print("Documentation OS will not silently rewrite semantic documentation.")
        print("Update the relevant living contract when behavior changed; otherwise the")
        print("impact remains an explicit review signal rather than invented documentation.")


def print_impact(payload: dict[str, Any]) -> None:
    scope = payload["scope"]
    print("⚔️  AOE2WAR DOCUMENTATION IMPACT")
    print()
    print(f"State:                {payload['state']}")
    print(f"Risk:                 {payload['risk']}")
    print(f"Base:                 {scope['base'][:12]}")
    print(f"HEAD:                 {scope['head'][:12]}")
    print(f"Implementation paths: {len(scope['implementation'])}")
    print(f"Documentation paths:  {len(scope['documentation'])}")
    print(f"Semantic review:      {'REQUIRED' if payload['semantic_review_required'] else 'NOT REQUIRED'}")
    print(
        "Engineering memory:  "
        + (
            "UPDATED"
            if payload.get("engineering_memory_changed")
            else (
                "REQUIRED"
                if payload.get("engineering_memory_required")
                else "NOT REQUIRED"
            )
        )
    )

    if scope["implementation"]:
        print()
        print("Changed implementation:")
        for path in scope["implementation"]:
            print(f"  {path}")

    if payload["semantic_docs_changed"]:
        print()
        print("Semantic documentation changed:")
        for path in payload["semantic_docs_changed"]:
            print(f"  {path}")

    if payload["candidate_documents"]:
        print()
        print("Ranked review candidates:")
        for item in payload["candidate_documents"]:
            topics = ",".join(item["matched_topics"]) or "broad-contract"
            print(
                f"  score={item['score']:>2}  {item['path']}  "
                f"[{item['authority']}; {topics}]"
            )


def source_audit() -> list[dict[str, Any]]:
    import aoe2_update

    results: list[dict[str, Any]] = []
    for repo_id, repo in aoe2_update.SOURCES.items():
        rc, out = aoe2_update.source_checker(repo)
        results.append(
            {
                "repo": repo_id,
                "ok": rc == 0,
                "detail": aoe2_audit.checker_summary(out),
            }
        )
    return results


def central_audit() -> dict[str, Any]:
    if not DOCS_REPO.is_dir():
        raise RuntimeError(f"AoE2WAR-docs repository missing: {DOCS_REPO}")

    venv_python = DOCS_REPO / ".venv-docs" / "bin" / "python"
    venv_mkdocs = DOCS_REPO / ".venv-docs" / "bin" / "mkdocs"
    if not venv_python.is_file() or not venv_mkdocs.is_file():
        raise RuntimeError("central documentation venv missing; run `make bootstrap` in AoE2WAR-docs")

    import aoe2_update

    temp_root = Path(tempfile.mkdtemp(prefix="aoe2war-docs-audit-"))
    worktree = temp_root / "AoE2WAR-docs"
    added = False
    steps: list[dict[str, Any]] = []

    try:
        add = run(
            ["git", "worktree", "add", "--detach", str(worktree), "HEAD"],
            cwd=DOCS_REPO,
            timeout=120,
        )
        if add.returncode != 0:
            raise RuntimeError("cannot create isolated documentation audit worktree: " + add.stdout[-2000:])
        added = True

        commands: list[tuple[str, list[str], int]] = [
            ("generate", [str(venv_python), "scripts/generate.py"], 120),
            ("validate", [str(venv_python), "scripts/validate.py"], 120),
            ("validate-yaml", [str(venv_python), "scripts/validate_frontmatter_yaml.py"], 120),
            ("idempotence", [str(venv_python), "scripts/check_generation_idempotence.py"], 180),
            (
                "audit-taxonomy",
                [
                    str(venv_python),
                    "scripts/audit_taxonomy.py",
                    "--app", str(aoe2_update.SOURCES["app-prodn"]),
                    "--api", str(aoe2_update.SOURCES["api-prodn"]),
                    "--watcher", str(aoe2_update.SOURCES["aoe2-watcher"]),
                    "--vpssentry", str(aoe2_update.VPSSENTRY),
                    "--wolochain", str(aoe2_update.WOLOCHAIN),
                    "--docs", ".",
                    "--json", "taxonomy-audit.json",
                    "--csv", "migration-matrix.csv",
                ],
                180,
            ),
            (
                "build",
                [str(venv_mkdocs), "build", "--strict", "--site-dir", str(worktree / "_site-audit")],
                180,
            ),
        ]

        for label, command, timeout in commands:
            proc = run(command, cwd=worktree, timeout=timeout)
            steps.append(
                {
                    "label": label,
                    "ok": proc.returncode == 0,
                    "detail": proc.stdout.strip().splitlines()[-1] if proc.stdout.strip() else "",
                }
            )
            if proc.returncode != 0:
                raise RuntimeError(f"central documentation {label} failed:\n{proc.stdout[-5000:]}")

        return {
            "ok": True,
            "head": git("rev-parse", "HEAD", cwd=DOCS_REPO),
            "steps": steps,
        }
    finally:
        if added:
            run(["git", "worktree", "remove", "--force", str(worktree)], cwd=DOCS_REPO, timeout=120)
        shutil.rmtree(temp_root, ignore_errors=True)


def audit_payload() -> dict[str, Any]:
    sources = source_audit()
    central = central_audit()
    status = status_payload()
    ok = all(item["ok"] for item in sources) and central["ok"]
    ok = ok and status["health"] == "HEALTHY"
    return {
        "schema": 1,
        "ok": ok,
        "status": status,
        "sources": sources,
        "central": central,
    }


def print_audit(payload: dict[str, Any]) -> None:
    print("⚔️  AOE2WAR DOCUMENTATION AUDIT")
    print()
    for item in payload["sources"]:
        print(f"Source {item['repo']:<12} {'PASS' if item['ok'] else 'FAIL'}  {item['detail']}")
    print()
    for item in payload["central"]["steps"]:
        print(f"Central {item['label']:<14} {'PASS' if item['ok'] else 'FAIL'}  {item['detail']}")
    print()
    print(f"Documentation health: {payload['status']['health']}")
    print("AUDIT: " + ("HEALTHY" if payload["ok"] else "ATTENTION"))


def update_proxy(arguments: list[str]) -> int:
    command = [sys.executable, str(UPDATE_SCRIPT), *arguments]
    return subprocess.call(command, cwd=str(ROOT))


def self_test() -> int:
    assert aoe2_release_gate.classify_risk([]) == "NO_CHANGE"
    assert "documentation" in impact_topics(["scripts/aoe2_docs.py"], "INFRASTRUCTURE")
    assert "database" in impact_topics(["prisma/schema.prisma"], "DATABASE")
    assert docs_owned_path("docs/FOO.md")
    assert docs_owned_path("README.md")
    assert not docs_owned_path("app/page.tsx")
    assert "INFRASTRUCTURE" in SEMANTIC_REVIEW_RISKS
    assert "APPLICATION" not in SEMANTIC_REVIEW_RISKS
    print("PASS: Documentation OS policy invariants")
    return 0


def main() -> int:
    if len(sys.argv) >= 2 and sys.argv[1] == "update":
        return update_proxy(sys.argv[2:])

    parser = argparse.ArgumentParser(prog="aoe2war docs")
    sub = parser.add_subparsers(dest="command", required=True)

    status_parser = sub.add_parser("status", help="cheap documentation health summary")
    status_parser.add_argument("--json", action="store_true")

    impact_parser = sub.add_parser("impact", help="map implementation changes to documentation review candidates")
    impact_parser.add_argument("--base")
    impact_parser.add_argument("--json", action="store_true")

    audit_parser = sub.add_parser("audit", help="full isolated documentation-control-plane audit")
    audit_parser.add_argument("--json", action="store_true")

    sub.add_parser("self-test", help=argparse.SUPPRESS)

    args = parser.parse_args()

    try:
        if args.command == "status":
            payload = status_payload()
            if args.json:
                print(json.dumps(payload, indent=2, sort_keys=True))
            else:
                print_status(payload)
            return 0 if payload["health"] == "HEALTHY" else 1

        if args.command == "impact":
            payload = impact_payload(args.base)
            if args.json:
                print(json.dumps(payload, indent=2, sort_keys=True))
            else:
                print_impact(payload)
            return 1 if payload["state"] == "SEMANTIC_REVIEW_DUE" else 0

        if args.command == "audit":
            payload = audit_payload()
            if args.json:
                print(json.dumps(payload, indent=2, sort_keys=True))
            else:
                print_audit(payload)
            return 0 if payload["ok"] else 1

        if args.command == "self-test":
            return self_test()
    except (RuntimeError, OSError, subprocess.TimeoutExpired, ValueError) as exc:
        print(f"STOP: {exc}", file=sys.stderr)
        return 2

    return 2


if __name__ == "__main__":
    raise SystemExit(main())
