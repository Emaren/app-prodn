from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "aoe2_speed_cloudflare_remote",
    ROOT / "scripts" / "aoe2_speed_cloudflare_remote.py",
)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class CloudflareRemoteHelperTests(unittest.TestCase):
    def request(self, **overrides):
        routes = ["/about"]
        cookie_names = ["aoe2hdbets_session"]
        base = {
            "schema": 2,
            "kind": "aoe2war-speedos-cloudflare-apply-request",
            "zone_name": "aoe2war.com",
            "expression": MODULE.canonical_expression(routes, cookie_names),
            "edge_ttl_seconds": 300,
            "eligible_exact_routes": routes,
            "cookie_bypass_names": cookie_names,
            "plan_sha256": "a" * 64,
            "operator_source_sha": "b" * 40,
        }
        base.update(overrides)
        return base

    def test_apply_request_is_exact_zone_rsc_guarded_and_bounded(self):
        validated = MODULE.validate_request(self.request())
        self.assertEqual(validated["edge_ttl_seconds"], 300)
        self.assertEqual(validated["eligible_exact_routes"], ["/about"])
        self.assertEqual(validated["cookie_bypass_names"], ["aoe2hdbets_session"])

        api_routes = ["/api/test"]
        api_expression = MODULE.canonical_expression(api_routes, ["aoe2hdbets_session"])
        bad = [
            self.request(schema=1),
            self.request(zone_name="example.com"),
            self.request(expression='(http.host eq "aoe2war.com" or true)'),
            self.request(
                eligible_exact_routes=api_routes,
                expression=api_expression,
            ),
            self.request(cookie_bypass_names=[]),
            self.request(edge_ttl_seconds=301),
            self.request(plan_sha256="not-a-digest"),
            self.request(operator_source_sha="not-a-source-sha"),
        ]
        for payload in bad:
            with self.assertRaises(MODULE.CloudflareError):
                MODULE.validate_request(payload)

    def test_expression_is_reconstructed_from_exact_metadata(self):
        routes = ["/about", "/speed"]
        cookies = ["aoe2hdbets_session", "aoe2war_language"]
        payload = self.request(
            eligible_exact_routes=routes,
            cookie_bypass_names=cookies,
            expression=MODULE.canonical_expression(routes, cookies),
        )
        validated = MODULE.validate_request(payload)
        self.assertEqual(validated["expression"], payload["expression"])
        with self.assertRaisesRegex(MODULE.CloudflareError, "exactly match"):
            MODULE.validate_request({**payload, "expression": payload["expression"] + " or true"})

    def test_desired_rule_caches_only_success_responses_for_bounded_ttl(self):
        rule = MODULE.desired_rule(MODULE.validate_request(self.request()))
        self.assertEqual(rule["action"], "set_cache_settings")
        self.assertTrue(rule["enabled"])
        self.assertEqual(rule["description"], MODULE.RULE_DESCRIPTION)
        ttl = rule["action_parameters"]["edge_ttl"]
        self.assertEqual(ttl["mode"], "override_origin")
        self.assertEqual(ttl["default"], 0)
        self.assertEqual(ttl["status_code_ttl"][0]["value"], 300)
        self.assertEqual(ttl["status_code_ttl"][1]["value"], 0)
        self.assertEqual(ttl["status_code_ttl"][2]["value"], -1)

    def test_production_source_sha_marks_canonical_repo_safe_for_root_git(self):
        from unittest.mock import patch

        completed = MODULE.subprocess.CompletedProcess(
            args=[],
            returncode=0,
            stdout="d" * 40 + "\n",
            stderr="",
        )
        with patch.object(MODULE.subprocess, "run", return_value=completed) as run:
            self.assertEqual(MODULE.production_source_sha(), "d" * 40)

        command = run.call_args.args[0]
        self.assertEqual(
            command,
            [
                "git",
                "-c",
                f"safe.directory={MODULE.PRODUCTION_APP_ROOT}",
                "-C",
                str(MODULE.PRODUCTION_APP_ROOT),
                "rev-parse",
                "HEAD",
            ],
        )

    def test_apply_refetches_authoritative_rule_identity_after_mutation(self):
        zone = {"id": "zone-1", "name": "aoe2war.com"}
        prior = {"id": "ruleset-1", "rules": []}
        current = {
            "id": "ruleset-1",
            "rules": [
                {
                    "id": "rule-new",
                    "description": MODULE.RULE_DESCRIPTION,
                }
            ],
        }
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            old = (MODULE.STATE, MODULE.REQUEST, MODULE.LAST_APPLY)
            MODULE.STATE = state
            MODULE.REQUEST = state / "request.json"
            MODULE.LAST_APPLY = state / "last-apply.json"
            MODULE.REQUEST.write_text(json.dumps(self.request()))
            try:
                from unittest.mock import patch

                with (
                    patch.object(MODULE, "production_source_sha", return_value="d" * 40),
                    patch.object(MODULE, "resolve_zone", return_value=zone),
                    patch.object(MODULE, "snapshot", return_value=(state / "snapshot.json", prior)),
                    patch.object(MODULE, "phase_ruleset", return_value=current),
                    patch.object(MODULE, "api", return_value={"result": {"unexpected": "shape"}}),
                ):
                    result = MODULE.cmd_apply()
                record = json.loads(MODULE.LAST_APPLY.read_text())
                self.assertTrue(result["ok"])
                self.assertEqual(result["rule_id_suffix"], "rule-new")
                self.assertEqual(record["state"], "applied")
                self.assertEqual(record["rule_id"], "rule-new")
            finally:
                MODULE.STATE, MODULE.REQUEST, MODULE.LAST_APPLY = old

    def test_response_loss_after_mutation_rolls_back_from_prepared_record(self):
        zone = {"id": "zone-1", "name": "aoe2war.com"}
        prior = {"id": "ruleset-1", "rules": []}
        current = {
            "id": "ruleset-1",
            "rules": [
                {
                    "id": "rule-new",
                    "description": MODULE.RULE_DESCRIPTION,
                }
            ],
        }
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            old = (MODULE.STATE, MODULE.REQUEST, MODULE.LAST_APPLY)
            MODULE.STATE = state
            MODULE.REQUEST = state / "request.json"
            MODULE.LAST_APPLY = state / "last-apply.json"
            MODULE.REQUEST.write_text(json.dumps(self.request()))
            calls = []

            def fake_api(method, path, payload=None, *, allow_404=False):
                calls.append((method, path))
                if method == "POST" and path.endswith("/rules"):
                    prepared = json.loads(MODULE.LAST_APPLY.read_text())
                    self.assertEqual(prepared["state"], "prepared")
                    raise MODULE.CloudflareError("simulated response loss")
                return {"success": True}

            try:
                from unittest.mock import patch

                with (
                    patch.object(MODULE, "production_source_sha", return_value="d" * 40),
                    patch.object(MODULE, "resolve_zone", return_value=zone),
                    patch.object(MODULE, "snapshot", return_value=(state / "snapshot.json", prior)),
                    patch.object(MODULE, "phase_ruleset", return_value=current),
                    patch.object(MODULE, "api", side_effect=fake_api),
                ):
                    with self.assertRaisesRegex(MODULE.CloudflareError, "rollback completed"):
                        MODULE.cmd_apply()
                record = json.loads(MODULE.LAST_APPLY.read_text())
                self.assertEqual(record["state"], "rolled_back_after_apply_failure")
                self.assertEqual(record["rollback_action"], "deleted_created_rule")
                self.assertIn(
                    ("DELETE", "/zones/zone-1/rulesets/ruleset-1/rules/rule-new"),
                    calls,
                )
            finally:
                MODULE.STATE, MODULE.REQUEST, MODULE.LAST_APPLY = old

    def test_rollback_refuses_legacy_apply_record(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            old = (MODULE.STATE, MODULE.REQUEST, MODULE.LAST_APPLY)
            MODULE.STATE = state
            MODULE.REQUEST = state / "request.json"
            MODULE.LAST_APPLY = state / "last-apply.json"
            MODULE.LAST_APPLY.write_text(
                json.dumps(
                    {
                        "schema": 1,
                        "kind": "aoe2war-speedos-cloudflare-apply-record",
                        "zone_id": "zone-1",
                    }
                )
            )
            try:
                from unittest.mock import patch

                with patch.object(
                    MODULE,
                    "resolve_zone",
                    return_value={"id": "zone-1", "name": "aoe2war.com"},
                ):
                    with self.assertRaisesRegex(MODULE.CloudflareError, "legacy or unrecognized"):
                        MODULE.cmd_rollback()
            finally:
                MODULE.STATE, MODULE.REQUEST, MODULE.LAST_APPLY = old

    def dynamic_request(self, **overrides):
        routes = list(MODULE.DYNAMIC_ALLOWED_ROUTES)
        cookie_names = ["aoe2hdbets_session"]
        base = {
            "schema": 1,
            "kind": "aoe2war-speedos-cloudflare-dynamic-apply-request",
            "zone_name": "aoe2war.com",
            "expression": MODULE.canonical_dynamic_expression(routes, cookie_names),
            "edge_ttl_seconds": 30,
            "eligible_exact_routes": routes,
            "cookie_bypass_names": cookie_names,
            "plan_sha256": "a" * 64,
            "policy_sha256": "b" * 64,
            "qualification_sha256": "c" * 64,
            "operator_source_sha": "d" * 40,
        }
        base.update(overrides)
        return base

    def test_dynamic_request_is_root_allowlisted_empty_query_and_exact_30_seconds(self):
        payload = self.dynamic_request()
        validated = MODULE.validate_dynamic_request(payload)
        self.assertEqual(validated["edge_ttl_seconds"], 30)
        self.assertEqual(validated["eligible_exact_routes"], list(MODULE.DYNAMIC_ALLOWED_ROUTES))
        self.assertIn('http.request.uri.query eq ""', validated["expression"])
        self.assertEqual(MODULE.desired_dynamic_rule(validated)["description"], MODULE.DYNAMIC_RULE_DESCRIPTION)

        widened = {**payload, "expression": payload["expression"] + " or true"}
        unauthorized_routes = ["/academy", "/players"]
        unauthorized = {
            **payload,
            "eligible_exact_routes": unauthorized_routes,
            "expression": MODULE.canonical_dynamic_expression(unauthorized_routes, ["aoe2hdbets_session"]),
        }
        for bad in (
            {**payload, "edge_ttl_seconds": 31},
            widened,
            unauthorized,
            {**payload, "qualification_sha256": "bad"},
        ):
            with self.assertRaises(MODULE.CloudflareError):
                MODULE.validate_dynamic_request(bad)

    def test_dynamic_apply_requires_static_rule_and_refetches_identity(self):
        zone = {"id": "zone-1", "name": "aoe2war.com"}
        static = {"id": "static-1", "description": MODULE.RULE_DESCRIPTION}
        dynamic = {"id": "dyn-new", "description": MODULE.DYNAMIC_RULE_DESCRIPTION}
        prior = {"id": "ruleset-1", "rules": [static]}
        current = {"id": "ruleset-1", "rules": [static, dynamic]}
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            old = (MODULE.STATE, MODULE.DYNAMIC_REQUEST, MODULE.LAST_DYNAMIC_APPLY)
            MODULE.STATE = state
            MODULE.DYNAMIC_REQUEST = state / "dynamic-request.json"
            MODULE.LAST_DYNAMIC_APPLY = state / "last-dynamic-apply.json"
            MODULE.DYNAMIC_REQUEST.write_text(json.dumps(self.dynamic_request()))
            try:
                from unittest.mock import patch
                with (
                    patch.object(MODULE, "production_source_sha", return_value="d" * 40),
                    patch.object(MODULE, "resolve_zone", return_value=zone),
                    patch.object(MODULE, "snapshot", return_value=(state / "snapshot.json", prior)),
                    patch.object(MODULE, "phase_ruleset", return_value=current),
                    patch.object(MODULE, "api", return_value={"result": {"unexpected": "shape"}}),
                ):
                    result = MODULE.cmd_apply_dynamic()
                record = json.loads(MODULE.LAST_DYNAMIC_APPLY.read_text())
                self.assertTrue(result["ok"])
                self.assertEqual(result["rule_id_suffix"], "dyn-new")
                self.assertEqual(record["state"], "applied")
                self.assertEqual(record["rule_id"], "dyn-new")
            finally:
                MODULE.STATE, MODULE.DYNAMIC_REQUEST, MODULE.LAST_DYNAMIC_APPLY = old

    def test_dynamic_response_loss_rolls_back_only_dynamic_rule(self):
        zone = {"id": "zone-1", "name": "aoe2war.com"}
        static = {"id": "static-1", "description": MODULE.RULE_DESCRIPTION}
        dynamic = {"id": "dyn-new", "description": MODULE.DYNAMIC_RULE_DESCRIPTION}
        prior = {"id": "ruleset-1", "rules": [static]}
        current = {"id": "ruleset-1", "rules": [static, dynamic]}
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            old = (MODULE.STATE, MODULE.DYNAMIC_REQUEST, MODULE.LAST_DYNAMIC_APPLY)
            MODULE.STATE = state
            MODULE.DYNAMIC_REQUEST = state / "dynamic-request.json"
            MODULE.LAST_DYNAMIC_APPLY = state / "last-dynamic-apply.json"
            MODULE.DYNAMIC_REQUEST.write_text(json.dumps(self.dynamic_request()))
            calls = []
            def fake_api(method, path, payload=None, *, allow_404=False):
                calls.append((method, path))
                if method == "POST" and path.endswith("/rules"):
                    prepared = json.loads(MODULE.LAST_DYNAMIC_APPLY.read_text())
                    self.assertEqual(prepared["state"], "prepared")
                    raise MODULE.CloudflareError("simulated dynamic response loss")
                return {"success": True}
            try:
                from unittest.mock import patch
                with (
                    patch.object(MODULE, "production_source_sha", return_value="d" * 40),
                    patch.object(MODULE, "resolve_zone", return_value=zone),
                    patch.object(MODULE, "snapshot", return_value=(state / "snapshot.json", prior)),
                    patch.object(MODULE, "phase_ruleset", return_value=current),
                    patch.object(MODULE, "api", side_effect=fake_api),
                ):
                    with self.assertRaisesRegex(MODULE.CloudflareError, "rollback completed"):
                        MODULE.cmd_apply_dynamic()
                record = json.loads(MODULE.LAST_DYNAMIC_APPLY.read_text())
                self.assertEqual(record["state"], "rolled_back_after_apply_failure")
                self.assertEqual(record["rollback_action"], "deleted_created_dynamic_rule")
                deletes = [path for method, path in calls if method == "DELETE"]
                self.assertEqual(deletes, ["/zones/zone-1/rulesets/ruleset-1/rules/dyn-new"])
                self.assertNotIn("static-1", " ".join(deletes))
            finally:
                MODULE.STATE, MODULE.DYNAMIC_REQUEST, MODULE.LAST_DYNAMIC_APPLY = old

    def test_dynamic_apply_refuses_missing_static_rule(self):
        zone = {"id": "zone-1", "name": "aoe2war.com"}
        prior = {"id": "ruleset-1", "rules": []}
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            old = (MODULE.STATE, MODULE.DYNAMIC_REQUEST, MODULE.LAST_DYNAMIC_APPLY)
            MODULE.STATE = state
            MODULE.DYNAMIC_REQUEST = state / "dynamic-request.json"
            MODULE.LAST_DYNAMIC_APPLY = state / "last-dynamic-apply.json"
            MODULE.DYNAMIC_REQUEST.write_text(json.dumps(self.dynamic_request()))
            try:
                from unittest.mock import patch
                with (
                    patch.object(MODULE, "production_source_sha", return_value="d" * 40),
                    patch.object(MODULE, "resolve_zone", return_value=zone),
                    patch.object(MODULE, "snapshot", return_value=(state / "snapshot.json", prior)),
                ):
                    with self.assertRaisesRegex(MODULE.CloudflareError, "requires the certified static"):
                        MODULE.cmd_apply_dynamic()
            finally:
                MODULE.STATE, MODULE.DYNAMIC_REQUEST, MODULE.LAST_DYNAMIC_APPLY = old


    def test_dynamic_apply_rejects_source_sha_not_matching_production(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            old = (MODULE.STATE, MODULE.DYNAMIC_REQUEST, MODULE.LAST_DYNAMIC_APPLY)
            MODULE.STATE = state
            MODULE.DYNAMIC_REQUEST = state / "dynamic-request.json"
            MODULE.LAST_DYNAMIC_APPLY = state / "last-dynamic-apply.json"
            MODULE.DYNAMIC_REQUEST.write_text(json.dumps(self.dynamic_request(operator_source_sha="d" * 40)))
            try:
                from unittest.mock import patch
                with patch.object(MODULE, "production_source_sha", return_value="e" * 40):
                    with self.assertRaisesRegex(MODULE.CloudflareError, "does not match production"):
                        MODULE.cmd_apply_dynamic()
            finally:
                MODULE.STATE, MODULE.DYNAMIC_REQUEST, MODULE.LAST_DYNAMIC_APPLY = old

    def asset_request(self, **overrides):
        source_path = "/uploads/managed-assets/background/hero-chain-1789329346053-zrmnar-1789329348882-2bf78674.png"
        base = {
            "schema": 1,
            "kind": "aoe2war-speedos-cloudflare-asset-apply-request",
            "zone_name": "aoe2war.com",
            "source_path": source_path,
            "quality": MODULE.ASSET_QUALITY,
            "responsive_widths": [640, 1080, 1920],
            "edge_ttl_seconds": MODULE.ASSET_EDGE_TTL_SECONDS,
            "vary_media_types": list(MODULE.ASSET_VARY_MEDIA_TYPES),
            "expression": MODULE.canonical_asset_expression(source_path, [640, 1080, 1920]),
            "plan_sha256": "a" * 64,
            "operator_source_sha": "d" * 40,
        }
        base.update(overrides)
        return base

    def test_asset_request_is_exact_hero_q95_vary_normalized_and_bounded(self):
        payload = MODULE.validate_asset_request(self.asset_request())
        self.assertEqual(payload["quality"], 95)
        self.assertEqual(payload["edge_ttl_seconds"], 3600)
        self.assertIn('http.request.uri.path eq "/_next/image"', payload["expression"])
        self.assertIn("hero-chain-", payload["expression"])

        bad_source = "/uploads/managed-assets/avatar/not-a-hero.png"
        for bad in (
            self.asset_request(schema=2),
            self.asset_request(source_path=bad_source, expression=MODULE.canonical_asset_expression(bad_source, [640, 1080, 1920])),
            self.asset_request(quality=90),
            self.asset_request(edge_ttl_seconds=86400),
            self.asset_request(responsive_widths=[1080]),
            self.asset_request(vary_media_types=["image/webp"]),
            self.asset_request(expression=self.asset_request()["expression"] + " or true"),
            self.asset_request(plan_sha256="bad"),
        ):
            with self.assertRaises(MODULE.CloudflareError):
                MODULE.validate_asset_request(bad)

    def test_asset_rule_normalizes_accept_and_bypasses_unexpected_vary_headers(self):
        rule = MODULE.desired_asset_rule(MODULE.validate_asset_request(self.asset_request()))
        self.assertEqual(rule["description"], MODULE.ASSET_RULE_DESCRIPTION)
        self.assertTrue(rule["action_parameters"]["cache"])
        self.assertEqual(
            rule["action_parameters"]["edge_ttl"]["status_code_ttl"][0]["value"],
            3600,
        )
        vary = rule["action_parameters"]["vary"]
        self.assertEqual(vary["default"]["action"], "bypass")
        self.assertEqual(vary["headers"]["accept"]["action"], "normalize")
        self.assertEqual(
            vary["headers"]["accept"]["media_types"],
            ["image/avif", "image/webp", "image/*"],
        )

    def test_asset_apply_requires_both_html_rules_and_refetches_identity(self):
        zone = {"id": "zone-1", "name": "aoe2war.com"}
        static = {"id": "static-1", "description": MODULE.RULE_DESCRIPTION}
        dynamic = {"id": "dynamic-1", "description": MODULE.DYNAMIC_RULE_DESCRIPTION}
        asset = {"id": "asset-new", "description": MODULE.ASSET_RULE_DESCRIPTION}
        prior = {"id": "ruleset-1", "rules": [static, dynamic]}
        current = {"id": "ruleset-1", "rules": [static, dynamic, asset]}
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            old = (MODULE.STATE, MODULE.ASSET_REQUEST, MODULE.LAST_ASSET_APPLY)
            MODULE.STATE = state
            MODULE.ASSET_REQUEST = state / "asset-request.json"
            MODULE.LAST_ASSET_APPLY = state / "last-asset-apply.json"
            MODULE.ASSET_REQUEST.write_text(json.dumps(self.asset_request()))
            try:
                from unittest.mock import patch
                with (
                    patch.object(MODULE, "production_source_sha", return_value="d" * 40),
                    patch.object(MODULE, "resolve_zone", return_value=zone),
                    patch.object(MODULE, "snapshot", return_value=(state / "snapshot.json", prior)),
                    patch.object(MODULE, "phase_ruleset", return_value=current),
                    patch.object(MODULE, "api", return_value={"result": {"unexpected": "shape"}}),
                ):
                    result = MODULE.cmd_apply_asset()
                record = json.loads(MODULE.LAST_ASSET_APPLY.read_text())
                self.assertTrue(result["ok"])
                self.assertEqual(result["rule_id_suffix"], "sset-new")
                self.assertEqual(record["rule_id"], "asset-new")
                self.assertEqual(record["state"], "applied")
            finally:
                MODULE.STATE, MODULE.ASSET_REQUEST, MODULE.LAST_ASSET_APPLY = old

        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            old = (MODULE.STATE, MODULE.ASSET_REQUEST, MODULE.LAST_ASSET_APPLY)
            MODULE.STATE = state
            MODULE.ASSET_REQUEST = state / "asset-request.json"
            MODULE.LAST_ASSET_APPLY = state / "last-asset-apply.json"
            MODULE.ASSET_REQUEST.write_text(json.dumps(self.asset_request()))
            try:
                from unittest.mock import patch
                with (
                    patch.object(MODULE, "production_source_sha", return_value="d" * 40),
                    patch.object(MODULE, "resolve_zone", return_value=zone),
                    patch.object(MODULE, "snapshot", return_value=(state / "snapshot.json", {"id": "ruleset-1", "rules": [static]})),
                ):
                    with self.assertRaisesRegex(MODULE.CloudflareError, "both certified HTML"):
                        MODULE.cmd_apply_asset()
            finally:
                MODULE.STATE, MODULE.ASSET_REQUEST, MODULE.LAST_ASSET_APPLY = old

    def test_asset_response_loss_rolls_back_only_asset_rule(self):
        zone = {"id": "zone-1", "name": "aoe2war.com"}
        static = {"id": "static-1", "description": MODULE.RULE_DESCRIPTION}
        dynamic = {"id": "dynamic-1", "description": MODULE.DYNAMIC_RULE_DESCRIPTION}
        asset = {"id": "asset-new", "description": MODULE.ASSET_RULE_DESCRIPTION}
        prior = {"id": "ruleset-1", "rules": [static, dynamic]}
        current = {"id": "ruleset-1", "rules": [static, dynamic, asset]}
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            old = (MODULE.STATE, MODULE.ASSET_REQUEST, MODULE.LAST_ASSET_APPLY)
            MODULE.STATE = state
            MODULE.ASSET_REQUEST = state / "asset-request.json"
            MODULE.LAST_ASSET_APPLY = state / "last-asset-apply.json"
            MODULE.ASSET_REQUEST.write_text(json.dumps(self.asset_request()))
            calls = []

            def fake_api(method, path, payload=None, *, allow_404=False):
                calls.append((method, path))
                if method == "POST" and path.endswith("/rules"):
                    self.assertEqual(
                        json.loads(MODULE.LAST_ASSET_APPLY.read_text())["state"],
                        "prepared",
                    )
                    raise MODULE.CloudflareError("simulated asset response loss")
                return {"success": True}

            try:
                from unittest.mock import patch
                with (
                    patch.object(MODULE, "production_source_sha", return_value="d" * 40),
                    patch.object(MODULE, "resolve_zone", return_value=zone),
                    patch.object(MODULE, "snapshot", return_value=(state / "snapshot.json", prior)),
                    patch.object(MODULE, "phase_ruleset", return_value=current),
                    patch.object(MODULE, "api", side_effect=fake_api),
                ):
                    with self.assertRaisesRegex(MODULE.CloudflareError, "rollback completed"):
                        MODULE.cmd_apply_asset()
                record = json.loads(MODULE.LAST_ASSET_APPLY.read_text())
                self.assertEqual(record["rollback_action"], "deleted_created_asset_rule")
                deletes = [path for method, path in calls if method == "DELETE"]
                self.assertEqual(deletes, ["/zones/zone-1/rulesets/ruleset-1/rules/asset-new"])
            finally:
                MODULE.STATE, MODULE.ASSET_REQUEST, MODULE.LAST_ASSET_APPLY = old

    def featured_avatar_request(self, **overrides):
        paths = [
            "/api/media-assets/avatar/user-aoe2hd-ai-concierge-featured",
            "/api/media-assets/avatar/user-u-79ce46af3d504ceca718e5fda83e3502-featured",
        ]
        base = {
            "schema": 1,
            "kind": "aoe2war-speedos-cloudflare-featured-avatar-apply-request",
            "zone_name": "aoe2war.com",
            "eligible_exact_paths": paths,
            "cache_version": MODULE.FEATURED_AVATAR_CACHE_VERSION,
            "edge_ttl_seconds": MODULE.FEATURED_AVATAR_EDGE_TTL_SECONDS,
            "vary_media_types": list(MODULE.FEATURED_AVATAR_VARY_MEDIA_TYPES),
            "vary_passthrough_headers": list(MODULE.FEATURED_AVATAR_PASSTHROUGH_HEADERS),
            "expression": MODULE.canonical_featured_avatar_expression(paths),
            "plan_sha256": "a" * 64,
            "roster_sha256": "b" * 64,
            "operator_source_sha": "d" * 40,
        }
        base.update(overrides)
        return base

    def test_featured_avatar_request_is_exact_public_card_cohort(self):
        payload = MODULE.validate_featured_avatar_request(self.featured_avatar_request())
        self.assertEqual(payload["edge_ttl_seconds"], 3600)
        self.assertIn('http.request.uri.args["size"]', payload["expression"])
        self.assertIn('"card"', payload["expression"])
        self.assertIn(MODULE.FEATURED_AVATAR_CACHE_VERSION, payload["expression"])
        self.assertEqual(len(payload["eligible_exact_paths"]), 2)

        bad_path = "/api/media-assets/avatar/user-bad"
        for bad in (
            self.featured_avatar_request(schema=2),
            self.featured_avatar_request(
                eligible_exact_paths=[bad_path],
                expression=MODULE.canonical_featured_avatar_expression([bad_path]),
            ),
            self.featured_avatar_request(edge_ttl_seconds=86400),
            self.featured_avatar_request(cache_version="old"),
            self.featured_avatar_request(vary_media_types=["image/webp"]),
            self.featured_avatar_request(vary_passthrough_headers=["rsc"]),
            self.featured_avatar_request(expression=self.featured_avatar_request()["expression"] + " or true"),
            self.featured_avatar_request(roster_sha256="bad"),
        ):
            with self.assertRaises(MODULE.CloudflareError):
                MODULE.validate_featured_avatar_request(bad)

    def test_featured_avatar_rule_normalizes_accept_and_passthroughs_next_vary(self):
        rule = MODULE.desired_featured_avatar_rule(
            MODULE.validate_featured_avatar_request(self.featured_avatar_request())
        )
        self.assertEqual(rule["description"], MODULE.FEATURED_AVATAR_RULE_DESCRIPTION)
        vary = rule["action_parameters"]["vary"]
        self.assertEqual(vary["default"]["action"], "bypass")
        self.assertEqual(vary["headers"]["accept"]["action"], "normalize")
        for header in MODULE.FEATURED_AVATAR_PASSTHROUGH_HEADERS:
            self.assertEqual(vary["headers"][header]["action"], "passthrough")

    def test_featured_avatar_apply_requires_existing_speedos_stack(self):
        zone = {"id": "zone-1", "name": "aoe2war.com"}
        static = {"id": "static-1", "description": MODULE.RULE_DESCRIPTION}
        dynamic = {"id": "dynamic-1", "description": MODULE.DYNAMIC_RULE_DESCRIPTION}
        asset = {"id": "asset-1", "description": MODULE.ASSET_RULE_DESCRIPTION}
        avatar = {"id": "avatar-new", "description": MODULE.FEATURED_AVATAR_RULE_DESCRIPTION}
        prior = {"id": "ruleset-1", "rules": [static, dynamic, asset]}
        current = {"id": "ruleset-1", "rules": [static, dynamic, asset, avatar]}
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            old = (
                MODULE.STATE,
                MODULE.FEATURED_AVATAR_REQUEST,
                MODULE.LAST_FEATURED_AVATAR_APPLY,
            )
            MODULE.STATE = state
            MODULE.FEATURED_AVATAR_REQUEST = state / "featured-avatar-request.json"
            MODULE.LAST_FEATURED_AVATAR_APPLY = state / "last-featured-avatar-apply.json"
            MODULE.FEATURED_AVATAR_REQUEST.write_text(json.dumps(self.featured_avatar_request()))
            try:
                from unittest.mock import patch
                with (
                    patch.object(MODULE, "production_source_sha", return_value="d" * 40),
                    patch.object(MODULE, "resolve_zone", return_value=zone),
                    patch.object(MODULE, "snapshot", return_value=(state / "snapshot.json", prior)),
                    patch.object(MODULE, "phase_ruleset", return_value=current),
                    patch.object(MODULE, "api", return_value={"success": True}),
                ):
                    result = MODULE.cmd_apply_featured_avatar()
                record = json.loads(MODULE.LAST_FEATURED_AVATAR_APPLY.read_text())
                self.assertTrue(result["ok"])
                self.assertEqual(record["state"], "applied")
                self.assertEqual(record["rule_id"], "avatar-new")
            finally:
                (
                    MODULE.STATE,
                    MODULE.FEATURED_AVATAR_REQUEST,
                    MODULE.LAST_FEATURED_AVATAR_APPLY,
                ) = old

    def test_featured_avatar_response_loss_rolls_back_only_avatar_rule(self):
        zone = {"id": "zone-1", "name": "aoe2war.com"}
        static = {"id": "static-1", "description": MODULE.RULE_DESCRIPTION}
        dynamic = {"id": "dynamic-1", "description": MODULE.DYNAMIC_RULE_DESCRIPTION}
        asset = {"id": "asset-1", "description": MODULE.ASSET_RULE_DESCRIPTION}
        avatar = {"id": "avatar-new", "description": MODULE.FEATURED_AVATAR_RULE_DESCRIPTION}
        prior = {"id": "ruleset-1", "rules": [static, dynamic, asset]}
        current = {"id": "ruleset-1", "rules": [static, dynamic, asset, avatar]}
        calls = []
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            old = (
                MODULE.STATE,
                MODULE.FEATURED_AVATAR_REQUEST,
                MODULE.LAST_FEATURED_AVATAR_APPLY,
            )
            MODULE.STATE = state
            MODULE.FEATURED_AVATAR_REQUEST = state / "featured-avatar-request.json"
            MODULE.LAST_FEATURED_AVATAR_APPLY = state / "last-featured-avatar-apply.json"
            MODULE.FEATURED_AVATAR_REQUEST.write_text(json.dumps(self.featured_avatar_request()))

            def fake_api(method, path, payload=None, *, allow_404=False):
                calls.append((method, path))
                if method == "POST" and path.endswith("/rules"):
                    raise MODULE.CloudflareError("simulated avatar response loss")
                return {"success": True}

            try:
                from unittest.mock import patch
                with (
                    patch.object(MODULE, "production_source_sha", return_value="d" * 40),
                    patch.object(MODULE, "resolve_zone", return_value=zone),
                    patch.object(MODULE, "snapshot", return_value=(state / "snapshot.json", prior)),
                    patch.object(MODULE, "phase_ruleset", return_value=current),
                    patch.object(MODULE, "api", side_effect=fake_api),
                ):
                    with self.assertRaisesRegex(MODULE.CloudflareError, "rollback completed"):
                        MODULE.cmd_apply_featured_avatar()
                deletes = [path for method, path in calls if method == "DELETE"]
                self.assertEqual(
                    deletes,
                    ["/zones/zone-1/rulesets/ruleset-1/rules/avatar-new"],
                )
            finally:
                (
                    MODULE.STATE,
                    MODULE.FEATURED_AVATAR_REQUEST,
                    MODULE.LAST_FEATURED_AVATAR_APPLY,
                ) = old

    def test_helper_never_serializes_token_into_results(self):
        source = (ROOT / "scripts" / "aoe2_speed_cloudflare_remote.py").read_text()
        self.assertIn('os.getenv("CLOUDFLARE_API_TOKEN"', source)
        self.assertNotIn('"token": token()', source)
        self.assertNotIn("CLOUDFLARE_API_TOKEN=%", source)

    def test_systemd_unit_is_root_only_hardened_and_uses_secret_environment_file(self):
        unit = (ROOT / "deploy" / "aoe2war-speedos-cloudflare@.service").read_text()
        self.assertIn("User=root", unit)
        self.assertIn("EnvironmentFile=/etc/aoe2hdbets/aoe2war-speedos-cloudflare.env", unit)
        self.assertIn("ProtectSystem=strict", unit)
        self.assertIn("ProtectHome=true", unit)
        self.assertIn("ReadWritePaths=/var/lib/aoe2war-speedos", unit)
        self.assertIn("/usr/bin/flock -n /var/lib/aoe2war-speedos/cloudflare/operation.lock", unit)
        self.assertIn("RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6", unit)
        self.assertNotIn("CLOUDFLARE_API_TOKEN=", unit)


if __name__ == "__main__":
    unittest.main()
