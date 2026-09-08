#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import subprocess
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
APP_ROOT = ROOT / "app"
PUBLIC_ROOT = ROOT / "public"
COHORT_PATH = ROOT / "docs" / "audits" / "performance-route-cohort-v2.txt"

PAGE_SUFFIXES = ("page.tsx", "page.ts", "page.jsx", "page.js")

SENSITIVE_ROUTE_EXCLUSIONS = {
    "/market/invoices/[publicId]": (
        "user-specific public-id route; benchmark only with a real isolated fixture "
        "or authenticated campaign, never a fabricated invoice id"
    ),
}

ASSET_SUFFIXES = {
    "image": {".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif", ".svg", ".ico"},
    "audio": {".mp3", ".wav", ".ogg", ".m4a", ".flac", ".aac"},
    "video": {".mp4", ".webm", ".mov", ".m4v"},
    "font": {".woff", ".woff2", ".ttf", ".otf", ".eot"},
    "data": {".json", ".csv", ".xml", ".txt", ".webmanifest"},
    "download": {".exe", ".msi", ".dmg", ".zip", ".tar", ".gz", ".tgz", ".appimage"},
}


class InventoryError(RuntimeError):
    pass


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def route_from_page(path: Path) -> str:
    rel = path.relative_to(APP_ROOT).as_posix()
    for suffix in PAGE_SUFFIXES:
        if rel == suffix:
            return "/"
        if rel.endswith("/" + suffix):
            value = rel[: -(len(suffix) + 1)]
            return "/" + value
    raise InventoryError(f"not a Next page path: {path}")


def source_page_files() -> list[Path]:
    if not APP_ROOT.is_dir():
        raise InventoryError(f"app directory missing: {APP_ROOT}")
    pages = sorted(
        path
        for path in APP_ROOT.rglob("page.*")
        if path.is_file() and path.name in PAGE_SUFFIXES
    )
    if not pages:
        raise InventoryError("no Next page routes discovered")
    return pages


def source_route_templates() -> list[str]:
    return sorted({route_from_page(path) for path in source_page_files()})


LOCAL_IMPORT_PATTERN = re.compile(
    r"""from\s+["'](?P<module>@/[^"']+|\.{1,2}/[^"']+)["']"""
)


def resolve_local_module(importer: Path, module: str) -> Path | None:
    if module.startswith("@/"):
        stem = ROOT / module[2:]
    else:
        stem = importer.parent / module

    candidates = [
        stem,
        stem.with_suffix(".ts"),
        stem.with_suffix(".tsx"),
        stem.with_suffix(".js"),
        stem.with_suffix(".jsx"),
        stem / "index.ts",
        stem / "index.tsx",
        stem / "index.js",
        stem / "index.jsx",
    ]
    for candidate in candidates:
        if candidate.is_file() and ROOT in candidate.resolve().parents:
            return candidate.resolve()
    return None


def source_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return ""


def page_source_profile(path: Path) -> dict[str, Any]:
    """Static first-hop source evidence. This is not a runtime latency claim."""
    page = source_text(path)
    dependencies: list[Path] = []
    seen: set[Path] = set()

    for match in LOCAL_IMPORT_PATTERN.finditer(page):
        dependency = resolve_local_module(path, match.group("module"))
        if dependency is None or dependency in seen:
            continue
        seen.add(dependency)
        dependencies.append(dependency)

    dependency_sources = [(item, source_text(item)) for item in dependencies]
    combined = "\n".join([page, *(text for _, text in dependency_sources)])
    client_dependencies = [
        item
        for item, text in dependency_sources
        if text.lstrip().startswith('"use client"')
        or text.lstrip().startswith("'use client'")
    ]

    prisma_calls = len(re.findall(r"\bprisma\.[A-Za-z_$][A-Za-z0-9_$]*", combined))
    promise_all_calls = len(re.findall(r"\bPromise\.all(?:Settled)?\s*\(", combined))
    fetch_calls = len(re.findall(r"\bfetch\s*\(", combined))
    suspense_usages = len(re.findall(r"<Suspense\b", page))
    image_usages = len(re.findall(r"<Image\b", combined))
    generation_cache_signal = bool(
        re.search(
            r"createGenerationKeyedLoader|replayGeneration|generationKeyed|CacheGeneration",
            combined,
        )
    )
    complete_corpus_signal = bool(
        re.search(
            r"PUBLIC_MATCHUP_SCAN_LIMIT|loadPublicRivalryBoards|loadPublicBattleArchive|"
            r"loadPublicPlayerDirectory|complete[-_ ]corpus|full corpus",
            combined,
            re.IGNORECASE,
        )
    )
    force_dynamic = bool(re.search(r'export\s+const\s+dynamic\s*=\s*["\']force-dynamic["\']', page))
    revalidate_zero = bool(re.search(r"export\s+const\s+revalidate\s*=\s*0\b", page))
    page_is_client = page.lstrip().startswith('"use client"') or page.lstrip().startswith("'use client'")

    first_hop_bytes = sum(
        len(text.encode("utf-8"))
        for _, text in dependency_sources
    )
    static_complexity_score = (
        (2.0 if force_dynamic else 0.0)
        + min(prisma_calls, 12) * 0.35
        + min(promise_all_calls, 8) * 0.10
        + min(len(client_dependencies), 8) * 0.20
        + min((len(page.encode("utf-8")) + first_hop_bytes) / 100_000.0, 4.0) * 0.25
        + (1.5 if complete_corpus_signal else 0.0)
        - (0.5 if generation_cache_signal else 0.0)
        - (0.25 if suspense_usages else 0.0)
    )

    return {
        "evidence_scope": "static_page_plus_first_hop_imports_not_runtime_proof",
        "source_path": path.relative_to(ROOT).as_posix(),
        "page_source_bytes": len(page.encode("utf-8")),
        "first_hop_dependency_count": len(dependencies),
        "first_hop_source_bytes": first_hop_bytes,
        "first_hop_dependencies": [
            item.relative_to(ROOT).as_posix()
            for item in dependencies[:40]
        ],
        "force_dynamic": force_dynamic,
        "revalidate_zero": revalidate_zero,
        "page_is_client": page_is_client,
        "client_first_hop_dependencies": len(client_dependencies),
        "direct_or_first_hop_prisma_calls": prisma_calls,
        "promise_all_signals": promise_all_calls,
        "fetch_signals": fetch_calls,
        "suspense_usages": suspense_usages,
        "image_usages": image_usages,
        "generation_cache_signal": generation_cache_signal,
        "complete_corpus_signal": complete_corpus_signal,
        "static_complexity_score": round(max(0.0, static_complexity_score), 3),
    }


def cohort_routes() -> list[str]:
    if not COHORT_PATH.is_file():
        raise InventoryError(f"performance cohort missing: {COHORT_PATH}")
    routes = [
        line.strip()
        for line in COHORT_PATH.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]
    if len(routes) != len(set(routes)):
        raise InventoryError("performance cohort contains duplicate routes")
    return routes


def template_regex(template: str) -> re.Pattern[str]:
    parts: list[str] = []
    for segment in template.split("/"):
        if not segment:
            continue
        if segment.startswith("[...") and segment.endswith("]"):
            parts.append(".+")
        elif segment.startswith("[[...") and segment.endswith("]]"):
            parts.append(".*")
        elif segment.startswith("[") and segment.endswith("]"):
            parts.append("[^/]+")
        else:
            parts.append(re.escape(segment))
    if not parts:
        return re.compile(r"^/$")
    return re.compile(r"^/" + "/".join(parts) + r"$")


def representative_for(template: str, cohort: list[str]) -> str | None:
    pattern = template_regex(template)
    return next((route for route in cohort if pattern.fullmatch(route)), None)


def classify_route(template: str) -> tuple[str, str | None]:
    if template == "/admin" or template.startswith("/admin/"):
        return "admin", "authenticated operator surface"
    if template in SENSITIVE_ROUTE_EXCLUSIONS:
        return "sensitive_dynamic", SENSITIVE_ROUTE_EXCLUSIONS[template]
    return "public", None


def asset_category(path: Path) -> str:
    suffix = path.suffix.lower()
    for category, suffixes in ASSET_SUFFIXES.items():
        if suffix in suffixes:
            return category
    return "other"


def tracked_public_blobs() -> dict[str, str]:
    proc = subprocess.run(
        ["git", "ls-files", "-s", "--", "public"],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if proc.returncode != 0:
        return {}

    result: dict[str, str] = {}
    for line in proc.stdout.splitlines():
        metadata, separator, path = line.partition("\t")
        if not separator or not path:
            continue
        fields = metadata.split()
        if len(fields) < 2:
            continue
        result[path] = fields[1]
    return result


def asset_inventory() -> dict[str, Any]:
    totals: dict[str, dict[str, int]] = defaultdict(lambda: {"files": 0, "bytes": 0})
    largest: list[dict[str, Any]] = []
    total_files = 0
    total_bytes = 0
    blobs = tracked_public_blobs()
    blob_groups: dict[str, list[dict[str, Any]]] = defaultdict(list)

    if PUBLIC_ROOT.is_dir():
        for path in PUBLIC_ROOT.rglob("*"):
            if not path.is_file():
                continue
            try:
                size = path.stat().st_size
            except OSError:
                continue
            relative = str(path.relative_to(ROOT))
            category = asset_category(path)
            totals[category]["files"] += 1
            totals[category]["bytes"] += size
            total_files += 1
            total_bytes += size
            row = {
                "path": relative,
                "category": category,
                "bytes": size,
            }
            largest.append(row)
            blob = blobs.get(relative)
            if blob:
                blob_groups[blob].append(row)

    duplicate_groups: list[dict[str, Any]] = []
    for blob, rows in blob_groups.items():
        if len(rows) < 2:
            continue
        bytes_each = int(rows[0]["bytes"])
        duplicate_groups.append(
            {
                "blob": blob,
                "copies": len(rows),
                "bytes_each": bytes_each,
                "avoidable_bytes": bytes_each * (len(rows) - 1),
                "paths": [str(row["path"]) for row in rows],
            }
        )

    duplicate_groups.sort(key=lambda row: int(row["avoidable_bytes"]), reverse=True)
    largest.sort(key=lambda row: int(row["bytes"]), reverse=True)
    return {
        "total_files": total_files,
        "total_bytes": total_bytes,
        "by_category": dict(sorted(totals.items())),
        "largest": largest[:20],
        "duplicate_group_count": len(duplicate_groups),
        "duplicate_avoidable_bytes": sum(
            int(row["avoidable_bytes"]) for row in duplicate_groups
        ),
        "duplicate_groups": duplicate_groups[:20],
    }


def snapshot() -> dict[str, Any]:
    page_files = source_page_files()
    page_by_template = {
        route_from_page(path): path
        for path in page_files
    }
    source = sorted(page_by_template)
    cohort = cohort_routes()

    page_rows: list[dict[str, Any]] = []
    uncovered_public: list[str] = []
    counts = {"public": 0, "admin": 0, "sensitive_dynamic": 0}

    for template in source:
        classification, reason = classify_route(template)
        counts[classification] += 1
        representative = representative_for(template, cohort)
        covered = representative is not None
        if classification == "public" and not covered:
            uncovered_public.append(template)
        page_rows.append(
            {
                "template": template,
                "classification": classification,
                "reason": reason,
                "benchmark_representative": representative,
                "covered_by_public_campaign": covered if classification == "public" else False,
                "source_profile": page_source_profile(page_by_template[template]),
            }
        )

    source_public_templates = counts["public"]
    covered_public_templates = source_public_templates - len(uncovered_public)

    return {
        "schema": 1,
        "kind": "aoe2war-performance-page-inventory",
        "generated_at": utc_now(),
        "source_page_count": len(source),
        "page_counts": counts,
        "public_campaign_route_count": len(cohort),
        "coverage": {
            "public_templates": source_public_templates,
            "covered_public_templates": covered_public_templates,
            "uncovered_public_templates": uncovered_public,
            "coverage_percent": round(
                (covered_public_templates * 100.0 / source_public_templates)
                if source_public_templates
                else 100.0,
                2,
            ),
        },
        "pages": page_rows,
        "assets": asset_inventory(),
    }


def human_bytes(value: int) -> str:
    amount = float(max(0, value))
    units = ("B", "KiB", "MiB", "GiB", "TiB")
    for unit in units:
        if amount < 1024.0 or unit == units[-1]:
            return f"{amount:.1f} {unit}" if unit != "B" else f"{int(amount)} B"
        amount /= 1024.0
    return f"{value} B"


def print_status(payload: dict[str, Any]) -> None:
    counts = payload["page_counts"]
    coverage = payload["coverage"]
    assets = payload["assets"]

    print("⚔️  AOE2WAR SPEED PAGE INVENTORY")
    print()
    print(f"Source pages:      {payload['source_page_count']}")
    print(f"Public templates:  {coverage['public_templates']}")
    print(f"Public covered:    {coverage['covered_public_templates']} ({coverage['coverage_percent']:.2f}%)")
    print(f"Admin pages:       {counts['admin']}")
    print(f"Sensitive dynamic: {counts['sensitive_dynamic']}")
    print(f"Benchmark routes:  {payload['public_campaign_route_count']}")
    print()
    print(f"Public assets:     {assets['total_files']} files · {human_bytes(assets['total_bytes'])}")
    print(
        "Exact duplicates:  "
        f"{assets['duplicate_group_count']} groups · "
        f"{human_bytes(assets['duplicate_avoidable_bytes'])} avoidable tracked bytes"
    )

    if coverage["uncovered_public_templates"]:
        print()
        print("UNBENCHMARKED PUBLIC ROUTES:")
        for route in coverage["uncovered_public_templates"]:
            print(f"  - {route}")

    public_profiles = [
        row
        for row in payload["pages"]
        if row["classification"] == "public"
    ]
    public_profiles.sort(
        key=lambda row: float((row.get("source_profile") or {}).get("static_complexity_score") or 0.0),
        reverse=True,
    )

    print()
    print("Highest static source-complexity signals (not measured latency):")
    for row in public_profiles[:10]:
        profile = row["source_profile"]
        print(
            f"  {profile['static_complexity_score']:>5.2f}  {row['template']:<32} "
            f"dynamic={profile['force_dynamic']} prisma={profile['direct_or_first_hop_prisma_calls']} "
            f"client_deps={profile['client_first_hop_dependencies']}"
        )

    print()
    print("Largest public assets:")
    for row in assets["largest"][:10]:
        print(f"  {human_bytes(int(row['bytes'])):>10}  {row['category']:<8}  {row['path']}")


def main() -> int:
    parser = argparse.ArgumentParser(prog="aoe2war speed inventory")
    parser.add_argument("--json", action="store_true")
    parser.add_argument(
        "--require-complete-public-coverage",
        action="store_true",
        help="exit non-zero when a public source page lacks a benchmark representative",
    )
    args = parser.parse_args()

    try:
        payload = snapshot()
    except InventoryError as exc:
        print(f"STOP: {exc}")
        return 2

    if args.json:
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        print_status(payload)

    if args.require_complete_public_coverage and payload["coverage"]["uncovered_public_templates"]:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
