#!/usr/bin/env python3
"""Read-only Kingdom 100 name and alias lookup; never executes a catalog command."""
import argparse
import json
import re
from pathlib import Path

REGISTRY = Path(__file__).resolve().parents[1] / "config/aoe2war-os-registry.v1.json"

def normalize(value):
    return " ".join(re.findall(r"[a-z0-9]+", value.casefold()))

def load_catalog(path=REGISTRY):
    registry = json.loads(path.read_text(encoding="utf-8"))
    catalog = registry["kingdom_100"]
    rows = catalog["slots"]
    if catalog["authority"] != "SOURCE_ONLY_CATALOG_NO_EXECUTION" or len(rows) != 100 or [r["slot"] for r in rows] != list(range(1, 101)):
        raise ValueError("INVALID_ROSTER")
    if catalog["verified_live_workers"] is not None:
        raise ValueError("UNVERIFIED_LIVE_COUNT")
    ids = {r["canonical_id"] for r in registry["subordinate_os"]}
    seen = {}
    for row in rows:
        n = row["slot"]
        if row["live_proof"] != "UNVERIFIED" or (row["canonical_id"] is not None and row["canonical_id"] not in ids):
            raise ValueError("INVALID_AUTHORITY")
        for key in ("parent_slot", "owner_slot"):
            target = row[key]
            if target is not None and (type(target) is not int or not 1 <= target <= 100):
                raise ValueError("INVALID_LINK")
        if row["owner_slot"] is None:
            raise ValueError("MISSING_OWNER_ROUTE")
        for name in [row["name"], *row["aliases"]]:
            k = normalize(name)
            if not k or k in seen:
                raise ValueError("DUPLICATE_NAME_OR_ALIAS")
            seen[k] = n
        visited = {n}
        parent = row["parent_slot"]
        while parent is not None:
            if type(parent) is not int or not 1 <= parent <= 100 or parent in visited:
                raise ValueError("PARENT_CYCLE_OR_INVALID")
            visited.add(parent)
            parent = rows[parent - 1]["parent_slot"]
    if {r["canonical_id"] for r in rows if r["canonical_id"] is not None} != ids:
        raise ValueError("REGISTERED_ID_COVERAGE")
    return rows

def lookup(rows, query):
    q = normalize(query)
    if not q:
        raise ValueError("EMPTY_QUERY")
    exact = [r for r in rows if q in [normalize(r["name"]), *(normalize(a) for a in r["aliases"])]]
    if exact:
        return exact
    return [r for r in rows if q in normalize(" ".join([r["name"], *r["aliases"], r["focus"]]))]

def packet(rows, row):
    result = dict(row)
    result["parent_name"] = "AoE2WAR OS" if row["parent_slot"] is None else rows[row["parent_slot"] - 1]["name"]
    result["owner_route"] = rows[row["owner_slot"] - 1]["name"]
    result["execution_authorized"] = False
    return result

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("action", choices=["list", "lookup", "validate"])
    p.add_argument("query", nargs="?")
    a = p.parse_args()
    rows = load_catalog()
    if a.action == "validate":
        value = {"status": "PASS", "names": len(rows), "execution_authorized": False}
    elif a.action == "list":
        value = [packet(rows, r) for r in rows]
    else:
        if not a.query:
            p.error("lookup requires a name or alias")
        value = [packet(rows, r) for r in lookup(rows, a.query)]
    print(json.dumps(value, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    main()
