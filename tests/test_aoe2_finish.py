from __future__ import annotations

import importlib.util
import pathlib
import sys
import tempfile
import unittest
from unittest.mock import patch

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

    def test_checkpoint_receipt_replaces_one_atomic_file(self):
        with tempfile.TemporaryDirectory() as temp:
            path = pathlib.Path(temp) / "finish.json"
            payload = {"status": "RUNNING", "phases": {}}
            MODULE.checkpoint_receipt(path, payload)
            payload["status"] = "CERTIFIED"
            MODULE.checkpoint_receipt(path, payload)
            stored = MODULE.json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(stored["status"], "CERTIFIED")
            self.assertIn("updated_at", stored)
            self.assertEqual(list(path.parent.glob("*.tmp")), [])

    def test_production_role_can_be_forced_without_path_guessing(self):
        with patch.dict(MODULE.os.environ, {"AOE2_FINISH_HOST_ROLE": "production"}):
            self.assertTrue(MODULE.is_production_checkout())
        with patch.dict(MODULE.os.environ, {"AOE2_FINISH_HOST_ROLE": "operator"}):
            self.assertFalse(MODULE.is_production_checkout())

    def test_environment_value_parser_never_executes_content(self):
        with tempfile.TemporaryDirectory() as temp:
            path = pathlib.Path(temp) / "bridge.env"
            path.write_text(
                "# comment\nexport AOE2WAR_OS_BRIDGE_TOKEN='fixed-token'\n",
                encoding="utf-8",
            )
            self.assertEqual(
                MODULE.parse_environment_value(path, "AOE2WAR_OS_BRIDGE_TOKEN"),
                "fixed-token",
            )

    def test_delegated_bridge_run_defers_reload_to_parent(self):
        with patch.dict(
            MODULE.os.environ,
            {"AOE2WAR_OPERATOR_BRIDGE_RUN_ID": "run-123"},
        ):
            result = MODULE.reload_operator_bridge_after_release(
                MODULE.Progress(enabled=False)
            )
        self.assertEqual(result["status"], "PARENT_SELF_RELOAD_PENDING")

    def test_context_overlap_captures_and_checkpoints_result(self):
        receipt = {}
        checkpoints = []
        with patch.object(
            MODULE.aoe2_update,
            "capture_context",
            return_value={
                "AoE2HDBets": {
                    "sha256": "a" * 64,
                    "bytes": 123,
                }
            },
        ):
            state = MODULE.start_pre_release_context_overlap(
                projects=["AoE2HDBets"],
                receipt=receipt,
                checkpoint=lambda: checkpoints.append("checkpoint"),
                progress=MODULE.Progress(enabled=False),
            )
            MODULE.settle_pre_release_context_overlap(
                state=state,
                receipt=receipt,
                checkpoint=lambda: checkpoints.append("checkpoint"),
                progress=MODULE.Progress(enabled=False),
            )

        overlap = receipt["pre_release_context_overlap"]
        self.assertEqual(overlap["status"], "PASSED")
        self.assertEqual(overlap["projects"], ["AoE2HDBets"])
        self.assertIn("AoE2HDBets", overlap["archives"])
        self.assertGreaterEqual(len(checkpoints), 2)

    def test_external_source_authorities_fail_closed_on_dirty_repo(self):
        with tempfile.TemporaryDirectory() as temp:
            base = pathlib.Path(temp)
            external = base / "external"
            docs = base / "docs"
            external.mkdir()
            docs.mkdir()
            with (
                patch.object(
                    MODULE.aoe2_update,
                    "SOURCES",
                    {"app-prodn": MODULE.ROOT, "api-prodn": external},
                ),
                patch.object(MODULE.aoe2_update, "DOCS", docs),
                patch.object(
                    MODULE.aoe2_update,
                    "git_output",
                    side_effect=lambda _repo, command, *args: (
                        "main" if command == "branch" else "a" * 40
                    ),
                ),
                patch.object(
                    MODULE.aoe2_update,
                    "status_paths",
                    side_effect=lambda repo: {"changed.py"} if repo == external else set(),
                ),
                patch.object(
                    MODULE.aoe2_update,
                    "remote_sha",
                    return_value="a" * 40,
                ),
            ):
                result = MODULE.external_source_authority_snapshot()

        self.assertEqual(result["status"], "BLOCKED")
        self.assertEqual(
            result["repositories"]["api-prodn"]["status"],
            "DIRTY",
        )
        self.assertTrue(any("api-prodn" in item for item in result["blockers"]))


if __name__ == "__main__":
    unittest.main()
