#!/usr/bin/env python3
"""Read-only, PRIVATE overlap of v3 archive candidates with Watcher display.

The server exports hashed positive Watcher DISPLAY observations only.
An absent row is NOT evidence that no Watcher authority exists.
No public rating updates, DB changes, replay rewriting or WOLO operations.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

# Direct `python3 scripts/...` execution sets sys.path[0] to scripts/,
# unlike unittest discovery. Add this repository root before project imports.
ROOT = Path(__file__).resolve().parents[1]
if __package__ in (None, "") and str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.leaderboard_steam_archive_parser import validate as validate_archive
from scripts.leaderboard_steam_history_policy import (
    extract_candidate_evidence,
    resolve_historical_lane,
)

REMOTE = ROOT / "scripts" / "leaderboard_steam_watcher_overlap_remote.mjs"
FINGERPRINT = re.compile(r"[a-f0-9]{64}\Z")


def validate_overlay(payload: dict) -> dict[str, dict]:
    if (not isinstance(payload, dict) or payload.get("kind") !=
        "aoe2war-qualified-watcher-positive-display-snapshot" or
        payload.get("schemaVersion") != 1 or
        payload.get("sourceCompletenessProven") is not False or
        payload.get("labelsAreAllSigned") is not False or
        payload.get("absenceIsNotEvidence") is not True):
        raise RuntimeError("Watcher positive-only display contract invalid")
    proof = payload.get("databaseReadOnly")
    if (not isinstance(proof, list) or len(proof) != 1 or
        not isinstance(proof[0], dict) or
        proof[0].get("transaction_mode") != "on" or
        proof[0].get("default_mode") != "on"):
        raise RuntimeError("Watcher database read-only proof absent")
    if payload.get("mutations") != {
        "production": 0, "parserRows": 0, "identityRows": 0,
        "currentRatingRows": 0, "wolo": 0
    }:
        raise RuntimeError("Watcher observer mutation assertion invalid")
    counts = payload.get("sourceCounts")
    if (not isinstance(counts, dict) or
        set(counts) != {
            "immutableReceiptIdentityRows", "qualifiedDisplayIdentityRows",
            "positiveDisplayIdentities"
        } or any(type(n) is not int or n < 0 or n > 100000 for n in
                  counts.values())):
        raise RuntimeError("Watcher source counts invalid")
    rows = payload.get("rows")
    if not isinstance(rows, list) or len(rows) != counts["positiveDisplayIdentities"]:
        raise RuntimeError("Watcher snapshot row conservation failed")

    indexed = {}
    for entry in rows:
        if (not isinstance(entry, dict) or set(entry) != {
            "identityFingerprint", "rmRating", "rmObservedAt",
            "dmRating", "dmObservedAt"
        }):
            raise RuntimeError("Watcher display row malformed")
        fp = entry["identityFingerprint"]
        if (not isinstance(fp, str) or FINGERPRINT.fullmatch(fp) is None or
            fp in indexed):
            raise RuntimeError("Watcher identity hash invalid or duplicated")
        for lane in ("rm", "dm"):
            rating = entry[lane + "Rating"]
            at = entry[lane + "ObservedAt"]
            if (rating is None) != (at is None):
                raise RuntimeError("Watcher value-clock coherence failure")
            if rating is not None:
                if (type(rating) is not int or not 1 <= rating <= 5000 or
                    not isinstance(at, str) or
                    not at.endswith("Z")):
                    raise RuntimeError("Watcher display value invalid")
                try:
                    parsed = datetime.fromisoformat(at.replace("Z", "+00:00"))
                except ValueError as error:
                    raise RuntimeError("Watcher display clock invalid") from error
                if parsed.tzinfo is None:
                    raise RuntimeError("Watcher timestamp lacks timezone")
        if entry["rmRating"] is None and entry["dmRating"] is None:
            raise RuntimeError("Watcher positive row has no positive lanes")
        indexed[fp] = entry
    return indexed


def reconcile(archive_payload: dict, watcher_payload: dict) -> dict:
    if not isinstance(archive_payload, dict):
        raise RuntimeError("missing private archive evidence")
    wave = archive_payload.get("summary", {}).get("sampleWave")
    if type(wave) is not int:
        raise RuntimeError("private archive wave malformed")
    validate_archive(archive_payload, expected_wave=wave)
    candidates = extract_candidate_evidence([archive_payload])
    watcher_by_hash = validate_overlay(watcher_payload)
    summary = {
        "historicalCandidateIdentities": len(candidates),
        "historicalLanesEvaluated": 2 * len(candidates),
        "positiveWatcherDisplayLanes": 0,
        "unknownWatcherAbsenceLanes": 0,
        "historicalValuesMatchingWatcher": 0,
        "historicalValuesDifferingWatcher": 0,
        "publishedLastKnownSteamRatings": 0,
        "currentWatcherStatusesInvented": 0,
    }
    records = []
    for candidate in candidates:
        sid = candidate["steamId"]
        fp = hashlib.sha256(
            ("aoe2war-archived-identity-v1:" + sid).encode()
        ).hexdigest()
        remote = watcher_by_hash.get(fp)
        row = {"identityFingerprint": fp, "replaySha256": candidate["replaySha256"],
               "gameStatsId": candidate["gameStatsId"], "lanes": {}}
        for lane in ("rm", "dm"):
            history = resolve_historical_lane(sid, lane, [candidate])
            if history["source"] != "last_known_header":
                raise RuntimeError("previously validated historical candidate rejected")
            watcher_rating = remote[lane + "Rating"] if remote else None
            watcher_at = remote[lane + "ObservedAt"] if remote else None
            if watcher_rating is None:
                summary["unknownWatcherAbsenceLanes"] += 1
                row["lanes"][lane] = {
                    "status": "watcher_absence_not_proven",
                    "historicalCandidateValue": history["value"],
                    "historicalPlayedOn": history["observedAt"],
                    "displayDecision": None,
                }
                continue
            qualified = {"steamId": sid, "lane": lane,
                         "rating": watcher_rating, "observedAt": watcher_at}
            result = resolve_historical_lane(
                sid, lane, [candidate], qualified_watcher=qualified
            )
            if result["source"] != "current_watcher" or result["value"] != watcher_rating:
                raise RuntimeError("qualified Watcher precedence failed")
            summary["positiveWatcherDisplayLanes"] += 1
            name = ("historicalValuesMatchingWatcher" if watcher_rating ==
                    history["value"] else "historicalValuesDifferingWatcher")
            summary[name] += 1
            row["lanes"][lane] = {
                "status": "qualified_watcher_display_precedence",
                "historicalCandidateValue": history["value"],
                "historicalPlayedOn": history["observedAt"],
                "watcherDisplayValue": watcher_rating,
                "watcherObservedAt": watcher_at,
                "displayDecision": watcher_rating,
            }
        records.append(row)
    if (summary["historicalLanesEvaluated"] !=
        summary["positiveWatcherDisplayLanes"] +
        summary["unknownWatcherAbsenceLanes"] or
        summary["positiveWatcherDisplayLanes"] !=
        summary["historicalValuesMatchingWatcher"] +
        summary["historicalValuesDifferingWatcher"]):
        raise RuntimeError("Watcher overlap counts not conserved")
    return {
        "kind": "aoe2war-steam-historical-positive-watcher-overlap",
        "schemaVersion": 1,
        "archiveWave": wave,
        "sourceArchiveParser": archive_payload["summary"]["apiParserSource"],
        "sourceProductionRevision": archive_payload.get("productionSource"),
        "watcherProductionRevision": watcher_payload.get("productionSource"),
        "sourceCompletenessProven": False,
        "absenceIsNotEvidence": True,
        "labelsAreAllSigned": False,
        "sourceCounts": dict(watcher_payload["sourceCounts"]),
        "summary": summary,
        "records": records,
        "mutations": watcher_payload["mutations"],
    }


def latest_v3_receipt(directory: Path, wave: int) -> tuple[Path, dict]:
    pattern = f"*-leaderboard-steam-archive-parser-wave-{wave}.json"
    for path in sorted(directory.glob(pattern), reverse=True):
        if (path.stat().st_mode & 0o077) != 0:
            raise RuntimeError("private archive receipt permissions unsafe")
        envelope = json.loads(path.read_text(encoding="utf-8"))
        payload = envelope.get("payload") if isinstance(envelope, dict) else None
        if isinstance(payload, dict) and payload.get("schemaVersion") == 3:
            validate_archive(payload, wave)
            return path, payload
    raise RuntimeError("no private schema-v3 archived Steam candidate receipt")


def write_private_overlap(directory: Path, payload: dict) -> Path:
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    now = datetime.now(timezone.utc)
    serialized = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    digest = hashlib.sha256(serialized.encode()).hexdigest()[:16]
    path = directory / (
        f"{now:%Y%m%dT%H%M%SZ}-{digest}-steam-watcher-positive-overlap.json"
    )
    fd = os.open(path, os.O_CREAT | os.O_WRONLY | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(payload, f, sort_keys=True, indent=2)
        f.write("\n")
        f.flush()
        os.fsync(f.fileno())
    return path


def main(wave: int = 4) -> None:
    if type(wave) is not int or not 0 <= wave <= 78:
        raise RuntimeError("unsafe archive evidence wave")
    spec = importlib.util.spec_from_file_location(
        "aoe2war_truth", ROOT / "scripts" / "aoe2_truth.py"
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("protected truth runner unavailable")
    truth = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(truth)
    _source_path, historic = latest_v3_receipt(truth.RECEIPT_DIR, wave)
    truth.REMOTE_PROGRAM = REMOTE
    # Remote shell verifies a clean, unchanged production app, live service,
    # and the DB's transaction/default read-only settings before observation.
    remote = truth.run_remote("census", 0)
    overview = reconcile(historic, remote)
    previous = os.umask(0o077)
    try:
        receipt = write_private_overlap(truth.RECEIPT_DIR, overview)
    finally:
        os.umask(previous)
    print(json.dumps({
        "observedAt": remote.get("observedAt"),
        "archiveWave": wave,
        "historicalEvidenceProductionRevision":
            overview["sourceProductionRevision"],
        "currentWatcherDisplayProductionRevision":
            overview["watcherProductionRevision"],
        "sourceCompletenessProven": False,
        "absenceIsNotEvidence": True,
        "labelsAreAllSigned": False,
        "sourceCounts": overview["sourceCounts"],
        "summary": overview["summary"],
        "receipt": str(receipt),
        "readOnly": True,
        "productionMutated": False,
        "woloMutated": False,
    }, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Audit positive Watcher display overlap with a private v3 archive cohort"
    )
    parser.add_argument("--wave", type=int, default=4, choices=range(79))
    main(parser.parse_args().wave)
