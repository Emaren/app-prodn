#!/usr/bin/env python3
"""Read-only exact-HEAD source and financial-HOLD evidence observer.

This creates an evidence report, NOT a release permit, deployment, bank proof,
custody attestation or authorization to move real WOLO.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

API = "https://api.github.com"
COMMIT = re.compile(r"^[a-f0-9]{40}$")
SLUG = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
APP_CHECKS = (
    "Release and documentation control plane",
    "Type, contract, and production build",
    "Isolated Steam-rating PostgreSQL chronology",
    "Original-LIVE HD admission / isolated PostgreSQL 16",
    "Source-bound finance fence / isolated PostgreSQL 16",
    "PostgreSQL 16 / War Satchel exact proof constraints",
)
WOLO_CHECKS = (
    "Foundation checks",
    "Independent reviewer PostgreSQL observation",
    "private-custody",
    "source-seal",
    "Reproducible custody backend wolosatcheld artifact — UNDEPLOYED",
)


def api_get(path: str, token: str | None = None) -> Any:
    """One authenticated, read-only GitHub REST GET; no mutation ever."""
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "aoe2war-release-flight-recorder/1",
    }
    if token:
        headers["Authorization"] = "Bearer " + token
    request = Request(API + path, headers=headers, method="GET")
    try:
        with urlopen(request, timeout=15) as response:
            return json.load(response)
    except (HTTPError, URLError, TimeoutError, ValueError) as exc:
        code = getattr(exc, "code", None)
        # Never serialize the request object or its credential-bearing headers.
        raise RuntimeError(f"GitHub evidence read unavailable ({code or type(exc).__name__})") from None


def validate_repo(value: str) -> str:
    if not SLUG.fullmatch(value):
        raise ValueError("Repository must be a GitHub owner/name slug")
    return value


def validate_pr(value: str | int) -> int:
    if not str(value).isdigit() or len(str(value)) > 7 or int(value) <= 0:
        raise ValueError("PR or issue number must be a positive integer")
    return int(value)


def latest_checks(check_runs: list[dict[str, Any]], head: str) -> dict[str, dict[str, Any]]:
    """Only exact HEAD checks qualify; newest check-run id wins per job name."""
    if not COMMIT.fullmatch(head):
        raise ValueError("Unverifiable commit identity")
    out: dict[str, dict[str, Any]] = {}
    for run in check_runs:
        if run.get("head_sha") != head:
            continue
        name, run_id = run.get("name"), run.get("id")
        if not isinstance(name, str) or not name or not isinstance(run_id, int):
            continue
        if name not in out or run_id > out[name]["id"]:
            out[name] = {
                "id": run_id,
                "status": str(run.get("status") or "unknown"),
                "conclusion": str(run.get("conclusion") or ""),
                "url": str(run.get("html_url") or ""),
            }
    return out


def evaluate_checks(checks: dict[str, dict[str, Any]], required: tuple[str, ...]) -> dict[str, Any]:
    detail: dict[str, Any] = {}
    outcomes: list[str] = []
    for name in required:
        entry = checks.get(name)
        if entry is None:
            detail[name] = {"verdict": "MISSING", "url": None}
            outcomes.append("MISSING")
            continue
        status, conclusion = entry["status"], entry["conclusion"]
        verdict = "PASS" if status == "completed" and conclusion == "success" else (
            "PENDING" if status in ("queued", "in_progress", "waiting", "requested", "pending") else "FAIL"
        )
        detail[name] = {
            "verdict": verdict, "status": status,
            "conclusion": conclusion, "url": entry["url"],
        }
        outcomes.append(verdict)
    state = (
        "RED" if "FAIL" in outcomes else
        "UNVERIFIED" if "MISSING" in outcomes else
        "PENDING" if "PENDING" in outcomes else "GREEN"
    )
    return {
        "source_check_state": state,
        "required": detail,
        "other_check_count": len(set(checks) - set(required)),
    }


def collect_pr(repo: str, number: int, required: tuple[str, ...], token: str | None) -> dict[str, Any]:
    base = f"/repos/{repo}"
    pr = api_get(base + f"/pulls/{number}", token)
    head = pr["head"]["sha"]
    if not isinstance(head, str) or not COMMIT.fullmatch(head):
        raise RuntimeError("Pull request head SHA is not a full git commit")
    main = api_get(base + "/git/ref/heads/main", token)["object"]["sha"]
    if not isinstance(main, str) or not COMMIT.fullmatch(main):
        raise RuntimeError("Repository main SHA is unavailable")
    all_runs: list[dict[str, Any]] = []
    for page in range(1, 11):
        payload = api_get(base + f"/commits/{head}/check-runs?per_page=100&page={page}", token)
        rows = payload.get("check_runs")
        if not isinstance(rows, list):
            raise RuntimeError("Malformed check-run response")
        all_runs.extend(rows)
        if len(rows) < 100:
            break
    else:
        raise RuntimeError("Check-run pagination exceeded safe evidence limit")
    checks = evaluate_checks(latest_checks(all_runs, head), required)
    # A concurrent Codex push cannot turn stale green checks into new-head proof.
    final_head = api_get(base + f"/pulls/{number}", token)["head"]["sha"]
    if final_head != head:
        raise RuntimeError("Pull request head moved while evidence was collected")
    return {
        "repo": repo, "pr_number": number, "url": pr.get("html_url"),
        "head_sha": head, "main_sha_at_observation": main,
        "base_branch": pr["base"]["ref"], "draft": bool(pr.get("draft")),
        "merged": bool(pr.get("merged")), "state": pr.get("state"),
        "mergeable": pr.get("mergeable"), **checks,
    }


def collect_issue(repo: str, number: int, token: str | None) -> dict[str, Any]:
    issue = api_get(f"/repos/{repo}/issues/{number}", token)
    body = str(issue.get("body") or "")
    return {
        "repo": repo, "number": number, "url": issue.get("html_url"),
        "state": issue.get("state"), "updated_at": issue.get("updated_at"),
        "title": issue.get("title"),
        "body_sha256": hashlib.sha256(body.encode()).hexdigest(),
        "note": "Issue status and checksum are observational, not financial certification.",
    }


def build_report(
    app_repo: str, app_pr: int, wolo_repo: str, wolo_pr: int,
    issue_number: int, token: str | None = None,
    observed_at: str | None = None,
) -> dict[str, Any]:
    report: dict[str, Any] = {
        "schema": 1,
        "collected_at": observed_at or datetime.now(timezone.utc).isoformat(),
        "collector_commit": os.getenv("GITHUB_SHA"),
        "intent": "READ_ONLY_CROSS_REPO_SOURCE_EVIDENCE",
        "financial_activation": "HARD_HOLD_UNCERTIFIED",
        "production_deployment_authorized": False,
        "financial_note": (
            "GitHub checks and issue closure cannot certify reserves, custody, solvency, "
            "actual operations, or operator/witness approvals."
        ),
        "errors": [],
    }
    for key, func in (
        ("application", lambda: collect_pr(app_repo, app_pr, APP_CHECKS, token)),
        ("wolochain", lambda: collect_pr(wolo_repo, wolo_pr, WOLO_CHECKS, token)),
        ("financial_issue", lambda: collect_issue(wolo_repo, issue_number, token)),
    ):
        try:
            report[key] = func()
        except (KeyError, TypeError, ValueError, RuntimeError) as exc:
            report[key] = {"state": "UNVERIFIED", "error": str(exc)}
            report["errors"].append(key)
    states = [report[key].get("source_check_state", "UNVERIFIED")
              for key in ("application", "wolochain")]
    report["source_evidence"] = (
        "GREEN" if states == ["GREEN", "GREEN"] else
        "RED" if "RED" in states else
        "UNVERIFIED" if "UNVERIFIED" in states else "PENDING"
    )
    return report


def markdown_report(report: dict[str, Any]) -> str:
    tick = chr(96)
    lines = [
        "# AoE2WAR Release Flight Recorder", "",
        f"Observed at: {tick}{report['collected_at']}{tick}", "",
        f"**Cross-repository source evidence: {report['source_evidence']}**", "",
        "**Financial activation: HARD HOLD — NOT CERTIFIED.**",
        "**Production deployment authorization: NO.**", "",
        "| Source | Exact HEAD | Source checks | PR |",
        "|---|---|---|---|",
    ]
    for key in ("application", "wolochain"):
        v = report[key]
        lines.append(
            f"| {key} | {tick}{v.get('head_sha','UNVERIFIED')}{tick} | "
            f"{v.get('source_check_state','UNVERIFIED')} | "
            f"{v.get('url') or 'Unavailable'} |"
        )
    lines.extend(["", "## Required source checks", ""])
    for key in ("application", "wolochain"):
        v = report[key]
        lines.append(f"### {key}")
        for name, check in v.get("required", {}).items():
            lines.append(f"- {check['verdict']}: {name}")
        if v.get("error"):
            lines.append(f"- UNVERIFIED: {v['error']}")
        lines.append("")
    issue = report["financial_issue"]
    lines.extend([
        "## Financial authority is external to this report", "",
        f"Issue #{issue.get('number','?')}: {issue.get('state','UNVERIFIED')} — "
        f"{issue.get('url','unavailable')}", "",
        "Even if both source rows turn GREEN and the issue closes, funds may not move "
        "without independently verified live custody, solvency, operator/witness "
        "approval and the canonical release controller.", "",
        "This observer never deploys, signs, creates a release permit or changes financial gates.", "",
    ])
    if report["errors"]:
        lines.extend(["## Evidence gaps", "", ", ".join(report["errors"]), ""])
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--app-repo", default="Emaren/app-prodn")
    parser.add_argument("--app-pr", default="801")
    parser.add_argument("--wolo-repo", default="Emaren/wolochain")
    parser.add_argument("--wolo-pr", default="82")
    parser.add_argument("--financial-issue", default="5")
    parser.add_argument("--output-dir", default="artifacts/release-flight-recorder")
    parser.add_argument(
        "--strict-source", action="store_true",
        help="Exit 2 unless required source checks are green. NEVER authorizes money.",
    )
    args = parser.parse_args(argv)
    try:
        app_repo, wolo_repo = validate_repo(args.app_repo), validate_repo(args.wolo_repo)
        app_pr, wolo_pr, issue = (validate_pr(x)
                                  for x in (args.app_pr, args.wolo_pr, args.financial_issue))
    except ValueError as exc:
        parser.error(str(exc))
    report = build_report(
        app_repo, app_pr, wolo_repo, wolo_pr, issue,
        os.getenv("GH_TOKEN") or os.getenv("GITHUB_TOKEN"),
    )
    directory = Path(args.output_dir)
    directory.mkdir(parents=True, exist_ok=True)
    json_path, md_path = directory / "release-evidence.json", directory / "release-evidence.md"
    raw = json.dumps(report, sort_keys=True, indent=2) + "\n"
    json_path.write_text(raw)
    md = markdown_report(report)
    md_path.write_text(md)
    (directory / "release-evidence.sha256").write_text(
        hashlib.sha256(raw.encode()).hexdigest() + "  release-evidence.json\n"
    )
    summary = os.getenv("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as stream:
            stream.write(md + "\n")
    print(f"SOURCE={report['source_evidence']} FINANCE=HARD_HOLD_UNCERTIFIED evidence={json_path}")
    return 2 if args.strict_source and report["source_evidence"] != "GREEN" else 0


if __name__ == "__main__":
    sys.exit(main())
