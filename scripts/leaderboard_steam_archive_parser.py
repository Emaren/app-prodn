#!/usr/bin/env python3
"""Protected read-only canary: SHA-verified archived HD header reparse."""
from __future__ import annotations

import argparse
import importlib.util
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REMOTE = ROOT / "scripts" / "leaderboard_steam_archive_parser_remote.mjs"


def validate(payload: object, expected_wave: int = 0) -> dict:
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
    cohort_fingerprint = payload.get("cohortFingerprint")
    if not isinstance(cohort_fingerprint, str) or not re.fullmatch(
        r"[a-f0-9]{64}", cohort_fingerprint
    ):
        raise RuntimeError("archive cohort digest invalid")
    sample_evidence = payload.get("sampleEvidence")
    if not isinstance(sample_evidence, list):
        raise RuntimeError("private sample manifest is missing")
    identity_fps = set()
    archive_hashes = set()
    for item in sample_evidence:
        if not isinstance(item, dict) or set(item) != {
            "identityFingerprint", "replaySha256", "result"
        }:
            raise RuntimeError("private sample manifest shape invalid")
        identity = item["identityFingerprint"]
        replay = item["replaySha256"]
        if (not isinstance(identity, str) or
            not re.fullmatch(r"[a-f0-9]{64}", identity) or
            not isinstance(replay, str) or
            not re.fullmatch(r"[a-f0-9]{64}", replay) or
            item["result"] not in {
                "parsed", "no_projection", "timeout", "parser_error",
                "invalid_parser_output", "unique_identity",
                "both_hd_headers_match",
            }):
            raise RuntimeError("private sample manifest evidence invalid")
        if identity in identity_fps or replay in archive_hashes:
            raise RuntimeError("private sample manifest duplication")
        identity_fps.add(identity)
        archive_hashes.add(replay)
    data = payload.get("summary")
    if not isinstance(data, dict):
        raise RuntimeError("missing canary summary")
    parser_source = data.get("apiParserSource")
    if not isinstance(parser_source, str) or len(parser_source) != 40 or any(
        char not in "0123456789abcdef" for char in parser_source
    ):
        raise RuntimeError("invalid installed API parser revision")
    nums = (
        "publicUnratedExactSteamIds", "unmarkedWatchersWithBothNumbers",
        "scannedGameRows", "scanBatches", "selectedSampleLimit",
        "sampleFilesLocated", "sampleHashesVerified", "sampleHashMismatch",
        "identitiesWithoutLocatedFile", "identitiesWithOversizeOnly",
        "identitiesWithVerifiedFile",
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
    count_fields = (
        "noProjectionByMode", "noProjectionByErrorStage",
        "noProjectionByErrorCategory",
    )
    for name in count_fields:
        counts = data.get(name)
        if not isinstance(counts, dict) or any(
            not isinstance(label, str) or
            not label.replace("_", "").isalnum() or
            not label[0].isalpha() or len(label) > 64 or
            type(count) is not int or count < 0
            for label, count in counts.items()
        ):
            raise RuntimeError(f"invalid parser no-projection evidence: {name}")
        if sum(counts.values()) != data["parserNoProjection"]:
            raise RuntimeError("parser no-projection conservation failed")
    if (len(sample_evidence) != data["sampleHashesVerified"] or
        data["identitiesWithVerifiedFile"] != data["sampleHashesVerified"] or
        data["identitiesWithVerifiedFile"] +
            data["identitiesWithoutLocatedFile"] >
            data.get("sampleIdentityWindow", -1) or
        data["identitiesWithOversizeOnly"] >
            data.get("sampleIdentityWindow", -1)):
        raise RuntimeError("private sample manifest count mismatch")
    if type(data.get("sampleIdentityWindow")) is not int or not (
        0 <= data["sampleIdentityWindow"] <= 24
    ):
        raise RuntimeError("unsafe parser sample identity window")
    for name in ("sampleWave", "sampleOffsetIdentities"):
        if type(data.get(name)) is not int or data[name] < 0:
            raise RuntimeError("invalid archive parser sample wave")
    if type(data.get("deadlineReached")) is not bool:
        raise RuntimeError("invalid archive parser deadline status")
    if type(expected_wave) is not int or not 0 <= expected_wave <= 78:
        raise RuntimeError("requested archive parser wave unsafe")
    expected_limit = 6 if expected_wave == 0 else 24
    expected_offset = 0 if expected_wave == 0 else 6 + (expected_wave - 1) * 24
    if (data["sampleWave"] != expected_wave or
        data["sampleOffsetIdentities"] != expected_offset or
        data["selectedSampleLimit"] != expected_limit):
        raise RuntimeError("archive parser sample wave does not match request")
    for name in ("apiPythonAvailable", "archiveAccessible"):
        if type(data.get(name)) is not bool:
            raise RuntimeError("canary environment proof malformed")
    total = data["sampleHashesVerified"]
    if (not 0 <= total <= data["sampleIdentityWindow"] <=
            data["selectedSampleLimit"] <= 24 or
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


def analyze_private_history(payload: dict, receipt_dir: Path) -> dict:
    """Track cross-wave evidence reuse without publishing Steam IDs or SHAs."""
    sample = payload["sampleEvidence"]
    new_identities = {entry["identityFingerprint"] for entry in sample}
    new_archives = {entry["replaySha256"] for entry in sample}
    wave = payload["summary"]["sampleWave"]
    prior_identity_fps = set()
    prior_archive_hashes = set()
    prior_cohort_fps = set()
    reviewed = 0
    legacy_untracked = 0
    same_wave_receipts = 0
    # Old wave 0-2 receipts predate private sample fingerprints.
    # Treat their deduplication as UNKNOWN, not as distinct evidence.
    for path in sorted(
        receipt_dir.glob("*-leaderboard-steam-archive-parser-wave-*.json")
    ):
        envelope = json.loads(path.read_text(encoding="utf-8"))
        prior = envelope.get("payload")
        if not isinstance(prior, dict) or prior.get("kind") != payload["kind"]:
            raise RuntimeError("unexpected archived Steam recovery receipt")
        prior_wave = prior.get("summary", {}).get("sampleWave")
        if type(prior_wave) is not int:
            raise RuntimeError("previous recovery receipt missing wave")
        if prior_wave == wave:
            same_wave_receipts += 1
            continue
        old_sample = prior.get("sampleEvidence")
        old_cohort = prior.get("cohortFingerprint")
        if old_sample is None or old_cohort is None:
            legacy_untracked += 1
            continue
        validate(prior, prior_wave)
        prior_cohort_fps.add(old_cohort)
        reviewed += 1
        prior_identity_fps.update(
            item["identityFingerprint"] for item in old_sample
        )
        prior_archive_hashes.update(
            item["replaySha256"] for item in old_sample
        )
    return {
        "priorTrackedWaveReceipts": reviewed,
        "priorUntrackedWaveReceipts": legacy_untracked,
        "sameWaveReceiptsExcluded": same_wave_receipts,
        "crossWaveIdentityOverlap": len(new_identities & prior_identity_fps),
        "crossWaveArtifactOverlap": len(new_archives & prior_archive_hashes),
        "cohortFingerprintsDiffer": len(
            prior_cohort_fps - {payload["cohortFingerprint"]}
        ),
        "newUniqueIdentityProofsVsTracked": len(
            new_identities - prior_identity_fps
        ),
        "newUniqueArtifactProofsVsTracked": len(
            new_archives - prior_archive_hashes
        ),
    }


def main(wave: int = 0) -> None:
    spec = importlib.util.spec_from_file_location(
        "aoe2war_truth", ROOT / "scripts" / "aoe2_truth.py"
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("protected truth observer unavailable")
    truth = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(truth)
    truth.REMOTE_PROGRAM = REMOTE
    if type(wave) is not int or not 0 <= wave <= 78:
        raise RuntimeError("archive parser wave outside safety ceiling")
    payload = truth.run_remote("census", wave)
    summary = validate(payload, expected_wave=wave)
    overlap = analyze_private_history(payload, truth.RECEIPT_DIR)
    receipt = truth.write_receipt(
        f"leaderboard-steam-archive-parser-wave-{wave}", payload
    )
    receipt.chmod(0o600)
    print(json.dumps({
        "observedAt": payload.get("observedAt"),
        "productionSource": payload.get("productionSource"),
        "summary": summary,
        "evidenceCoverage": overlap,
        "receipt": str(receipt),
        "readOnly": True,
        "productionMutated": False,
        "woloMutated": False,
    }, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Read-only sample of SHA-verified historic Steam header ratings"
    )
    parser.add_argument(
        "--wave", type=int, default=0, choices=range(79),
        help="0: original six-file canary; 1-78: separate 24-file wave"
    )
    main(parser.parse_args().wave)
