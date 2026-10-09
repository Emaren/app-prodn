#!/usr/bin/env python3
"""Second-stage guarded read-only Steam RM/DM rating-provenance gate census."""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROGRAM = ROOT / "scripts" / "leaderboard_steam_gate_remote.mjs"


def main() -> None:
    spec = importlib.util.spec_from_file_location(
        "aoe2war_truth", ROOT / "scripts" / "aoe2_truth.py"
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("protected truth observer unavailable")
    truth = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(truth)
    truth.REMOTE_PROGRAM = PROGRAM
    payload = truth.run_remote("census")

    if payload.get("kind") != "aoe2war-steam-rating-gate-funnel":
        raise RuntimeError("unexpected gate-funnel result")
    proof = payload.get("databaseReadOnly")
    if not isinstance(proof, list) or len(proof) != 1 or not isinstance(proof[0], dict):
        raise RuntimeError("database read-only proof absent or malformed")
    if proof[0].get("transaction_mode") != "on" or proof[0].get("default_mode") != "on":
        raise RuntimeError("database read-only proof failed")
    expected = {"production": 0, "parserRows": 0, "identityRows": 0,
                "currentRatingRows": 0, "wolo": 0}
    if payload.get("mutations") != expected:
        raise RuntimeError("production/Wolo mutation assertion mismatch")
    counts = payload.get("counts")
    stages = payload.get("histogram")
    if not isinstance(counts, dict) or not isinstance(stages, dict):
        raise RuntimeError("counts and histogram required")
    total = counts.get("publicIdentityRows")
    if type(total) is not int or total <= 0:
        raise RuntimeError("invalid identity denominator")
    no_id = counts.get("noExactSteamIdentity")
    for lane in ("rm", "dm"):
        rated = counts.get(lane + "Rated")
        missing = counts.get(lane + "Missing")
        histogram = stages.get(lane)
        if not isinstance(histogram, dict) or len(histogram) != 9:
            raise RuntimeError("gate histogram malformed")
        if any(type(v) is not int or v < 0 for v in histogram.values()):
            raise RuntimeError("gate histogram contains invalid counts")
        if rated + missing != total or sum(histogram.values()) + no_id != missing:
            raise RuntimeError("gate histogram conservation failed")

    receipt = truth.write_receipt("leaderboard-steam-gate-funnel", payload)
    receipt.chmod(0o600)
    print(json.dumps({
        "observedAt": payload.get("observedAt"),
        "productionSource": payload.get("productionSource"),
        "counts": counts,
        "histogram": stages,
        "receipt": str(receipt),
        "readOnly": True,
        "productionMutated": False,
        "woloMutated": False,
    }, indent=2))


if __name__ == "__main__":
    main()
