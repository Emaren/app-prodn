#!/usr/bin/env python3
"""Operator-side resumable, bounded source-byte Steam header recovery.

Uses the EXISTING read-only, Git/SHA-pinned archive parser one wave at a time.
This is a private evidence collector, not a rating publisher or DB backfill.

Plan first; --execute explicitly authorizes only protected read-only samples.
One command processes at most 8 waves (up to 192 identity windows). Every wave
runs with a separate 180-s hard timeout in the established observer.
"""
from __future__ import annotations

import argparse
import contextlib
import io
import importlib.util
import json
import os
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
if __package__ in (None, ""):
    import sys
    if str(ROOT) not in sys.path:
        sys.path.insert(0, str(ROOT))

from scripts import leaderboard_steam_archive_parser as archive

FILENAME = re.compile(
    r".+-leaderboard-steam-archive-parser-wave-(\d+)\.json\Z"
)
MAX_WAVES_PER_INVOCATION = 8
SEED_WAVE = 4


def read_private_envelope(path: Path) -> tuple[int, dict] | None:
    """Old schema 1/2 can count as history but not as recovered rating values."""
    name = FILENAME.fullmatch(path.name)
    if not name:
        return None
    if path.stat().st_mode & 0o077:
        raise RuntimeError("STOP: private archive receipt has unsafe permissions")
    envelope = json.loads(path.read_text(encoding="utf-8"))
    payload = envelope.get("payload") if isinstance(envelope, dict) else None
    if not isinstance(payload, dict) or payload.get("schemaVersion") != 3:
        return None
    wave = int(name[1])
    if wave not in range(79):
        raise RuntimeError("STOP: private receipt has unexpected wave")
    if payload.get("summary", {}).get("sampleWave") != wave:
        raise RuntimeError("STOP: private filename and payload wave disagree")
    summary = archive.validate(payload, expected_wave=wave)
    if summary.get("deadlineReached") or summary.get("sampleHashMismatch"):
        raise RuntimeError("STOP: prior wave has unresolved deadline or SHA mismatch")
    return wave, payload


def verified_inventory(directory: Path) -> dict:
    """Count per-player SHA-proven observations; permit shared multiplayer files."""
    if not directory.is_dir():
        raise RuntimeError("STOP: protected operator receipts directory not found")
    evidence_by_wave: dict[int, dict] = {}
    original_wave_files = 0
    for path in sorted(directory.glob("*-leaderboard-steam-archive-parser-wave-*.json")):
        record = read_private_envelope(path)
        if record is None:
            original_wave_files += 1
            continue
        wave, payload = record
        previous = evidence_by_wave.get(wave)
        if previous is None:
            evidence_by_wave[wave] = payload
        else:
            fields = ("cohortFingerprint", "sampleEvidence", "privateHistoricalCandidates")
            # Same-wave reruns are not counted twice. If a repeated proof
            # changes, fail closed instead of quietly selecting one.
            if any(previous.get(key) != payload.get(key) for key in fields):
                raise RuntimeError("STOP: inconsistent same-wave replay proofs")

    if SEED_WAVE not in evidence_by_wave:
        raise RuntimeError("STOP: trusted v3 wave-4 anchor receipt is absent")
    anchor = evidence_by_wave[SEED_WAVE]["cohortFingerprint"]
    seen_steam = {}
    seen_replays = {}
    shared_replay_identity_checks = 0
    shared_replay_artifact_hashes = set()
    for wave, payload in sorted(evidence_by_wave.items()):
        if payload.get("cohortFingerprint") != anchor:
            raise RuntimeError("STOP: historical candidate cohort fingerprint drift")
        for entry in payload["sampleEvidence"]:
            fp = entry["identityFingerprint"]
            replay = entry["replaySha256"]
            if fp in seen_steam and seen_steam[fp] != wave:
                raise RuntimeError("STOP: overlapping Steam identity across waves")
            # A single multiplayer recording legitimately contains several
            # distinct Steam identities. Its SHA proves artifact bytes,
            # not single-player ownership. A repeated SHA across different
            # Steam IDs is therefore NOT an identity overlap.
            if replay in seen_replays:
                shared_replay_identity_checks += 1
                shared_replay_artifact_hashes.add(replay)
            seen_steam[fp] = wave
            seen_replays.setdefault(replay, wave)

    return {
        "cohortFingerprint": anchor,
        "waves": evidence_by_wave,
        "untrackedLegacyReceiptFiles": original_wave_files,
        "verifiedIdentityCount": len(seen_steam),
        "verifiedArtifactCount": len(seen_replays),
        "sharedReplayIdentityChecks": shared_replay_identity_checks,
        "sharedReplayArtifactHashes": len(shared_replay_artifact_hashes),
        "historicalCandidateCount": sum(
            len(p["privateHistoricalCandidates"]) for p in evidence_by_wave.values()
        ),
    }


def selection_plan(inventory: dict, start: int, stop: int) -> dict:
    if (type(start) is not int or type(stop) is not int or
        start < 5 or stop > 78 or start > stop or
        stop - start + 1 > MAX_WAVES_PER_INVOCATION):
        raise ValueError("choose 1–8 consecutive waves between 5 and 78")
    completed = sorted(w for w in range(start, stop + 1) if w in inventory["waves"])
    pending = [w for w in range(start, stop + 1) if w not in inventory["waves"]]
    return {
        "requestedWaves": list(range(start, stop + 1)),
        "alreadyCompletedWaves": completed,
        "remainingWaves": pending,
        "maxNewIdentityWindows": 24 * len(pending),
        "verifiedUniqueIdentitiesToDate": inventory["verifiedIdentityCount"],
        "distinctVerifiedReplayArtifactsToDate": inventory["verifiedArtifactCount"],
        "sharedReplayIdentityChecksToDate": inventory["sharedReplayIdentityChecks"],
        "sharedReplayArtifactHashesToDate": inventory["sharedReplayArtifactHashes"],
        "recoveredHistoricalCandidatesToDate": inventory["historicalCandidateCount"],
        "legacyReceiptsNotCreditedAsDistinct": inventory["untrackedLegacyReceiptFiles"],
        "productionWritesAllowed": False,
        "woloWritesAllowed": False,
    }


def load_truth():
    spec = importlib.util.spec_from_file_location(
        "aoe2war_truth", ROOT / "scripts" / "aoe2_truth.py"
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("STOP: protected read-only observer missing")
    truth = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(truth)
    return truth


def execute_batch(
    directory: Path, start: int, stop: int, *,
    runner=None,
) -> dict:
    """Fail on the first bad wave; preserve all earlier private receipts."""
    before = verified_inventory(directory)
    plan = selection_plan(before, start, stop)
    if runner is None:
        runner = archive.main
    done = []
    for wave in plan["remainingWaves"]:
        # archive.main internally performs read-only source/DB/systemd proofs,
        # independent SHA/reparse, strict validation and exclusive 0600 save.
        with contextlib.redirect_stdout(io.StringIO()):
            runner(wave)
        after = verified_inventory(directory)
        if wave not in after["waves"]:
            raise RuntimeError("STOP: observer returned without a valid private receipt")
        result = {
            "wave": wave,
            "sourceBytesShaVerified": after["waves"][wave]["summary"]["sampleHashesVerified"],
            "historicalCandidates": len(after["waves"][wave]["privateHistoricalCandidates"]),
        }
        done.append(result)
        print(json.dumps({"completedReadOnlyWave": result}), flush=True)
    final = verified_inventory(directory)
    return {
        "completedThisInvocation": done,
        "totalVerifiedUniqueIdentityProofs": final["verifiedIdentityCount"],
        "totalDistinctReplayArtifacts": final["verifiedArtifactCount"],
        "sharedReplayIdentityChecks": final["sharedReplayIdentityChecks"],
        "sharedReplayArtifactHashes": final["sharedReplayArtifactHashes"],
        "totalPrivateHistoricalCandidates": final["historicalCandidateCount"],
        "nextWave": next(
            (w for w in range(stop + 1, 79) if w not in final["waves"]), None
        ),
        "readOnly": True, "productionMutated": False, "woloMutated": False,
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Plan or collect 1–8 read-only SHA-checked Steam rating waves"
    )
    parser.add_argument("--start", type=int, default=5)
    parser.add_argument("--stop", type=int, default=12)
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--plan", action="store_true", help="offline only (default)")
    group.add_argument("--execute", action="store_true",
                       help="explicitly start bounded protected remote reads")
    args = parser.parse_args()
    selection_plan({"waves": {}, "verifiedIdentityCount": 0,
                    "verifiedArtifactCount": 0,
                    "sharedReplayIdentityChecks": 0,
                    "sharedReplayArtifactHashes": 0,
                    "historicalCandidateCount": 0,
                    "untrackedLegacyReceiptFiles": 0}, args.start, args.stop)
    truth = load_truth()
    inventory = verified_inventory(truth.RECEIPT_DIR)
    if args.execute:
        print(json.dumps({
            "operation": "protected_read_only_steam_bulk_evidence_collection",
            "selectedWaves": [args.start, args.stop],
            "pending": selection_plan(inventory, args.start, args.stop)["remainingWaves"],
        }, indent=2), flush=True)
        result = execute_batch(truth.RECEIPT_DIR, args.start, args.stop)
    else:
        result = selection_plan(inventory, args.start, args.stop)
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
