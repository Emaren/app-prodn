#!/usr/bin/env python3
"""Read-only, public-evidence triage for the weighted AoE2WAR inspection board."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import urllib.error
import urllib.request
from typing import Any, Mapping

DEFAULT_URL = "https://aoe2war.com/api/general-inspections"
CATEGORIES = {"speed", "documentation", "organization", "tests", "release", "security", "data"}


class InspectionError(ValueError):
    pass


def _record(value: object) -> Mapping[str, Any]:
    return value if isinstance(value, dict) else {}


def _number(value: object) -> float | None:
    if type(value) not in (int, float):
        return None
    candidate = float(value)
    return candidate if 0 <= candidate <= 100 else None


def _time(value: object) -> str:
    if not isinstance(value, str) or not value.strip():
        return "unavailable"
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            return "unavailable"
    except ValueError:
        return "unavailable"
    minutes = max(0, int((datetime.now(timezone.utc) - parsed.astimezone(timezone.utc)).total_seconds() / 60))
    return f"{minutes}m old"


def summarize(payload: object) -> dict[str, Any]:
    obj = _record(payload)
    if obj.get("schema") != 1 or not isinstance(obj.get("categories"), list):
        raise InspectionError("Public inspection snapshot schema/categories unavailable")
    if _number(obj.get("overallScore")) is None:
        raise InspectionError("Overall weighted score missing or malformed")

    rows: list[dict[str, Any]] = []
    seen: set[str] = set()
    for value in obj["categories"]:
        cat = _record(value)
        category_id = cat.get("id")
        if not isinstance(category_id, str) or category_id not in CATEGORIES or category_id in seen:
            raise InspectionError("Duplicate or unexpected inspection category")
        seen.add(category_id)
        score = _number(cat.get("score"))
        if score is None or not isinstance(cat.get("checks"), list):
            raise InspectionError(f"Invalid weighted checks for {category_id}")
        checks = []
        for check in cat["checks"]:
            item = _record(check)
            weight, earned = _number(item.get("weight")), _number(item.get("earned"))
            if weight is None or earned is None or earned > weight + 0.01:
                raise InspectionError(f"Invalid point evidence in {category_id}")
            deficit = round(max(0, weight - earned), 2)
            if deficit <= 0.005:
                continue
            checks.append({
                "id": str(item.get("id") or ""),
                "label": str(item.get("label") or ""),
                "earned": round(earned, 2),
                "weight": round(weight, 2),
                "lost": deficit,
                "detail": str(item.get("detail") or ""),
                "evidenceAt": item.get("evidenceAt") if isinstance(item.get("evidenceAt"), str) else None,
            })
        checks.sort(key=lambda row: (-row["lost"], row["id"]))
        rows.append({
            "id": category_id,
            "title": str(cat.get("title") or category_id),
            "score": score,
            "lost": round(100 - score, 2),
            "checks": checks,
        })
    if seen != CATEGORIES:
        raise InspectionError("Incomplete seven-category inspection board")
    rows.sort(key=lambda row: (-row["lost"], row["id"]))
    return {
        "releaseSha": obj.get("releaseSha"),
        "buildVersion": obj.get("buildVersion"),
        "generatedAt": obj.get("generatedAt"),
        "overallScore": obj["overallScore"],
        "categories": rows,
        "notes": [str(x) for x in obj.get("notes", []) if isinstance(x, str)],
    }


def fetch_public(url: str = DEFAULT_URL) -> object:
    if url != DEFAULT_URL:
        raise InspectionError("Public source is pinned to AoE2WAR; use --file for fixtures")
    request = urllib.request.Request(
        url, headers={"Accept": "application/json", "Cache-Control": "no-cache"}
    )
    try:
        with urllib.request.urlopen(request, timeout=12) as response:
            if response.status != 200:
                raise InspectionError(f"Public inspections HTTP {response.status}")
            raw = response.read(512_001)
            if len(raw) > 512_000:
                raise InspectionError("Public inspection response exceeds size bound")
    except urllib.error.HTTPError as exc:
        if exc.code == 403:
            raise InspectionError(
                "Public inspection API returned HTTP 403 for this Python client. "
                "No score JSON was received. This may be an upstream access rule; "
                "do not disable security controls. Save the API JSON using an "
                "authorized browser session, then run: "
                "./bin/aoe2war inspections --file /path/to/general-inspections.json"
            ) from exc
        raise InspectionError(f"Public inspections HTTP {exc.code}") from exc
    except (OSError, urllib.error.URLError) as exc:
        raise InspectionError(f"Public inspections could not be read: {exc}") from exc
    try:
        return json.loads(raw)
    except ValueError as exc:
        raise InspectionError("Public inspections returned malformed JSON") from exc


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--file", type=Path, help="Analyze a pre-existing public snapshot JSON without network")
    parser.add_argument("--json", action="store_true", help="Print normalized evidence and missing points")
    args = parser.parse_args()
    try:
        payload = json.loads(args.file.read_text(encoding="utf-8")) if args.file else fetch_public()
        report = summarize(payload)
    except (InspectionError, OSError, ValueError) as exc:
        print(f"STOP: {exc}")
        return 2
    if args.json:
        print(json.dumps(report, indent=2, sort_keys=True))
        return 0

    print("⚔️  AOE2WAR GENERAL INSPECTIONS — READ-ONLY EVIDENCE TRIAGE")
    print(f"Overall: {report['overallScore']}/100 · release {str(report['releaseSha'] or 'unknown')[:12]}")
    print(f"Snapshot: {_time(report['generatedAt'])} · build {report['buildVersion'] or 'unknown'}")
    for row in report["categories"]:
        print(f"\n{row['title']}: {row['score']:.0f}/100 · {row['lost']:.0f} points unearned")
        for ch in row["checks"]:
            print(
                f"  - {ch['id']} [{ch['earned']:g}/{ch['weight']:g}]: "
                f"{ch['detail']} · evidence {_time(ch['evidenceAt'])}"
            )
    for note in report["notes"]:
        print(f"Note: {note}")
    print("\nThis is a read-only inventory, not a score adjustment or remediation.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
