#!/usr/bin/env python3
"""Offline, aggregate-only closure certificate for the protected Steam archive cohort.

Reuses the audit branch's authoritative per-wave v3 validator. This command never
opens replay bytes, makes network calls, writes receipts, or publishes ratings.
Original-byte reparse/SHA attestation belongs to the prior per-wave collector,
not to this offline cross-receipt consistency audit.
"""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime
import hashlib
import json
from pathlib import Path
import re

from scripts import leaderboard_steam_bulk_recovery as bulk

TRACKED_WAVES = frozenset(range(4, 79))
CAMPAIGN_EXPECTED = {
    "verifiedUniqueIdentityProofs": 1692,
    "distinctReplayArtifacts": 1178,
    "sharedReplayIdentityChecks": 514,
    "sharedReplayArtifactHashes": 320,
    "historicalRmDmPairs": 1378,
}
IDENTITY_DOMAIN = "aoe2war-archived-identity-v1:"


def stop(reason: str) -> None:
    # Never put private identities, replay hashes, timestamps or ratings in errors.
    raise RuntimeError("STOP: " + reason)


def _timestamp(value: object) -> datetime:
    if not isinstance(value, str) or not value.endswith("Z"):
        stop("candidate has no trusted explicit UTC game timestamp")
    try:
        result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        stop("candidate has malformed game timestamp")
    if result.tzinfo is None:
        stop("candidate timestamp is not timezone-aware")
    return result


def certify_inventory(
    inventory: dict,
    *,
    expected: dict[str, int] | None = None,
) -> dict:
    """Certify only the exact, already-validated private v3 campaign inventory.

    bulk.verified_inventory() first invokes archive.validate() for every unique
    wave receipt. This second independent pass cross-checks global accounting,
    candidate identity/proof linkage and chronology, without printing raw data.
    """
    waves = inventory["waves"]
    if set(waves) != TRACKED_WAVES:
        stop("tracked waves 4 through 78 are not exact and complete")
    fingerprints: set[str] = set()
    replay_usage: Counter[str] = Counter()
    candidates: set[str] = set()
    revisions: set[str] = set()
    times: list[datetime] = []
    cohort = waves[4]["cohortFingerprint"]

    for wave in sorted(waves):
        payload = waves[wave]
        if payload.get("cohortFingerprint") != cohort:
            stop("cohort fingerprint changed between waves")
        summary = payload["summary"]
        if summary.get("sampleWave") != wave:
            stop("wave number changed between receipt and content")
        if summary.get("deadlineReached") or summary.get("sampleHashMismatch"):
            stop("one wave lacks complete source-hash confirmation")
        samples = payload["sampleEvidence"]
        if summary.get("sampleHashesVerified") != len(samples):
            stop("verified source/sample conservation failed")
        proof = {}
        for item in samples:
            fingerprint = item["identityFingerprint"]
            replay = item["replaySha256"]
            if fingerprint in fingerprints:
                stop("cross-wave Steam identity proof collision")
            fingerprints.add(fingerprint)
            replay_usage[replay] += 1
            proof[(fingerprint, replay, item["gameStatsId"])] = item

        revision = summary.get("apiParserSource")
        if not isinstance(revision, str) or re.fullmatch(r"[a-f0-9]{40}", revision) is None:
            stop("invalid API parser revision")
        revisions.add(revision)

        for candidate in payload["privateHistoricalCandidates"]:
            steam_id = candidate["steamId"]
            identity_fp = hashlib.sha256(
                (IDENTITY_DOMAIN + steam_id).encode("utf-8")
            ).hexdigest()
            sample = proof.get((
                identity_fp, candidate["replaySha256"], candidate["gameStatsId"]
            ))
            if (
                sample is None
                or sample["result"] != "historical_candidate_only"
                or sample["acceptedSameGame"] is not True
                or sample["ratingObservedAt"] != candidate["ratingObservedAt"]
                or candidate["observationAuthority"] != "historical_candidate_only"
                or candidate["steamRmSource"] != "hd_header"
                or candidate["steamDmSource"] != "hd_header"
                or candidate["apiParserSource"] != revision
            ):
                stop("candidate does not match its independently verified replay proof")
            if identity_fp in candidates:
                stop("duplicate historical identity candidate")
            candidates.add(identity_fp)
            times.append(_timestamp(candidate["ratingObservedAt"]))

    replay_artifacts = len(replay_usage)
    shared_checks = sum(n - 1 for n in replay_usage.values())
    shared_hashes = sum(n > 1 for n in replay_usage.values())
    metrics = {
        "verifiedUniqueIdentityProofs": len(fingerprints),
        "distinctReplayArtifacts": replay_artifacts,
        "sharedReplayIdentityChecks": shared_checks,
        "sharedReplayArtifactHashes": shared_hashes,
        "historicalRmDmPairs": len(candidates),
    }
    recorded = {
        "verifiedUniqueIdentityProofs": inventory["verifiedIdentityCount"],
        "distinctReplayArtifacts": inventory["verifiedArtifactCount"],
        "sharedReplayIdentityChecks": inventory["sharedReplayIdentityChecks"],
        "sharedReplayArtifactHashes": inventory["sharedReplayArtifactHashes"],
        "historicalRmDmPairs": inventory["historicalCandidateCount"],
    }
    if metrics != recorded:
        stop("independently recomputed counts differ from receipt inventory")
    if expected is not None and metrics != expected:
        stop("campaign counts differ from operator-approved closure benchmark")
    if len(revisions) != 1:
        stop("multiple API parser revisions require separate review")
    if len(candidates) > len(fingerprints):
        stop("historical candidate count exceeds identity proofs")
    if not times:
        stop("campaign has no qualified timestamped candidate")

    # Deliberately omit raw Steam IDs, names, SHA256s, ratings and timestamps:
    # even aggregate min/max individual evidence clocks are not published.
    return {
        "kind": "aoe2war-steam-private-campaign-certificate/v1",
        "status": "PASS",
        "trackedWaves": len(waves),
        **metrics,
        "legacyReceiptsExcluded": inventory["untrackedLegacyReceiptFiles"],
        "apiParserRevisionCount": len(revisions),
        "readOnly": True,
        "productionMutated": False,
        "woloMutated": False,
        "publicationsAuthorized": 0,
        "nextStep": "OFFLINE_REVIEW_ONLY",
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Certify 75 protected v3 Steam archive waves; print aggregates only"
    )
    parser.add_argument(
        "--receipts-dir", type=Path, default=None,
        help="Protected local receipt directory; defaults to aoe2_truth.RECEIPT_DIR",
    )
    args = parser.parse_args()
    directory = (
        args.receipts_dir if args.receipts_dir is not None
        else bulk.load_truth().RECEIPT_DIR
    )
    if directory.is_symlink():
        stop("private receipt directory must not be a symlink")
    if not directory.is_dir():
        stop("protected local receipt directory missing")
    inventory = bulk.verified_inventory(directory)
    certificate = certify_inventory(inventory, expected=CAMPAIGN_EXPECTED)
    print(json.dumps(certificate, sort_keys=True, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
