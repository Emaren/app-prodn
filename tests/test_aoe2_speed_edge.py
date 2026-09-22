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

        result = MODULE.build_audit(
            source_inventory=source,
            benchmark=benchmark,
            probe_fn=probe,
            edge_authority={},
        )
        by_route = {row["route"]: row for row in result["rows"]}
        self.assertEqual(by_route["/bets"]["priority"], "strong_edge_shell_candidate")
        self.assertEqual(by_route["/war-chest"]["priority"], "blocked_shared_cache")
        self.assertGreater(by_route["/bets"]["score"], by_route["/war-chest"]["score"])

    def test_audit_marks_verified_installed_cohorts_as_governed_even_when_probe_is_expired(self):
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
                    "template": "/market",
                    "classification": "public",
                    "benchmark_representative": "/market",
                    "source_profile": {
                        "source_path": "app/market/page.tsx",
                        "edge_cache_classification": "static_or_revalidated_public_candidate",
                    },
                },
            ]
        }
        benchmark = {
            "mode": "full",
            "release_sha": "a" * 40,
            "_path": str(MODULE.speed.STATE / "performance-receipts" / "sample.json"),
            "routes": [
                {"path": "/bets", "warm_median_ttfb_ms": 250.0, "origin_warm_median_ttfb_ms": 2.0, "warm_public_origin_gap_ms": 248.0},
                {"path": "/market", "warm_median_ttfb_ms": 330.0, "origin_warm_median_ttfb_ms": 3.0, "warm_public_origin_gap_ms": 327.0},
            ],
        }
        authority = {
            "static": {
                "tier": "static",
                "routes": ["/bets"],
                "route_count": 1,
                "ttl_seconds": 300,
                "authority_receipt": "static.json",
            },
            "dynamic": {
                "tier": "dynamic",
                "routes": ["/market"],
                "route_count": 1,
                "ttl_seconds": 30,
                "authority_receipt": "dynamic.json",
            },
            "overlap_routes": [],
        }

        result = MODULE.build_audit(
            source_inventory=source,
            benchmark=benchmark,
            probe_fn=lambda route: {
                "available": True,
                "cf_cache_status": "EXPIRED",
                "next_cache_status": None,
                "set_cookie": False,
                "shared_cache_prohibited": route == "/market",
                "edge_cache_hit": False,
            },
            edge_authority=authority,
        )
        by_route = {row["route"]: row for row in result["rows"]}
        self.assertEqual(by_route["/bets"]["priority"], "installed_static_edge")
        self.assertEqual(by_route["/market"]["priority"], "installed_dynamic_edge")
        self.assertEqual(by_route["/market"]["edge_authority"]["ttl_seconds"], 30)
        self.assertTrue(by_route["/market"]["live"]["shared_cache_prohibited"])
        self.assertFalse(by_route["/market"]["edge_authority_drift"])
        self.assertEqual(result["counts"]["installed_static_edge"], 1)
        self.assertEqual(result["counts"]["installed_dynamic_edge"], 1)
        self.assertEqual(result["installed_edge_authority"], authority)

    def test_reusable_edge_audit_invalidates_when_installed_authority_changes(self):
        source = {"pages": []}
        benchmark = {"release_sha": "a" * 40}
        authority = {"static": None, "dynamic": None, "overlap_routes": []}
        audit = {
            "benchmark_release_sha": "a" * 40,
            "cache_safety_signature": MODULE.cache_safety_signature(source),
            "installed_edge_authority": authority,
            "generated_at": MODULE.utc_now(),
        }
        original = MODULE.installed_edge_authority_snapshot
        try:
            MODULE.installed_edge_authority_snapshot = lambda: authority
            self.assertTrue(MODULE.reusable_edge_audit(audit, source, benchmark))
            MODULE.installed_edge_authority_snapshot = lambda: {
                "static": None,
                "dynamic": {
                    "tier": "dynamic",
                    "routes": ["/market"],
                    "route_count": 1,
                    "ttl_seconds": 30,
                    "authority_receipt": "dynamic.json",
                },
                "overlap_routes": [],
            }
            self.assertFalse(MODULE.reusable_edge_audit(audit, source, benchmark))
        finally:
            MODULE.installed_edge_authority_snapshot = original

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
        policy = MODULE.load_dynamic_policy()
        return {
            "pages": [
                {
                    "template": row["route"],
                    "classification": "public",
                    "benchmark_representative": row["route"],
                    "source_profile": {
                        "source_path": f"app{row['route']}/page.tsx",
                        "edge_cache_classification": (
                            "anonymous_dynamic_candidate_review"
                            if row["admission"] == "anonymous_dynamic"
                            else "static_or_revalidated_public_candidate"
                        ),
                        "server_request_personalization_signal": False,
                        "layout_server_personalization_signal": False,
                    },
                }
                for row in policy["routes"]
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
            ["/academy", "/ai", "/battle-archive", "/champions", "/champions/world", "/clans", "/forum", "/game-stats/16218/review", "/kingdom", "/leaderboard/og", "/market", "/market/shops/chat-effects", "/matchups/c_u_0df73bdbb64646c19e4a9bfd225b3285/n_Seedy_SI69", "/matchups/team/WyJjX3VfMGRmNzNiZGJiNjQ2NDZjMTllNGE5YmZkMjI1YjMyODUiLCJjX3VfMTc4MTYzODQzNjFmNGM4YThkNTdjNjkzNDI2NTEwMGIiLCJuX2NvcHBlcl9oZWFkX3JvYWQiXQ/WyJuX2Nhcmxvc2lzbSIsIm5fUm9NYV9WaWNUb1JfIiwibl9UYW5rVG9wTWFzdGVyIl0", "/national-champions", "/players/by-name/Emaren", "/radio", "/rivalries", "/traffic", "/war-engine", "/wolo", "/zodiac"],
        )
        self.assertTrue(all(row["ttl_seconds"] == 30 for row in policy["routes"]))
        self.assertTrue(all(row["empty_query_only"] is True for row in policy["routes"]))
        admissions = {row["route"]: row["admission"] for row in policy["routes"]}
        self.assertEqual(admissions["/market"], "request_time_public")
        self.assertEqual(admissions["/forum"], "request_time_public")
        self.assertEqual(admissions["/academy"], "anonymous_dynamic")
        self.assertIn("/kingdom", [row["route"] for row in policy["routes"]])
        self.assertIn("/wolo", [row["route"] for row in policy["routes"]])
        self.assertIn("/rivalries", [row["route"] for row in policy["routes"]])
        self.assertIn("/war-engine", [row["route"] for row in policy["routes"]])
        self.assertIn("/zodiac", [row["route"] for row in policy["routes"]])
        self.assertNotIn("/players/u_626ea6497a984dabbc2338ef54c5d333", [row["route"] for row in policy["routes"]])

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

    def test_dynamic_inventory_admits_only_declared_public_classes_without_personalization(self):
        inventory = self._dynamic_source_inventory()
        routes = MODULE.dynamic_inventory_routes(inventory)
        self.assertEqual(routes["/academy"]["admission"], "anonymous_dynamic")
        self.assertEqual(routes["/market"]["admission"], "request_time_public")

        personalized = self._dynamic_source_inventory()
        market = next(
            page for page in personalized["pages"]
            if page["benchmark_representative"] == "/market"
        )
        market["source_profile"]["server_request_personalization_signal"] = True
        routes = MODULE.dynamic_inventory_routes(personalized)
        self.assertNotIn("/market", routes)

    def test_dynamic_qualification_rejects_policy_source_admission_mismatch(self):
        original = MODULE.require_dynamic_release_identity
        try:
            MODULE.require_dynamic_release_identity = lambda: self._dynamic_identity()
            policy = MODULE.load_dynamic_policy()
            market = next(row for row in policy["routes"] if row["route"] == "/market")
            market["admission"] = "anonymous_dynamic"
            with self.assertRaisesRegex(MODULE.EdgeAuditError, "admission mismatch"):
                MODULE.qualify_dynamic_edge(
                    self._dynamic_source_inventory(),
                    policy=policy,
                    sample_offsets=(0.0, 15.0, 30.0),
                    public_probe=lambda route: {},
                    origin_probe=lambda route: {},
                    sleep_fn=lambda _: None,
                    monotonic_fn=lambda: 0.0,
                )
        finally:
            MODULE.require_dynamic_release_identity = original

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
            self.assertEqual(result["qualified_count"], len(MODULE.load_dynamic_policy()["routes"]))
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

    def test_dynamic_review_qualification_is_read_only_and_separates_stable_from_churn(self):
        original = MODULE.require_dynamic_release_identity
        clock = [0.0]
        calls = {"/changing": 0}
        try:
            MODULE.require_dynamic_release_identity = lambda: self._dynamic_identity()
            source = {
                "pages": [
                    {
                        "template": "/stable",
                        "classification": "public",
                        "benchmark_representative": "/stable",
                        "source_profile": {
                            "source_path": "app/stable/page.tsx",
                            "edge_cache_classification": "anonymous_dynamic_candidate_review",
                            "server_request_personalization_signal": False,
                            "layout_server_personalization_signal": False,
                        },
                    },
                    {
                        "template": "/changing",
                        "classification": "public",
                        "benchmark_representative": "/changing",
                        "source_profile": {
                            "source_path": "app/changing/page.tsx",
                            "edge_cache_classification": "anonymous_dynamic_candidate_review",
                            "server_request_personalization_signal": False,
                            "layout_server_personalization_signal": False,
                        },
                    },
                ]
            }
            audit = {
                "_path": str(MODULE.speed.STATE / "performance-edge-receipts" / "review-source.json"),
                "rows": [
                    {"route": "/stable", "priority": "anonymous_dynamic_freshness_review"},
                    {"route": "/changing", "priority": "anonymous_dynamic_freshness_review"},
                ],
            }

            def monotonic():
                return clock[0]

            def sleep(seconds):
                clock[0] += seconds

            def public(route):
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
                row = public(route)
                row["effective_url"] = MODULE.speed.ORIGIN_BASE + route
                row["cf_cache_status"] = None
                if route == "/changing":
                    calls[route] += 1
                    if calls[route] == 3:
                        row["body_sha256"] = "f" * 64
                return row

            result = MODULE.qualify_dynamic_review_candidates(
                source,
                audit,
                public_probe=public,
                origin_probe=origin,
                sleep_fn=sleep,
                monotonic_fn=monotonic,
            )
            by_route = {row["route"]: row for row in result["rows"]}
            self.assertTrue(result["review_only"])
            self.assertFalse(result["mutation_authorized"])
            self.assertEqual(result["route_count"], 2)
            self.assertEqual(result["technically_qualified_count"], 1)
            self.assertTrue(by_route["/stable"]["technically_qualified"])
            self.assertFalse(by_route["/stable"]["mutation_authorized"])
            self.assertFalse(by_route["/changing"]["technically_qualified"])
            self.assertTrue(
                any(
                    "origin body changed" in reason
                    for reason in by_route["/changing"]["reasons"]
                )
            )
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
            self.assertEqual(plan["eligible_exact_routes"], [row["route"] for row in policy["routes"]])
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
            result = MODULE.verify_dynamic_cloudflare_apply(dynamic_plan, static_plan, sleep_fn=lambda _: None)
            self.assertTrue(result["ok"])
            self.assertEqual(result["failures"], [])
            self.assertEqual(len(result["static_cohort"]), 2)
        finally:
            MODULE.cache_status_probe = original

    def test_dynamic_post_apply_static_verifier_allows_bounded_edge_revalidation(self):
        original = MODULE.cache_status_probe
        try:
            calls = {"/upload": 0}

            def probe(path, *, cookie=None, rsc=False, query=None):
                if path == "/api/deployment-version" or cookie or rsc or query:
                    return {"ok": True, "cf_cache_status": "DYNAMIC"}
                if path in {"/academy", "/champions"}:
                    return {"ok": True, "cf_cache_status": "HIT"}
                calls[path] = calls.get(path, 0) + 1
                sequence = ["MISS", "EXPIRED", "EXPIRED", "EXPIRED", "HIT"]
                return {"ok": True, "cf_cache_status": sequence[min(calls[path] - 1, len(sequence) - 1)]}

            MODULE.cache_status_probe = probe
            result = MODULE.verify_dynamic_cloudflare_apply(
                {
                    "eligible_exact_routes": ["/academy", "/champions"],
                    "cookie_bypass_names": ["aoe2hdbets_session"],
                },
                {"eligible_exact_routes": ["/upload"]},
                sleep_fn=lambda _: None,
            )
            self.assertTrue(result["ok"])
            self.assertEqual(result["failures"], [])
            self.assertEqual(result["static_prime"][0]["probe"]["cf_cache_status"], "MISS")
            self.assertEqual(len(result["static_cohort"][0]["attempts"]), 4)
            self.assertEqual(result["static_cohort"][0]["final"]["cf_cache_status"], "HIT")
        finally:
            MODULE.cache_status_probe = original

    def test_asset_extractor_finds_one_q95_managed_hero_across_responsive_widths(self):
        hero = "/uploads/managed-assets/background/hero-chain-123-abc.png"
        sample = (
            '<link rel="preload" as="image" imagesrcset="'
            '/_next/image?url=%2Fbrand%2Faoe2war-logo.webp&amp;w=1080&amp;q=75 1x, '
            '/_next/image?url=%2Fuploads%2Fmanaged-assets%2Fbackground%2Fhero-chain-123-abc.png&amp;w=1080&amp;q=95 1080w, '
            '/_next/image?url=%2Fuploads%2Fmanaged-assets%2Fbackground%2Fhero-chain-123-abc.png&amp;w=1920&amp;q=95 1920w">'
        )
        rows = MODULE.extract_hero_image_candidates(sample)
        self.assertEqual({row["source_path"] for row in rows}, {hero})
        self.assertEqual([row["width"] for row in rows], [1080, 1920])
        self.assertTrue(all(row["quality"] == 95 for row in rows))

    def test_asset_plan_binds_certified_release_live_hero_and_vary_contract(self):
        original_identity = MODULE.require_dynamic_release_identity
        original_discover = MODULE.discover_live_hero_image
        hero = "/uploads/managed-assets/background/hero-chain-123-abc.png"
        try:
            MODULE.require_dynamic_release_identity = lambda: self._dynamic_identity()
            MODULE.discover_live_hero_image = lambda: {
                "source_path": hero,
                "quality": 95,
                "widths": [640, 1080, 1920],
                "probe_width": 1920,
                "candidate_count": 3,
            }
            plan = MODULE.build_asset_cloudflare_plan()
            self.assertEqual(plan["release_sha"], "a" * 40)
            self.assertEqual(plan["source_path"], hero)
            self.assertEqual(plan["quality"], 95)
            self.assertEqual(plan["edge_ttl_seconds"], 3600)
            self.assertEqual(plan["vary_default"], "bypass")
            self.assertEqual(plan["vary_accept"], "normalize")
            self.assertTrue(plan["query_string_preserved"])
            self.assertIn('any(http.request.uri.args["url"][*] == "%2Fuploads%2Fmanaged-assets%2Fbackground%2Fhero-chain-123-abc.png")', plan["expression"])
            self.assertIn('any(http.request.uri.args["q"][*] == "95")', plan["expression"])
            self.assertIn('any(http.request.uri.args["w"][*] == "1920")', plan["expression"])
        finally:
            MODULE.require_dynamic_release_identity = original_identity
            MODULE.discover_live_hero_image = original_discover

    def test_asset_authority_uses_latest_successful_dynamic_apply_receipt(self):
        old_receipts = MODULE.EDGE_RECEIPTS
        try:
            with tempfile.TemporaryDirectory() as tmp:
                MODULE.EDGE_RECEIPTS = Path(tmp)

                def write(name, *, mtime, routes, rollback=False, verification_ok=True):
                    path = MODULE.EDGE_RECEIPTS / name
                    path.write_text(json.dumps({
                        "kind": "aoe2war-speedos-cloudflare-dynamic-apply",
                        "rollback_performed": rollback,
                        "verification": {"ok": verification_ok},
                        "dynamic_plan": {"eligible_exact_routes": routes},
                    }))
                    os.utime(path, (mtime, mtime))
                    return path

                expected = write(
                    "20260917T000000Z-cloudflare-dynamic-apply.json",
                    mtime=100,
                    routes=["/academy", "/wolo"],
                )
                write(
                    "20260917T000100Z-cloudflare-dynamic-apply.json",
                    mtime=200,
                    routes=["/market"],
                    rollback=True,
                )
                authority = MODULE.latest_successful_dynamic_apply()
                self.assertIsNotNone(authority)
                self.assertEqual(authority["dynamic_plan"]["eligible_exact_routes"], ["/academy", "/wolo"])
                self.assertEqual(authority["_path"], str(expected))
        finally:
            MODULE.EDGE_RECEIPTS = old_receipts

    def test_asset_verifier_proves_variants_q90_exclusion_and_html_preservation(self):
        original_asset_probe = MODULE.asset_probe
        original_cache_probe = MODULE.cache_status_probe
        try:
            def asset_probe(source_path, *, accept, width=1920, quality=95):
                if quality == 90:
                    return {
                        "ok": True,
                        "cf_cache_status": "DYNAMIC",
                        "content_type": "image/webp",
                        "body_sha256": "9" * 64,
                        "bytes": 500000,
                        "vary": "Accept",
                    }
                fallback = "image/png" in accept
                digest_char = "b" if fallback else ("c" if width == 1080 else "a")
                return {
                    "ok": True,
                    "cf_cache_status": "HIT",
                    "content_type": "image/png" if fallback else "image/webp",
                    "body_sha256": digest_char * 64,
                    "bytes": 728090 if width == 1920 else 400000,
                    "vary": "Accept",
                    "next_cache_status": "HIT",
                }

            def cache_probe(path, **kwargs):
                if path == "/api/deployment-version":
                    return {"ok": True, "cf_cache_status": "DYNAMIC"}
                return {"ok": True, "cf_cache_status": "HIT"}

            MODULE.asset_probe = asset_probe
            MODULE.cache_status_probe = cache_probe
            result = MODULE.verify_asset_cloudflare_apply(
                {"source_path": "/uploads/managed-assets/background/hero-chain-123-abc.png"},
                {"eligible_exact_routes": ["/about", "/download"]},
                {"eligible_exact_routes": ["/academy", "/wolo"]},
                sleep_fn=lambda _: None,
            )
            self.assertTrue(result["ok"])
            self.assertEqual(result["failures"], [])
            self.assertEqual(result["excluded_q90"]["cf_cache_status"], "DYNAMIC")
            self.assertEqual(len(result["static_cohort"]), 2)
            self.assertEqual(len(result["dynamic_cohort"]), 2)
        finally:
            MODULE.asset_probe = original_asset_probe
            MODULE.cache_status_probe = original_cache_probe

    def test_featured_avatar_plan_binds_live_roster_and_exact_query_contract(self):
        original_identity = MODULE.require_dynamic_release_identity
        original_discover = MODULE.discover_live_featured_avatar_paths
        try:
            MODULE.require_dynamic_release_identity = lambda: self._dynamic_identity()
            MODULE.discover_live_featured_avatar_paths = lambda: {
                "paths": [
                    "/api/media-assets/avatar/user-aoe2hd-ai-concierge-featured",
                    "/api/media-assets/avatar/user-u-79ce46af3d504ceca718e5fda83e3502-featured",
                ],
                "roster_sha256": "b" * 64,
                "featured_entry_count": 21,
                "eligible_path_count": 2,
            }
            plan = MODULE.build_featured_avatar_cloudflare_plan()
            self.assertEqual(plan["release_sha"], "a" * 40)
            self.assertEqual(plan["eligible_path_count"], 2)
            self.assertEqual(plan["roster_sha256"], "b" * 64)
            self.assertEqual(plan["cache_version"], "20260630a")
            self.assertEqual(plan["edge_ttl_seconds"], 3600)
            self.assertIn('http.request.uri.args["size"]', plan["expression"])
            self.assertIn('"card"', plan["expression"])
            self.assertIn("20260630a", plan["expression"])
            self.assertEqual(
                MODULE.slugify_avatar_target("aoe2hd_ai_concierge"),
                "aoe2hd-ai-concierge",
            )
        finally:
            MODULE.require_dynamic_release_identity = original_identity
            MODULE.discover_live_featured_avatar_paths = original_discover

    def test_featured_avatar_verifier_proves_hits_exclusions_and_stack_preservation(self):
        original_avatar_probe = MODULE.featured_avatar_probe
        original_cache_probe = MODULE.cache_status_probe
        original_asset_probe = MODULE.asset_probe
        original_build_asset = MODULE.build_asset_cloudflare_plan
        try:
            def avatar_probe(path, *, accept=MODULE.ASSET_MODERN_ACCEPT, size="card", cache_version=MODULE.FEATURED_AVATAR_CACHE_VERSION):
                excluded = size != "card" or cache_version != MODULE.FEATURED_AVATAR_CACHE_VERSION
                digest = ("b" if "image/png" in accept else "a") * 64
                return {
                    "ok": True,
                    "cf_cache_status": "DYNAMIC" if excluded else "HIT",
                    "content_type": "image/webp",
                    "body_sha256": digest,
                    "bytes": 120000,
                }

            def cache_probe(path, **kwargs):
                if path == "/api/deployment-version":
                    return {"ok": True, "cf_cache_status": "DYNAMIC"}
                return {"ok": True, "cf_cache_status": "HIT"}

            MODULE.featured_avatar_probe = avatar_probe
            MODULE.cache_status_probe = cache_probe
            hero_statuses = iter(["REVALIDATED", "HIT"])
            MODULE.asset_probe = lambda source_path, *, accept, width=1920, quality=95: {
                "ok": True,
                "cf_cache_status": next(hero_statuses),
            }
            MODULE.build_asset_cloudflare_plan = lambda: {
                "source_path": "/uploads/managed-assets/background/hero-chain-123-abc.png"
            }
            result = MODULE.verify_featured_avatar_cloudflare_apply(
                {
                    "eligible_exact_paths": [
                        "/api/media-assets/avatar/user-a-featured",
                        "/api/media-assets/avatar/user-b-featured",
                    ]
                },
                {"eligible_exact_routes": ["/about"]},
                {"eligible_exact_routes": ["/academy"]},
                sleep_fn=lambda _: None,
            )
            self.assertTrue(result["ok"])
            self.assertEqual(result["failures"], [])
            self.assertEqual(len(result["featured_avatar_rows"]), 2)
            self.assertEqual(result["excluded_thumb"]["cf_cache_status"], "DYNAMIC")
            self.assertEqual(result["excluded_version"]["cf_cache_status"], "DYNAMIC")
            self.assertEqual(result["hero_probe"]["cf_cache_status"], "HIT")
            self.assertEqual(
                [row["cf_cache_status"] for row in result["hero_convergence"]["attempts"]],
                ["REVALIDATED", "HIT"],
            )
        finally:
            MODULE.featured_avatar_probe = original_avatar_probe
            MODULE.cache_status_probe = original_cache_probe
            MODULE.asset_probe = original_asset_probe
            MODULE.build_asset_cloudflare_plan = original_build_asset

    def test_remote_cloudflare_service_accepts_featured_avatar_commands(self):
        original_run = MODULE.subprocess.run
        try:
            def fake_run(args, **kwargs):
                command = "apply-featured-avatar" if "apply-featured-avatar" in args[-1] else "rollback-featured-avatar"
                class Result:
                    returncode = 0
                    stderr = ""
                    stdout = json.dumps({"ok": True, "command": command}) + "\n"
                return Result()

            MODULE.subprocess.run = fake_run
            self.assertEqual(
                MODULE.remote_cloudflare_service("apply-featured-avatar")["command"],
                "apply-featured-avatar",
            )
            self.assertEqual(
                MODULE.remote_cloudflare_service("rollback-featured-avatar")["command"],
                "rollback-featured-avatar",
            )
        finally:
            MODULE.subprocess.run = original_run

    def test_bin_exposes_edge_delivery_audit(self):
        source = (ROOT / "bin" / "aoe2war").read_text(encoding="utf-8")
        self.assertIn('SPEED_EDGE="$BIN_DIR/../scripts/aoe2_speed_edge.py"', source)
        self.assertIn('[ "${1:-}" = "edge" ]', source)


if __name__ == "__main__":
    unittest.main()
