"""Source-only synthetic tests for local private/public collision screening."""
import io
import json
import unittest
from urllib.parse import parse_qs, urlsplit

from scripts import leaderboard_steam_public_overlap as overlap


def sid(number: int) -> str:
    return str(76561198000000000 + number)


def key(number: int) -> str:
    return "steam:" + sid(number)


def candidates(*numbers: int) -> list[dict]:
    return [{"steamId": sid(n)} for n in numbers]


class Response(io.BytesIO):
    status = 200
    headers = {"Content-Type": "application/json"}

    def __init__(self, data: dict):
        super().__init__(json.dumps(data).encode("utf-8"))


def page(entries, *, offset=0, total=None, ranked=None):
    if total is None:
        total = len(entries)
    if ranked is None:
        ranked = sum(e["primaryRating"] is not None for e in entries)
    return {
        "ok": True, "trackedPlayers": total, "rankedPlayers": ranked,
        "entries": entries,
        "nextOffset": offset + len(entries),
        "hasMore": offset + len(entries) < total,
    }


class PublicOverlapTests(unittest.TestCase):
    def test_five_exclusive_collision_states_and_aggregate_only(self):
        rm = {key(1): False, key(2): False, key(3): True, key(4): True}
        dm = {key(1): False, key(2): True, key(3): False, key(4): True}
        result = overlap.review_overlap(candidates(1, 2, 3, 4, 5), rm, dm)
        for item in (
            "unratedBoth", "unratedRmOnly", "unratedDmOnly",
            "alreadyRatedBoth", "notOnPublicRoster",
        ):
            self.assertEqual(result[item], 1)
        self.assertEqual(result["historicalCandidatesChecked"], 5)
        self.assertEqual(result["publicExactSteamRows"], 4)
        self.assertEqual(result["currentSignedWatcherChronologyVerified"], False)
        self.assertEqual(result["historicalRatingsPublished"], 0)
        self.assertEqual(result["privateRatingsExported"], 0)
        for n in range(1, 6):
            self.assertNotIn(sid(n), json.dumps(result))

    def test_missing_lane_population_stops(self):
        with self.assertRaisesRegex(overlap.OverlapError, "populations differ"):
            overlap.review_overlap(candidates(1), {key(1): False}, {})

    def test_duplicate_private_identity_stops(self):
        with self.assertRaisesRegex(overlap.OverlapError, "duplicate private"):
            overlap.review_overlap(candidates(1, 1), {key(1): False}, {key(1): False})

    def test_public_single_page_read_and_endpoint_params(self):
        rows = [
            {"key": key(1), "identityKind": "steam", "primaryRating": 1900},
            {"key": "replay:provisional", "identityKind": "name", "primaryRating": None},
        ]
        requests = []
        def opener(req, timeout):
            requests.append((req.full_url, req.headers))
            return Response(page(rows))
        got, count = overlap.read_public_lane("rm", opener=opener)
        self.assertEqual(count, 1)
        self.assertEqual(got, {key(1): True, "replay:provisional": False})
        self.assertEqual(parse_qs(urlsplit(requests[0][0]).query)["lane"], ["rm"])
        self.assertEqual(parse_qs(urlsplit(requests[0][0]).query)["scope"], ["all"])
        self.assertEqual(requests[0][1]["User-agent"], "Mozilla/5.0")

    def test_public_duplicate_row_stops(self):
        rows = [{"key": key(1), "identityKind": "steam", "primaryRating": 2000}] * 2
        with self.assertRaisesRegex(overlap.OverlapError, "duplicate public"):
            overlap.read_public_lane("dm", opener=lambda req, timeout: Response(page(rows)))

    def test_public_rated_count_mismatch_stops(self):
        rows = [{"key": key(1), "identityKind": "steam", "primaryRating": None}]
        with self.assertRaisesRegex(overlap.OverlapError, "rated count"):
            overlap.read_public_lane("rm", opener=lambda req, timeout: Response(page(rows, ranked=1)))

    def test_public_invalid_steam_kind_stops(self):
        rows = [{"key": key(1), "identityKind": "name", "primaryRating": None}]
        with self.assertRaisesRegex(overlap.OverlapError, "kind inconsistent"):
            overlap.read_public_lane("rm", opener=lambda req, timeout: Response(page(rows)))

    def test_public_403_stops(self):
        class Forbidden(Response):
            status = 403
            headers = {"Content-Type": "text/plain"}
        with self.assertRaisesRegex(overlap.OverlapError, "non-JSON"):
            overlap.read_public_lane("rm", opener=lambda req, timeout: Forbidden(page([])))

    def test_public_pagination_drift_stops(self):
        rows = [{"key": key(1), "identityKind": "steam", "primaryRating": None}]
        data = page(rows, total=2)
        data["nextOffset"] = 50
        with self.assertRaisesRegex(overlap.OverlapError, "nextOffset"):
            overlap.read_public_lane("rm", opener=lambda req, timeout: Response(data))


if __name__ == "__main__":
    unittest.main()
