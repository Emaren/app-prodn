#!/usr/bin/env python3
"""Kingdom Scan OS: deterministic read-only registry and scan planner.

Never invokes a scanner, network, shell, timer, filesystem walk, signer, or
mutation. The plan is an inert proposal; executors retain native authority.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path, PurePosixPath
import re
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "config/scan-os-catalog.v1.json"
VALID_GOALS = frozenset(("storage_hel1", "storage_m1", "health", "release", "all"))
VALID_SCOPES = frozenset(("HEL1_ROOT", "HEL1_DATA", "M1", "SOURCE_CI", "APPLICATION"))
GOAL_SCOPES = {
    "storage_hel1": frozenset(("HEL1_ROOT", "HEL1_DATA")),
    "storage_m1": frozenset(("M1",)),
    "release": frozenset(("SOURCE_CI",)),
    "health": frozenset(("APPLICATION",)),
}
VALID_OWNERS = frozenset(("OWNER", "WE1", "WE2", "WE3", "WE4"))
VALID_REPOS = frozenset(("Emaren/app-prodn", "Emaren/VPSSentry"))
VALID_MODES = frozenset(("EXISTING_OBSERVER", "SOURCE_CANDIDATE", "OWNER_OPT_IN_LOCAL",
                          "EXISTING_SOURCE_CI", "EXISTING_AGGREGATE_READ"))
VALID_ADMISSIONS = frozenset(("CAPACITY_ONLY", "NOT_ADMITTED",
                               "NO_CURRENT_RECEIPT", "CI_REQUIRED", "SOURCE_ONLY"))
SCAN_FIELDS = frozenset(("id", "group", "goal", "scope", "owner", "repo",
                          "source_path", "mode", "budget_seconds",
                          "current_admission", "evidence", "reason"))
ID = re.compile(r"^[A-Z][A-Z0-9_]{2,63}$")
MAX_BYTES = 32_768


class CatalogError(ValueError):
    pass


def _no_duplicate_json_fields(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    fields: dict[str, Any] = {}
    for name, value in pairs:
        if name in fields:
            raise CatalogError("CATALOG_DUPLICATE_FIELD")
        fields[name] = value
    return fields


def load_catalog(path: Path = CATALOG) -> dict[str, Any]:
    """Read a small static source-owned manifest, not untrusted scan results."""
    if path.is_symlink() or not path.is_file() or path.stat().st_size > MAX_BYTES:
        raise CatalogError("CATALOG_MISSING_OR_OVERSIZED")
    try:
        data = json.loads(path.read_text(encoding="utf-8"),
                          object_pairs_hook=_no_duplicate_json_fields)
    except (UnicodeError, ValueError, OSError) as exc:
        raise CatalogError("CATALOG_INVALID") from exc
    return validate_catalog(data)


def validate_catalog(data: dict[str, Any]) -> dict[str, Any]:
    """Validate ALL registry input before calculating source grouping or provenance."""
    if not isinstance(data, dict) or data.get("schema") != "aoe2war.scan-os.catalog.v1":
        raise CatalogError("CATALOG_SCHEMA")
    if set(data) != {"schema", "authority", "scans", "lessons"}:
        raise CatalogError("CATALOG_FIELDS")
    if data.get("authority") != "SOURCE_ONLY_READ_ONLY_NO_EXECUTION":
        raise CatalogError("CATALOG_AUTHORITY")
    scans = data.get("scans")
    lessons = data.get("lessons")
    if not isinstance(scans, list) or not 1 <= len(scans) <= 64:
        raise CatalogError("CATALOG_SCAN_COUNT")
    if not isinstance(lessons, list) or len(lessons) > 64:
        raise CatalogError("CATALOG_LESSON_COUNT")
    ids: set[str] = set()
    groups: dict[str, tuple[str, str, int, str, str, str, str]] = {}
    producers: dict[tuple[str, str, int, str, str, str, str], str] = {}
    for scan in scans:
        if not isinstance(scan, dict) or set(scan) != SCAN_FIELDS:
            raise CatalogError("SCAN_MALFORMED")
        sid = scan.get("id")
        group = scan.get("group")
        source = scan.get("source_path")
        repo = scan.get("repo")
        budget = scan.get("budget_seconds")
        if not isinstance(sid, str) or not ID.fullmatch(sid) or sid in ids:
            raise CatalogError("SCAN_DUPLICATE_OR_BAD_ID")
        if not isinstance(group, str) or not ID.fullmatch(group):
            raise CatalogError("SCAN_BAD_GROUP")
        goal, scope = scan.get("goal"), scan.get("scope")
        if not isinstance(goal, str) or goal not in GOAL_SCOPES or (
                not isinstance(scope, str) or scope not in GOAL_SCOPES[goal]):
            raise CatalogError("SCAN_BAD_SCOPE")
        if type(budget) is not int or not 1 <= budget <= 240:
            raise CatalogError("SCAN_BAD_BUDGET")
        if not isinstance(repo, str) or repo not in VALID_REPOS:
            raise CatalogError("SCAN_BAD_REPOSITORY")
        if not isinstance(source, str) or len(source) > 180:
            raise CatalogError("SCAN_BAD_SOURCE")
        parsed = PurePosixPath(source)
        if (str(parsed) != source or len(parsed.parts) < 2 or
                parsed.parts[0] not in ("scripts", "lib") or
                any(x in (".", "..") for x in parsed.parts) or
                not re.fullmatch(r"(?:scripts|lib)/(?:[A-Za-z0-9_-][A-Za-z0-9_.-]*/)*"
                                 r"[A-Za-z0-9_-][A-Za-z0-9_.-]*", source)):
            raise CatalogError("SCAN_BAD_SOURCE")
        for field in ("owner", "mode", "current_admission", "evidence", "reason"):
            if not isinstance(scan.get(field), str) or not scan[field] or len(scan[field]) > 250:
                raise CatalogError("SCAN_MISSING_FIELD")
        if scan["owner"] not in VALID_OWNERS or scan["mode"] not in VALID_MODES or (
                scan["current_admission"] not in VALID_ADMISSIONS):
            raise CatalogError("SCAN_BAD_SOURCE_OWNERSHIP")
        signature = (repo, source, budget, scan["owner"], scan["mode"],
                     scan["current_admission"], goal)
        if group in groups and groups[group] != signature:
            raise CatalogError("SCAN_GROUP_NOT_SAME_PRODUCER")
        if signature in producers and producers[signature] != group:
            raise CatalogError("SCAN_DUPLICATE_PRODUCER_GROUP")
        groups[group] = signature
        producers[signature] = group
        ids.add(sid)
    lesson_ids: set[str] = set()
    for lesson in lessons:
        if not isinstance(lesson, dict) or set(lesson) != {"code", "rule", "reference"}:
            raise CatalogError("LESSON_MALFORMED")
        code = lesson.get("code")
        if not isinstance(code, str) or not ID.fullmatch(code) or code in lesson_ids:
            raise CatalogError("LESSON_DUPLICATE_OR_BAD_ID")
        if any(not isinstance(lesson.get(f), str) or not lesson[f] or len(lesson[f]) > 300
               for f in ("rule", "reference")):
            raise CatalogError("LESSON_INCOMPLETE")
        lesson_ids.add(code)
    return data


def plan(data: dict[str, Any], *, goal: str, scope: str | None = None) -> dict[str, Any]:
    data = validate_catalog(data)  # Library callers do not bypass source admission.
    if (goal not in VALID_GOALS or scope is not None and scope not in VALID_SCOPES
            or (goal != "all" and scope is not None and scope not in GOAL_SCOPES[goal])):
        raise CatalogError("REQUEST_OUT_OF_SCOPE")
    chosen = [s for s in data["scans"]
              if (goal == "all" or s["goal"] == goal)
              and (scope is None or s["scope"] == scope)]
    if not chosen:
        raise CatalogError("REQUEST_HAS_NO_SOURCE")
    grouped: dict[str, dict[str, Any]] = {}
    for s in chosen:
        g = grouped.setdefault(s["group"], {
            "group": s["group"], "owner": s["owner"], "repository": s["repo"],
            "source_path": s["source_path"], "mode": s["mode"],
            "budget_seconds": s["budget_seconds"], "scans": [], "scopes": [],
            "admission": [], "decision": "PROPOSE_ONLY_NOT_EXECUTED",
            "reuse_proof": "NONE_INTENT_ONLY",
        })
        g["scans"].append(s["id"])
        g["scopes"].append(s["scope"])
        if s["current_admission"] not in g["admission"]:
            g["admission"].append(s["current_admission"])
    steps = sorted(grouped.values(), key=lambda g: (g["budget_seconds"], g["group"]))
    return {
        "schema": "aoe2war.scan-os.plan.v1", "status": "PLAN_ONLY_NO_EXECUTION",
        "goal": goal, "scope": scope or "ALL_MATCHING", "registered_scans": len(chosen),
        "deduplicated_producer_groups": len(steps),
        "maximum_planned_seconds_sequential_if_ALL_executed": sum(s["budget_seconds"] for s in steps),
        "steps": steps,
        "result_reuse": "NOT_PROVEN_NO_SIGNED_RECEIPT_VERIFICATION",
        "authorization": "NONE_NO_HOST_COMMANDS_NO_TIMERS_NO_MUTATION",
        "important": "Budgets are manifest limits, not observed duration; plan is not an execution permit.",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    subs = parser.add_subparsers(dest="command", required=True)
    subs.add_parser("catalog", help="List registered scanners, without running anything")
    p = subs.add_parser("plan", help="Produce a deduplicated inert scan plan")
    p.add_argument("--goal", choices=sorted(VALID_GOALS), required=True)
    p.add_argument("--scope", choices=sorted(VALID_SCOPES))
    subs.add_parser("lessons", help="Read the source-owned scan lessons and fixes")
    m = subs.add_parser("measure", help="Run local read-only HOT/INCREMENTAL/DEEP observation")
    m.add_argument("--goal", choices=("release",), required=True)
    m.add_argument("--profile", choices=("HOT", "INCREMENTAL", "DEEP"), required=True)
    m.add_argument("--source-root", type=Path, required=True)
    m.add_argument("--state-dir", type=Path, required=True)
    m.add_argument("--reason", default="")
    b = subs.add_parser("benchmark", help="Summarize real local learning receipts")
    b.add_argument("--state-dir", type=Path, required=True)
    args = parser.parse_args()
    try:
        data = load_catalog()
        if args.command == "catalog":
            output = {"schema": data["schema"], "status": data["authority"], "scans": data["scans"]}
        elif args.command == "lessons":
            output = {"status": "SOURCE_REVIEWED_LESSONS_ONLY", "lessons": data["lessons"]}
        elif args.command in ("measure", "benchmark"):
            # Same original catalog and planner; unprivileged observation-only extension.
            # No external producer process, signed verifier or host authorization delegated.
            from scan_os_learning import ObservationHold, perform, learning_summary
            try:
                if args.command == "measure":
                    output = perform(data, goal=args.goal, profile=args.profile,
                                     source_root=args.source_root,
                                     state_dir=args.state_dir, reason=args.reason)
                else:
                    output = learning_summary(args.state_dir)
            except (ObservationHold, OSError, ValueError, KeyError, TypeError) as exc:
                raise CatalogError("LEARNING_HOLD_" + str(exc)) from exc
        else:
            output = plan(data, goal=args.goal, scope=args.scope)
    except CatalogError as exc:
        print(json.dumps({"status": "HOLD", "reason": str(exc)}))
        return 2
    print(json.dumps(output, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
