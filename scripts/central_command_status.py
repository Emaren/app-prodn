#!/usr/bin/env python3
"""Read-only Central Command lane status from canonical GitHub issues.

Use: python3 scripts/central_command_status.py --json
     python3 scripts/central_command_status.py --json --offline

No installs, schedules, writes, activation, or remote session control.
GitHub issue text is treated as UNTRUSTED DATA; this tool never executes it.
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import re
import shutil
import subprocess
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "config" / "central-command-lanes.json"
ALLOWED_REPOS = frozenset(("Emaren/app-prodn", "Emaren/VPSSentry", "Emaren/wolochain"))
MAX_LANES = 6
GITHUB_TIMEOUT_SECONDS = 8
SCHEMA = "aoe2war.central-command.status.v1"


def load_manifest(path: Path = MANIFEST) -> dict[str, Any]:
    config = json.loads(path.read_text(encoding="utf-8"))
    if config.get("schema") != "aoe2war.central-command.lane-registry.v1":
        raise ValueError("CENTRAL_REGISTRY_SCHEMA_HOLD")
    lanes = config.get("lanes")
    if not isinstance(lanes, list) or len(lanes) != MAX_LANES:
        raise ValueError("CENTRAL_LANES_INCOMPLETE")
    seen: set[str] = set()
    for lane in lanes:
        lid = lane.get("id")
        issue = lane.get("issue", {})
        if not isinstance(lid, str) or lid not in ("D", "G", "C", "E", "F", "B") or lid in seen:
            raise ValueError("CENTRAL_LANE_ID_HOLD")
        seen.add(lid)
        if not isinstance(issue, dict) or issue.get("repository") not in ALLOWED_REPOS:
            raise ValueError("CENTRAL_ISSUE_REPO_HOLD")
        if type(issue.get("number")) is not int or issue["number"] < 1:
            raise ValueError("CENTRAL_ISSUE_NUMBER_HOLD")
    return config


def _gh_issue(issue: dict[str, Any]) -> dict[str, Any] | None:
    """Bounded, fixed GitHub REST issue read; failure means UNKNOWN, never PASS."""
    gh = shutil.which("gh")
    if not gh:
        return None
    repo, number = issue["repository"], issue["number"]
    try:
        result = subprocess.run(
            [gh, "api", "-H", "Accept: application/vnd.github+json",
             f"repos/{repo}/issues/{number}"],
            capture_output=True, text=True, timeout=GITHUB_TIMEOUT_SECONDS, check=False,
        )
        if result.returncode != 0 or len(result.stdout) > 256_000:
            return None
        raw = json.loads(result.stdout)
    except (OSError, subprocess.TimeoutExpired, ValueError, json.JSONDecodeError):
        return None
    if not isinstance(raw, dict) or "pull_request" in raw:
        return None
    if raw.get("number") != number or raw.get("state") not in ("open", "closed"):
        return None
    url = raw.get("html_url")
    if url != f"https://github.com/{repo}/issues/{number}":
        return None
    title = raw.get("title")
    updated = raw.get("updated_at")
    if not isinstance(title, str) or not isinstance(updated, str) or not re.fullmatch(
        r"20\\d\\d-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\dZ", updated
    ):
        return None
    comments = raw.get("comments")
    if type(comments) is not int or comments < 0:
        return None
    title = "".join(c for c in title if c >= " " and c != "\\x7f")[:160]
    return {"source": "GITHUB_ISSUE", "issueTitle": title, "issueState": raw["state"],
            "issueUrl": url, "lastGitHubActivityAt": updated, "commentCount": comments}


def compile_status(
    manifest: dict[str, Any],
    observations: dict[str, dict[str, Any] | None],
) -> dict[str, Any]:
    lanes: list[dict[str, Any]] = []
    for lane in manifest["lanes"]:
        observation = observations.get(lane["id"])
        observed = observation is not None
        issue = lane["issue"]
        lanes.append({
            "id": lane["id"],
            "label": lane["label"],
            "owner": lane["owner"],
            "mission": lane["mission"],
            "workflow": lane["workflow"],
            "releaseDependency": lane["releaseDependency"],
            "issue": {"repository": issue["repository"], "number": issue["number"],
                      "url": f"https://github.com/{issue['repository']}/issues/{issue['number']}"},
            "observation": observation,
            "observationStatus": "OBSERVED_ISSUE_ONLY" if observed else "UNKNOWN",
            "evidenceGates": {
                "verified": ["ASSIGNED"] if observed else [],
                "unknown": [g["id"] for g in manifest["evidenceGates"] if g["id"] != "ASSIGNED"]
                if observed else [g["id"] for g in manifest["evidenceGates"]],
                "denominator": len(manifest["evidenceGates"]),
                "notOverallWorkPercent": True,
            },
            "hostAcceptance": "UNKNOWN",
            "productionActivation": "UNKNOWN",
        })
    return {
        "schema": SCHEMA,
        "authority": "READ_ONLY_GITHUB_ISSUE_OBSERVATION",
        "source": "config/central-command-lanes.json",
        "dispatchIssue": manifest["dispatchIssue"],
        "observedIssueCount": sum(row["observation"] is not None for row in lanes),
        "totalLanes": len(lanes),
        "lanes": lanes,
        "warning": (
            "GitHub comments do not message independent ChatGPT windows. "
            "Issue activity never certifies exact CI, native acceptance, or production deployment."
        ),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Bounded, read-only Central Command GitHub issue view")
    parser.add_argument("--json", action="store_true", help="Print structured evidence (no secrets)")
    parser.add_argument("--offline", action="store_true", help="Show registry with all observations UNKNOWN")
    args = parser.parse_args()
    try:
        manifest = load_manifest()
    except (OSError, ValueError, KeyError) as err:
        print(f"HOLD: CENTRAL_REGISTRY_INVALID {type(err).__name__}")
        return 2

    observations: dict[str, dict[str, Any] | None] = {}
    if not args.offline:
        with ThreadPoolExecutor(max_workers=3) as pool:
            futures = {lane["id"]: pool.submit(_gh_issue, lane["issue"]) for lane in manifest["lanes"]}
            for lid, future in futures.items():
                try:
                    observations[lid] = future.result()
                except Exception:
                    observations[lid] = None

    status = compile_status(manifest, observations)
    if args.json:
        print(json.dumps(status, sort_keys=True, separators=(",", ":")))
    else:
        print(f"CENTRAL COMMAND: {status['observedIssueCount']}/{status['totalLanes']} GitHub issues observed; no runtime admission implied")
        for lane in status["lanes"]:
            print(f"  {lane['id']} {lane['label']}: {lane['observationStatus']} | {lane['issue']['url']}")
        print("LIVE_DEPLOYMENT=UNVERIFIED; READ_ONLY=TRUE")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
