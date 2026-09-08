from __future__ import annotations

import importlib.util
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))
SPEC = importlib.util.spec_from_file_location("aoe2_speed_edge_test", SCRIPTS / "aoe2_speed_edge.py")
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class SpeedEdgeTests(unittest.TestCase):
    def test_header_parser_uses_final_response_and_collects_set_cookie(self):
        raw = (
            "HTTP/2 301\r\nlocation: https://aoe2war.com/bets\r\n\r\n"
            "HTTP/2 200\r\nserver: cloudflare\r\ncf-cache-status: DYNAMIC\r\n"
            "cache-control: s-maxage=31536000\r\nset-cookie: session=x\r\n\r\n"
        )
        parsed = MODULE.parse_final_header_block(raw)
        self.assertEqual(parsed["cf-cache-status"], "DYNAMIC")
        self.assertEqual(parsed["cache-control"], "s-maxage=31536000")
        self.assertEqual(parsed["set-cookie"], ["session=x"])

    def test_priority_fails_closed_on_server_personalization_or_runtime_cookie(self):
        self.assertEqual(
            MODULE.priority_for("server_personalized_do_not_cache", {} )[0],
            "blocked_shared_cache",
        )
        self.assertEqual(
            MODULE.priority_for("static_client_shell_candidate", {"set_cookie": True})[0],
            "blocked_shared_cache",
        )

    def test_audit_ranks_static_shell_without_caching_personalized_route(self):
        source = {
            "pages": [
                {
                    "template": "/bets",
                    "classification": "public",
                    "benchmark_representative": "/bets",
                    "source_profile": {
                        "source_path": "app/bets/page.tsx",
                        "edge_cache_classification": "static_client_shell_candidate",
                    },
                },
                {
                    "template": "/war-chest",
                    "classification": "public",
                    "benchmark_representative": "/war-chest",
                    "source_profile": {
                        "source_path": "app/war-chest/page.tsx",
                        "edge_cache_classification": "server_personalized_do_not_cache",
                    },
                },
            ]
        }
        benchmark = {
            "mode": "full",
            "release_sha": "a" * 40,
            "_path": str(MODULE.speed.STATE / "performance-receipts" / "sample.json"),
            "routes": [
                {"path": "/bets", "warm_median_ttfb_ms": 300.0, "origin_warm_median_ttfb_ms": 2.0, "warm_public_origin_gap_ms": 298.0},
                {"path": "/war-chest", "warm_median_ttfb_ms": 310.0, "origin_warm_median_ttfb_ms": 20.0, "warm_public_origin_gap_ms": 290.0},
            ],
        }

        def probe(path: str):
            return {
                "available": True,
                "cf_cache_status": "DYNAMIC",
                "next_cache_status": "HIT" if path == "/bets" else None,
                "set_cookie": False,
                "edge_cache_hit": False,
            }

        result = MODULE.build_audit(source_inventory=source, benchmark=benchmark, probe_fn=probe)
        by_route = {row["route"]: row for row in result["rows"]}
        self.assertEqual(by_route["/bets"]["priority"], "strong_edge_shell_candidate")
        self.assertEqual(by_route["/war-chest"]["priority"], "blocked_shared_cache")
        self.assertGreater(by_route["/bets"]["score"], by_route["/war-chest"]["score"])

    def test_cache_safety_signature_ignores_inventory_timestamp_but_changes_with_policy(self):
        base = {
            "generated_at": "2026-01-01T00:00:00Z",
            "pages": [{
                "template": "/bets",
                "classification": "public",
                "benchmark_representative": "/bets",
                "source_profile": {
                    "source_path": "app/bets/page.tsx",
                    "edge_cache_classification": "static_client_shell_candidate",
                    "server_request_personalization_signal": False,
                    "layout_server_personalization_signal": False,
                    "applicable_layouts": ["app/layout.tsx", "app/bets/layout.tsx"],
                },
            }],
        }
        changed_time = {**base, "generated_at": "2026-02-01T00:00:00Z"}
        changed_policy = json.loads(json.dumps(base))
        changed_policy["pages"][0]["source_profile"]["edge_cache_classification"] = "server_personalized_do_not_cache"
        self.assertEqual(MODULE.cache_safety_signature(base), MODULE.cache_safety_signature(changed_time))
        self.assertNotEqual(MODULE.cache_safety_signature(base), MODULE.cache_safety_signature(changed_policy))

    def test_cookie_discovery_finds_known_app_cookie_contracts(self):
        names = MODULE.discover_app_cookie_names()
        self.assertIn("aoe2hdbets_session", names)
        self.assertIn("aoe2hdbets_guest_reaction", names)
        self.assertIn("aoe2war_wargraph_spectator", names)
        self.assertIn("aoe2war_language", names)
        self.assertIn("aoe2hdbets_leaderboard_view", names)

    def test_cloudflare_plan_requires_next_hit_no_private_and_session_bypass(self):
        audit = {
            "rows": [
                {
                    "route": "/bets",
                    "priority": "strong_edge_shell_candidate",
                    "live": {"next_cache_status": "HIT", "shared_cache_prohibited": False, "set_cookie": False},
                },
                {
                    "route": "/market",
                    "priority": "static_delivery_candidate",
                    "live": {"next_cache_status": None, "shared_cache_prohibited": True, "set_cookie": False},
                },
                {
                    "route": "/war-chest",
                    "priority": "blocked_shared_cache",
                    "live": {"next_cache_status": None, "shared_cache_prohibited": True, "set_cookie": False},
                },
            ]
        }
        plan = MODULE.build_cloudflare_plan(audit)
        self.assertEqual(plan["eligible_exact_routes"], ["/bets"])
        self.assertIn("/war-chest", plan["blocked_routes"])
        self.assertIn("/market", plan["review_routes"])
        self.assertIn('not http.cookie contains "aoe2hdbets_session="', plan["proposed_cache_rule_expression"])
        self.assertIn("aoe2hdbets_session", plan["cookie_bypass_names"])
        self.assertIn("aoe2war_language", plan["cookie_bypass_names"])
        self.assertIn("aoe2hdbets_leaderboard_lane", plan["cookie_bypass_names"])
        self.assertFalse(plan["mutation_authorized"])

    def test_bin_exposes_edge_delivery_audit(self):
        source = (ROOT / "bin" / "aoe2war").read_text(encoding="utf-8")
        self.assertIn('SPEED_EDGE="$BIN_DIR/../scripts/aoe2_speed_edge.py"', source)
        self.assertIn('[ "${1:-}" = "edge" ]', source)


if __name__ == "__main__":
    unittest.main()
