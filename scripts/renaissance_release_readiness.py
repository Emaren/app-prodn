#!/usr/bin/env python3
"""Fail-closed, read-only Renaissance release readiness; never authorizes deployment.

Snapshot mode enables reproducible offline evidence review. Live mode performs
bounded GitHub GET requests for the exact PR SHA and required CI workflows.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from typing import Any

SCHEMA = "aoe2war.renaissance.release-readiness.v1"
SHA = re.compile(r"[0-9a-f]{40}\Z")
REPO = re.compile(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+\Z")
REQUIRED_WORKFLOWS = (
    "AoE2WAR CI",
    "Renaissance source integrity",
    "Kingdom Index source census",
    "Kingdom Index criterion submission boundary",
    "Renaissance integrated Kingdom Chrome (candidate only)",
    "Kingdom Index Watcher DocsV2 Source-Bound Proposal",
)
REQUIRED_JOBS = {
    "Renaissance integrated Kingdom Chrome (candidate only)": (
        "Integrated brain real Next/Chrome — NOT production",
        "Integrated intelligence real Next/Chrome — NOT production",
        "Integrated tests real Next/Chrome — NOT production",
    ),
    "Kingdom Index criterion submission boundary": (
        "Index exact-head TS contract (NOT production approval)",
        "Untrusted receipt, signature, rubric and replay refusal (fixtures only)",
        "Exact PR-head Next emitted closure (observation ONLY)",
    ),
    "AoE2WAR CI": (
        "Type, contract, and production build",
        "Isolated Steam-rating PostgreSQL chronology",
        "Release and documentation control plane",
    ),
}


def api_get(repo: str, suffix: str, token: str | None = None) -> dict[str, Any]:
    """Fixed GitHub origin, read-only GET, bounded response. Never writes."""
    request = Request(
        "https://api.github.com/repos/" + repo + suffix,
        headers={
            "Accept": "application/vnd.github+json",
            "User-Agent": "aoe2war-renaissance-readiness/1",
            **({"Authorization": "Bearer " + token} if token else {}),
        },
        method="GET",
    )
    with urlopen(request, timeout=15) as response:
        data = response.read(4_000_001)
    if len(data) > 4_000_000:
        raise ValueError("GitHub response exceeds bounded limit")
    result = json.loads(data)
    if not isinstance(result, dict):
        raise ValueError("GitHub API response must be an object")
    return result


def _sha(value: Any) -> str:
    if not isinstance(value, str) or not SHA.fullmatch(value):
        raise ValueError("Malformed required 40-character Git SHA")
    return value


def _number(value: Any) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise ValueError("Invalid GitHub identifier")
    return value


def select_runs(runs: list, head: str) -> dict[str, dict]:
    """Newer failed CI always wins over older green CI for the same workflow."""
    chosen: dict[str, dict] = {}
    for row in runs:
        if not isinstance(row, dict):
            raise ValueError("Malformed workflow run")
        name = row.get("name")
        if name not in REQUIRED_WORKFLOWS or row.get("head_sha") != head or row.get("event") != "pull_request":
            continue
        run_id = _number(row.get("id"))
        order = (_number(row.get("run_number")), _number(row.get("run_attempt", 1)), run_id)
        previous = chosen.get(name)
        if previous is None or order > previous["_order"]:
            chosen[name] = {**row, "_order": order}
    return chosen


def live_snapshot(repo: str, number: int, token: str | None = None) -> dict[str, Any]:
    pr = api_get(repo, f"/pulls/{number}", token)
    main = api_get(repo, "/git/ref/heads/main", token)
    head = _sha(pr.get("head", {}).get("sha"))
    baseline = _sha(main.get("object", {}).get("sha"))
    comparison = api_get(repo, f"/compare/{baseline}...{head}", token)
    params = urlencode({"head_sha": head, "event": "pull_request", "per_page": 100})
    runs = api_get(repo, "/actions/runs?" + params, token)
    records = runs.get("workflow_runs")
    if not isinstance(records, list):
        raise ValueError("GitHub workflow_runs missing")
    if len(records) == 100 or runs.get("total_count", 0) > len(records):
        raise ValueError("Run list incomplete; cannot qualify partial CI")
    chosen = select_runs(records, head)
    jobs = {}
    for name in REQUIRED_JOBS:
        match = chosen.get(name)
        if match is None:
            continue
        run_id = match["id"]
        response = api_get(repo, f"/actions/runs/{run_id}/jobs?per_page=100", token)
        entries = response.get("jobs")
        if not isinstance(entries, list) or len(entries) == 100 or response.get("total_count", 0) > len(entries):
            raise ValueError(f"Missing or incomplete job list for {name}")
        jobs[str(run_id)] = entries
    return {"repo": repo, "pr": pr, "main": main, "compare": comparison, "runs": records, "jobs": jobs}


def analyze(snapshot: dict[str, Any], *, repo: str, pr_number: int, expected_head: str | None) -> dict[str, Any]:
    if not REPO.fullmatch(repo) or pr_number < 1:
        raise ValueError("Invalid repository or PR number")
    if expected_head is not None:
        _sha(expected_head)
    if not isinstance(snapshot, dict) or snapshot.get("repo") != repo:
        raise ValueError("Invalid or foreign snapshot repository")
    pr, main, compare = snapshot.get("pr"), snapshot.get("main"), snapshot.get("compare")
    runs, jobsets = snapshot.get("runs"), snapshot.get("jobs")
    if not all(isinstance(x, dict) for x in (pr, main, compare, jobsets)) or not isinstance(runs, list):
        raise ValueError("Incomplete PR/main/compare/runs/jobs snapshot")
    if pr.get("number") != pr_number:
        raise ValueError("Snapshot PR number mismatch")
    head_ref, base_ref = pr.get("head"), pr.get("base")
    if not isinstance(head_ref, dict) or not isinstance(base_ref, dict):
        raise ValueError("Malformed PR refs")
    sha = _sha(head_ref.get("sha"))
    main_sha = _sha(main.get("object", {}).get("sha"))
    _sha(base_ref.get("sha"))
    if expected_head and sha != expected_head:
        raise ValueError("PR head changed since expected immutable source")
    blockers = []

    def stop(code: str, detail: str) -> None:
        blockers.append({"code": code, "detail": detail})

    if head_ref.get("repo", {}).get("full_name") != repo or base_ref.get("repo", {}).get("full_name") != repo:
        stop("FORKED_REFS", "Both refs must belong to the authorized repository")
    if base_ref.get("ref") != "main":
        stop("WRONG_BASE_BRANCH", "Candidate must target protected main")
    if pr.get("state") != "open":
        stop("NOT_OPEN", "Pull request is not open")
    if pr.get("draft") is not False:
        stop("DRAFT", "Candidate remains draft; no reviewed merge")
    if pr.get("mergeable") is not True:
        stop("NOT_MERGEABLE", "Mergeability unknown or false")
    if compare.get("base_commit", {}).get("sha") != main_sha or compare.get("head_commit", {}).get("sha") != sha:
        stop("UNBOUND_COMPARE", "GitHub comparison does not bind exact main and PR head")
    if compare.get("status") not in ("ahead", "identical"):
        stop("MAIN_NOT_ANCESTOR", "Current main not ancestor of candidate; integrate and requalify")

    selected = select_runs(runs, sha)
    workflows = []
    for name in REQUIRED_WORKFLOWS:
        row = selected.get(name)
        if row is None:
            stop("MISSING_WORKFLOW", name + " has no exact-head pull_request run")
            workflows.append({"name": name, "conclusion": "MISSING", "run_id": None, "jobs": []})
            continue
        conclusion = row.get("conclusion")
        if row.get("status") != "completed" or conclusion != "success":
            stop("WORKFLOW_NOT_GREEN", name + " is " + str(conclusion or row.get("status")))
        run_id = row["id"]
        statuses = []
        if name in REQUIRED_JOBS:
            jobs = jobsets.get(str(run_id))
            if not isinstance(jobs, list):
                stop("MISSING_JOB_RECEIPT", name + " jobs unavailable")
                jobs = []
            for required in REQUIRED_JOBS[name]:
                found = [item for item in jobs if isinstance(item, dict) and item.get("name") == required]
                if len(found) != 1:
                    stop("MISSING_OR_AMBIGUOUS_JOB", name + ": " + required)
                    statuses.append({"name": required, "conclusion": "MISSING_OR_DUPLICATED"})
                    continue
                job = found[0]
                verdict = job.get("conclusion")
                if job.get("status") != "completed" or verdict != "success":
                    stop("JOB_NOT_GREEN", required + " is " + str(verdict or job.get("status")))
                statuses.append({"name": required, "conclusion": verdict})
        workflows.append({"name": name, "conclusion": conclusion, "run_id": run_id, "jobs": statuses})

    return {
        "schema": SCHEMA,
        "repo": repo, "pr_number": pr_number,
        "candidate_sha": sha, "current_main_sha": main_sha,
        "candidate_ci_qualified": not blockers,
        "source_diverged_from_main": compare.get("status") not in ("ahead", "identical"),
        "checks": workflows, "blockers": blockers,
        "protected_release_authorized": False,
        "artifact_specific_owner_authorization_verified": False,
        "live_build_parity_verified": False,
        "financial_release_authorized": False,
        "index_quality_score_approved": False,
        "production_deployed": None,
        "advice": "CI green is not permission to merge, stage, activate, release funds or award a /100 grade. An independently approved, artifact-bound protected release remains necessary.",
    }


def render_markdown(result: dict[str, Any]) -> str:
    lines = [
        "# Renaissance release readiness — READ ONLY",
        "",
        f"**Candidate:** \x60{result['candidate_sha']}\x60 · **Current main:** \x60{result['current_main_sha']}\x60",
        f"**Candidate CI:** {'QUALIFIED' if result['candidate_ci_qualified'] else 'BLOCKED'} · **Deployment authorization:** NOT GRANTED",
        "",
        "| Exact-head workflow | Result | Jobs |",
        "|---|---|---|",
    ]
    for row in result["checks"]:
        jobs = ", ".join(j["name"].split(" — ")[0] + ":" + str(j["conclusion"]) for j in row["jobs"])
        lines.append(f"| {row['name']} | {row['conclusion']} | {jobs or '—'} |")
    lines.extend(["", "## Blockers"])
    lines.extend(f"- **{item['code']}:** {item['detail']}" for item in result["blockers"])
    if not result["blockers"]:
        lines.append("- No candidate-CI blockers. Protected release authorization is STILL unverified.")
    lines.extend(["", "**Always separate:** candidate CI ≠ approved merge ≠ sealed artifact ≠ authorized activation ≠ verified production ≠ financial release ≠ independently signed /100 score.", ""])
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", default="Emaren/app-prodn")
    parser.add_argument("--pr", type=int, default=824)
    parser.add_argument("--expected-sha", help="Optional immutable 40-character SHA fence")
    parser.add_argument("--snapshot", help="Read offline JSON snapshot instead of querying GitHub")
    parser.add_argument("--format", choices=("markdown", "json"), default="markdown")
    args = parser.parse_args(argv)
    try:
        if not REPO.fullmatch(args.repo) or args.pr < 1:
            raise ValueError("Invalid repository or PR")
        if args.snapshot:
            with open(args.snapshot, "rb") as handle:
                raw = handle.read(4_000_001)
            if len(raw) > 4_000_000:
                raise ValueError("Snapshot exceeds size limit")
            snapshot = json.loads(raw)
        else:
            snapshot = live_snapshot(args.repo, args.pr, os.getenv("GH_TOKEN") or os.getenv("GITHUB_TOKEN"))
        report = analyze(snapshot, repo=args.repo, pr_number=args.pr, expected_head=args.expected_sha)
        print(json.dumps(report, indent=2, sort_keys=True) if args.format == "json" else render_markdown(report))
        return 0 if report["candidate_ci_qualified"] else 2
    except (OSError, ValueError, HTTPError, URLError, json.JSONDecodeError) as exc:
        print("RENAISSANCE RELEASE READINESS STOP: " + str(exc)[:300], file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
