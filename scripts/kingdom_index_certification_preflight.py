#!/usr/bin/env python3
"""Read-only route qualification preflight for Renaissance Campaign 000.

This report is an ACTIONABLE GAP REGISTER, not a scoring engine and NEVER an
authorized certification. It reuses the existing conservative lexical source
closure and canonical 20-criterion, 100-point rubric, keeping UNKNOWN distinct
from zero. Later independently authenticated receipts must settle the gaps.
No network, production, database, signing or filesystem writes occur.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from kingdom_index_dependency_evidence import known_sources, route_evidence, DependencyEvidenceError

ROOT = Path(__file__).resolve().parents[1]
DIMENSIONS = {"correctness": 30, "functionality": 25, "performance": 20,
              "maintainability": 15, "tests": 10}
INDEX_GATES = frozenset({"source-closure", "score-verification", "staleness"})


def plan_for_route(root: Path, href: str, known: dict | None = None) -> dict[str, Any]:
    catalog = json.loads((root / "config/kingdom-index-routes.json").read_text())
    inventory = json.loads((root / "config/kingdom-index-inventory.json").read_text())
    rubric = json.loads((root / "config/kingdom-index-quality-rubric.json").read_text())
    profiles = json.loads((root / "config/kingdom-index-assurance-profiles.json").read_text())
    if href not in [row["href"] for row in catalog]:
        raise ValueError("Route not registered in the public Kingdom Index")
    page = next((row for row in inventory["pages"]
                 if row["href"] == href and row["scope"] == "public-index"), None)
    if page is None:
        raise ValueError("Route is not a public-index page template")
    if rubric.get("maximum") != 100 or set(rubric["dimensions"]) != set(DIMENSIONS):
        raise ValueError("Canonical 100-point rubric changed")
    criteria: list[dict[str, Any]] = []
    seen: set[str] = set()
    for name, weight in DIMENSIONS.items():
        dimension = rubric["dimensions"][name]
        if dimension["weight"] != weight:
            raise ValueError("Rubric dimension weight drift: " + name)
        rows = dimension["criteria"]
        if sum(row["max"] for row in rows) != weight:
            raise ValueError("Rubric criterion allocation drift: " + name)
        for item in rows:
            criterion_id = item["id"]
            if criterion_id in seen or not isinstance(item["max"], int) or item["max"] <= 0:
                raise ValueError("Duplicate or invalid canonical criterion")
            seen.add(criterion_id)
            criteria.append({
                "id": criterion_id, "dimension": name, "maximum": item["max"],
                "requirement": item["requirement"], "earned": None,
                "status": "INDEPENDENT_EVIDENCE_REQUIRED",
            })
    if len(criteria) != 20 or sum(row["maximum"] for row in criteria) != 100:
        raise ValueError("Expected exactly twenty canonical weighted criteria")
    profile_id = profiles["routeProfiles"].get(href)
    if not profile_id or profile_id not in profiles["profiles"]:
        raise ValueError("Missing registered route assurance profile")
    gates = profiles["profiles"][profile_id]["gates"]
    if href == "/kingdom-index" and {g["id"] for g in gates} != INDEX_GATES:
        raise ValueError("Index specialized assurance requirements drifted")
    if len({g["id"] for g in gates}) != len(gates):
        raise ValueError("Duplicated specialized assurance gate")
    dependencies = route_evidence(root, href, known)
    return {
        "schema": 1,
        "kind": "aoe2war.renaissance.page-certification-preflight.v1",
        "route": href,
        "entrypoint": page["entrypoint"],
        "rubric_version": rubric["version"],
        "maximum": 100,
        "grade": None,
        "certified": False,
        "publication_authorized": False,
        "status": "PRECERTIFICATION_BLOCKED",
        "criteria": criteria,
        "assurance_profile": profile_id,
        "required_gates": [
            {"id": gate["id"], "requirement": gate["requirement"], "status": "UNVERIFIED"}
            for gate in gates
        ],
        "lexical_source": {
            "closure": dependencies["source_closure"],
            "files": dependencies["file_count"],
            "status": dependencies["status"],
            "unresolved_local_imports": dependencies["unresolved_local_imports"],
            "generated_declarations_unverified": dependencies["generated_declarations_unverified"],
            "unclassified_local_imports": dependencies["unclassified_local_imports"],
            "nonliteral_import_modules": dependencies["nonliteral_import_modules"],
            "transitive_build_closure_certified": False,
        },
        "independent_blockers": [
            "TWENTY_CRITERION_RECEIPTS_NOT_AUTHENTICATED",
            "SPECIALIZED_GATES_UNVERIFIED" if gates else "GENERAL_ROUTE_ASSURANCE_UNVERIFIED",
            "TRANSITIVE_BUILD_AND_RUNTIME_CLOSURE_NOT_AUTHENTICATED",
            "REAL_BROWSER_ACCESSIBILITY_AND_LOAD_EVIDENCE_MISSING",
            "REAL_DB_AND_DOMAIN_EVIDENCE_MISSING",
            "EXACT_DEPLOYED_BUILD_AND_RELEASE_RECEIPT_NOT_AUTHENTICATED",
            "PROTECTED_WEBSITE_RELEASE_AUTHORITY_NOT_APPROVED",
            "CURRENT_PUBLIC_SCORE_PROJECTION_NOT_INTEGRATED",
        ],
        "limitations": (
            "Static read-only planning and lexical source observation only. "
            "No criterion points, passing assurance gates, runtime measurements, "
            "production parity, deployment permission or public 100/100 are inferred."
        ),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--route", default="/kingdom-index")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    try:
        result = plan_for_route(ROOT, args.route, known_sources(ROOT))
    except (OSError, ValueError, KeyError, TypeError, DependencyEvidenceError) as exc:
        print("KINGDOM PREFLIGHT STOP: " + str(exc), file=sys.stderr)
        return 2
    if args.json:
        print(json.dumps(result, indent=2, sort_keys=True))
    else:
        print("⚔️ RENAISSANCE · PAGE QUALIFICATION PREFLIGHT (NOT A CERTIFICATE)")
        print(f"Route: {result['route']} · {len(result['criteria'])}/20 criteria awaiting authenticated proof")
        print(f"Maximum: 100 · EARNED: UNKNOWN · status: {result['status']}")
        print(f"Lexical closure: {result['lexical_source']['closure']} "
              f"({result['lexical_source']['files']} files, "
              f"{len(result['lexical_source']['unresolved_local_imports'])} unresolved imports; "
              f"{len(result['lexical_source']['generated_declarations_unverified'])} generated declarations, "
              f"{len(result['lexical_source']['unclassified_local_imports'])} unclassified)")
        for blocker in result["independent_blockers"]:
            print(" BLOCKER:", blocker)
        # Bounded diagnostic for the FIRST route; these are lexical findings,
        # not automatically broken imports or independently verified defects.
        for reference in result["lexical_source"]["unresolved_local_imports"][:24]:
            print(" UNRESOLVED LEXICAL:", reference)
        if len(result["lexical_source"]["unresolved_local_imports"]) > 24:
            print(" ...remaining lexical findings:", len(result["lexical_source"]["unresolved_local_imports"]) - 24)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
