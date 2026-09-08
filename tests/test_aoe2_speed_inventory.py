import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
INVENTORY = ROOT / "scripts" / "aoe2_speed_inventory.py"

SPEC = importlib.util.spec_from_file_location("aoe2_speed_inventory", INVENTORY)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class SpeedInventoryTests(unittest.TestCase):
    def test_every_ordinary_public_page_has_campaign_representation(self):
        payload = MODULE.snapshot()

        self.assertGreaterEqual(payload["source_page_count"], 100)
        self.assertEqual(
            payload["coverage"]["uncovered_public_templates"],
            [],
        )
        self.assertEqual(
            payload["coverage"]["covered_public_templates"],
            payload["coverage"]["public_templates"],
        )
        self.assertEqual(payload["coverage"]["coverage_percent"], 100.0)

    def test_sensitive_invoice_route_is_not_faked_into_public_benchmark(self):
        payload = MODULE.snapshot()
        row = next(
            page
            for page in payload["pages"]
            if page["template"] == "/market/invoices/[publicId]"
        )

        self.assertEqual(row["classification"], "sensitive_dynamic")
        self.assertIsNone(row["benchmark_representative"])
        self.assertIn("fixture", row["reason"])

    def test_current_public_cohort_is_source_derived_and_unique(self):
        routes = MODULE.cohort_routes()

        self.assertEqual(len(routes), len(set(routes)))
        self.assertGreaterEqual(len(routes), 77)
        for route in (
            "/about",
            "/belts",
            "/market/shops/chat-effects",
            "/nations",
            "/pending-bets",
            "/realm",
            "/roadmap",
            "/users",
            "/wolo-1",
        ):
            self.assertIn(route, routes)

    def test_asset_inventory_is_typed_and_size_accounted(self):
        assets = MODULE.asset_inventory()

        self.assertGreaterEqual(assets["total_files"], 0)
        self.assertGreaterEqual(assets["total_bytes"], 0)
        self.assertIsInstance(assets["by_category"], dict)
        self.assertIsInstance(assets["largest"], list)
        self.assertLessEqual(len(assets["largest"]), 20)
        self.assertGreaterEqual(assets["duplicate_group_count"], 0)
        self.assertGreaterEqual(assets["duplicate_avoidable_bytes"], 0)
        self.assertIsInstance(assets["duplicate_groups"], list)

    def test_cli_exposes_speed_inventory(self):
        source = (ROOT / "bin" / "aoe2war").read_text(encoding="utf-8")

        self.assertIn(
            'SPEED_INVENTORY="$BIN_DIR/../scripts/aoe2_speed_inventory.py"',
            source,
        )
        self.assertIn('[ "${1:-}" = "inventory" ]', source)

    def test_source_profiles_are_static_evidence_not_runtime_claims(self):
        payload = MODULE.snapshot()
        rivalry = next(
            page
            for page in payload["pages"]
            if page["template"] == "/rivalries"
        )
        profile = rivalry["source_profile"]

        self.assertEqual(
            profile["evidence_scope"],
            "static_page_plus_first_hop_imports_not_runtime_proof",
        )
        self.assertTrue(profile["force_dynamic"])
        self.assertTrue(profile["complete_corpus_signal"])
        self.assertTrue(profile["generation_cache_signal"])
        self.assertGreater(profile["direct_or_first_hop_prisma_calls"], 0)

    def test_edge_cache_safety_distinguishes_personalized_shell_and_anonymous_dynamic(self):
        payload = MODULE.snapshot()
        by_template = {page["template"]: page["source_profile"] for page in payload["pages"]}

        self.assertEqual(
            by_template["/war-chest"]["edge_cache_classification"],
            "server_personalized_do_not_cache",
        )
        self.assertTrue(
            by_template["/war-chest"]["server_request_personalization_signal"]
        )
        self.assertEqual(
            by_template["/bets"]["edge_cache_classification"],
            "static_client_shell_candidate",
        )
        self.assertTrue(by_template["/bets"]["client_personalization_signal"])
        self.assertFalse(by_template["/bets"]["layout_server_personalization_signal"])
        self.assertIn("app/layout.tsx", by_template["/bets"]["applicable_layouts"])
        self.assertIn("app/bets/layout.tsx", by_template["/bets"]["applicable_layouts"])
        self.assertEqual(
            by_template["/kingdom"]["edge_cache_classification"],
            "anonymous_dynamic_candidate_review",
        )
        self.assertFalse(
            by_template["/kingdom"]["server_request_personalization_signal"]
        )

    def test_academy_profile_sees_streaming_and_client_hero_boundary(self):
        payload = MODULE.snapshot()
        academy = next(
            page
            for page in payload["pages"]
            if page["template"] == "/academy"
        )
        profile = academy["source_profile"]

        self.assertTrue(profile["force_dynamic"])
        self.assertGreaterEqual(profile["suspense_usages"], 1)
        self.assertGreaterEqual(profile["client_first_hop_dependencies"], 1)
        self.assertGreater(profile["page_source_bytes"], 0)


if __name__ == "__main__":
    unittest.main()
