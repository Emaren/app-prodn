#!/usr/bin/env python3
"""Kingdom Shepherd V1: read-only coordination of existing AoE2WAR authorities.

Not an additional health score or Doctor. No network requests, mutation or
automatic replay, financial, host, git or documentation operations.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import subprocess
from typing import Any

import aoe2_audit

ROOT = Path(__file__).resolve().parents[1]
DOCS = aoe2_audit.DOCS
SOURCES = aoe2_audit.CORE_SOURCES
STAGES = (
    "source",
    "documentation",
    "capacity",
    "release",
    "publication",
    "current_release_evidence",
    "inspections",
)
FIELDS = (
    "id", "title", "type", "status", "owner", "systems", "audience",
    "source_of_truth", "authority", "reviewed_at", "review_interval_days",
    "sensitivity",
)


def issue(stage: str, code: str, level: str, owner: str, finding: str,
          action: str, evidence: str | None = None) -> dict[str, Any]:
    if stage not in STAGES:
        raise ValueError("Unsupported Shepherd stage")
    return {
        "stage": stage, "code": code, "level": level, "owner": owner,
        "finding": finding, "nextAction": action, "evidence": evidence,
    }


def taxonomy_differences(taxonomy: dict[str, Any],
                         registries: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    """Compare canonical governed membership and versioned fields exactly.

    Retiring one expected document is a human-reviewed taxonomy transaction.
    New source entries are discoverable without treating them as deletions.
    """
    documents = taxonomy.get("documents")
    if not isinstance(documents, list):
        raise ValueError("Central taxonomy documents are unavailable")
    central: dict[tuple[str, str], dict[str, Any]] = {}
    for entry in documents:
        if not isinstance(entry, dict):
            raise ValueError("Malformed central taxonomy document")
        key = (str(entry.get("repository")), str(entry.get("path")))
        if key in central:
            raise ValueError("Duplicate governed taxonomy identity: " + ":".join(key))
        central[key] = entry

    findings: list[dict[str, Any]] = []
    for repo, raw in sorted(registries.items()):
        records = raw.get("documents")
        if raw.get("repo") != repo or not isinstance(records, list):
            raise ValueError("Invalid source registry: " + repo)
        source: dict[str, dict[str, Any]] = {}
        for entry in records:
            if not isinstance(entry, dict) or not isinstance(entry.get("path"), str):
                raise ValueError("Invalid document record: " + repo)
            path = entry["path"]
            if path in source:
                raise ValueError("Duplicate source document: " + repo + ":" + path)
            source[path] = entry

        for (owner, path), entry in sorted(central.items()):
            if owner == repo and path not in source:
                findings.append(issue(
                    "documentation", "governed-document-absent", "BLOCKED",
                    "Documentation OS",
                    f"{repo}:{path} exists in central taxonomy, not in canonical source registry",
                    "Review source-branch provenance; open a governed taxonomy retirement PR. Never silently delete.",
                    f"{repo}:{path}",
                ))
        for path, entry in sorted(source.items()):
            old = central.get((repo, path))
            if old is None:
                findings.append(issue(
                    "documentation", "new-source-document", "UPDATE",
                    "Documentation OS",
                    f"{repo}:{path} exists in canonical source registry but not central taxonomy",
                    "Run guarded central documentation federation after source parity is clean.",
                    f"{repo}:{path}",
                ))
                continue
            drift = [field for field in FIELDS if old.get(field) != entry.get(field)]
            if old.get("source_sha256") != entry.get("sha256"):
                drift.append("source_sha256")
            if drift:
                findings.append(issue(
                    "documentation", "registry-taxonomy-drift", "UPDATE",
                    "Documentation OS",
                    f"{repo}:{path} metadata is behind source: {', '.join(drift)}",
                    "Run guarded source-registry and central taxonomy federation with strict checks.",
                    f"{repo}:{path}",
                ))
    return findings


def repository_observation(repo: Path, label: str) -> dict[str, Any]:
    """Observe local Git state, never fetch, checkout, reset or change refs."""
    if not repo.is_dir():
        return {"id": label, "available": False, "clean": None,
                "head": None, "branch": None, "localTrackingExact": None}
    def git(*args: str) -> tuple[int, str]:
        try:
            p = subprocess.run(
                ["git", "--no-optional-locks", "-C", str(repo), *args],
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                timeout=12, check=False,
            )
            return p.returncode, p.stdout.strip()
        except (OSError, subprocess.TimeoutExpired):
            return 127, ""
    branch_rc, branch = git("branch", "--show-current")
    head_rc, head = git("rev-parse", "HEAD")
    status_rc, dirty = git("status", "--porcelain=v1", "--untracked-files=all")
    upstream_rc, upstream = git("rev-parse", "--verify", "@{upstream}")
    valid = all(rc == 0 for rc in (branch_rc, head_rc, status_rc))
    return {
        "id": label, "available": valid, "branch": branch or None,
        "head": head if head_rc == 0 else None,
        "clean": dirty == "" if valid else None,
        "dirtyCount": len(dirty.splitlines()) if valid else None,
        "localTrackingExact": head == upstream if upstream_rc == 0 and valid else None,
        "trackingIsCached": True,  # Local tracking ref is NOT real-time origin.
    }


def classify_repository(observation: dict[str, Any]) -> list[dict[str, Any]]:
    label = observation["id"]
    if not observation.get("available"):
        return [issue("source", "source-unavailable", "BLOCKED", "Workspace OS",
                      f"{label} cannot be inspected safely",
                      "Check the authorized checkout and local Git metadata.")]
    findings = []
    if not observation.get("branch"):
        findings.append(issue("source", "detached-source", "BLOCKED", "Workspace OS",
                              f"{label} has a detached HEAD", "Select the correct protected branch."))
    if observation.get("clean") is not True:
        findings.append(issue("source", "source-dirty", "BLOCKED", "Workspace OS",
                              f"{label} has {observation.get('dirtyCount')} unpublished worktree path(s)",
                              "Inspect exact paths; preserve legitimate work in a scoped branch/stash. Never hard-reset."))
    if observation.get("localTrackingExact") is False:
        findings.append(issue("source", "tracking-ref-drift", "ATTENTION", "Release OS",
                              f"{label} differs from its cached upstream Git ref",
                              "Verify real origin and fast-forward only if safely clean; cached ref is not proof of remote head."))
    return findings


def inspection_differences(payload: dict[str, Any], intended_head: str | None,
                           now: datetime) -> list[dict[str, Any]]:
    if payload.get("schema") != 1 or not isinstance(payload.get("categories"), list):
        raise ValueError("Unsupported inspection snapshot")
    findings: list[dict[str, Any]] = []
    actual = payload.get("releaseSha")
    if isinstance(intended_head, str) and isinstance(actual, str) and actual != intended_head:
        findings.append(issue(
            "release", "inspection-release-behind-source", "ATTENTION", "Release OS",
            "Inspection screenshot/API describes a different release SHA than the intended source",
            "Finish protected release first, then regenerate current-source performance and bridge proofs.",
        ))
    generated = payload.get("generatedAt")
    if isinstance(generated, str):
        try:
            ts = datetime.fromisoformat(generated.replace("Z", "+00:00"))
            if ts.tzinfo is None:
                raise ValueError("Missing time zone")
            if (now - ts).total_seconds() > 600:
                findings.append(issue(
                    "publication", "inspection-snapshot-stale", "STALE", "Kingdom Intelligence",
                    "Inspection evidence snapshot is older than 10 minutes",
                    "Refresh the authorized current browser/bridge snapshot; do not reuse historical scores.",
                ))
        except ValueError:
            findings.append(issue("publication", "inspection-clock-untrusted", "STALE",
                                  "Kingdom Intelligence", "Inspection timestamp invalid",
                                  "Require an offset-aware generatedAt timestamp."))
    for category in payload["categories"]:
        if not isinstance(category, dict):
            raise ValueError("Malformed inspection category")
        score = category.get("score")
        if not isinstance(score, (int, float)) or isinstance(score, bool) or not 0 <= score <= 100:
            raise ValueError("Malformed category score")
        if score < 100:
            findings.append(issue(
                "inspections", "inspection-points-unearned", "ATTENTION",
                "General Inspections",
                f"{category.get('title') or category.get('id')}: {score:.1f}/100",
                "Use exact weighted check deficits and same-release receipt ages; do not change weights.",
            ))
    return findings


def build_plan(registries: dict[str, dict[str, Any]], taxonomy: dict[str, Any],
               repositories: list[dict[str, Any]], inspected: dict[str, Any] | None,
               now: datetime, intended_head: str | None = None) -> dict[str, Any]:
    findings = [f for item in repositories for f in classify_repository(item)]
    findings.extend(taxonomy_differences(taxonomy, registries))
    if inspected is not None:
        findings.extend(inspection_differences(inspected, intended_head, now))
    order = {name: i for i, name in enumerate(STAGES)}
    priority = {"BLOCKED": 0, "UPDATE": 1, "STALE": 2, "ATTENTION": 3}
    findings.sort(key=lambda row: (order[row["stage"]], priority.get(row["level"], 9),
                                   row["code"], row.get("evidence") or ""))
    blockers = [row for row in findings if row["level"] == "BLOCKED"]
    return {
        "schema": 1, "kind": "aoe2war-kingdom-shepherd",
        "generatedAt": now.astimezone(timezone.utc).isoformat(),
        "mutationAllowed": False,
        "doesNotCertify": ["live production", "fresh Doctor", "replay winners",
                           "Wolo custody", "100-point inspections"],
        "canonicalRelease": intended_head,
        "stages": list(STAGES), "repositories": repositories,
        "findings": findings, "firstBlocker": blockers[0] if blockers else None,
        "next": findings[0] if findings else None,
        "readyForLiveMutation": False,  # Never infer from this lightweight view.
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--inspections-file", type=Path)
    args = parser.parse_args()
    now = datetime.now(timezone.utc)
    allrepos = {**SOURCES, "AoE2WAR-docs": DOCS}
    observed = [repository_observation(p, name) for name, p in sorted(allrepos.items())]
    try:
        with (DOCS / "catalog/document-taxonomy.json").open() as f:
            taxonomy = json.load(f)
        registries = {}
        for name, p in SOURCES.items():
            with (p / "docs/document-registry.json").open() as f:
                registries[name] = json.load(f)
        inspection = json.loads(args.inspections_file.read_text()) if args.inspections_file else None
        app = next((r for r in observed if r["id"] == "app-prodn"), {})
        snapshot = build_plan(registries, taxonomy, observed, inspection, now, app.get("head"))
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print("STOP: Shepherd evidence is incomplete: " + str(exc))
        return 2
    if args.json:
        print(json.dumps(snapshot, indent=2, sort_keys=True))
    else:
        print("⚔️  KINGDOM SHEPHERD — READ-ONLY DEPENDENCY PLAN")
        print("No Doctor score, no remote authority assertion and no mutations.")
        print("Observed source head:", str(snapshot["canonicalRelease"] or "UNKNOWN")[:12])
        print("Source/taxonomy findings:", len(snapshot["findings"]))
        if not snapshot["findings"]:
            print("No observed coordination gaps; this does NOT certify the live estate.")
        else:
            for row in snapshot["findings"][:30]:
                print(f"  {row['level']:9} {row['stage']:25} {row['code']}: {row['finding']}")
                print("    NEXT:", row["nextAction"])
            if len(snapshot["findings"]) > 30:
                print(f"  … {len(snapshot['findings'])-30} more in --json")
        print("Production/replay/WOLO/current-release 100-point proof: NOT ATTESTED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
