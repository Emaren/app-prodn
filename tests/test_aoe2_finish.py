from __future__ import annotations

import importlib.util
import pathlib
import sys
import unittest

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "aoe2_finish.py"
SCRIPTS = SCRIPT.parent
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

SPEC = importlib.util.spec_from_file_location("aoe2_finish", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class FinishTests(unittest.TestCase):
    def test_local_worktree_wins_when_vps_clean(self):
        plan = MODULE.source_plan(
            local_dirty=2,
            production_dirty=0,
            local_head="a" * 40,
            github_head="a" * 40,
            production_head="b" * 40,
        )
        self.assertEqual(plan.mode, "local_worktree")

    def test_vps_worktree_requires_exact_shared_base(self):
        plan = MODULE.source_plan(
            local_dirty=0,
            production_dirty=2,
            local_head="a" * 40,
            github_head="a" * 40,
            production_head="a" * 40,
        )
        self.assertEqual(plan.mode, "vps_worktree")

        with self.assertRaises(MODULE.FinishError):
            MODULE.source_plan(
                local_dirty=0,
                production_dirty=1,
                local_head="a" * 40,
                github_head="a" * 40,
                production_head="b" * 40,
            )

    def test_two_dirty_authorities_fail_closed(self):
        with self.assertRaises(MODULE.FinishError):
            MODULE.source_plan(
                local_dirty=1,
                production_dirty=1,
                local_head="a" * 40,
                github_head="a" * 40,
                production_head="a" * 40,
            )

    def test_history_reconcile_when_clean_heads_differ(self):
        plan = MODULE.source_plan(
            local_dirty=0,
            production_dirty=0,
            local_head="a" * 40,
            github_head="b" * 40,
            production_head="a" * 40,
        )
        self.assertEqual(plan.mode, "history_reconcile")

    def test_sensitive_paths(self):
        self.assertTrue(MODULE.is_sensitive_path(".env"))
        self.assertTrue(MODULE.is_sensitive_path("secrets/id_rsa"))
        self.assertTrue(MODULE.is_sensitive_path("x/private.pem"))
        self.assertFalse(MODULE.is_sensitive_path(".env.production.example"))
        self.assertFalse(MODULE.is_sensitive_path("lib/secretPolicy.ts"))

    def test_needs_deploy(self):
        clean = {
            "local": {"head": "a"},
            "production": {
                "reachable": True,
                "dirty_count": 0,
                "source_sha": "a",
                "service": "active",
                "version_parity": True,
            },
            "certification": {"status": "CERTIFIED", "release_sha": "a"},
        }
        self.assertFalse(MODULE.needs_deploy(clean))
        changed = {**clean, "local": {"head": "b"}}
        self.assertTrue(MODULE.needs_deploy(changed))


if __name__ == "__main__":
    unittest.main()
