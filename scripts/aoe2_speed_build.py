#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
STATE = ROOT / ".aoe2war-release"
RECEIPT_DIR = STATE / "build-performance-receipts"


class BuildSpeedError(RuntimeError):
    pass


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def load_json(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise BuildSpeedError(f"invalid build manifest {path}: {exc}") from exc
    if not isinstance(payload, dict):
        raise BuildSpeedError(f"build manifest root is not an object: {path}")
    return payload


def human_bytes(value: int) -> str:
    amount = float(max(0, value))
    for unit in ("B", "KiB", "MiB", "GiB"):
        if amount < 1024.0 or unit == "GiB":
            return f"{amount:.1f} {unit}" if unit != "B" else f"{int(amount)} B"
        amount /= 1024.0
    return f"{value} B"


def category(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix == ".js":
        return "js"
    if suffix == ".css":
        return "css"
    if suffix == ".map":
        return "map"
    if suffix in {".woff", ".woff2", ".ttf", ".otf"}:
        return "font"
    if suffix in {".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif", ".svg"}:
        return "image"
    return "other"


def normalize_manifest_path(value: str) -> str:
    path = value.strip().lstrip("/")
    if path.startswith("_next/"):
        path = path[len("_next/"):]
    return path


def existing_manifest_file(build_dir: Path, value: str) -> Path | None:
    relative = normalize_manifest_path(value)
    candidates = (
        build_dir / relative,
        build_dir / "static" / relative.removeprefix("static/"),
    )
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    return None


def manifest_route_files(build_dir: Path) -> dict[str, set[str]]:
    routes: dict[str, set[str]] = defaultdict(set)
    manifest_names = ("app-build-manifest.json", "build-manifest.json")
    for name in manifest_names:
        path = build_dir / name
        if not path.is_file():
            continue
        payload = load_json(path)
        pages = payload.get("pages")
        if not isinstance(pages, dict):
            continue
        for route, values in pages.items():
            if not isinstance(route, str) or not isinstance(values, list):
                continue
            for value in values:
                if isinstance(value, str):
                    routes[route].add(value)
    return routes


def snapshot(root: Path = ROOT) -> dict[str, Any]:
    build_dir = root / ".next"
    if not build_dir.is_dir():
        raise BuildSpeedError(f"Next production build is missing: {build_dir}")

    static_root = build_dir / "static"
    files: list[dict[str, Any]] = []
    totals: dict[str, dict[str, int]] = defaultdict(lambda: {"files": 0, "bytes": 0})

    if static_root.is_dir():
        for path in static_root.rglob("*"):
            if not path.is_file():
                continue
            try:
                size = path.stat().st_size
            except OSError:
                continue
            kind = category(path)
            relative = path.relative_to(build_dir).as_posix()
            row = {"path": relative, "category": kind, "bytes": size}
            files.append(row)
            totals[kind]["files"] += 1
            totals[kind]["bytes"] += size

    files.sort(key=lambda row: int(row["bytes"]), reverse=True)
    route_files = manifest_route_files(build_dir)
    route_rows: list[dict[str, Any]] = []

    for route, values in route_files.items():
        resolved: dict[str, Path] = {}
        for value in values:
            path = existing_manifest_file(build_dir, value)
            if path:
                resolved[path.resolve().as_posix()] = path

        js_bytes = 0
        css_bytes = 0
        other_bytes = 0
        refs: list[str] = []
        for path in resolved.values():
            size = path.stat().st_size
            refs.append(path.relative_to(build_dir).as_posix())
            kind = category(path)
            if kind == "js":
                js_bytes += size
            elif kind == "css":
                css_bytes += size
            else:
                other_bytes += size

        route_rows.append(
            {
                "route": route,
                "referenced_files": len(resolved),
                "referenced_bytes": js_bytes + css_bytes + other_bytes,
                "js_bytes": js_bytes,
                "css_bytes": css_bytes,
                "other_bytes": other_bytes,
                "files": sorted(refs),
            }
        )

    route_rows.sort(key=lambda row: int(row["js_bytes"]), reverse=True)
    total_static_bytes = sum(int(row["bytes"]) for row in files)

    return {
        "schema": 1,
        "kind": "aoe2war-next-build-performance-census",
        "generated_at": utc_now(),
        "build_dir": str(build_dir),
        "static": {
            "total_files": len(files),
            "total_bytes": total_static_bytes,
            "by_category": dict(sorted(totals.items())),
            "largest": files[:30],
            "largest_js_bytes": max(
                (int(row["bytes"]) for row in files if row["category"] == "js"),
                default=0,
            ),
        },
        "routes": {
            "manifest_route_count": len(route_rows),
            "largest_by_js": route_rows[:30],
            "largest_route_js_bytes": max(
                (int(row["js_bytes"]) for row in route_rows),
                default=0,
            ),
        },
    }


def write_receipt(payload: dict[str, Any], root: Path = ROOT) -> Path:
    receipt_dir = root / ".aoe2war-release" / "build-performance-receipts"
    receipt_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = receipt_dir / f"{stamp}.json"
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return path


def print_status(payload: dict[str, Any], receipt: Path | None) -> None:
    static = payload["static"]
    routes = payload["routes"]
    by_category = static["by_category"]

    print("⚔️  AOE2WAR NEXT BUILD SPEED CENSUS")
    print()
    print(f"Static files:       {static['total_files']}")
    print(f"Static bytes:       {human_bytes(int(static['total_bytes']))}")
    print(f"JS bytes:           {human_bytes(int(by_category.get('js', {}).get('bytes', 0)))}")
    print(f"CSS bytes:          {human_bytes(int(by_category.get('css', {}).get('bytes', 0)))}")
    print(f"Largest JS chunk:   {human_bytes(int(static['largest_js_bytes']))}")
    print(f"Manifest routes:    {routes['manifest_route_count']}")
    print(f"Largest route JS:   {human_bytes(int(routes['largest_route_js_bytes']))}")
    print()
    print("Largest route JS footprints:")
    for row in routes["largest_by_js"][:12]:
        print(
            f"  {human_bytes(int(row['js_bytes'])):>10} JS · "
            f"{human_bytes(int(row['css_bytes'])):>10} CSS · "
            f"{row['route']}"
        )
    print()
    print("Largest static build artifacts:")
    for row in static["largest"][:12]:
        print(
            f"  {human_bytes(int(row['bytes'])):>10}  "
            f"{row['category']:<6}  {row['path']}"
        )

    if receipt:
        print()
        print(f"Receipt: {receipt}")


def main() -> int:
    parser = argparse.ArgumentParser(
        prog="aoe2war speed build",
        description=(
            "Inspect a completed Next production build for route-referenced JS/CSS "
            "and static artifact size. This is build evidence, not browser transfer evidence."
        ),
    )
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--no-receipt", action="store_true")
    parser.add_argument(
        "--require-build",
        action="store_true",
        help="return nonzero when .next is absent (default also reports absence as an error)",
    )
    parser.add_argument(
        "--max-single-js-kib",
        type=float,
        default=None,
        help="optional fail threshold for one raw JS build artifact",
    )
    parser.add_argument(
        "--max-route-js-kib",
        type=float,
        default=None,
        help="optional fail threshold for one route's referenced raw JS",
    )
    args = parser.parse_args()

    try:
        payload = snapshot()
    except BuildSpeedError as exc:
        print(f"STOP: {exc}", file=sys.stderr)
        return 2

    receipt = None if args.no_receipt else write_receipt(payload)

    if args.json:
        print(
            json.dumps(
                {"receipt": str(receipt) if receipt else None, "payload": payload},
                indent=2,
                sort_keys=True,
            )
        )
    else:
        print_status(payload, receipt)

    single_limit = (
        int(args.max_single_js_kib * 1024)
        if args.max_single_js_kib is not None
        else None
    )
    route_limit = (
        int(args.max_route_js_kib * 1024)
        if args.max_route_js_kib is not None
        else None
    )

    violations: list[str] = []
    if single_limit is not None and int(payload["static"]["largest_js_bytes"]) > single_limit:
        violations.append(
            "largest JS chunk exceeds "
            f"{args.max_single_js_kib:g} KiB"
        )
    if route_limit is not None and int(payload["routes"]["largest_route_js_bytes"]) > route_limit:
        violations.append(
            "largest route JS footprint exceeds "
            f"{args.max_route_js_kib:g} KiB"
        )

    if violations:
        for violation in violations:
            print(f"REGRESSION: {violation}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
