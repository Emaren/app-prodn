"""Offline archived HD rating selection must never become current authority."""
from __future__ import annotations

import copy
import unittest
from scripts.leaderboard_steam_history_policy import (
    extract_candidate_evidence, resolve_historical_lane,
)
from test_leaderboard_steam_archive_parser_cli import historical_fixture

STEAM = "76561197960265730"


def candidate(rm=1520, dm=1615, at="2025-07-01T10:20:30.000Z",
              replay="b" * 64, game=100):
    return {
        "steamId": STEAM, "gameStatsId": game,
        "replaySha256": replay, "apiParserSource": "a" * 40,
        "ratingObservedAt": at,
        "steamRmRating": rm, "steamDmRating": dm,
        "steamRmSource": "hd_header", "steamDmSource": "hd_header",
        "observationAuthority": "historical_candidate_only",
    }


def watcher(lane, rating=1700, at="2025-06-01T01:00:00.000Z"):
    return {
        "steamId": STEAM, "lane": lane,
        "rating": rating, "observedAt": at,
    }


class HistoricalPolicyTests(unittest.TestCase):
    def test_empty_unrated(self):
        x = resolve_historical_lane(STEAM, "rm", [])
        self.assertEqual((x["source"], x["value"]), ("unavailable", None))

    def test_newest_historical_per_lane_by_played_on_not_ingestion(self):
        rows = [candidate(rm=1300, dm=1650, at="2025-06-01T00:00:00.000Z"),
                candidate(rm=1400, dm=1550, at="2025-07-01T00:00:00.000Z",
                          replay="c" * 64, game=101)]
        rm = resolve_historical_lane(STEAM, "rm", rows)
        dm = resolve_historical_lane(STEAM, "dm", rows)
        self.assertEqual((rm["source"], rm["value"]),
                         ("last_known_header", 1400))
        self.assertEqual((dm["source"], dm["value"]),
                         ("last_known_header", 1550))

    def test_watcher_wins_even_against_newer_historical(self):
        x = resolve_historical_lane(
            STEAM, "rm", [candidate()], qualified_watcher=watcher("rm", 1710)
        )
        self.assertEqual((x["source"], x["value"]),
                         ("current_watcher", 1710))

    def test_each_lane_is_independent(self):
        records = [candidate()]
        self.assertEqual(
            resolve_historical_lane(
                STEAM, "rm", records,
                qualified_watcher=watcher("rm", 1720)
            )["value"], 1720
        )
        self.assertEqual(resolve_historical_lane(
            STEAM, "dm", records
        )["value"], 1615)

    def test_invalid_watcher_fails_closed_without_historical_downgrade(self):
        for bad in (
            watcher("rm", at=None),
            watcher("dm"),
            watcher("rm", rating=0),
            {"steamId": "76561197960265731", "lane": "rm",
             "rating": 1740, "observedAt": "2025-08-01T00:00:00.000Z"},
        ):
            with self.subTest(bad=bad):
                x = resolve_historical_lane(
                    STEAM, "rm", [candidate()], qualified_watcher=bad
                )
                self.assertEqual(
                    (x["source"], x["value"]),
                    ("quarantined", None),
                )

    def test_latest_timestamp_conflict_is_quarantined(self):
        x = resolve_historical_lane(
            STEAM, "rm",
            [candidate(rm=1520), candidate(rm=1530, replay="c" * 64,
                                            game=101)]
        )
        self.assertEqual(x["source"], "quarantined")
        self.assertEqual(x["reason"], "conflicting_latest_header_ratings")
        self.assertIsNone(x["value"])

    def test_same_time_same_rating_is_not_conflict(self):
        x = resolve_historical_lane(
            STEAM, "rm",
            [candidate(), candidate(replay="c" * 64, game=101)]
        )
        self.assertEqual((x["source"], x["value"], x["archiveEvidenceCount"]),
                         ("last_known_header", 1520, 2))

    def test_older_conflict_cannot_displace_newest(self):
        records = [
            candidate(rm=1510, at="2025-05-01T00:00:00.000Z"),
            candidate(rm=1520, at="2025-05-01T00:00:00.000Z",
                      replay="c" * 64, game=101),
            candidate(rm=1530, at="2025-07-01T00:00:00.000Z",
                      replay="d" * 64, game=102),
        ]
        self.assertEqual(resolve_historical_lane(
            STEAM, "rm", records
        )["value"], 1530)

    def test_invalid_source_and_clock_are_quarantined(self):
        cases = [
            {"steamRmSource": "unmarked"},
            {"ratingObservedAt": None},
            {"ratingObservedAt": "2025-07-01"},
            {"steamRmRating": 0},
            {"steamRmRating": True},
            {"replaySha256": "invalid"},
            {"observationAuthority": "signed"},
        ]
        for patch in cases:
            with self.subTest(patch=patch):
                x = resolve_historical_lane(
                    STEAM, "rm", [dict(candidate(), **patch)]
                )
                self.assertEqual(x["source"], "quarantined")

    def test_wrong_identity_cannot_become_target(self):
        other = dict(candidate(), steamId="76561197960265731")
        self.assertEqual(resolve_historical_lane(
            STEAM, "rm", [other]
        )["source"], "unavailable")

    def test_raw_unknown_identity_or_lane_rejected(self):
        with self.assertRaisesRegex(ValueError, "SteamID64"):
            resolve_historical_lane("123", "rm", [])
        with self.assertRaisesRegex(ValueError, "lane"):
            resolve_historical_lane(STEAM, "site_elo", [])

    def test_extract_rejects_legacy_schemes_and_keeps_v3_values(self):
        payload = historical_fixture()
        rows = extract_candidate_evidence([payload])
        self.assertEqual(rows[0]["steamRmRating"], 1520)
        self.assertEqual(rows[0]["steamDmRating"], 1615)
        old = copy.deepcopy(payload)
        old["schemaVersion"] = 2
        old.pop("privateHistoricalCandidates")
        with self.assertRaisesRegex(RuntimeError, "unexpected"):
            extract_candidate_evidence([old])

    def test_exact_repeat_deduplicates_without_mutating_source(self):
        payload = historical_fixture()
        records = extract_candidate_evidence([payload, payload])
        self.assertEqual(len(records), 1)
        records[0]["steamRmRating"] = 777
        self.assertEqual(
            payload["privateHistoricalCandidates"][0]["steamRmRating"],
            1520,
        )

    def test_duplicate_same_sha_conflicting_values_fail_closed(self):
        first = historical_fixture()
        second = copy.deepcopy(first)
        second["privateHistoricalCandidates"][0]["steamRmRating"] = 1700
        # Each receipt's internal archive binding still matches its
        # independent manifest; cross-receipt source disagreement is forbidden.
        with self.assertRaisesRegex(ValueError, "conflicting duplicate"):
            extract_candidate_evidence([first, second])

    def test_non_mapping_watcher_input_quarantined(self):
        x = resolve_historical_lane(
            STEAM, "rm", [candidate()], qualified_watcher="signed"
        )
        self.assertEqual(x["source"], "quarantined")

    def test_tampered_rating_source_fails_full_receipt_validation(self):
        payload = historical_fixture()
        payload["privateHistoricalCandidates"][0]["steamRmSource"] = "unmarked"
        with self.assertRaisesRegex(RuntimeError, "not independently qualified"):
            extract_candidate_evidence([payload])


if __name__ == "__main__":
    unittest.main()
