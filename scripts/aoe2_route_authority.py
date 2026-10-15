#!/usr/bin/env python3
"""Read-only HD HTTP authorization-evidence census.

Lexical review signals ONLY: no route is certified safe or unsafe.
No source execution, network, database access, keys, or production mutations.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path, PurePosixPath
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
ROUTE_ROOT = Path("app/api")
HTTP_METHODS = ("GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE")
MUTATING = frozenset({"POST", "PUT", "PATCH", "DELETE"})
# Reviewed HD pattern names, including radio operator and ticket delegation,
# plus local authenticated-token helpers. This is only lexical evidence:
# a matching name can be unused or forged; runtime negative tests are separate.
GUARDS = ("requireAdmin", "getSessionUid", "requireViewer", "getServerSession",
          "requireReplayResultReviewAccess", "bridgeTokenMatches",
          "requireRadioWoloOperator", "handleBetStakeTicketCommit",
          "authorized", "authorize", "isAuthorized", "verifySession",
          "requireAuthenticated", "requireUser", "assertAdmin")
BODY_READERS = ("request.json(", "request.text(", "request.formData(",
                "request.arrayBuffer(", "request.body", "readBounded",
                "readWarSatchelBoundedUtf8")
HANDLER_RE = re.compile(
    r"(?m)^[ \t]*export[ \t]+(?:(?:async[ \t]+)?function[ \t]+"
    r"|const[ \t]+)(GET|HEAD|OPTIONS|POST|PUT|PATCH|DELETE)\b"
)
SENSITIVE_NAME_RE = re.compile(
    r"(?i)(admin|wolo|wallet|stake|bet|settle|claim|fund|bounty|trophy|"
    r"replay|broadcast|transfer|challenge|payout)"
)
MAX_SOURCE_BYTES = 1_500_000


class RouteCensusError(RuntimeError):
    pass


def discover_routes(root: Path = ROOT) -> dict[str, Path]:
    base = root / ROUTE_ROOT
    if not base.exists():
        return {}
    result: dict[str, Path] = {}
    for path in base.rglob("*"):
        if (path.name not in {"route.ts", "route.tsx", "route.js", "route.mjs"}
                or path.is_symlink() or not path.is_file()):
            continue
        name = path.relative_to(root).as_posix()
        if len(name) > 512 or any(part.startswith(".") for part
                                  in PurePosixPath(name).parts):
            continue
        result[name] = path
    return dict(sorted(result.items()))


def classify_route(path: str, source: str) -> dict[str, Any]:
    methods = sorted(set(HANDLER_RE.findall(source)),
                     key=HTTP_METHODS.index)
    guards = sorted(signal for signal in GUARDS
                    if re.search(r"\b" + re.escape(signal) + r"\b", source))
    bodies = sorted(symbol for symbol in BODY_READERS if symbol in source)
    sensitive_name = bool(SENSITIVE_NAME_RE.search(path))
    if path.startswith("app/api/admin/"):
        surface = "admin_path"
    elif path.startswith("app/api/internal/"):
        surface = "internal_path"
    elif sensitive_name:
        surface = "sensitive_named_path"
    else:
        surface = "general_path"
    mutating = any(method in MUTATING for method in methods)
    return {
        "route": path,
        "methods": methods,
        "mutation_method_count": sum(method in MUTATING for method in methods),
        "surface": surface,
        "local_guard_symbols_seen": guards,
        "body_reader_symbols_seen": bodies,
        # Only an owner review prompt. An internal route needs authority review
        # even when its generic path lacks money/replay/security keywords.
        # A guard may still live inside a delegated helper.
        "manual_authority_trace_candidate": (
            mutating and (sensitive_name or surface == "internal_path") and not guards
        ),
    }


def inspect(root: Path = ROOT) -> dict[str, Any]:
    routes = discover_routes(root)
    rows = []
    for name, path in routes.items():
        if path.stat().st_size > MAX_SOURCE_BYTES:
            raise RouteCensusError(f"route source exceeds bounded reader: {name}")
        try:
            source = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError) as exc:
            raise RouteCensusError(f"cannot read route source: {name}") from exc
        rows.append(classify_route(name, source))
    counts = Counter(method for row in rows for method in row["methods"])
    review = [row["route"] for row in rows
              if row["manual_authority_trace_candidate"]]
    return {
        "schema": 1,
        "kind": "aoe2war-hd-route-authority-evidence-census",
        "scope": "Lexical, read-only app/api inspection only. Delegated guards, "
                 "body limits, runtime identity, actual authorization and "
                 "middleware NOT certified.",
        "route_file_count": len(rows),
        "exported_handler_count": sum(len(row["methods"]) for row in rows),
        "method_counts": {method: counts[method] for method in HTTP_METHODS},
        "mutation_route_count": sum(row["mutation_method_count"] > 0
                                    for row in rows),
        "local_guard_signal_route_count": sum(
            bool(row["local_guard_symbols_seen"]) for row in rows
        ),
        "manual_authority_trace_candidate_count": len(review),
        "manual_authority_trace_candidates": review,
        "routes": rows,
        "interpretation": "Missing lexical symbol does not mean missing "
                          "authorization. Review actual imported call paths "
                          "and negative tests before reporting an issue.",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--ci", action="store_true",
                        help="fail only on analyzer errors, not historical review debt")
    args = parser.parse_args()
    try:
        report = inspect()
        if args.json:
            print(json.dumps(report, indent=2, sort_keys=True))
        else:
            print("⚔️  AOE2WAR HD ROUTE AUTHORITY EVIDENCE CENSUS")
            for key in ("route_file_count", "exported_handler_count",
                        "mutation_route_count", "local_guard_signal_route_count",
                        "manual_authority_trace_candidate_count"):
                print(f"  {key}: {report[key]}")
            for path in report["manual_authority_trace_candidates"][:25]:
                print("  REVIEW ONLY " + path)
            print("  Symbols are evidence; never assert an auth vulnerability from absence.")
        return 0
    except (OSError, ValueError, RouteCensusError) as exc:
        print(f"STOP: HD route census failed: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
