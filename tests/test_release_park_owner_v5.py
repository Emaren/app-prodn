"""Read-only qualification for the source-owned historical PARK_ONLY operator."""
from __future__ import annotations
import importlib.util
import json
from pathlib import Path
import sys
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
spec = importlib.util.spec_from_file_location("stage_park_mac", ROOT / "scripts/aoe2_release_park_owner_v5.py")
assert spec is not None and spec.loader is not None
park = importlib.util.module_from_spec(spec)
spec.loader.exec_module(park)


class ParkOnlyContracts(unittest.TestCase):
    @staticmethod
    def valid_preview():
        return {"status": "PREVIEW_ONLY", "authorization": "HOLD_NOT_CONSUMED",
                "owner_spki_sha256": park.EXPECTED_OWNER,
                "controller_sha256": park.EXPECTED_CONTROLLER,
                "approved_target_sha": park.TARGET, "evidence": {"old_build_id": "historical"}}

    def test_root_preview_read_only(self):
        packet = self.valid_preview()
        with mock.patch.object(park, "ssh", return_value=json.dumps(packet).encode()) as remote:
            self.assertEqual(park.preview(), packet)
            self.assertEqual(remote.call_args.args, ("python3", park.CONTROLLER, "--preview"))

    def test_root_preview_rejects_identity_or_target_drift(self):
        for field, value in (("owner_spki_sha256", "0" * 64),
                             ("controller_sha256", "0" * 64),
                             ("approved_target_sha", "0" * 40),
                             ("authorization", "CONSUMED")):
            with self.subTest(field=field):
                packet = dict(self.valid_preview(), **{field: value})
                with mock.patch.object(park, "ssh", return_value=json.dumps(packet).encode()):
                    with self.assertRaises(RuntimeError):
                        park.preview()

    def test_remote_handler_compiles_and_only_calls_installed_park_controller(self):
        remote = park.ROOT_IMPORT_AND_APPLY
        compile(remote, "root-park", "exec")
        self.assertIn("PARKED_NO_DELETE", remote)
        self.assertIn("PARK_ONLY", remote)
        self.assertIn("O_EXCL", remote)
        self.assertIn("O_NOFOLLOW", remote)
        self.assertIn('["python3", str(CTRL), "--apply", "--permit"', remote)
        self.assertNotIn("activate_release(", remote)
        self.assertNotIn("stage_release(", remote)


if __name__ == "__main__":
    unittest.main()
