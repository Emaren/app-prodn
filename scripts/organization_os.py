#!/usr/bin/env python3
"""Organization OS: views over Scan OS's ORIGINAL catalog and sparse source links.

Never scans the filesystem, changes privileges, reads finance, or constructs a
new ledger. Catalog, Index, Contents, Glossary, Encyclopedia, Appendix, Ledger,
and Accounting are projections of one validated source graph.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import stat

from scan_os import load_catalog

ROOT = Path(__file__).resolve().parents[1]
LINKS = ROOT / "config/organization-os-source-links.v1.json"
SCHEMA = "aoe2war.organization-os.source-links.v1"
ID = re.compile(r"^[A-Z][A-Z0-9_]{2,79}$")
TERM_ID = re.compile(r"^[A-Z][A-Z0-9_]{1,79}$")
PATH = re.compile(r"^(scripts|config|docs|lib|ops)/[A-Za-z0-9_./-]+$")
VIEWS = ("catalog", "index", "contents", "glossary", "encyclopedia",
         "appendix", "ledger", "accounting")
NODE_FIELDS = frozenset(("id", "kind", "repo", "path", "owner", "producer",
                         "consumers", "source_location", "runtime_surface",
                         "symlink_to", "symlink_destinations",
                         "dependencies", "retention", "recovery_evidence",
                         "admission"))
VALID_REPOS = frozenset(("Emaren/app-prodn", "Emaren/VPSSentry"))
MAX_INPUT_BYTES = 65536


class OrganizationHold(ValueError):
    pass


def need(condition, reason):
    if not condition:
        raise OrganizationHold("ORGANIZATION_HOLD_" + reason)


def load_links(file=LINKS):
    file = Path(file)
    need(not file.is_symlink() and file.is_file() and
         file.stat().st_size <= MAX_INPUT_BYTES, "LINKS_FILE_BOUNDS")
    fd = os.open(file, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        before = os.fstat(fd)
        need(stat.S_ISREG(before.st_mode) and before.st_nlink == 1
             and before.st_size <= MAX_INPUT_BYTES, "LINKS_FD_BOUNDS")
        content = os.read(fd, MAX_INPUT_BYTES + 1)
        after = os.fstat(fd)
        need((before.st_dev, before.st_ino, before.st_mtime_ns, before.st_size) ==
             (after.st_dev, after.st_ino, after.st_mtime_ns, after.st_size),
             "LINKS_CHANGED_DURING_READ")
    finally:
        os.close(fd)
    def no_duplicates(items):
        out = {}
        for k, v in items:
            need(k not in out, "DUPLICATE_JSON_FIELD")
            out[k] = v
        return out
    return json.loads(content, object_pairs_hook=no_duplicates)


def validate_links(data):
    need(type(data) is dict and
         set(data) == {"schema", "authority", "objects", "unresolved", "terms"}
         and data["schema"] == SCHEMA
         and data["authority"] == "READ_ONLY_SOURCE_GRAPH_NO_EXTRA_SERVICE",
         "SCHEMA_AUTHORITY")
    objects, unresolved, terms = (data[x] for x in ("objects", "unresolved", "terms"))
    need(type(objects) is list and 1 <= len(objects) <= 64
         and type(unresolved) is list and len(unresolved) <= 64
         and type(terms) is list and len(terms) <= 128,
         "COUNT_BOUNDS")
    ids = set()
    sources = set()
    for n in objects:
        need(type(n) is dict and set(n) == NODE_FIELDS, "NODE_FIELDS")
        k = n["id"]
        need(type(k) is str and ID.fullmatch(k) and k not in ids,
             "NODE_DUPLICATE_ID")
        ids.add(k)
        path = n["path"]
        need(type(path) is str and len(path) <= 180 and PATH.fullmatch(path)
             and ".." not in path.split("/") and "//" not in path
             and n["repo"] in VALID_REPOS, "NODE_SOURCE_ESCAPE")
        need((n["repo"], path) not in sources, "DUPLICATE_SOURCE")
        sources.add((n["repo"], path))
        for field in ("kind", "owner", "producer", "source_location",
                      "retention", "admission"):
            need(type(n[field]) is str and 0 < len(n[field]) <= 120,
                 "NODE_REQUIRED_FIELD")
        need(n["retention"] == "PROTECTED_SOURCE" and
             n["recovery_evidence"] is None, "SOURCE_NOT_ERASABLE_OR_RECOVERED")
        need(n["runtime_surface"] is None or
             n["runtime_surface"] in ("HEL1_ROOT", "HEL1_ROOT_AND_DATA"),
             "INVALID_RUNTIME_LOCATION")
        for field in ("consumers", "dependencies", "symlink_destinations"):
            need(type(n[field]) is list and len(n[field]) <= 32 and
                 all(type(v) is str and 0 < len(v) <= 120 for v in n[field]) and
                 len(n[field]) == len(set(n[field])), "NODE_LIST_OR_DUPLICATE")
        need(n["symlink_to"] is None or
             (type(n["symlink_to"]) is str and ID.fullmatch(n["symlink_to"])),
             "BAD_SYMLINK_DESTINATION")
        # A reference never means the path is a real symlink on disk.
        need(n["symlink_destinations"] == [], "SYMLINK_DESTINATIONS_UNVERIFIED")
    for n in objects:
        need(all(dependency in ids and dependency != n["id"]
                 for dependency in n["dependencies"]), "STALE_DEPENDENCY")
        need(n["symlink_to"] is None or n["symlink_to"] in ids,
             "SYMLINK_TO_UNKNOWN_NODE")
    links = {n["id"]: n["dependencies"] + ([n["symlink_to"]]
            if n["symlink_to"] is not None else []) for n in objects}
    visiting, visited = set(), set()
    def visit(k):
        need(k not in visiting, "DEPENDENCY_OR_SYMLINK_CYCLE")
        if k in visited:
            return
        visiting.add(k)
        for dst in links[k]:
            visit(dst)
        visiting.remove(k)
        visited.add(k)
    for k in sorted(ids):
        visit(k)
    for row in unresolved:
        need(type(row) is dict and set(row) == {"id", "source", "needed"}
             and type(row["id"]) is str and ID.fullmatch(row["id"])
             and row["id"] not in ids and
             all(type(row[v]) is str and row[v] for v in ("source", "needed")),
             "UNRESOLVED_BAD_SHAPE")
    term_names = set()
    for term in terms:
        need(type(term) is dict and set(term) == {"term", "definition"}
             and type(term["term"]) is str and TERM_ID.fullmatch(term["term"])
             and term["term"] not in term_names and
             type(term["definition"]) is str and term["definition"],
             "TERM_DUPLICATE_OR_BAD")
        term_names.add(term["term"])
    return data


def graph(links, catalog):
    links = validate_links(links)
    from scan_os import validate_catalog
    c = validate_catalog(catalog)
    original = {item["id"]: item for item in links["objects"]}
    groups = {}
    for s in c["scans"]:
        g = groups.setdefault(s["group"], [])
        g.append(s)
    for group, scans in groups.items():
        p = scans[0]
        node_id = "PRODUCER_" + group
        need(node_id not in original, "GROUP_NODE_ID_COLLISION")
        original[node_id] = {
            "id": node_id, "kind": "SCAN_PRODUCER",
            "repo": p["repo"], "path": p["source_path"],
            "owner": p["owner"], "producer": group,
            "consumers": sorted({s["scope"] for s in scans}),
            "source_location": "SCAN_OS_EXISTING_CATALOG",
            "runtime_surface": None,
            "symlink_to": None, "symlink_destinations": [],
            "dependencies": ["SCAN_OS"], "retention": "PROTECTED_SOURCE",
            "recovery_evidence": None, "admission": p["current_admission"],
            "scan_ids": sorted(s["id"] for s in scans),
            "budget_seconds": p["budget_seconds"],
        }
    # Producer file paths may already be represented by a canonical object:
    # their node relationship is a graph edge, not a second physical copy.
    source_groups = {}
    for n in original.values():
        key = (n["repo"], n["path"])
        source_groups.setdefault(key, []).append(n["id"])
    resolved = sorted(original.values(), key=lambda n: n["id"])
    return {"schema": "aoe2war.organization-os.graph.v1",
            "authority": "SOURCE_GRAPH_ONLY_NOT_RUNTIME_ATTESTATION",
            "objects": resolved, "source_groups": [
                {"repo": repo, "path": path, "object_ids": sorted(ids)}
                for (repo, path), ids in sorted(source_groups.items())],
            "terms": links["terms"], "unresolved": links["unresolved"],
            "scans": [{"id": s["id"], "producer_group": s["group"],
                       "scope": s["scope"], "admission": s["current_admission"]}
                      for s in c["scans"]],
            "no_privileged_service": True,
            "data_copies_created": 0,
            "delete_authorized": False}


def project(g, view):
    need(view in VIEWS, "UNKNOWN_VIEW")
    nodes = g["objects"]
    base = {"schema": "aoe2war.organization-os.view.v1", "view": view,
            "authority": "DERIVED_READ_ONLY_NOT_AN_EXECUTION_PERMIT",
            "source_graph_schema": g["schema"], "delete_authorized": False}
    if view == "catalog":
        base["items"] = [{"id": n["id"], "kind": n["kind"], "owner": n["owner"],
                           "producer": n["producer"], "admission": n["admission"]}
                         for n in nodes]
    elif view == "index":
        base["items"] = [{"id": n["id"], "repo": n["repo"], "source_path": n["path"],
                           "producer": n["producer"],
                           "consumer_refs": n["consumers"]} for n in nodes]
    elif view == "contents":
        base["owners"] = {owner: sorted(n["id"] for n in nodes if n["owner"] == owner)
                          for owner in sorted(set(n["owner"] for n in nodes))}
    elif view == "glossary":
        base["terms"] = sorted(g["terms"], key=lambda n: n["term"])
    elif view == "encyclopedia":
        base["objects"] = nodes
    elif view == "appendix":
        base["unresolved"] = g["unresolved"]
        base["source_aliases"] = [r for r in g["source_groups"]
                                  if len(r["object_ids"]) > 1]
    elif view == "ledger":
        base["entries"] = []
        base["status"] = "EXTERNAL_SIGNED_RECEIPT_LEDGERS_NOT_IMPORTED"
        base["empty_is_not_no_operations"] = True
    elif view == "accounting":
        base["physical_reclaim_bytes"] = None
        base["disjoint_coverage_fraction"] = None
        base["unattributed_residual_bytes"] = None
        base["status"] = "ORIGINAL_CAPACITY_AND_RETIRE_LEDGERS_REQUIRED"
        base["no_gross_byte_summation"] = True
    return base


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--view", choices=VIEWS, default="catalog")
    a = ap.parse_args()
    try:
        result = project(graph(load_links(), load_catalog()), a.view)
    except (OrganizationHold, OSError, ValueError, TypeError, KeyError) as e:
        print(json.dumps({"status": "HOLD", "reason": str(e),
                          "delete_authorized": False}))
        return 3
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
