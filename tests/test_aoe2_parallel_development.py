#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "aoe2_parallel.py"

spec = importlib.util.spec_from_file_location("aoe2_parallel_test", SCRIPT)
assert spec and spec.loader
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)


class ParallelDevelopmentTests(unittest.TestCase):
    def test_contract_inference(self) -> None:
        contracts = set(
            module.infer_contracts(
                [
                    "lib/liveGames.ts",
                    "app/api/bets/route.ts",
                    "prisma/schema.prisma",
                    "scripts/aoe2_workspace.py",
                ]
            )
        )
        self.assertIn("battle-identity", contracts)
        self.assertIn("watcher-reconciliation", contracts)
        self.assertIn("financial-truth", contracts)
        self.assertIn("database-schema", contracts)
        self.assertIn("release-engineering", contracts)

    def test_database_frontier(self) -> None:
        self.assertTrue(module.owns_database_frontier(["prisma/schema.prisma"]))
        self.assertTrue(
            module.owns_database_frontier(
                ["prisma/migrations/20260826000000_example/migration.sql"]
            )
        )
        self.assertFalse(
            module.owns_database_frontier(["components/PlayerCard.tsx"])
        )

    def test_critical_semantic_overlap_is_high(self) -> None:
        left = {
            "changed_paths": ["lib/liveGames.ts"],
            "contracts": ["battle-identity"],
            "database_frontier": False,
        }
        right = {
            "changed_paths": ["lib/bets.ts"],
            "contracts": ["battle-identity"],
            "database_frontier": False,
        }
        severity, _, contracts = module.conflict_severity(left, right)
        self.assertEqual(severity, "HIGH")
        self.assertEqual(contracts, ["battle-identity"])

    def test_file_overlap_is_medium(self) -> None:
        left = {
            "changed_paths": ["components/Test.tsx"],
            "contracts": [],
            "database_frontier": False,
        }
        right = {
            "changed_paths": ["components/Test.tsx"],
            "contracts": [],
            "database_frontier": False,
        }
        severity, files, _ = module.conflict_severity(left, right)
        self.assertEqual(severity, "MEDIUM")
        self.assertEqual(files, ["components/Test.tsx"])

    def test_two_database_frontiers_are_high(self) -> None:
        left = {
            "changed_paths": ["prisma/schema.prisma"],
            "contracts": ["database-schema"],
            "database_frontier": True,
        }
        right = {
            "changed_paths": ["prisma/migrations/x/migration.sql"],
            "contracts": ["database-schema"],
            "database_frontier": True,
        }
        severity, _, contracts = module.conflict_severity(left, right)
        self.assertEqual(severity, "HIGH")
        self.assertIn("database-schema", contracts)

    def test_disjoint_noncritical_lanes_are_low(self) -> None:
        left = {
            "changed_paths": ["components/A.tsx"],
            "contracts": [],
            "database_frontier": False,
        }
        right = {
            "changed_paths": ["components/B.tsx"],
            "contracts": [],
            "database_frontier": False,
        }
        self.assertEqual(module.conflict_severity(left, right)[0], "LOW")

    def test_shadow_name_is_postgres_safe(self) -> None:
        value = module.database_name(
            "feature/" + ("very-long-feature-name-" * 10)
        )
        self.assertLessEqual(len(value), 63)
        self.assertRegex(value, r"^[a-z0-9_]+$")


if __name__ == "__main__":
    unittest.main()
