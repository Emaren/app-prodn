from __future__ import annotations

import importlib.util
import json
import os
import sys
import tempfile
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
        self.assertIn('not http.request.uri.query contains "_rsc="', plan["proposed_cache_rule_expression"])
        self.assertIn('not http.cookie contains "aoe2hdbets_session="', plan["proposed_cache_rule_expression"])
        self.assertEqual(plan["edge_ttl_seconds"], 300)
        self.assertFalse(plan["rsc_cache_authorized"])
        self.assertIn("aoe2hdbets_session", plan["cookie_bypass_names"])
        self.assertIn("aoe2war_language", plan["cookie_bypass_names"])
        self.assertIn("aoe2hdbets_leaderboard_lane", plan["cookie_bypass_names"])
        self.assertFalse(plan["mutation_authorized"])


    def test_static_replan_preserves_owned_safe_routes_adds_new_hits_and_revokes_unsafe(self):
        audit = {
            "rows": [
                {
                    "route": "/about",
                    "source_cache_classification": "static_or_revalidated_public_candidate",
                    "priority": "already_edge_cached_public",
                    "live": {"next_cache_status": None, "shared_cache_prohibited": False, "set_cookie": False},
                },
                {
                    "route": "/app",
                    "source_cache_classification": "static_client_shell_candidate",
                    "priority": "strong_edge_shell_candidate",
                    "live": {"next_cache_status": None, "shared_cache_prohibited": False, "set_cookie": False},
                },
                {
                    "route": "/bets",
                    "source_cache_classification": "static_client_shell_candidate",
                    "priority": "strong_edge_shell_candidate",
                    "live": {"next_cache_status": "HIT", "shared_cache_prohibited": False, "set_cookie": False},
                },
                {
                    "route": "/academy",
                    "source_cache_classification": "anonymous_dynamic_candidate_review",
                    "priority": "anonymous_dynamic_freshness_review",
                    "live": {"next_cache_status": None, "shared_cache_prohibited": False, "set_cookie": False},
                },
                {
                    "route": "/war-chest",
                    "source_cache_classification": "server_personalized_do_not_cache",
                    "priority": "blocked_shared_cache",
                    "live": {"next_cache_status": None, "shared_cache_prohibited": True, "set_cookie": False},
                },
            ]
        }
        installed = {"eligible_exact_routes": ["/about", "/academy", "/app", "/war-chest"]}
        plan = MODULE.build_cloudflare_plan(audit, installed_plan=installed)
        self.assertEqual(plan["eligible_exact_routes"], ["/about", "/app", "/bets"])
        self.assertEqual(plan["installed_exact_routes_before"], ["/about", "/academy", "/app", "/war-chest"])
        self.assertEqual(plan["preserved_installed_routes"], ["/about", "/app"])
        self.assertEqual(plan["newly_eligible_routes"], ["/bets"])
        self.assertEqual(plan["revoked_installed_routes"], ["/academy", "/war-chest"])
        self.assertIn("/academy", plan["review_routes"])
        self.assertIn("/war-chest", plan["blocked_routes"])


    def _dynamic_source_inventory(self):
        return {
            "pages": [
                {
                    "template": route,
                    "classification": "public",
                    "benchmark_representative": route,
                    "source_profile": {
                        "source_path": f"app{route}/page.tsx",
                        "edge_cache_classification": "anonymous_dynamic_candidate_review",
                        "server_request_personalization_signal": False,
                        "layout_server_personalization_signal": False,
                    },
                }
                for route in ("/academy", "/ai", "/battle-archive", "/bounties", "/champions", "/clans", "/national-champions")
            ]
        }

    def _dynamic_identity(self):
        sha = "a" * 40
        return {
            "release_sha": sha,
            "operator_source_sha": sha,
            "github_main_sha": sha,
            "build_id": "build",
            "build_version": "version",
            "certification": "CERTIFIED",
        }

    def test_dynamic_policy_is_bounded_to_exact_30_second_empty_query_routes(self):
        policy = MODULE.load_dynamic_policy()
        self.assertEqual(
            [row["route"] for row in policy["routes"]],
            ["/academy", "/ai", "/battle-archive", "/bounties", "/champions", "/clans", "/national-champions"],
        )
        self.assertTrue(all(row["ttl_seconds"] == 30 for row in policy["routes"]))
        self.assertTrue(all(row["empty_query_only"] is True for row in policy["routes"]))

    def test_dynamic_apply_static_authority_uses_latest_successful_static_apply_receipt(self):
        old_receipts = MODULE.EDGE_RECEIPTS
        try:
            with tempfile.TemporaryDirectory() as tmp:
                MODULE.EDGE_RECEIPTS = Path(tmp)

                def write(name, *, mtime, routes, rollback=False, verification_ok=True):
                    path = MODULE.EDGE_RECEIPTS / name
                    path.write_text(json.dumps({
                        "kind": "aoe2war-speedos-cloudflare-apply",
                        "rollback_performed": rollback,
                        "verification": {"ok": verification_ok},
                        "plan": {"eligible_exact_routes": routes},
                    }))
                    os.utime(path, (mtime, mtime))
                    return path

                expected = write(
                    "20260917T000000Z-cloudflare-apply.json",
                    mtime=100,
                    routes=["/about", "/app"],
                )
                write(
                    "20260917T000100Z-cloudflare-apply.json",
                    mtime=200,
                    routes=["/bets"],
                    rollback=True,
                )
                write(
                    "20260917T000200Z-cloudflare-apply.json",
                    mtime=300,
                    routes=["/download"],
                    verification_ok=False,
                )

                authority = MODULE.latest_successful_static_apply()
                self.assertIsNotNone(authority)
                self.assertEqual(authority["plan"]["eligible_exact_routes"], ["/about", "/app"])
                self.assertEqual(authority["_path"], str(expected))
        finally:
            MODULE.EDGE_RECEIPTS = old_receipts

    def test_dynamic_release_identity_requires_certified_clean_main_and_three_way_sha_parity(self):
        original_identity = MODULE.speed.collect_release_identity
        original_git = MODULE.operator_git_state
        try:
            MODULE.speed.collect_release_identity = lambda: self._dynamic_identity()
            MODULE.operator_git_state = lambda: {"branch": "main", "clean": True, "dirty_paths": 0}
            self.assertEqual(MODULE.require_dynamic_release_identity()["release_sha"], "a" * 40)

            drift = self._dynamic_identity()
            drift["github_main_sha"] = "b" * 40
            MODULE.speed.collect_release_identity = lambda: drift
            with self.assertRaises(MODULE.EdgeAuditError):
                MODULE.require_dynamic_release_identity()

            MODULE.speed.collect_release_identity = lambda: self._dynamic_identity()
            MODULE.operator_git_state = lambda: {"branch": "performance/dynamic", "clean": False, "dirty_paths": 2}
            with self.assertRaises(MODULE.EdgeAuditError):
                MODULE.require_dynamic_release_identity()
        finally:
            MODULE.speed.collect_release_identity = original_identity
            MODULE.operator_git_state = original_git

    def test_dynamic_qualification_requires_public_origin_byte_stability_for_full_ttl(self):
        original = MODULE.require_dynamic_release_identity
        clock = [0.0]
        try:
            MODULE.require_dynamic_release_identity = lambda: self._dynamic_identity()

            def monotonic():
                return clock[0]

            def sleep(seconds):
                clock[0] += seconds

            def probe(route):
                digest = __import__("hashlib").sha256(route.encode()).hexdigest()
                return {
                    "available": True,
                    "http_status": 200,
                    "content_type": "text/html; charset=utf-8",
                    "set_cookie": False,
                    "body_sha256": digest,
                    "effective_url": MODULE.PUBLIC_BASE + route,
                    "cf_cache_status": "DYNAMIC",
                }

            def origin(route):
                row = probe(route)
                row["effective_url"] = MODULE.speed.ORIGIN_BASE + route
                row["cf_cache_status"] = None
                return row

            result = MODULE.qualify_dynamic_edge(
                self._dynamic_source_inventory(),
                policy=MODULE.load_dynamic_policy(),
                public_probe=probe,
                origin_probe=origin,
                sleep_fn=sleep,
                monotonic_fn=monotonic,
            )
            self.assertTrue(result["all_qualified"])
            self.assertEqual(result["qualified_count"], 7)
            self.assertGreaterEqual(result["elapsed_seconds"], 30.0)
            self.assertTrue(all(len(row["samples"]) == 3 for row in result["rows"]))
        finally:
            MODULE.require_dynamic_release_identity = original


    def test_dynamic_qualification_allows_matching_existing_hit_but_rejects_stale_hit(self):
        original = MODULE.require_dynamic_release_identity
        clock = [0.0]
        try:
            MODULE.require_dynamic_release_identity = lambda: self._dynamic_identity()

            def monotonic():
                return clock[0]

            def sleep(seconds):
                clock[0] += seconds

            def public(route):
                return {
                    "available": True,
                    "route": route,
                    "url": MODULE.PUBLIC_BASE + route,
                    "effective_url": MODULE.PUBLIC_BASE + route,
                    "http_status": 200,
                    "content_type": "text/html; charset=utf-8",
                    "set_cookie": False,
                    "body_sha256": "e" * 64,
                    "cf_cache_status": "HIT",
                }

            def origin(route):
                row = public(route)
                row["url"] = MODULE.speed.ORIGIN_BASE + route
                row["effective_url"] = MODULE.speed.ORIGIN_BASE + route
                row["cf_cache_status"] = None
                return row

            result = MODULE.qualify_dynamic_edge(
                self._dynamic_source_inventory(),
                public_probe=public,
                origin_probe=origin,
                sleep_fn=sleep,
                monotonic_fn=monotonic,
            )
            self.assertTrue(result["all_qualified"])

            def stale_origin(route):
                row = origin(route)
                if route == "/academy":
                    row["body_sha256"] = "f" * 64
                return row

            clock[0] = 0.0
            stale = MODULE.qualify_dynamic_edge(
                self._dynamic_source_inventory(),
                public_probe=public,
                origin_probe=stale_origin,
                sleep_fn=sleep,
                monotonic_fn=monotonic,
            )
            academy = next(row for row in stale["rows"] if row["route"] == "/academy")
            self.assertFalse(stale["all_qualified"])
            self.assertFalse(academy["qualified"])
            self.assertTrue(any("public/origin byte equality failed" in reason for reason in academy["reasons"]))
        finally:
            MODULE.require_dynamic_release_identity = original

    def test_dynamic_qualification_holds_route_when_origin_changes_within_ttl(self):
        original = MODULE.require_dynamic_release_identity
        clock = [0.0]
        calls = {"/champions": 0}
        try:
            MODULE.require_dynamic_release_identity = lambda: self._dynamic_identity()

            def monotonic():
                return clock[0]

            def sleep(seconds):
                clock[0] += seconds

            def public(route):
                digest = __import__("hashlib").sha256(route.encode()).hexdigest()
                return {
                    "available": True,
                    "http_status": 200,
                    "content_type": "text/html",
                    "set_cookie": False,
                    "body_sha256": digest,
                    "effective_url": MODULE.PUBLIC_BASE + route,
                    "cf_cache_status": "DYNAMIC",
                }

            def origin(route):
                row = public(route)
                row["effective_url"] = MODULE.speed.ORIGIN_BASE + route
                row["cf_cache_status"] = None
                if route == "/champions":
                    calls[route] += 1
                    if calls[route] == 3:
                        row["body_sha256"] = "f" * 64
                return row

            result = MODULE.qualify_dynamic_edge(
                self._dynamic_source_inventory(),
                policy=MODULE.load_dynamic_policy(),
                public_probe=public,
                origin_probe=origin,
                sleep_fn=sleep,
                monotonic_fn=monotonic,
            )
            by_route = {row["route"]: row for row in result["rows"]}
            self.assertFalse(result["all_qualified"])
            self.assertFalse(by_route["/champions"]["qualified"])
            self.assertTrue(any("origin body changed" in reason for reason in by_route["/champions"]["reasons"]))
        finally:
            MODULE.require_dynamic_release_identity = original

    def test_dynamic_plan_binds_exact_expression_policy_and_qualification_digest(self):
        original = MODULE.require_dynamic_release_identity
        try:
            MODULE.require_dynamic_release_identity = lambda: self._dynamic_identity()
            policy = MODULE.load_dynamic_policy()
            qualification = {
                "schema": 1,
                "kind": "aoe2war-speedos-dynamic-edge-qualification",
                "release_identity": self._dynamic_identity(),
                "operator_source_sha": "a" * 40,
                "policy_sha256": __import__("hashlib").sha256(MODULE.DYNAMIC_POLICY_PATH.read_bytes()).hexdigest(),
                "all_qualified": True,
                "rows": [{"route": row["route"], "qualified": True} for row in policy["routes"]],
            }
            plan = MODULE.build_dynamic_cloudflare_plan(qualification)
            self.assertEqual(plan["eligible_exact_routes"], ["/academy", "/ai", "/battle-archive", "/bounties", "/champions", "/clans", "/national-champions"])
            self.assertEqual(plan["edge_ttl_seconds"], 30)
            self.assertIn('http.request.uri.query eq ""', plan["expression"])
            self.assertIn('not http.cookie contains "aoe2hdbets_session="', plan["expression"])
            self.assertRegex(plan["qualification_sha256"], r"^[0-9a-f]{64}$")
        finally:
            MODULE.require_dynamic_release_identity = original

    def test_dynamic_post_apply_verifier_preserves_static_hits_and_bypasses_variants(self):
        original = MODULE.cache_status_probe
        try:
            def probe(path, *, cookie=None, rsc=False, query=None):
                if path == "/api/deployment-version" or cookie or rsc or query:
                    return {"ok": True, "cf_cache_status": "DYNAMIC"}
                return {"ok": True, "cf_cache_status": "HIT"}

            MODULE.cache_status_probe = probe
            dynamic_plan = {
                "eligible_exact_routes": ["/academy", "/champions"],
                "cookie_bypass_names": ["aoe2hdbets_session", "aoe2war_language"],
            }
            static_plan = {"eligible_exact_routes": ["/download", "/app"]}
            result = MODULE.verify_dynamic_cloudflare_apply(dynamic_plan, static_plan)
            self.assertTrue(result["ok"])
            self.assertEqual(result["failures"], [])
            self.assertEqual(len(result["static_cohort"]), 2)
        finally:
            MODULE.cache_status_probe = original

    def test_bin_exposes_edge_delivery_audit(self):
        source = (ROOT / "bin" / "aoe2war").read_text(encoding="utf-8")
        self.assertIn('SPEED_EDGE="$BIN_DIR/../scripts/aoe2_speed_edge.py"', source)
        self.assertIn('[ "${1:-}" = "edge" ]', source)


if __name__ == "__main__":
    unittest.main()
