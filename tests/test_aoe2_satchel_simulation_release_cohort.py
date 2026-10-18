from __future__ import annotations

import importlib.util
import pathlib
import tempfile
import unittest

SOURCE = pathlib.Path(__file__).resolve().parents[1]
MODULE_PATH = SOURCE / "scripts/aoe2_satchel_simulation_release_cohort.py"
spec = importlib.util.spec_from_file_location("satchel_simulation_release_cohort", MODULE_PATH)
module = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(module)


class ExactHistoricalSimulationCohortTests(unittest.TestCase):
    def test_exact_source_has_six_committed_blob_hashes(self):
        module.prove_exact_source(SOURCE)
        self.assertEqual(len(module.COHORT_PATHS), 6)
        self.assertEqual(len(set(module.COHORT_PATHS)), 6)

    def test_only_historical_production_ancestor_and_one_new_sql_qualify(self):
        result = module.scoped_manifest_paths(
            SOURCE,
            module.PREVIOUS_PRODUCTION_SOURCE,
            [module.LATEST_PATH, "app/AppShell.tsx"],
        )
        self.assertEqual(result, list(module.COHORT_PATHS))

    def test_wrong_ancestor_does_not_expand_migration_scope(self):
        result = module.scoped_manifest_paths(
            SOURCE, "0" * 40, [module.LATEST_PATH]
        )
        self.assertEqual(result, [module.LATEST_PATH])

    def test_other_migration_does_not_expand_scope(self):
        result = module.scoped_manifest_paths(
            SOURCE,
            module.PREVIOUS_PRODUCTION_SOURCE,
            ["prisma/migrations/unrelated/migration.sql"],
        )
        self.assertEqual(result, ["prisma/migrations/unrelated/migration.sql"])

    def test_multiple_changed_sql_does_not_expand_scope(self):
        result = module.scoped_manifest_paths(
            SOURCE,
            module.PREVIOUS_PRODUCTION_SOURCE,
            [module.LATEST_PATH, module.COHORT_PATHS[0]],
        )
        self.assertEqual(result, [module.LATEST_PATH, module.COHORT_PATHS[0]])

    def test_unknown_sql_or_source_does_not_grant_contract(self):
        example = {
            "migration_paths": [module.LATEST_PATH],
            "previous_production_sha": module.PREVIOUS_PRODUCTION_SOURCE,
            "risk_class": "DATABASE",
            "changed_files": [module.LATEST_PATH],
        }
        self.assertFalse(module.is_exact_cohort_contract(SOURCE, example))

    def test_exact_manifest_matches_still_do_not_grant_finance(self):
        example = {
            "migration_paths": list(module.COHORT_PATHS),
            "previous_production_sha": module.PREVIOUS_PRODUCTION_SOURCE,
            "risk_class": "DATABASE",
            "changed_files": [module.LATEST_PATH],
        }
        self.assertTrue(module.is_exact_cohort_contract(SOURCE, example))

    def test_invalid_risk_does_not_authorize_simulation_release(self):
        example = {
            "migration_paths": list(module.COHORT_PATHS),
            "previous_production_sha": module.PREVIOUS_PRODUCTION_SOURCE,
            "risk_class": "DOCUMENTATION",
            "changed_files": [module.LATEST_PATH],
        }
        with self.assertRaisesRegex(
            module.SatchelSimulationCohortError, "full database risk"
        ):
            module.is_exact_cohort_contract(SOURCE, example)

    def test_missing_exact_source_denied(self):
        with tempfile.TemporaryDirectory() as root:
            with self.assertRaisesRegex(
                module.SatchelSimulationCohortError, "migration census changed"
            ):
                module.prove_exact_source(pathlib.Path(root))


if __name__ == "__main__":
    unittest.main()
