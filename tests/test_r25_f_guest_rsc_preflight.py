"""F nonfinancial production cutover: reject HTTP-200 Next RSC errors."""
import importlib.util
import json
import pathlib
import unittest
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[1]
PATH = ROOT / "scripts" / "aoe2_r24_f_parallel_nginx_cutover.py"
SPEC = importlib.util.spec_from_file_location("r25_f_live_guest_smoke", PATH)
f = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(f)


def flight(lines):
    return "".join(
        "<script>self.__next_f.push([1,"
        + json.dumps(chunk)
        + "])</script>"
        for chunk in lines
    )


GOOD = flight([
    "0:D{\"name\":\"Players\",\"env\":\"Server\"}\n",
    "1:[\"$\",\"main\",null,{\"children\":\"Public players\"}]\n",
]) + " " * 9500
ERROR = flight([
    "0:D{\"name\":\"Players\",\"env\":\"Server\"}\n",
    "8:E{\"digest\":\"2743377646\"}\n",
]) + " " * 9500


class TestRscPrecutover(unittest.TestCase):
    def test_good_flight_is_clean(self):
        self.assertFalse(f.production_has_server_component_error(GOOD))

    def test_next_server_error_in_http_200_is_detected(self):
        self.assertTrue(f.production_has_server_component_error(ERROR))

    def test_literal_user_text_does_not_fake_flight_error(self):
        user_text = "Visitor saw 8:E{\"digest\":\"2743377646\"} in a forum post."
        self.assertFalse(f.production_has_server_component_error(GOOD + user_text))

    def test_missing_flight_fails_closed(self):
        with self.assertRaisesRegex(f.Hold, "CONTENT_PARITY_RSC_STREAM_MISSING"):
            f.production_has_server_component_error("<html><body>looks OK</body></html>")

    def test_truncated_or_malformed_stream_fails_closed(self):
        with self.assertRaisesRegex(f.Hold, "CONTENT_PARITY_RSC_STREAM_INVALID"):
            f.production_has_server_component_error("<script>self.__next_f.push([1,\"bad\\q\"])</script>")

    def test_guest_pages_require_both_old_and_new_clean(self):
        pages = {
            (3030, route): GOOD for route in ("/players", "/war-chest", "/game-stats", "/rivalries", "/battle-archive", "/bounties", "/champions", "/radio")
        }
        pages.update({
            (3032, route): GOOD for route in ("/players", "/war-chest", "/game-stats", "/rivalries", "/battle-archive", "/bounties", "/champions", "/radio")
        })
        with mock.patch.object(f, "production_content_html", side_effect=lambda p, r: pages[(p, r)]) as getter:
            result = f.production_public_guest_page_smoke()
        self.assertEqual(len(result), 8)
        self.assertEqual(getter.call_count, 16)
        self.assertTrue(all(v["guest_server_render_healthy"] for v in result.values()))

    def test_guest_players_error_rejects_public_switch(self):
        pages = {
            (3030, route): GOOD for route in ("/players", "/war-chest", "/game-stats", "/rivalries", "/battle-archive", "/bounties", "/champions", "/radio")
        }
        pages[(3032, "/players")] = ERROR
        with mock.patch.object(f, "production_content_html", side_effect=lambda p, r: pages[(p, r)]):
            with self.assertRaisesRegex(f.Hold, "CONTENT_PARITY_CANDIDATE_GUEST_RSC_ERROR:/players"):
                f.production_public_guest_page_smoke()

    def test_guest_war_chest_and_game_stats_errors_block(self):
        for route in ("/war-chest", "/game-stats", "/rivalries", "/battle-archive", "/bounties", "/champions", "/radio"):
            pages = {
                (3030, p): GOOD for p in ("/players", "/war-chest", "/game-stats", "/rivalries", "/battle-archive", "/bounties", "/champions", "/radio")
            }
            pages.update({
                (3032, p): GOOD for p in ("/players", "/war-chest", "/game-stats", "/rivalries", "/battle-archive", "/bounties", "/champions", "/radio")
            })
            pages[(3032, route)] = ERROR
            with self.subTest(route=route):
                with mock.patch.object(f, "production_content_html", side_effect=lambda p, r: pages[(p, r)]):
                    with self.assertRaisesRegex(f.Hold, "CONTENT_PARITY_CANDIDATE_GUEST_RSC_ERROR:" + route):
                        f.production_public_guest_page_smoke()


if __name__ == "__main__":
    unittest.main()
