#!/usr/bin/env python3
"""Read-only source + optional replay post-ingest report diagnostic.

Distinguishes upload, parser, result, and market stages. It does not access
databases, RPC, wallets, private keys, live web services or execute settlement.
Source-check is a limited known-symbol observation, not a transitive proof.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAX_SOURCE = 2_000_000
MAX_REPORT = 131072
STAGES = (
    ("upload_auth", "app/api/replay/upload/route.ts",
     ("export async function POST(", "resolveWatcherTelemetryIdentity(", "coordinateReplayPostIngest(")),
    ("internal_post_ingest", "app/api/replay/post-ingest/route.ts",
     ("internalApiKeyMatches(", "classifyReplayIngestReceipt(", "coordinateReplayPostIngest(")),
    ("receipt_and_finality", "lib/replayPostIngest.ts",
     ("export function classifyReplayIngestReceipt(", "export async function coordinateReplayPostIngest(",
      "await dependencies.ensureBetMarkets(")),
    ("parser_contract", "lib/replayEngineRoom.ts",
     ("HD_REPLAY_PARSER_BASE_CONTRACT", "export const HD_REPLAY_PARSER_CONTRACT")),
    ("canonical_team_integrity", "lib/teamResolution.ts",
     ("export function normalizeReplayPlayers(", "export function validateMarketFinalIntegrity(")),
    ("watcher_identity", "lib/watcherTelemetry.ts",
     ("export async function resolveWatcherTelemetryIdentity(",)),
    ("owner_scoped_shadow", "lib/betAutomationShadowWorker.ts",
     ("export async function runBetAutoShadowWorker(", "options.activeSessions.flatMap(")),
)
STAGE_KEYS = (
    ("automatic", "results"), ("automatic", "identities"),
    ("warGraph", None), ("financial", "tournament"), ("financial", "markets"),
)


def _read(path: Path, max_bytes: int) -> bytes | None:
    try:
        if path.is_symlink() or not path.is_file() or path.stat().st_size > max_bytes:
            return None
        data = path.read_bytes()
        return data if len(data) <= max_bytes else None
    except OSError:
        return None


def inspect_source(root: Path) -> dict:
    stages = []
    files = {}
    for name, rel, symbols in STAGES:
        if rel not in files:
            data = _read(root / rel, MAX_SOURCE)
            try:
                source = data.decode("utf-8") if data is not None else None
            except UnicodeError:
                source = None
            files[rel] = (source, hashlib.sha256(data).hexdigest() if source is not None else None)
        source, digest = files[rel]
        evidence = []
        for symbol in symbols:
            line = None if source is None else next(
                (i for i, text in enumerate(source.splitlines(), 1) if symbol in text), None)
            evidence.append({"symbol": symbol, "observed_line": line})
        status = "UNKNOWN_SOURCE" if source is None else "SOURCE_DRIFT" if any(
            item["observed_line"] is None for item in evidence) else "KNOWN_SYMBOLS_OBSERVED"
        stages.append({"stage": name, "path": rel, "sha256": digest, "status": status, "symbols": evidence})
    source = files.get("lib/replayEngineRoom.ts", (None, None))[0]
    parser = {"parser_name": None, "parser_version": None, "pass_version": None}
    if source is not None:
        # Extract only *literals* from the current canonical contract, do not
        # accept the historical PASS8 contract in its place.
        base = re.search(r"const HD_REPLAY_PARSER_BASE_CONTRACT\s*=\s*\{(.*?)\}", source, re.S)
        current = re.search(r"export const HD_REPLAY_PARSER_CONTRACT\s*=\s*\{(.*?)\}", source, re.S)
        if base and current:
            def field(block, key):
                match = re.search(r"\b" + key + r"\s*:\s*['\"]([^'\"]+)['\"]", block)
                return match.group(1) if match else None
            parser = {
                "parser_name": field(base.group(1), "parserName"),
                "parser_version": field(base.group(1), "parserVersion"),
                "pass_version": field(current.group(1), "passVersion"),
            }
    return {
        "status": "KNOWN_SOURCE_CONTRACT_PRESENT" if all(
            s["status"] == "KNOWN_SYMBOLS_OBSERVED" for s in stages) and all(parser.values())
            else "UNKNOWN_OR_DRIFTED_SOURCE_CONTRACT",
        "parser_contract": parser, "stages": stages,
    }


def _nonnegative_int(value) -> bool:
    return type(value) is int and 0 <= value <= 1_000_000


def _dupes_fail(pairs):
    record = {}
    for k, v in pairs:
        if k in record:
            raise ValueError("duplicate_json_key")
        record[k] = v
    return record


def inspect_report(path: Path) -> dict:
    raw = _read(path, MAX_REPORT)
    if raw is None:
        return {"status": "INVALID_OR_UNAVAILABLE_RECEIPT", "safe_to_deploy": False}
    try:
        obj = json.loads(raw.decode("utf-8"), object_pairs_hook=_dupes_fail,
                         parse_constant=lambda _: (_ for _ in ()).throw(ValueError("invalid_constant")))
    except (ValueError, UnicodeError, RecursionError):
        return {"status": "INVALID_OR_UNAVAILABLE_RECEIPT", "safe_to_deploy": False}
    try:
        if not isinstance(obj, dict):
            raise ValueError("not_object")
        count_keys = {
            "receipt_count": obj["receiptCount"], "accepted": obj["acceptedCount"],
            "archived": obj["storage"]["archivedCount"],
            "parser_completed": obj["parser"]["completedCount"],
            "parser_pending": obj["parser"]["pendingCount"],
            "trusted_results": obj["result"]["trustedCount"],
            "ready_results": obj["result"]["readyCount"],
            "stats_eligible": obj["statistics"]["eligibleCount"],
            "financial_eligible": obj["financial"]["eligibleCount"],
        }
        if not all(_nonnegative_int(v) for v in count_keys.values()):
            raise ValueError("bad_count")
        if count_keys["accepted"] > count_keys["receipt_count"]:
            raise ValueError("impossible_accepted_count")
        stages = []
        for group, name in STAGE_KEYS:
            value = obj[group] if name is None else obj[group][name]
            if not isinstance(value, dict) or type(value["requested"]) is not bool or type(value["attempted"]) is not bool:
                raise ValueError("bad_stage")
            succeeded = value["succeeded"]
            if succeeded is not None and type(succeeded) is not bool:
                raise ValueError("bad_succeeded")
            if value["attempted"] and not value["requested"]:
                raise ValueError("unrequested_attempt")
            state = ("NOT_REQUESTED" if not value["requested"] else
                     "NOT_ATTEMPTED" if not value["attempted"] else
                     "REPORTED_SUCCESS" if succeeded is True else
                     "REPORTED_FAILURE" if succeeded is False else "INDETERMINATE")
            stages.append({"stage": f"{group}.{name}" if name else group, "state": state})
        if count_keys["accepted"] == 0:
            meaning = "NO_ACCEPTED_UPLOAD"
        elif not count_keys["parser_completed"]:
            meaning = "UPLOAD_ACCEPTED_PARSE_NOT_COMPLETE"
        elif not count_keys["ready_results"]:
            meaning = "PARSED_BUT_NO_READY_RESULT"
        elif not count_keys["financial_eligible"]:
            meaning = "RESULT_READY_BUT_FINANCIAL_ELIGIBILITY_ZERO"
        else:
            meaning = "FINANCIAL_ELIGIBILITY_REPORTED_NOT_CUSTODY_PROOF"
        incomplete = any(s["state"] in ("NOT_ATTEMPTED", "REPORTED_FAILURE", "INDETERMINATE") for s in stages)
        return {
            "status": "REPORTED_STAGE_FAILURE_OR_UNCERTAINTY" if incomplete else "STRUCTURED_RECEIPT_PARSED",
            "meaning": meaning, "counts": count_keys, "stage_executions": stages,
            "result_or_chain_finality_certified": False,
            "actual_bank_or_custody_certified": False,
            "safe_to_deploy": False,
            "notes": [
                "Accepted/archived is not parsed; parsed is not result-trusted; result-ready is not financial eligibility.",
                "Reported successful market reconciliation is not a verified chain payout or real-funded Satchel receipt.",
                "Receipt is untrusted caller-supplied data unless independently sourced; errors and identifiers are not re-emitted.",
            ],
        }
    except (KeyError, TypeError, ValueError, AttributeError):
        return {"status": "INVALID_OR_UNAVAILABLE_RECEIPT", "safe_to_deploy": False}


def inspect(root: Path, report: Path | None = None) -> dict:
    return {
        "schema": "aoe2war.replay_stage_radar.v1",
        "classification": "SOURCE_AND_UNTRUSTED_RECEIPT_DIAGNOSTIC_ONLY",
        "source": inspect_source(root),
        "report": inspect_report(report) if report is not None else None,
        "production_proven": False, "cross_repo_parser_binary_proven": False,
        "wolo_financial_release_authorized": False, "safe_to_deploy": False,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--report", type=Path, help="optional local ReplayPostIngestReport JSON, never networked")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--check-source", action="store_true", help="exit 2 on missing/drifted known source, not a financial gate")
    args = parser.parse_args()
    result = inspect(args.root, args.report)
    output = json.dumps(result, indent=2, sort_keys=True) + "\n"
    if args.output:
        args.output.write_text(output, encoding="utf-8")
    print(output, end="")
    return 2 if args.check_source and result["source"]["status"] != "KNOWN_SOURCE_CONTRACT_PRESENT" else 0


if __name__ == "__main__":
    raise SystemExit(main())
