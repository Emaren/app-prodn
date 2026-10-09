#!/usr/bin/env python3
"""Offline, display-only Steam RM/DM chronology preview.

This module has no filesystem, database, network, publication, or mutation path.
Call extract_candidate_evidence only with local operator receipts, after their
schema/provenance gates pass. The candidate ledger is NOT a live Watcher signature
and this module cannot authenticate current Watcher payloads. A trusted current
observation must already have been verified by its separate authoritative rail.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal, Mapping, Sequence
import re

Lane = Literal["rm", "dm"]
ResultSource = Literal[
    "current_watcher", "last_known_header", "unavailable", "quarantined"
]
STEAM_ID_RE = re.compile(r"\d{17}\Z")
HASH_RE = re.compile(r"[a-f0-9]{64}\Z")


def utc_clock(value: object) -> datetime | None:
    """Require an explicitly zoned, real observation time; never use ingest time."""
    if not isinstance(value, str) or not value.endswith("Z"):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return None
    normalized = parsed.astimezone(timezone.utc)
    if not datetime(2000, 1, 1, tzinfo=timezone.utc) < normalized:
        return None
    return normalized


def qualified_rating(value: object) -> int | None:
    return value if type(value) is int and 1 <= value <= 5000 else None


def extract_candidate_evidence(payloads: Sequence[dict]) -> list[dict]:
    """Validate case-level ledgers; do not invent numeric values for schema 1/2."""
    try:
        from scripts.leaderboard_steam_archive_parser import validate
    except ModuleNotFoundError:
        from leaderboard_steam_archive_parser import validate

    accumulated: list[dict] = []
    seen = set()
    for payload in payloads:
        summary = payload.get("summary") if isinstance(payload, dict) else None
        if not isinstance(summary, dict):
            raise ValueError("invalid historical evidence receipt")
        wave = summary.get("sampleWave")
        if type(wave) is not int:
            raise ValueError("invalid historical wave")
        validate(payload, wave)  # v3 is the only accepted candidate source.
        for record in payload["privateHistoricalCandidates"]:
            key = (record["steamId"], record["gameStatsId"], record["replaySha256"])
            if key in seen:
                continue  # Re-reading an identical candidate is not new evidence.
            seen.add(key)
            accumulated.append(dict(record))
    return accumulated


def resolve_historical_lane(
    steam_id: str,
    lane: Lane,
    validated_candidates: Sequence[Mapping[str, Any]],
    *,
    qualified_watcher: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Return an OFFLINE display proposal; never label it signed/current itself.

    qualified_watcher is a pre-qualified authoritative display observation from
    the caller's verified Watcher resolver. This function never verifies HMAC
    and its return value MUST NOT grant identity/betting/settlement authority.
    Signed-current and old display-only Watcher compatibility are distinct
    upstream; neither is derivable from archived replay headers.
    """
    if not isinstance(steam_id, str) or STEAM_ID_RE.fullmatch(steam_id) is None:
        raise ValueError("expected exact SteamID64")
    if lane not in ("rm", "dm"):
        raise ValueError("invalid Steam rating lane")
    unavailable = {
        "lane": lane, "source": "unavailable", "value": None,
        "observedAt": None, "reason": "no_qualified_evidence",
        "archiveEvidenceCount": 0,
    }

    # A current Watcher display observation ALWAYS wins on its own lane,
    # even if a later uploaded archive claims a newer played-on clock.
    # A supplied-but-invalid trusted observation fails closed: it must
    # not be silently downgraded to the historical fallback.
    if qualified_watcher is not None:
        wr = qualified_watcher.get("rating")
        wt = qualified_watcher.get("observedAt")
        wid = qualified_watcher.get("steamId")
        wlane = qualified_watcher.get("lane")
        if (
            wid != steam_id or wlane != lane or
            qualified_rating(wr) is None or utc_clock(wt) is None
        ):
            return {
                **unavailable, "source": "quarantined",
                "reason": "invalid_qualified_watcher_input",
            }
        return {
            **unavailable, "source": "current_watcher",
            "value": wr, "observedAt": wt,
            "reason": "prequalified_watcher_wins",
        }

    lane_key = "steamRmRating" if lane == "rm" else "steamDmRating"
    source_key = "steamRmSource" if lane == "rm" else "steamDmSource"
    selected = []
    for entry in validated_candidates:
        if entry.get("steamId") != steam_id:
            continue
        rating = qualified_rating(entry.get(lane_key))
        clock = utc_clock(entry.get("ratingObservedAt"))
        source = entry.get(source_key)
        hashed = entry.get("replaySha256")
        if (
            entry.get("observationAuthority") != "historical_candidate_only" or
            source != "hd_header" or rating is None or clock is None or
            not isinstance(hashed, str) or HASH_RE.fullmatch(hashed) is None or
            type(entry.get("gameStatsId")) is not int or
            entry["gameStatsId"] <= 0
        ):
            return {
                **unavailable, "source": "quarantined",
                "reason": "invalid_historical_candidate",
            }
        selected.append((clock, rating, hashed, entry["gameStatsId"]))

    if not selected:
        return unavailable
    newest = max(x[0] for x in selected)
    newest_group = [x for x in selected if x[0] == newest]
    if len({x[1] for x in newest_group}) > 1:
        return {
            **unavailable, "source": "quarantined",
            "observedAt": newest.isoformat().replace("+00:00", "Z"),
            "reason": "conflicting_latest_header_ratings",
            "archiveEvidenceCount": len({x[2] for x in newest_group}),
        }
    # Different hashes agreeing at the same played-on time do not vote the
    # rating upward or downward; they support the identical value only.
    return {
        **unavailable, "source": "last_known_header",
        "value": newest_group[0][1],
        "observedAt": newest.isoformat().replace("+00:00", "Z"),
        "reason": "latest_nonconflicting_archived_hd_header",
        "archiveEvidenceCount": len({x[2] for x in newest_group}),
    }
