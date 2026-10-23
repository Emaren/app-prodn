#!/usr/bin/env python3
"""Read-only DocsV2 review-debt queue; never changes reviewed_at or source files.

The due-date rule matches scripts/docs_v2_check.py: a positive interval is
overdue only when UTC today is strictly later than reviewed_at + interval.
This is an advisory inventory, NOT a replacement for the protected gate.
"""
from __future__ import annotations

import argparse
from datetime import date, datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
SHA256 = re.compile(r"[0-9a-f]{64}\Z")
NON_REVIEWED = {"historical", "superseded", "generated"}


def _review_date(value: Any, label: str) -> date:
    if not isinstance(value, str):
        raise ValueError(f"{label}: expected YYYY-MM-DD")
    try:
        parsed = date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError(f"{label}: invalid YYYY-MM-DD") from exc
    if parsed.isoformat() != value:
        raise ValueError(f"{label}: noncanonical date")
    return parsed


def _safe_path(value: Any) -> str:
    if not isinstance(value, str) or not value or "\\" in value:
        raise ValueError("registry contains an invalid document path")
    path = PurePosixPath(value)
    if path.is_absolute() or any(part in ("", ".", "..") for part in value.split("/")):
        raise ValueError(f"unsafe registry document path: {value!r}")
    if path.as_posix() != value:
        raise ValueError(f"noncanonical registry document path: {value!r}")
    return value


def _require_text(row: dict[str, Any], name: str) -> str:
    val = row.get(name)
    if not isinstance(val, str) or not val.strip():
        raise ValueError(f"missing or malformed document {name}")
    return val.strip()


def review_queue(
    root: Path, registry: dict[str, Any], *, as_of: date, within_days: int = 14
) -> dict[str, Any]:
    if not isinstance(registry, dict) or not isinstance(registry.get("documents"), list):
        raise ValueError("invalid DocsV2 registry")
    if isinstance(within_days, bool) or not isinstance(within_days, int) or within_days < 0 or within_days > 365:
        raise ValueError("within_days must be an integer from 0 through 365")

    items: list[dict[str, Any]] = []
    seen: set[str] = set()
    reviewed = 0
    for raw in registry["documents"]:
        if not isinstance(raw, dict):
            raise ValueError("registry document entry must be an object")
        path = _safe_path(raw.get("path"))
        if path in seen:
            raise ValueError(f"duplicate registry path: {path}")
        seen.add(path)
        interval = raw.get("review_interval_days")
        if isinstance(interval, bool) or not isinstance(interval, int) or interval < 0:
            raise ValueError(f"invalid review interval: {path}")
        status = _require_text(raw, "status")
        if status in NON_REVIEWED and interval != 0:
            raise ValueError(f"{status} document must have zero review interval: {path}")
        if interval == 0:
            continue
        reviewed += 1
        checked = _review_date(raw.get("reviewed_at"), path)
        due = checked + timedelta(days=interval)
        remaining = (due - as_of).days
        if remaining > within_days:
            continue
        owner = _require_text(raw, "owner")
        title = _require_text(raw, "title")
        authority = _require_text(raw, "authority")
        systems = raw.get("systems")
        if not isinstance(systems, list) or not systems or not all(
            isinstance(s, str) and s.strip() for s in systems
        ):
            raise ValueError(f"invalid systems field: {path}")
        declared_hash = raw.get("sha256")
        if not isinstance(declared_hash, str) or SHA256.fullmatch(declared_hash) is None:
            raise ValueError(f"missing/invalid DocsV2 SHA256: {path}")
        target = root / path
        # Symlinks (including parent components) must not read outside source root.
        try:
            resolved = target.resolve(strict=True)
            if not resolved.is_relative_to(root.resolve(strict=True)) or not resolved.is_file():
                raise ValueError(f"document outside repository or not a regular file: {path}")
            actual_hash = hashlib.sha256(resolved.read_bytes()).hexdigest()
            integrity = "MATCH" if actual_hash == declared_hash else "DRIFT"
        except FileNotFoundError:
            actual_hash, integrity = None, "MISSING"
        kind = "OVERDUE" if remaining < 0 else "DUE_TODAY" if remaining == 0 else "UPCOMING"
        items.append({
            "path": path, "title": title, "owner": owner, "authority": authority,
            "systems": systems, "status": kind, "due_date": due.isoformat(),
            "reviewed_at": checked.isoformat(), "days_to_due": remaining,
            "registry_sha256": declared_hash, "actual_sha256": actual_hash,
            "content_integrity": integrity,
            "action": "Review actual content, obtain owner approval, then reseal with DocsV2",
        })
    items.sort(key=lambda x: (x["due_date"], x["owner"], x["path"]))
    return {
        "schema": "aoe2war.renaissance.docs-review-queue.v1",
        "as_of_utc": as_of.isoformat(), "window_days": within_days,
        "registry_documents": len(seen), "reviewable_documents": reviewed,
        "overdue": sum(x["status"] == "OVERDUE" for x in items),
        "due_today": sum(x["status"] == "DUE_TODAY" for x in items),
        "upcoming": sum(x["status"] == "UPCOMING" for x in items),
        "integrity_issues": sum(x["content_integrity"] != "MATCH" for x in items),
        "items": items, "does_not_authorize_review_renewal": True,
    }


def _cell(value: object) -> str:
    return str(value).replace("\r", " ").replace("\n", " ").replace("|", "\\|").replace("<", "&lt;").replace(">", "&gt;")


def render_markdown(report: dict[str, Any]) -> str:
    rows = [
        "# AoE2WAR — DocsV2 owner review queue",
        "",
        f"**UTC date:** {report['as_of_utc']} · **Reviewable:** {report['reviewable_documents']} "
        f"· **Overdue:** {report['overdue']} · **Due today:** {report['due_today']} "
        f"· **Upcoming within {report['window_days']} days:** {report['upcoming']} "
        f"· **Content integrity problems:** {report['integrity_issues']}",
        "",
        "| Due UTC | State | Document | Owner | Authority | Systems | Hash |",
        "|---|---|---|---|---|---|---|",
    ]
    for item in report["items"]:
        rows.append("| " + " | ".join(_cell(v) for v in (
            item["due_date"], item["status"], item["path"], item["owner"],
            item["authority"], ", ".join(item["systems"]), item["content_integrity"],
        )) + " |")
    if not report["items"]:
        rows.extend(["", "No review items within the requested window."])
    rows.extend([
        "",
        "Read-only owner-triage aid. Hash MATCH means bytes match the registry, **not** that",
        "the content has been reviewed or approved. Actual owner review, DocsV2 registry",
        "resealing, and the protected docs_v2_check.py gate remain mandatory.",
    ])
    return "\n".join(rows) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--registry", default="docs/document-registry.json")
    parser.add_argument("--as-of", help="UTC date YYYY-MM-DD; defaults to current UTC day")
    parser.add_argument("--within", type=int, default=14, help="Look-ahead days 0..365")
    parser.add_argument("--format", choices=("markdown", "json"), default="markdown")
    args = parser.parse_args(argv)
    try:
        root = args.root.resolve(strict=True)
        registry_name = _safe_path(args.registry)
        registry_path = (root / registry_name).resolve(strict=True)
        if not registry_path.is_relative_to(root) or not registry_path.is_file():
            raise ValueError("registry path must stay inside repository")
        registry_bytes = registry_path.read_bytes()
        doc = json.loads(registry_bytes)
        as_of = _review_date(args.as_of, "--as-of") if args.as_of else datetime.now(timezone.utc).date()
        result = review_queue(root, doc, as_of=as_of, within_days=args.within)
        result["registry_sha256"] = hashlib.sha256(registry_bytes).hexdigest()
        try:
            result["source_sha"] = subprocess.check_output(
                ["git", "-C", str(root), "rev-parse", "HEAD"], text=True, stderr=subprocess.DEVNULL
            ).strip()
        except (subprocess.CalledProcessError, FileNotFoundError):
            result["source_sha"] = None
        print(json.dumps(result, indent=2) if args.format == "json" else render_markdown(result), end="\n" if args.format == "json" else "")
        return 2 if result["integrity_issues"] else 0
    except (ValueError, OSError, json.JSONDecodeError, OverflowError) as exc:
        print(f"RENAISSANCE REVIEW QUEUE STOP: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
