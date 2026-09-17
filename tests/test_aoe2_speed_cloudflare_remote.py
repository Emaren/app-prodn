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
        routes = ["/academy", "/ai", "/battle-archive", "/bounties", "/champions", "/clans", "/national-champions"]
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
        unauthorized_routes = ["/academy", "/war-engine"]
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
