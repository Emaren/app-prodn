#!/usr/bin/env python3
"""Protected read-only canary: SHA-verified archived HD header reparse."""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REMOTE = ROOT / "scripts" / "leaderboard_steam_archive_parser_remote.mjs"


def validate(payload: object) -> dict:
    if not isinstance(payload, dict) or payload.get("kind") != (
        "aoe2war-archived-hd-rating-parser-canary"
    ) or payload.get("schemaVersion") != 1:
        raise RuntimeError("unexpected archive parser canary response")
    ro = payload.get("databaseReadOnly")
    if (not isinstance(ro, list) or len(ro) != 1 or
        not isinstance(ro[0], dict) or
        ro[0].get("transaction_mode") != "on" or
        ro[0].get("default_mode") != "on"):
        raise RuntimeError("read-only database proof failed")
    expected = {
        "production": 0, "parserRows": 0, "identityRows": 0,
        "currentRatingRows": 0, "wolo": 0,
    }
    if payload.get("mutations") != expected:
        raise RuntimeError("production mutation assertion failed")
    data = payload.get("summary")
    if not isinstance(data, dict):
        raise RuntimeError("missing canary summary")
    nums = (
        "publicUnratedExactSteamIds", "unmarkedWatchersWithBothNumbers",
        "scannedGameRows", "scanBatches", "selectedSampleLimit",
        "sampleFilesLocated", "sampleHashesVerified", "sampleHashMismatch",
        "sampleTooLarge", "parserParsed", "parserNoProjection",
        "parserTimeout", "parserError", "invalidParserOutput",
        "sameSteamIdentityPresent", "uniquelyBoundSteamIdentity",
        "headerRmPresent", "headerDmPresent", "headerBothPresent",
        "headerRmMatchesStored", "headerDmMatchesStored",
        "headerRmDiffersStored", "headerDmDiffersStored",
    )
    for name in nums:
        if type(data.get(name)) is not int or data[name] < 0:
            raise RuntimeError(f"invalid canary counter: {name}")
    for name in ("apiPythonAvailable", "archiveAccessible"):
        if type(data.get(name)) is not bool:
            raise RuntimeError("canary environment proof malformed")
    total = data["sampleHashesVerified"]
    if (not 0 <= total <= data["selectedSampleLimit"] <= 6 or
        data["parserParsed"] + data["parserNoProjection"] +
        data["parserTimeout"] + data["parserError"] +
        data["invalidParserOutput"] < total or
        data["uniquelyBoundSteamIdentity"] > data["parserParsed"] or
        data["headerRmPresent"] > data["uniquelyBoundSteamIdentity"] or
        data["headerDmPresent"] > data["uniquelyBoundSteamIdentity"] or
        data["headerBothPresent"] > min(
            data["headerRmPresent"], data["headerDmPresent"]) or
        data["headerRmMatchesStored"] + data["headerRmDiffersStored"] !=
            data["headerRmPresent"] or
        data["headerDmMatchesStored"] + data["headerDmDiffersStored"] !=
            data["headerDmPresent"]):
        raise RuntimeError("replay parser canary conservation failure")
    return data


def main() -> None:
    spec = importlib.util.spec_from_file_location(
        "aoe2war_truth", ROOT / "scripts" / "aoe2_truth.py"
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("protected truth observer unavailable")
    truth = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(truth)
    truth.REMOTE_PROGRAM = REMOTE
    payload = truth.run_remote("census")
    summary = validate(payload)
    receipt = truth.write_receipt("leaderboard-steam-archive-parser", payload)
    receipt.chmod(0o600)
    print(json.dumps({
        "observedAt": payload.get("observedAt"),
        "productionSource": payload.get("productionSource"),
        "summary": summary,
        "receipt": str(receipt),
        "readOnly": True,
        "productionMutated": False,
        "woloMutated": False,
    }, indent=2))


if __name__ == "__main__":
    main()
