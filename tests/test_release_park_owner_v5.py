"""Source-controlled v5 PARK_ONLY orchestration safety and preview contracts."""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
spec = importlib.util.spec_from_file_location(
    "aoe2_release_park_owner_v5_test",
    ROOT / "scripts/aoe2_release_park_owner_v5.py",
)
assert spec is not None and spec.loader is not None
park = importlib.util.module_from_spec(spec)
spec.loader.exec_module(park)


class OwnerV5StageParkTests(unittest.TestCase):
    def preview_packet(self):
        return {
            "status": "PREVIEW_ONLY",
            "authorization": "HOLD_NOT_CONSUMED",
            "owner_spki_sha256": park.EXPECTED_OWNER,
            "controller_sha256": park.EXPECTED_CONTROLLER,
            "approved_target_sha": park.TARGET,
            "evidence": {
                "old_build_id": "u842UVpDjLRLz-paxPv2U",
            },
        }

    def test_readonly_preview_accepts_exact_root_fields(self):
        packet = self.preview_packet()
        with mock.patch.object(park, "ssh", return_value=json.dumps(packet).encode()) as remote:
            self.assertEqual(park.preview(), packet)
            self.assertEqual(remote.call_args.args, ("python3", park.CONTROLLER, "--preview"))

    def test_rejects_untrusted_root_preview(self):
        good = self.preview_packet()
        for field, bad in (
            ("status", "ACTIVE"),
            ("authorization", "APPROVED"),
            ("owner_spki_sha256", "a" * 64),
            ("controller_sha256", "b" * 64),
            ("approved_target_sha", "c" * 40),
        ):
            with self.subTest(field=field):
                payload = dict(good, **{field: bad})
                with mock.patch.object(park, "ssh", return_value=json.dumps(payload).encode()):
                    with self.assertRaisesRegex(RuntimeError, "drift"):
                        park.preview()

    def test_remote_import_is_compileable_and_exactly_scoped(self):
        compile(park.ROOT_IMPORT_AND_APPLY, "root_only_import", "exec")
        source = park.ROOT_IMPORT_AND_APPLY
        self.assertIn("PARK_ONLY", source)
        self.assertIn("PARKED_NO_DELETE", source)
        self.assertIn("O_EXCL", source)
        self.assertIn("O_NOFOLLOW", source)
        self.assertIn("os.fsync", source)
        self.assertIn("root is required", source)
        self.assertIn("status", source)
        self.assertNotIn("PRIVATE KEY", source)
        self.assertNotIn("sudo", source)
        self.assertNotIn("activate", source)

    def test_signing_key_and_payload_are_never_transferred_in_preview(self):
        with mock.patch.object(park, "ssh", return_value=json.dumps(self.preview_packet()).encode()) as remote:
            park.preview()
            self.assertIsNone(remote.call_args.kwargs.get("payload"))

    def test_local_permit_is_create_once(self):
        with tempfile.TemporaryDirectory() as tmp:
            # Rebind canonical path to an isolated project fixture; don't
            # authorize a real stage or create persistent user files.
            repo = Path(tmp)
            (repo / ".aoe2war-release").mkdir()
            private = repo / ".aoe2war-release/stage-park-v5"
            orig_root, orig_receipts = park.ROOT, park.LOCAL_RECEIPTS
            park.ROOT, park.LOCAL_RECEIPTS = repo, private
            self.addCleanup(setattr, park, "ROOT", orig_root)
            self.addCleanup(setattr, park, "LOCAL_RECEIPTS", orig_receipts)
            packet = {"payload": {"nonce": "N" * 40}, "signature_base64": "AA=="}
            file = park.save_signed_packet(packet)
            self.assertEqual(file.stat().st_mode & 0o777, 0o600)
            self.assertEqual(json.loads(file.read_text()), packet)
            with self.assertRaises(FileExistsError):
                park.save_signed_packet(packet)

    def test_local_receipt_symlink_ancestor_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp) / "repo"
            repo.mkdir()
            outside = Path(tmp) / "outside"
            outside.mkdir()
            (repo / ".aoe2war-release").symlink_to(outside, target_is_directory=True)
            orig_root, orig_receipts = park.ROOT, park.LOCAL_RECEIPTS
            park.ROOT, park.LOCAL_RECEIPTS = repo, repo / ".aoe2war-release/stage-park-v5"
            self.addCleanup(setattr, park, "ROOT", orig_root)
            self.addCleanup(setattr, park, "LOCAL_RECEIPTS", orig_receipts)
            with self.assertRaisesRegex(RuntimeError, "linked or unowned"):
                park.private_local_directory(park.LOCAL_RECEIPTS)
            self.assertFalse((outside / "stage-park-v5").exists())


if __name__ == "__main__":
    unittest.main()
