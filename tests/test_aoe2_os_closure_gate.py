import unittest

import scripts.aoe2_release_gate as gate


class ClosureGateTests(unittest.TestCase):
    def test_council_change_triggers_release_engineering_contract(self):
        scope = {
            "mode": "worktree",
            "base_sha": "a" * 40,
            "target_sha": "WORKTREE",
            "changed_files": ["scripts/aoe2_council.py"],
        }
        self.assertEqual(
            gate.path_risk("scripts/aoe2_council.py"),
            "INFRASTRUCTURE",
        )
        labels = [
            label
            for label, _args, _timeout in gate.command_plan(
                scope,
                gate.classify_risk(scope["changed_files"]),
            )
        ]
        self.assertIn("release-engineering-tests", labels)
        self.assertIn("release-python-compile", labels)

    def test_new_gate_test_is_itself_infrastructure(self):
        self.assertEqual(
            gate.path_risk("tests/test_aoe2_os_closure_gate.py"),
            "INFRASTRUCTURE",
        )


if __name__ == "__main__":
    unittest.main()
