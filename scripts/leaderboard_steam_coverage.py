#!/usr/bin/env python3
"""Protected read-only Steam RM/DM coverage census. No database or VPS writes."""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROGRAM = ROOT / "scripts" / "leaderboard_steam_coverage_remote.mjs"


def main() -> None:
    spec = importlib.util.spec_from_file_location(
        "aoe2war_truth", ROOT / "scripts" / "aoe2_truth.py"
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("protected truth observer is missing")
    truth = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(truth)
    truth.REMOTE_PROGRAM = PROGRAM
    payload = truth.run_remote("census")

    if payload.get("kind") != "aoe2war-steam-rating-coverage-census":
        raise RuntimeError("unexpected rating census payload")
    modes = payload.get("databaseReadOnly", {})
    if modes.get("transaction_mode") != "on" or modes.get("default_mode") != "on":
        raise RuntimeError("database read-only proof missing")
    expected = {
        "production": 0, "parserRows": 0, "identityRows": 0,
        "currentRatingRows": 0, "wolo": 0,
    }
    if payload.get("mutations") != expected:
        raise RuntimeError("observer mutation declaration mismatch")
    counts = payload.get("counts")
    if not isinstance(counts, dict):
        raise RuntimeError("missing census totals")
    total = counts.get("publicIdentityRows")
    if not isinstance(total, int) or total < 0:
        raise RuntimeError("invalid public identity denominator")
    parts = ["bothRated", "rmOnly", "dmOnly", "neitherRated"]
    if sum(int(counts.get(key, -1)) for key in parts) != total:
        raise RuntimeError("census conservation failed")

    # Preserve a full local incident-review queue without publishing it.
    receipt = truth.write_receipt("leaderboard-steam-coverage", payload)
    receipt.chmod(0o600)
    print(json.dumps({
        "kind": payload["kind"],
        "observedAt": payload.get("observedAt"),
        "productionSource": payload.get("productionSource"),
        "counts": counts,
        "missingCases": len(payload.get("missingCases", [])),
        "receipt": str(receipt),
        "databaseReadOnly": True,
        "productionMutated": False,
        "woloMutated": False,
    }, indent=2))


if __name__ == "__main__":
    main()
