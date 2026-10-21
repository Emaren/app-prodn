#!/usr/bin/env python3
"""Read-only Kingdom Index route dependency evidence.

Reuses AoE2WAR's existing static module-graph resolver. This census is a
bounded *working-tree* lexical observation; it does NOT claim a complete
Next.js bundle, an authenticated release, or a page quality certification.
No source is executed, no network calls are made and no files are written.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import posixpath
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

import aoe2_module_graph as modules

ROOT = Path(__file__).resolve().parents[1]
ASSET_SUFFIXES = frozenset({".css", ".scss", ".json", ".svg", ".png", ".jpg", ".jpeg", ".webp"})
EXTRA_ROOTS = ("config", "public", "messages")
# These repository-wide inputs affect all routes regardless of direct imports.
# This is source evidence, not an emitted-bundle or deployment attestation.
GLOBAL_INPUTS = (
    "package.json", "yarn.lock", "package-lock.json", "pnpm-lock.yaml",
    "pnpm-workspace.yaml", "next.config.js", "next.config.mjs",
    "next.config.ts", "tsconfig.json", "postcss.config.js",
    "postcss.config.mjs", "postcss.config.cjs", "tailwind.config.js",
    "tailwind.config.ts", "prisma/schema.prisma", "middleware.ts",
    "middleware.js", "instrumentation.ts", "instrumentation.js",
)
# Next segment boundaries can render without being imported by page.tsx.
SEGMENT_BOUNDARY_STEMS = (
    "layout", "template", "loading", "error", "not-found", "default",
    "global-error",
)
SEGMENT_BOUNDARY_SUFFIXES = (".tsx", ".ts", ".jsx", ".js")
MAX_SOURCE_BYTES = 2_000_000
MAX_MODULES_PER_ROUTE = 4096
API_LITERAL = re.compile(r"""(?<![\w])/(api/[A-Za-z0-9_\-/]+)""")
DYNAMIC_IMPORT = re.compile(r"""\b(?:import|require)\s*\(\s*(?![\"'])""")
CSS_IMPORT = re.compile(r"""@import\s+(?:url\()?\s*["']([^"'\r\n]+)["']""")
# Existing module census intentionally anchors ordinary import lines. Catch
# valid side-effect imports after semicolons without claiming a full TS parser.
INLINE_IMPORT = re.compile(r"""(?m);[ \t]*(?:import|export)\s+(?:type\s+)?(?:[^;"']{0,750}?\s+from\s+)?["']([^"'\r\n]+)["']""")


class DependencyEvidenceError(RuntimeError):
    pass


def known_sources(root: Path) -> dict[str, Path]:
    result = dict(modules.find_modules(root))
    for base_name in (*modules.MODULE_ROOTS, *EXTRA_ROOTS):
        base = root / base_name
        if not base.is_dir():
            continue
        for file in base.rglob("*"):
            if not file.is_file() or file.is_symlink() or file.suffix.lower() not in ASSET_SUFFIXES:
                continue
            rel = file.relative_to(root).as_posix()
            if any(part in modules.EXCLUDED_SEGMENTS for part in Path(rel).parts):
                continue
            result[rel] = file
    for name in GLOBAL_INPUTS:
        file = root / name
        if file.is_file() and not file.is_symlink():
            result[name] = file
    return dict(sorted(result.items()))


def resolve_local(importer: str, specifier: str, known: set[str]) -> str | None:
    # An escaped local specifier, root path or nonlocal dependency must not
    # become an arbitrary filesystem read.
    if specifier.startswith("@/"):
        candidate = specifier[2:]
    elif specifier.startswith(("./", "../")):
        candidate = posixpath.join(posixpath.dirname(importer), specifier)
    else:
        return None
    candidate = posixpath.normpath(candidate)
    if candidate in (".", "..") or candidate.startswith("../") or candidate.startswith("/"):
        return None
    if candidate in known:
        return candidate
    for suffix in (*modules.MODULE_SUFFIXES, *sorted(ASSET_SUFFIXES)):
        for option in (candidate + suffix, candidate + "/index" + suffix):
            if option in known:
                return option
    return None


def generated_prisma_declarations(root: Path, unresolved: set[str]) -> list[dict[str, str]]:
    """Classify exact generated-client imports without declaring them resolved.

    A Prisma generator declaration is only a promise of build output. Never
    include nonexistent client files in the source closure or infer that the
    generated artifact exists, matches the schema, or is deployed.
    """
    schema = root / "prisma/schema.prisma"
    package = root / "package.json"
    if not schema.is_file() or schema.is_symlink() or not package.is_file() or package.is_symlink():
        return []
    if schema.stat().st_size > MAX_SOURCE_BYTES or package.stat().st_size > MAX_SOURCE_BYTES:
        return []
    try:
        definition = schema.read_text(encoding="utf-8")
        configuration = json.loads(package.read_text(encoding="utf-8"))
    except (ValueError, UnicodeDecodeError, OSError):
        return []
    generator = re.search(r"generator\\s+client\\s*\\{([^{}]{1,1500})\\}", definition)
    if generator is None:
        return []
    body = generator.group(1)
    if not re.search(r'provider\\s*=\\s*"prisma-client-js"', body):
        return []
    if not re.search(r'output\\s*=\\s*"\\.\\./lib/generated/prisma"', body):
        return []
    if "prisma generate" not in configuration.get("scripts", {}).get("prebuild", ""):
        return []
    result = []
    for reference in sorted(unresolved):
        importer, separator, target = reference.partition(" -> ")
        if separator and target == "@/lib/generated/prisma":
            result.append({
                "importer": importer,
                "specifier": target,
                "generator": "prisma/schema.prisma#generator-client",
                "output": "lib/generated/prisma",
                "status": "DECLARED_GENERATED_OUTPUT_NOT_AUTHENTICATED",
            })
    return result


def _source(root: Path, rel: str, known: dict[str, Path]) -> bytes:
    file = known[rel]
    if file.is_symlink() or not file.is_file():
        raise DependencyEvidenceError("Refusing nonregular source: " + rel)
    if file.stat().st_size > MAX_SOURCE_BYTES:
        raise DependencyEvidenceError("Source exceeds bounded reader: " + rel)
    raw = file.read_bytes()
    if len(raw) > MAX_SOURCE_BYTES:
        raise DependencyEvidenceError("Source changed during bounded read: " + rel)
    return raw


def route_evidence(root: Path, href: str,
                   known: dict[str, Path] | None = None) -> dict[str, Any]:
    if not isinstance(href, str) or not href.startswith("/") or ".." in href.split("/") or "?" in href:
        raise ValueError("Invalid route address")
    all_sources = known if known is not None else known_sources(root)
    present = set(all_sources)
    entry = "app/" + href.strip("/") + ("/" if href != "/" else "") + "page.tsx"
    if entry not in present:
        raise DependencyEvidenceError("No statically known page entry: " + href)
    # Capture ancestor layouts and segment boundaries as independent inputs.
    boundaries: set[str] = set()
    segment = posixpath.dirname(entry)
    while segment == "app" or segment.startswith("app/"):
        for stem in SEGMENT_BOUNDARY_STEMS:
            for ext in SEGMENT_BOUNDARY_SUFFIXES:
                candidate = segment + "/" + stem + ext
                if candidate in present:
                    boundaries.add(candidate)
        if segment == "app":
            break
        segment = posixpath.dirname(segment)
    pending = [entry, *sorted(boundaries)]
    visited: set[str] = set()
    unresolved: set[str] = set()
    external: set[str] = set()
    api_routes: set[str] = set()
    nonliteral: set[str] = set()

    while pending:
        rel = pending.pop()
        if rel in visited:
            continue
        if len(visited) >= MAX_MODULES_PER_ROUTE:
            raise DependencyEvidenceError("Dependency closure exceeds node limit")
        visited.add(rel)
        raw = _source(root, rel, all_sources)
        if Path(rel).suffix.lower() not in (set(modules.MODULE_SUFFIXES) | ASSET_SUFFIXES):
            continue
        if not rel.endswith((".ts", ".tsx", ".js", ".jsx", ".mjs", ".mts", ".css", ".scss")):
            continue
        try:
            source = raw.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise DependencyEvidenceError("Non-UTF8 module: " + rel) from exc
        references = modules.extract_import_references(source)
        references += [(m.group(1), "runtime") for m in INLINE_IMPORT.finditer(source)]
        if rel.endswith((".css", ".scss")):
            references += [(m.group(1), "runtime") for m in CSS_IMPORT.finditer(source)]
        for specifier, _kind in references:
            if specifier.startswith(("@/", "./", "../")):
                target = resolve_local(rel, specifier, present)
                if target is None:
                    unresolved.add(rel + " -> " + specifier)
                elif target not in visited:
                    pending.append(target)
            elif not specifier.startswith("node:"):
                external.add(specifier)
        # Literal API references are possible data dependencies, not proof
        # the page actually calls these handlers. Include them conservatively.
        for match in API_LITERAL.finditer(source):
            endpoint = match.group(1).rstrip("/")
            route = "app/" + endpoint + "/route.ts"
            if route in present:
                api_routes.add(route)
                if route not in visited:
                    pending.append(route)
        if DYNAMIC_IMPORT.search(source):
            nonliteral.add(rel)

    generated = generated_prisma_declarations(root, unresolved)
    generated_refs = {row["importer"] + " -> " + row["specifier"] for row in generated}
    unclassified = sorted(unresolved - generated_refs)

    # Shared build configuration is never invisible to the source version.
    bound = sorted(visited | (present & set(GLOBAL_INPUTS)))
    h = hashlib.sha256()
    for rel in bound:
        raw = _source(root, rel, all_sources)
        h.update(rel.encode("utf-8"))
        h.update(b"\x00")
        h.update(hashlib.sha256(raw).digest())
        h.update(b"\x00")
    return {
        "href": href,
        "entrypoint": entry,
        "app_segment_boundaries": sorted(boundaries),
        "source_closure": "dep-" + h.hexdigest()[:24],
        "file_count": len(bound),
        "files": bound,
        "referenced_api_routes": sorted(api_routes),
        "unresolved_local_imports": sorted(unresolved),
        "generated_declarations_unverified": generated,
        "unclassified_local_imports": unclassified,
        "nonliteral_import_modules": sorted(nonliteral),
        "external_package_specifiers": sorted(external),
        "dependency_completeness_certified": False,
        "quality_score_authority": "none",
        "status": "LEXICAL_GAPS_REVIEW" if unresolved or nonliteral else "STATIC_LEXICAL_CENSUS_ONLY",
        "limitations": "No Next.js bundle, public-asset closure, server actions, import-condition resolution, remote APIs, "
                       "side effects, database schema or production runtime attestation.",
    }


def _head(root: Path) -> tuple[str | None, bool]:
    try:
        sha = subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=root, stderr=subprocess.DEVNULL,
            timeout=10, text=True,
        ).strip()
        dirty = subprocess.check_output(
            ["git", "status", "--porcelain=v1", "--untracked-files=all"],
            cwd=root, stderr=subprocess.DEVNULL, timeout=10, text=True,
        ).strip()
        return sha, not bool(dirty)
    except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
        return None, False


def snapshot(root: Path, hrefs: list[str]) -> dict[str, Any]:
    known = known_sources(root)
    routes = [route_evidence(root, href, known) for href in hrefs]
    sha, clean = _head(root)
    return {
        "schema": 1,
        "kind": "aoe2war-kingdom-index-route-dependency-evidence",
        "source": "WORKTREE_LEXICAL_ONLY",
        "git_head": sha,
        "worktree_clean": clean,
        "git_exact_candidate_proven": False,
        "git_status_limitation": "Porcelain cleanliness is only a diagnostic; hidden index flags and mismatched bytes are not independently excluded.",
        "routes": routes,
        "any_unresolved": any(
            row["status"] != "STATIC_LEXICAL_CENSUS_ONLY" for row in routes
        ),
        "page_quality_certified": False,
        "financial_release_authorized": False,
        "read_only": True,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    selection = parser.add_mutually_exclusive_group(required=True)
    selection.add_argument("--route", help="A single public route, e.g. /leaderboard")
    selection.add_argument("--all", action="store_true", help="All registered Kingdom Index pages")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    try:
        catalog = json.loads((ROOT / "config/kingdom-index-routes.json").read_text())
        known_routes = [row["href"] for row in catalog]
        if args.route and args.route not in known_routes:
            raise ValueError("Route is not registered in Kingdom Index")
        report = snapshot(ROOT, known_routes if args.all else [args.route])
    except (OSError, ValueError, DependencyEvidenceError) as exc:
        print("STOP: " + str(exc), file=sys.stderr)
        return 2
    if args.json:
        print(json.dumps(report, indent=2, sort_keys=True))
    else:
        print("⚔️  KINGDOM INDEX DEPENDENCY EVIDENCE · NOT A CERTIFICATE")
        print("Candidate:", report["git_head"], "clean:", report["worktree_clean"])
        for row in report["routes"]:
            print(f" {row['href']}: {row['file_count']} files, "
                  f"{len(row['referenced_api_routes'])} API references, "
                  f"{len(row['unresolved_local_imports'])} unresolved imports, "
                  f"{len(row['nonliteral_import_modules'])} dynamic modules")
            print("  " + row["source_closure"] + " " + row["status"])
        print("No quality score or release authorization is inferred.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
