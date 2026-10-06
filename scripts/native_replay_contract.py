"""Closed, candidate-only native replay manifests shared by bridge and worker.

The digest proves immutable parameter agreement, not result authority. A v2
manifest admits known controls only; unresolved games need a separately proven
control ladder and a future reviewed contract.
"""
from __future__ import annotations

import hashlib
import json
import re
from typing import Any

SCHEMA = "aoe2war-native-replay-manifest/v2"
MAX_REPLAY_BYTES = 64 * 1024 * 1024
MAX_MANIFEST_BYTES = 32 * 1024
SHA_RE = re.compile(r"^[0-9a-f]{64}$")
PARSER_CONTRACT = {
    "parserName": "aoe2war.mgz_hd",
    "parserVersion": "1.8.51",
    "schemaVersion": "2026-07-25.1",
    "passName": "hd_deterministic_evidence",
    "passVersion": "10",
}
AUTHORITY = {"stats": False, "bets": False, "settlement": False, "wolo": False}


class NativeReplayContractError(ValueError):
    pass


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise NativeReplayContractError(message)


def _keys(value: Any, keys: set[str], label: str) -> dict[str, Any]:
    _require(type(value) is dict and set(value) == keys, f"{label} has invalid fields")
    return value


def _text(value: Any, label: str, maximum: int) -> str:
    _require(
        type(value) is str and 0 < len(value) <= maximum and value.strip() == value
        and not any(ord(char) < 32 for char in value),
        f"{label} must be a bounded nonblank string",
    )
    return value


def _integer(value: Any, label: str, minimum: int, maximum: int) -> int:
    _require(type(value) is int and minimum <= value <= maximum, f"{label} is invalid")
    return value


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)


def manifest_digest(value: dict[str, Any]) -> str:
    return hashlib.sha256(canonical_json({
        key: item for key, item in value.items() if key != "manifestSha256"
    }).encode("utf-8")).hexdigest()


def _unique_json_pairs(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        _require(key not in result, "manifest JSON contains duplicate fields")
        result[key] = value
    return result


def load_manifest_json(value: str) -> dict[str, Any]:
    _require(type(value) is str and len(value.encode("utf-8")) <= MAX_MANIFEST_BYTES,
             "manifest JSON exceeds the bound")
    try:
        parsed = json.loads(value, object_pairs_hook=_unique_json_pairs)
    except (ValueError, TypeError) as exc:
        raise NativeReplayContractError(f"manifest JSON is invalid: {exc}") from exc
    return validate_native_manifest(parsed)


def validate_native_manifest(value: Any) -> dict[str, Any]:
    source = _keys(value, {
        "schema", "gameStatsId", "replaySha256", "logicalBattleId", "sourceGameStatsIds",
        "sourceSnapshotSha256", "archive", "roster", "parser", "result", "financialExposure",
        "candidateOnly", "authority", "executionKind", "manifestSha256",
    }, "native manifest")
    _require(source["schema"] == SCHEMA, "unsupported native manifest schema")
    _require(source["executionKind"] == "control" and source["candidateOnly"] is True,
             "native v2 execution is candidate-only and known-control-only")
    authority = _keys(source["authority"], set(AUTHORITY), "authority")
    _require(all(authority[key] is False for key in AUTHORITY), "native authority escalation rejected")
    game_id = _integer(source["gameStatsId"], "GameStats identity", 1, 2**53 - 1)
    for key in ("replaySha256", "sourceSnapshotSha256", "manifestSha256"):
        _require(type(source[key]) is str and SHA_RE.fullmatch(source[key]) is not None,
                 f"{key} must be a lowercase SHA-256")
    _text(source["logicalBattleId"], "logical battle identity", 512)
    ids = source["sourceGameStatsIds"]
    _require(type(ids) is list and 1 <= len(ids) <= 500, "source GameStats identities are invalid")
    for source_id in ids:
        _integer(source_id, "source GameStats identity", 1, 2**53 - 1)
    _require(ids == sorted(set(ids)) and game_id in ids,
             "source GameStats identities must be sorted, unique and include the selected row")
    archive = _keys(source["archive"], {"objectKey", "sha256", "byteSize"}, "archive")
    _require(archive["sha256"] == source["replaySha256"], "archive hash does not bind the replay")
    _require(archive["objectKey"] == source["replaySha256"] + ".aoe2record",
             "archive object must be the exact SHA-named recorded HD replay")
    _integer(archive["byteSize"], "archive byte size", 1, MAX_REPLAY_BYTES)
    parser = _keys(source["parser"], {*PARSER_CONTRACT, "status"}, "parser")
    _require(all(parser[key] == item for key, item in PARSER_CONTRACT.items()),
             "native control requires the exact reviewed current parser contract")
    _require(parser["status"] in ("completed", "recovered"), "current parser candidate is incomplete")
    exposure = _keys(source["financialExposure"], {"markets", "wagers", "claims", "settlements"}, "financial exposure")
    _require(all(type(count) is int and count == 0 for count in exposure.values()),
             "financially linked replay cannot enter the native control rail")
    roster = source["roster"]
    _require(type(roster) is list and 2 <= len(roster) <= 8, "native roster must contain 2-8 players")
    slots, steam_ids, teams = [], [], set()
    for player in roster:
        row = _keys(player, {"slot", "steamId", "name", "teamId"}, "roster player")
        slots.append(_integer(row["slot"], "player slot", 1, 8))
        _require(type(row["steamId"]) is str and re.fullmatch(r"[0-9]{17}", row["steamId"]) is not None
                 and int(row["steamId"]) > 0, "roster requires an exact canonical Steam identity")
        steam_ids.append(row["steamId"])
        _text(row["name"], "canonical player name", 256)
        teams.add(_integer(row["teamId"], "canonical team identity", 0, 2**31 - 1))
    _require(slots == sorted(set(slots)) and len(set(steam_ids)) == len(roster),
             "native roster slots and Steam identities must be unique and sorted")
    _require(len(teams) == 2, "native controls require exactly two explicit canonical sides")
    result = _keys(source["result"], {"known", "winningSlots", "provenance"}, "result")
    _require(result["known"] is True, "unknown native campaign is locked until the independent control ladder passes")
    provenance = _text(result["provenance"], "trusted result provenance", 256)
    _require(re.fullmatch(r"acceptedadjudication:[1-9][0-9]*|public_result:[A-Za-z0-9_.:-]+", provenance) is not None,
             "result provenance is not an existing trusted public/adjudication class")
    winning = result["winningSlots"]
    _require(type(winning) is list and 0 < len(winning) < len(roster), "trusted winning slots are invalid")
    for slot in winning:
        _integer(slot, "winning slot", 1, 8)
    _require(winning == sorted(set(winning)) and set(winning).issubset(slots),
             "trusted winning slots must be unique members of the complete roster")
    winning_teams = {player["teamId"] for player in roster if player["slot"] in winning}
    _require(len(winning_teams) == 1 and
             [player["slot"] for player in roster if player["teamId"] in winning_teams] == winning,
             "winning slots must cover exactly one complete canonical side")
    _require(manifest_digest(source) == source["manifestSha256"], "native manifest SHA-256 mismatch")
    _require(len(canonical_json(source).encode("utf-8")) <= MAX_MANIFEST_BYTES, "native manifest exceeds the bound")
    return source


def validate_control_observations(
    manifest: dict[str, Any], attempt: dict[str, Any], receipt: dict[str, Any],
    validation: dict[str, Any], *, independently_verified: bool,
) -> dict[str, Any]:
    """Compare a rehashed native witness with independently trusted result slots."""
    manifest = validate_native_manifest(manifest)
    _require(independently_verified is True, "native evidence must be independently revalidated")
    _require(attempt.get("game_stats_id") == manifest["gameStatsId"] and
             attempt.get("replay_sha256") == manifest["replaySha256"], "native attempt identity mismatch")
    _require(attempt.get("cleanup_complete") is True, "native cleanup is incomplete")
    _text(attempt.get("run_id"), "native attempt run identity", 100)
    _require(attempt.get("reason") == "native_terminal_witness_recorded_candidate_only",
             "native terminal state was not reached")
    for key in ("production_results_mutated", "replay_truth_mutated", "betting_mutated", "wolo_mutated",
                "settlement_mutated", "control_gate_passed", "broad_execution_allowed"):
        _require(attempt.get(key) is False, f"native forbidden authority flag: {key}")
    for label, evidence in (("attempt", attempt), ("receipt", receipt), ("validation", validation)):
        _require(evidence.get("authority_scope") == "candidate_only" and
                 all(evidence.get(key) is False for key in
                     ("terminal_authority", "automatic_promotion_allowed", "settlement_authority")),
                 f"native {label} claims unsupported result authority")
    _require(validation.get("status") == "recorded_terminal_witness" and
             validation.get("file_integrity_verified") is True and
             validation.get("observation_semantics_independently_verified") is False,
             "native candidate validation is incomplete or claims promotion authority")
    observed = receipt.get("observations")
    _require(type(observed) is dict and observed.get("run_id") == attempt.get("run_id"),
             "native receipt mixes attempt identities")
    _require(observed.get("loaded") is True and observed.get("terminal_outcome_proven") is True,
             "exact replay load and terminal evidence are required")
    slots = [row["slot"] for row in manifest["roster"]]
    _require(type(observed.get("roster_slots")) is list and
             sorted(observed["roster_slots"]) == slots and len(observed["roster_slots"]) == len(slots),
             "native observed roster differs from the canonical manifest")
    result = observed.get("result")
    _require(type(result) is dict and result.get("outcome") == "decisive", "native terminal result is incomplete")
    winners, losers = result.get("winning_slots"), result.get("losing_slots")
    _require(type(winners) is list and type(losers) is list and winners and losers and
             all(type(slot) is int for slot in winners + losers) and
             len(set(winners + losers)) == len(slots) and sorted(winners + losers) == slots,
             "native winning slots do not partition the complete roster")
    _require(sorted(winners) == manifest["result"]["winningSlots"], "native winner disagrees with the trusted control")
    winning_players = [row for row in manifest["roster"] if row["slot"] in winners]
    return {
        "schema": "aoe2war-native-control-validation/v2", "status": "PASS", "controlPassed": True,
        "manifestSha256": manifest["manifestSha256"], "sourceSnapshotSha256": manifest["sourceSnapshotSha256"],
        "gameStatsId": manifest["gameStatsId"], "replaySha256": manifest["replaySha256"],
        "winningSlots": sorted(winners), "losingSlots": sorted(losers),
        "winningSteamIds": [row["steamId"] for row in winning_players],
        "winningTeamId": winning_players[0]["teamId"],
        "trustedResultProvenance": manifest["result"]["provenance"],
        "candidateOnly": True, "broadExecutionAllowed": False, "automaticPromotionAllowed": False,
        "authority": dict(AUTHORITY),
    }


def build_stats_only_review_evidence(
    manifest: dict[str, Any], control: dict[str, Any],
) -> dict[str, Any]:
    """Prepare evidence for the existing commissioner editor, never a verdict.

    The editor/server must obtain and revalidate its current roster, parser and
    proposition hashes before submitting an ordinary append-only adjudication.
    This envelope has no accepted decision or write operation.
    """
    manifest = validate_native_manifest(manifest)
    _require(type(control) is dict and control.get("schema") == "aoe2war-native-control-validation/v2"
             and control.get("status") == "PASS" and control.get("controlPassed") is True,
             "stats-only review evidence requires an independent native control PASS")
    for key in ("manifestSha256", "sourceSnapshotSha256", "gameStatsId", "replaySha256"):
        _require(control.get(key) == manifest[key], "native review evidence mixes source or attempt identities")
    _require(control.get("candidateOnly") is True and control.get("broadExecutionAllowed") is False and
             control.get("automaticPromotionAllowed") is False and control.get("authority") == AUTHORITY and
             all(control["authority"].get(key) is False for key in AUTHORITY),
             "native review evidence cannot escalate result or financial authority")
    winners = [player for player in manifest["roster"] if player["slot"] in manifest["result"]["winningSlots"]]
    _require(control.get("winningSlots") == manifest["result"]["winningSlots"] and
             control.get("winningSteamIds") == [player["steamId"] for player in winners] and
             control.get("winningTeamId") == winners[0]["teamId"],
             "native review winner does not bind the complete canonical side")
    teams = []
    for team_id in sorted({player["teamId"] for player in manifest["roster"]}):
        teams.append({"teamKey": f"team:{team_id}", "playerKeys": [
            "steam:" + player["steamId"] for player in manifest["roster"] if player["teamId"] == team_id
        ]})
    return {
        "schema": "aoe2war-native-result-review-evidence/v1",
        "kind": "native_hd_commissioner_review_evidence",
        "gameStatsId": manifest["gameStatsId"], "logicalBattleId": manifest["logicalBattleId"],
        "sourceGameStatsIds": list(manifest["sourceGameStatsIds"]), "replaySha256": manifest["replaySha256"],
        "manifestSha256": manifest["manifestSha256"], "sourceSnapshotSha256": manifest["sourceSnapshotSha256"],
        "controlValidationSha256": hashlib.sha256((canonical_json(control) + "\n").encode("utf-8")).hexdigest(),
        "completeRoster": [dict(player) for player in manifest["roster"]], "teamAssignments": teams,
        "winningSlots": list(control["winningSlots"]), "winningSteamIds": list(control["winningSteamIds"]),
        "winningTeamKey": f"team:{control['winningTeamId']}",
        "winningPlayerKeys": ["steam:" + player["steamId"] for player in winners],
        "candidateOnly": True, "requiresCommissionerApproval": True, "requestedAffectsStats": True,
        "affectsStats": False, "affectsBets": False, "settlementAuthority": False, "woloAuthority": False,
        "reviewerPath": f"/game-stats/{manifest['gameStatsId']}/review",
    }
