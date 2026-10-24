#!/usr/bin/env python3
"""Read-only, bounded tripwire for *known* public-read -> financial-wakeup paths.

This is deliberately NOT an AST proof of transitive side-effect freedom, a runtime
producer fence, bank attestation, custody permit, or deployment authorization.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = "aoe2war.financial_public_read_tripwire.v1"
MAX_BYTES = 2 * 1024 * 1024
# Known positive dependency edges, pinned to source observations; expanding this
# list does not make the rest of the application safe or accounted for.
PUBLIC_READ_MODULES = (
    "app/api/bets/route.ts",
    "app/api/live-games/route.ts",
    "app/api/header-summary/route.ts",
    "lib/lobbySnapshot.ts",
    "lib/warChest.ts",
)
FINANCIAL_SINK_MODULES = (
    "lib/betMarketEnsureQueue.ts",
    "lib/bets.ts",
)
# Each invocation here can trigger a financially relevant reconciliation path.
# Known source versions also include process-local delayed timers and callbacks.
WAKE_CALLS = (
    "queueBetMarketEnsure",
    "queueLobbyMaintenance",
    "ensureBetMarkets",
    "reconcileTournamentMatchProofs",
    "settleResolvedMarketWagers",
    "reconcilePendingCoreBetClaims",
    "settleFounderBonuses",
)
TRUST_LIMITATIONS = (
    "Conservative identifier-call heuristic, not a TypeScript AST / complete call graph",
    "Does not follow computed calls, re-exports, templates or every indirect import",
    "Does not inspect running binaries, timers, systemd units, DB triggers or external wallets",
    "Zero observed direct wakeups does not prove market liveness or refund deadlines",
    "No financial release authority; WoloChain independent six-control HOLD remains",
)


def _source(root: Path, rel: str) -> dict:
    path = root / rel
    try:
        if path.is_symlink() or not path.is_file():
            raise ValueError("missing_or_symlink")
        if path.stat().st_size > MAX_BYTES:
            raise ValueError("oversize")
        raw = path.read_bytes()
        if len(raw) > MAX_BYTES:
            raise ValueError("oversize")
        content = raw.decode("utf-8")
    except (OSError, UnicodeError, ValueError):
        return {"path": rel, "status": "UNKNOWN_SOURCE", "sha256": None, "content": None}
    return {"path": rel, "status": "SOURCE_READ", "sha256": hashlib.sha256(raw).hexdigest(), "content": content}


def _strip_literals(source: str) -> str:
    """Blank JS/TS comments, strings and template literals, retain newlines."""
    out = list(source)
    i = 0
    size = len(source)
    while i < size:
        begin = i
        quote = None
        if source.startswith("//", i):
            i += 2
            while i < size and source[i] != "\n":
                i += 1
        elif source.startswith("/*", i):
            i += 2
            closing = source.find("*/", i)
            i = size if closing < 0 else closing + 2
        elif source[i] in "'\"`":
            quote = source[i]
            i += 1
            while i < size:
                if source[i] == "\\":
                    i += 2
                elif source[i] == quote:
                    i += 1
                    break
                else:
                    i += 1
        else:
            i += 1
            continue
        for j in range(begin, min(i, size)):
            if out[j] != "\n":
                out[j] = " "
    return "".join(out)


def _import_aliases(source: str) -> dict[str, set[str]]:
    """Recognize ordinary named imports; unrecognized import syntax is not a proof."""
    names = {name: {name} for name in WAKE_CALLS}
    scrubbed = _strip_literals(source)
    # Source spans preserve character offsets after scrubbing; match import
    # declarations in code rather than comment-looking text.
    for match in re.finditer(r"\bimport\s*\{([^{}]*)\}\s*from\s*(['\"])([^'\"\n]+)\2", source):
        if "@/lib/" not in match.group(3):
            continue
        if not scrubbed[match.start():match.start()+6].strip() == "import":
            continue
        for spec in match.group(1).split(","):
            match_name = re.fullmatch(r"\s*(\w+)\s*(?:as\s+(\w+)\s*)?", spec)
            if match_name and match_name.group(1) in names:
                names[match_name.group(1)].add(match_name.group(2) or match_name.group(1))
    return names


def _wakes(source: str) -> list[dict]:
    code = _strip_literals(source)
    aliases = _import_aliases(source)
    hits = []
    for original in WAKE_CALLS:
        for local in sorted(aliases[original]):
            for match in re.finditer(r"(?<![\w$])" + re.escape(local) + r"\s*\(", code):
                # Definition declarations of private helpers aren't an
                # invocation; capture the subsequent call instead.
                preceding = code[max(0, match.start()-32):match.start()]
                if re.search(r"(?:function|type|interface)\s*$", preceding):
                    continue
                hits.append({"callee": original, "as": local,
                             "line": source.count("\n", 0, match.start()) + 1})
    return sorted(hits, key=lambda item: (item["line"], item["callee"], item["as"]))


def inspect(root: Path) -> dict:
    root = root.resolve()
    reads = []
    for rel in PUBLIC_READ_MODULES:
        record = _source(root, rel)
        content = record.pop("content")
        calls = _wakes(content) if content is not None else []
        reads.append({**record, "calls": calls, "has_known_wakeup": bool(calls)})
    sinks = []
    for rel in FINANCIAL_SINK_MODULES:
        record = _source(root, rel)
        content = record.pop("content")
        sinks.append({**record, "known_sink_calls": _wakes(content) if content is not None else []})
    unknown = [x["path"] for x in (*reads, *sinks) if x["status"] != "SOURCE_READ"]
    vulnerable = [x["path"] for x in reads if x["has_known_wakeup"]]
    status = ("UNKNOWN_SOURCE" if unknown else
              "KNOWN_PUBLIC_READ_WAKEUPS_PRESENT" if vulnerable else
              "NO_KNOWN_DIRECT_PUBLIC_READ_WAKEUPS")
    return {
        "schema": SCHEMA,
        "status": status,
        "classification": "SOURCE_TRIPWIRE_NOT_RELEASE_AUTHORITY",
        "known_public_read_wakeup_count": len(vulnerable),
        "known_public_read_wakeup_paths": vulnerable,
        "unknown_source_paths": unknown,
        "all_financial_producers_isolated": False,
        "safe_to_deploy": False,
        "financial_release_authorized": False,
        "independent_bank_and_wolo_controls": "UNVERIFIED",
        "public_reads": reads,
        "sink_source_probes": sinks,
        "limitations": list(TRUST_LIMITATIONS),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--output", type=Path, help="write read-only JSON to this path")
    parser.add_argument("--check", action="store_true", help="exit 2 on any known wakeup OR unknown source")
    args = parser.parse_args()
    report = inspect(args.root)
    result = json.dumps(report, sort_keys=True, indent=2) + "\n"
    if args.output:
        args.output.write_text(result, encoding="utf-8")
    print(result, end="")
    return 2 if args.check and report["status"] != "NO_KNOWN_DIRECT_PUBLIC_READ_WAKEUPS" else 0


if __name__ == "__main__":
    raise SystemExit(main())
