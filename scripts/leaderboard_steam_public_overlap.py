#!/usr/bin/env python3
"""Read-only public-overlap screen for private, SHA-proven Steam header ratings.

Joins private exact SteamID64 to the *public* RM and DM leaderboard rosters in
local process memory. Emits only counts; sends no private identity/rating to
GitHub or to the HTTP server. Public rating existence is NOT signed-Watcher
provenance. This cannot authorize a backfill, ranking or rating publication.
"""
from __future__ import annotations

import argparse
from collections import Counter
import json
from pathlib import Path
import re
import sys
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts import leaderboard_steam_bulk_recovery as bulk
from scripts.leaderboard_steam_archive_certificate import (
    CAMPAIGN_EXPECTED,
    certify_inventory,
)

ORIGIN = "https://aoe2war.com"
PAGE_LIMIT = 600
MAX_PAGES = 100
STEAM_KEY = re.compile(r"steam:[0-9]{17}\Z")


class OverlapError(RuntimeError):
    pass


def stop(reason: str):
    # Never interpolate private IDs, ratings, individual timestamps or hashes.
    raise OverlapError("STOP: " + reason)


def read_public_lane(lane: str, *, opener=urlopen) -> tuple[dict[str, bool], int]:
    if lane not in {"rm", "dm"}:
        stop("invalid leaderboard lane")
    results: dict[str, bool] = {}
    offset = 0
    total = ranked = None
    pages = 0
    while True:
        url = ORIGIN + "/api/lobby/leaderboard?" + urlencode({
            "lane": lane, "scope": "all", "offset": offset, "limit": PAGE_LIMIT,
        })
        request = Request(url, headers={
            "User-Agent": "Mozilla/5.0",
            "Accept": "application/json",
            "Cache-Control": "no-cache",
        })
        # No Steam IDs, candidate ratings or source timestamps appear in requests.
        with opener(request, timeout=90) as response:
            if response.status != 200 or "application/json" not in (
                response.headers.get("Content-Type", "")
            ):
                stop("public API returned a non-JSON success response")
            data = json.load(response)
        if not isinstance(data, dict) or data.get("ok") is not True:
            stop("public API did not provide a successful leaderboard payload")
        entries = data.get("entries")
        if not isinstance(entries, list) or len(entries) > PAGE_LIMIT:
            stop("public API pagination contract violated")
        count = data.get("trackedPlayers")
        rated_count = data.get("rankedPlayers")
        if type(count) is not int or type(rated_count) is not int:
            stop("public API has invalid roster counts")
        if total is None:
            total, ranked = count, rated_count
        elif (count, rated_count) != (total, ranked):
            stop("public API roster shifted during pagination")
        if data.get("nextOffset") != offset + len(entries):
            stop("public API nextOffset is invalid")
        has_more = data.get("hasMore")
        if type(has_more) is not bool:
            stop("public API hasMore is invalid")
        for row in entries:
            if not isinstance(row, dict):
                stop("public API row is malformed")
            key = row.get("key")
            if not isinstance(key, str) or not key:
                stop("public API identity key invalid")
            if key in results:
                stop("duplicate public identity across pages")
            if row.get("identityKind") == "steam" and not STEAM_KEY.fullmatch(key):
                stop("public Steam identity key malformed")
            if row.get("identityKind") != "steam" and STEAM_KEY.fullmatch(key):
                stop("public Steam identity kind inconsistent")
            rating = row.get("primaryRating")
            if rating is None:
                results[key] = False
            elif (type(rating) in (int, float) and
                    0 < rating <= 5000 and rating == rating):
                results[key] = True
            else:
                stop("public Steam rating sentinel malformed")
        offset += len(entries)
        pages += 1
        if pages > MAX_PAGES:
            stop("public API exceeded pagination safety bound")
        if not has_more:
            if offset != total:
                stop("public roster ended before trackedPlayers")
            break
        if not entries or offset >= total:
            stop("public API pagination made no progress")
    if sum(results.values()) != ranked:
        stop("public rated count does not equal rankedPlayers")
    return results, pages


def review_overlap(
    candidates: list[dict],
    rm: dict[str, bool],
    dm: dict[str, bool],
) -> dict:
    if set(rm) != set(dm):
        stop("RM and DM public identity populations differ")
    if not candidates:
        stop("there are no historical candidates")
    checked: set[str] = set()
    states: Counter[str] = Counter()
    for candidate in candidates:
        steam_id = candidate.get("steamId")
        if type(steam_id) is not str or not re.fullmatch(r"[0-9]{17}", steam_id):
            stop("private candidate identity malformed")
        key = "steam:" + steam_id
        if key in checked:
            stop("duplicate private candidate identity")
        checked.add(key)
        if key not in rm:
            states["notOnPublicRoster"] += 1
        elif not rm[key] and not dm[key]:
            states["unratedBoth"] += 1
        elif not rm[key]:
            states["unratedRmOnly"] += 1
        elif not dm[key]:
            states["unratedDmOnly"] += 1
        else:
            states["alreadyRatedBoth"] += 1
    if sum(states.values()) != len(candidates):
        stop("historical overlap accounting did not conserve candidates")
    public_exact = sum(key.startswith("steam:") for key in rm)
    return {
        "kind": "aoe2war-steam-archive-public-overlap/v1",
        "status": "PASS",
        "historicalCandidatesChecked": len(candidates),
        "publicIdentityRows": len(rm),
        "publicExactSteamRows": public_exact,
        "currentlyRatedRm": sum(rm.values()),
        "currentlyRatedDm": sum(dm.values()),
        "unratedBoth": states["unratedBoth"],
        "unratedRmOnly": states["unratedRmOnly"],
        "unratedDmOnly": states["unratedDmOnly"],
        "alreadyRatedBoth": states["alreadyRatedBoth"],
        "notOnPublicRoster": states["notOnPublicRoster"],
        "privateRatingsExported": 0,
        "historicalRatingsPublished": 0,
        "currentSignedWatcherChronologyVerified": False,
        "liveSnapshotAtomic": False,
        "productionMutated": False,
        "woloMutated": False,
        "nextStep": "PRIVATE_SIGNED_WATCHER_LANE_CONFLICT_AUDIT",
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Compare private certified historical candidates to live public rating presence"
    )
    parser.add_argument(
        "--execute-public-read", action="store_true",
        help="explicitly authorize public RM/DM API GETs; never publish candidates"
    )
    args = parser.parse_args()
    inventory = bulk.verified_inventory(bulk.load_truth().RECEIPT_DIR)
    certificate = certify_inventory(inventory, expected=CAMPAIGN_EXPECTED)
    if not args.execute_public_read:
        print(json.dumps({
            "kind": "aoe2war-steam-public-overlap-plan/v1",
            "status": "READY",
            "privateCandidateCount": certificate["historicalRmDmPairs"],
            "publicNetworkReadRequired": True,
            "privateRatingsExported": 0,
            "databaseMutationsAllowed": False,
            "woloMutationsAllowed": False,
        }, indent=2))
        return 0
    candidates = [
        candidate
        for wave in sorted(inventory["waves"])
        for candidate in inventory["waves"][wave]["privateHistoricalCandidates"]
    ]
    rm, rm_pages = read_public_lane("rm")
    dm, dm_pages = read_public_lane("dm")
    result = review_overlap(candidates, rm, dm)
    result["publicRmPages"] = rm_pages
    result["publicDmPages"] = dm_pages
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
