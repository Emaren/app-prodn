#!/usr/bin/env python3
"""Read-only, bounded, deterministic local JS/TS dependency census.

This is static IMPORT evidence, not a bundler or a security certification.
It never executes imported source or mutates release/data/runtime state.
"""
from __future__ import annotations

import argparse
import json
import posixpath
import re
from collections import defaultdict
from pathlib import Path, PurePosixPath
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
MODULE_ROOTS = ("app", "components", "lib", "hooks", "context")
MODULE_SUFFIXES = (".ts", ".tsx", ".js", ".jsx", ".mts", ".mjs")
EXCLUDED_SEGMENTS = frozenset({".next", "node_modules", ".aoe2war-release", "coverage"})
# Quoted specifiers in static import/export lines. Multiline clauses are
# bounded to prevent a source comment or malformed file from scanning MBs.
STATIC_IMPORT_RE = re.compile(
    r"""(?m)^[ \t]*(?:import|export)\s+(?:type\s+)?"""
    r"""(?:[^;'"]{0,750}?\s+from\s+)?["']([^"'\r\n]+)["']"""
)
LITERAL_CALL_RE = re.compile(
    r"""\b(?:import|require)\s*\(\s*["']([^"'\r\n]+)["']\s*\)"""
)
CLIENT_DIRECTIVE_RE = re.compile(r"""^["']use client["'];?$""")
SERVER_IMPORTS = frozenset({"server-only", "node:fs", "node:fs/promises",
                            "node:child_process", "node:net", "node:tls"})


def find_modules(root: Path = ROOT) -> dict[str, Path]:
    modules: dict[str, Path] = {}
    for base_name in MODULE_ROOTS:
        base = root / base_name
        if not base.is_dir():
            continue
        for path in base.rglob("*"):
            if path.suffix not in MODULE_SUFFIXES or path.is_symlink() or not path.is_file():
                continue
            name = path.relative_to(root).as_posix()
            if any(part in EXCLUDED_SEGMENTS for part in PurePosixPath(name).parts):
                continue
            modules[name] = path
    return dict(sorted(modules.items()))


def extract_imports(source: str) -> set[str]:
    """Only lexical import/export and literal import()/require() references."""
    matches = {m.group(1) for m in STATIC_IMPORT_RE.finditer(source)}
    matches.update(m.group(1) for m in LITERAL_CALL_RE.finditer(source))
    return matches


def resolve_import(importer: str, specifier: str, known: set[str]) -> str | None:
    """Resolve in-repository relative and @/ imports; no disk reads/traversal."""
    if specifier.startswith("@/"):
        candidate = specifier[2:]
    elif specifier.startswith("./") or specifier.startswith("../"):
        candidate = posixpath.join(posixpath.dirname(importer), specifier)
    else:
        return None

    candidate = posixpath.normpath(candidate)
    if candidate in {".", ".."} or candidate.startswith("../") or candidate.startswith("/"):
        return None
    if candidate in known:
        return candidate
    for suffix in MODULE_SUFFIXES:
        for path in (candidate + suffix, candidate + "/index" + suffix):
            if path in known:
                return path
    return None


def client_directive(source: str) -> bool:
    # Leading comments and blank lines are legal before the directive.
    for line in source.splitlines()[:24]:
        value = line.strip()
        if not value or value.startswith("//"):
            continue
        return bool(CLIENT_DIRECTIVE_RE.fullmatch(value))
    return False


def strongly_connected(graph: dict[str, set[str]]) -> list[list[str]]:
    """Iterative Kosaraju, deterministic and safe for deep import chains."""
    nodes = sorted(graph)
    reverse: dict[str, set[str]] = {node: set() for node in nodes}
    for start, targets in graph.items():
        for target in targets:
            reverse[target].add(start)

    visited: set[str] = set()
    finished: list[str] = []
    for root in nodes:
        if root in visited:
            continue
        visited.add(root)
        pending = [(root, iter(sorted(graph[root])))]
        while pending:
            node, edges = pending[-1]
            next_node = next(edges, None)
            if next_node is None:
                finished.append(node)
                pending.pop()
            elif next_node not in visited:
                visited.add(next_node)
                pending.append((next_node, iter(sorted(graph[next_node]))))

    assigned: set[str] = set()
    cycles: list[list[str]] = []
    for root in reversed(finished):
        if root in assigned:
            continue
        stack = [root]
        assigned.add(root)
        group: list[str] = []
        while stack:
            node = stack.pop()
            group.append(node)
            for previous in sorted(reverse[node]):
                if previous not in assigned:
                    assigned.add(previous)
                    stack.append(previous)
        if len(group) > 1 or root in graph[root]:
            cycles.append(sorted(group))
    return sorted(cycles, key=lambda group: (-len(group), group))


def inspect(root: Path = ROOT) -> dict[str, Any]:
    files = find_modules(root)
    known = set(files)
    graph: dict[str, set[str]] = {name: set() for name in files}
    raw_imports: dict[str, set[str]] = {}
    client: set[str] = set()
    server: set[str] = set()
    unresolved: list[dict[str, str]] = []
    for name, file in files.items():
        source = file.read_text(encoding="utf-8")
        specifiers = extract_imports(source)
        raw_imports[name] = specifiers
        if client_directive(source):
            client.add(name)
        if specifiers & SERVER_IMPORTS:
            server.add(name)
        for specifier in sorted(specifiers):
            if not (specifier.startswith("@/") or specifier.startswith("./")
                    or specifier.startswith("../")):
                continue
            resolved = resolve_import(name, specifier, known)
            if resolved:
                graph[name].add(resolved)
            elif not specifier.endswith((".css", ".scss", ".json", ".svg", ".png",
                                         ".jpg", ".webp", ".woff", ".woff2")):
                unresolved.append({"importer": name, "specifier": specifier})

    incoming: dict[str, int] = {node: 0 for node in graph}
    for targets in graph.values():
        for target in targets:
            incoming[target] += 1
    cycles = strongly_connected(graph)

    # Import reachability, not a proof of an actual browser bundle violation.
    reachable: set[str] = set(client)
    pending = list(client)
    while pending:
        node = pending.pop()
        for dependency in graph[node]:
            if dependency not in reachable:
                reachable.add(dependency)
                pending.append(dependency)
    client_server_paths = sorted(reachable & server)

    def rank_counts(values: dict[str, int]) -> list[dict[str, Any]]:
        return [
            {"path": node, "count": count}
            for node, count in sorted(values.items(), key=lambda x: (-x[1], x[0]))[:20]
        ]

    return {
        "schema": 1,
        "kind": "aoe2war-static-module-graph",
        "scope": "literal static imports/exports and literal import()/require(); "
                 "Next.js resolver, conditional bundling and TS semantics not certified",
        "module_count": len(files),
        "resolved_edges": sum(map(len, graph.values())),
        "cycle_group_count": len(cycles),
        "cycle_groups": cycles[:30],
        "unresolved_local_count": len(unresolved),
        "unresolved_local_sample": unresolved[:40],
        "client_entry_count": len(client),
        "server_only_import_count": len(server),
        "client_reachable_server_imports": client_server_paths[:40],
        "most_imported": rank_counts(incoming),
        "most_dependencies": rank_counts({p: len(v) for p, v in graph.items()}),
        "interpretation": "Observational refactor evidence only. Never change runtime "
                          "or block finance/settlement based on lexical risk alone.",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--ci", action="store_true",
                        help="run bounded analysis; fail only on analyzer errors, not existing debt")
    args = parser.parse_args()
    try:
        report = inspect()
        if args.json:
            print(json.dumps(report, indent=2, sort_keys=True))
        else:
            print("⚔️  AOE2WAR STATIC MODULE GRAPH")
            for key in ("module_count", "resolved_edges", "cycle_group_count",
                        "unresolved_local_count", "client_entry_count",
                        "server_only_import_count"):
                print(f"  {key}: {report[key]}")
            print("  Client-reachable server-import modules:",
                  len(report["client_reachable_server_imports"]))
            for row in report["most_imported"][:10]:
                print(f"  IN {row['count']:>3}  {row['path']}")
            for group in report["cycle_groups"][:5]:
                print("  CYCLE " + " → ".join(group[:8]))
            print("  Evidence is lexical and read-only, not a release waiver.")
        return 0
    except (OSError, ValueError, UnicodeError) as exc:
        print(f"STOP: module graph census failed: {exc}")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
