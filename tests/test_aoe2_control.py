from __future__ import annotations

import contextlib
import importlib.util
import pathlib
import sys
import tempfile
import unittest
from unittest import mock


SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "aoe2_control.py"
SCRIPTS = SCRIPT.parent
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

SPEC = importlib.util.spec_from_file_location("aoe2_control", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class ControlDocsTests(unittest.TestCase):
    def test_status_lists_exact_three_canonical_control_docs(self):
        plan = {
            "status": "current",
            "reason": "generated control blocks already match certified source",
            "intended_source_sha": "a" * 40,
            "current_source_sha": "a" * 40,
        }
        with mock.patch.object(MODULE.aoe2_release, "collect", return_value={}), \
             mock.patch.object(
                 MODULE.aoe2_update, "estate_map_refresh_plan", return_value=plan
             ):
            payload = MODULE.status_payload()
        self.assertEqual(payload["status"], "current")
        self.assertEqual(len(payload["authoritative_files"]), 3)
        self.assertTrue(
            payload["authoritative_files"][2].endswith("AOE2WAR_100_CLOSURE.md")
        )
        self.assertFalse(payload["runtime_mutated"])
        self.assertFalse(payload["wolo_mutated"])

    def test_refresh_is_documentation_only_and_verifies_final_audit(self):
        audit = mock.Mock()
        audit.payload.return_value = {"p0": 0, "p1": 0, "estate": "HEALTHY"}
        refresh = {
            "status": "refreshed",
            "intended_source_sha": "a" * 40,
        }
        with tempfile.TemporaryDirectory() as temporary, \
             mock.patch.object(MODULE, "RECEIPT_DIR", pathlib.Path(temporary)), \
             mock.patch.object(
                 MODULE.aoe2_update, "update_lock", return_value=contextlib.nullcontext()
             ), \
             mock.patch.object(
                 MODULE.aoe2_update, "refresh_estate_maps", return_value=refresh
             ) as refresh_call, \
             mock.patch.object(
                 MODULE.aoe2_update, "central_sync", return_value={"status": "already-current"}
             ), \
             mock.patch.object(MODULE.aoe2_audit, "collect_audit", return_value=audit):
            payload = MODULE.refresh_control_state(capture_context=False)

        refresh_call.assert_called_once_with(
            progress=mock.ANY,
            force=True,
        )
        self.assertEqual(payload["status"], "VERIFIED")
        self.assertFalse(payload["runtime_mutated"])
        self.assertFalse(payload["database_mutated"])
        self.assertFalse(payload["wolo_mutated"])


    def test_refresh_captures_mbp_and_vps_host_context_with_control_docs(self):
        audit = mock.Mock()
        audit.payload.return_value = {"p0": 0, "p1": 0, "estate": "HEALTHY"}
        refresh = {
            "status": "refreshed",
            "intended_source_sha": "a" * 40,
        }
        with tempfile.TemporaryDirectory() as temporary, \
             mock.patch.object(MODULE, "RECEIPT_DIR", pathlib.Path(temporary)), \
             mock.patch.object(
                 MODULE.aoe2_update, "update_lock", return_value=contextlib.nullcontext()
             ), \
             mock.patch.object(
                 MODULE.aoe2_update, "refresh_estate_maps", return_value=refresh
             ), \
             mock.patch.object(
                 MODULE.aoe2_update, "central_sync", return_value={"status": "already-current"}
             ), \
             mock.patch.object(
                 MODULE.aoe2_update,
                 "capture_context",
                 return_value={"VPSSentry": {}, "AoE2WAR-docs": {}, "MBP": {}, "VPS": {}},
             ) as capture_call, \
             mock.patch.object(MODULE.aoe2_audit, "collect_audit", return_value=audit):
            payload = MODULE.refresh_control_state(capture_context=True)

        capture_call.assert_called_once_with(
            [
                "AoE2HDBets",
                "WoloChain-wolo-1",
                "VPSSentry",
                "AoE2WAR-docs",
            ],
            progress=mock.ANY,
            include_host_context=True,
        )
        self.assertEqual(payload["status"], "VERIFIED")
        self.assertEqual(
            set(payload["context_archives"]),
            {
                "AoE2HDBets",
                "WoloChain-wolo-1",
                "VPSSentry",
                "AoE2WAR-docs",
                "MBP",
                "VPS",
            },
        )


if __name__ == "__main__":
    unittest.main()
