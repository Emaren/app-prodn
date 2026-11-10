"""Hash-pinned R25 managed portrait preflight. No public file mutations."""
from __future__ import annotations
import hashlib
import importlib.util
import json
from pathlib import Path
import os
import stat
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/release/r25_public_media_projection_v1.py"
spec = importlib.util.spec_from_file_location("r25_public_media_projection_v1", SCRIPT)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class PublicMediaProjection(unittest.TestCase):
    def setUp(self):
        self.t = tempfile.TemporaryDirectory()
        self.addCleanup(self.t.cleanup)
        self.root = Path(self.t.name) / "managed-assets"
        self.src = self.root / "uploads" / "managed-assets" / "avatar"
        self.dst = self.root / "avatar"
        self.src.mkdir(parents=True)
        self.dst.mkdir()
        self.assets = {name: bytes([index + 1]) * (100 + index * 22)
                       for index, name in enumerate(sorted(m.ALLOWED_FILES))}
        self.expected = {name: (hashlib.sha256(body).hexdigest(), len(body))
                         for name, body in self.assets.items()}
        for name, body in self.assets.items():
            (self.src / name).write_bytes(body)

    def inspect(self):
        return m.inspect(self.root, self.expected)

    def test_fixture_missing_four_is_staged_not_approved(self):
        report = self.inspect()
        self.assertEqual(report["status"], "PASS_SOURCE_HASHES_PROJECTION_HELD_FOR_CENTRAL")
        self.assertEqual(set(report["import_needed"]), set(self.assets))
        self.assertFalse(report["production_mutation"])
        self.assertFalse(report["finance_authorized"])
        self.assertFalse(report["release_authorized"])
        self.assertTrue(report["read_only"])
        self.assertEqual(len(report["assets"]), 4)
        self.assertEqual(list(self.dst.iterdir()), [])

    def test_full_identical_destination_is_idempotent_and_no_write(self):
        for name, body in self.assets.items():
            (self.dst / name).write_bytes(body)
        before = {x.name: x.stat().st_mtime_ns for x in self.dst.iterdir()}
        result = self.inspect()
        self.assertEqual(result["import_needed"], [])
        self.assertEqual(set(result["already_present"]), set(self.assets))
        self.assertEqual(before, {x.name: x.stat().st_mtime_ns for x in self.dst.iterdir()})

    def test_partial_exact_destination_is_safe_to_review(self):
        name = sorted(self.assets)[0]
        (self.dst / name).write_bytes(self.assets[name])
        result = self.inspect()
        self.assertEqual(result["already_present"], [name])
        self.assertEqual(len(result["import_needed"]), 3)

    def test_tampered_source_fails_closed(self):
        name = sorted(self.assets)[0]
        (self.src / name).write_bytes(b"tampered")
        with self.assertRaisesRegex(m.MediaHold, "SOURCE_HASH_OR_SIZE_MISMATCH"):
            self.inspect()

    def test_conflicting_preexisting_target_never_overwritten(self):
        name = sorted(self.assets)[0]
        path = self.dst / name
        path.write_bytes(b"wrong")
        with self.assertRaisesRegex(m.MediaHold, "CONFLICTING_DESTINATION"):
            self.inspect()
        self.assertEqual(path.read_bytes(), b"wrong")

    def test_source_symlink_refused(self):
        name = sorted(self.assets)[0]
        path = self.src / name
        path.unlink()
        path.symlink_to(self.src / sorted(self.assets)[1])
        with self.assertRaisesRegex(m.MediaHold, "SOURCE_OR_TARGET_UNREADABLE"):
            self.inspect()

    def test_target_symlink_and_broken_symlink_refused(self):
        name = sorted(self.assets)[0]
        path = self.dst / name
        path.symlink_to(self.src / name)
        with self.assertRaisesRegex(m.MediaHold, "DESTINATION_SYMLINK"):
            self.inspect()
        path.unlink()
        path.symlink_to(self.src / "nonexistent")
        with self.assertRaisesRegex(m.MediaHold, "DESTINATION_SYMLINK"):
            self.inspect()

    def test_source_directory_symlink_refused(self):
        old = self.root / "uploads" / "managed-assets" / "avatar"
        old.rename(old.with_name("avatar-real"))
        old.symlink_to(old.with_name("avatar-real"))
        with self.assertRaisesRegex(m.MediaHold, "PROJECTION_SYMLINK_OR_NOT_DIR"):
            self.inspect()

    def test_destination_directory_symlink_refused(self):
        self.dst.rmdir()
        self.dst.symlink_to(self.src)
        with self.assertRaisesRegex(m.MediaHold, "PROJECTION_SYMLINK_OR_NOT_DIR"):
            self.inspect()

    def test_missing_projection_path_refused(self):
        self.dst.rmdir()
        with self.assertRaisesRegex(m.MediaHold, "PROJECTION_DIRECTORY_MISSING"):
            self.inspect()

    def test_world_writable_source_refused(self):
        path = self.src / sorted(self.assets)[0]
        path.chmod(0o666)
        with self.assertRaisesRegex(m.MediaHold, "WORLD_WRITABLE_SOURCE"):
            self.inspect()

    def test_hardlinked_source_refused(self):
        path = self.src / sorted(self.assets)[0]
        os.link(path, self.src / "hardlink-canary")
        with self.assertRaisesRegex(m.MediaHold, "FILE_TYPE_SIZE_OR_LINK"):
            self.inspect()

    def test_unreviewed_manifest_name_or_hash_refused(self):
        name = sorted(self.assets)[0]
        wrong = dict(self.expected)
        wrong["extra.png"] = (hashlib.sha256(b"x").hexdigest(),1)
        with self.assertRaisesRegex(m.MediaHold, "UNPINNED_MANIFEST"):
            m.inspect(self.root, wrong)
        wrong = dict(self.expected)
        wrong[name] = ("A" * 64, len(self.assets[name]))
        with self.assertRaisesRegex(m.MediaHold, "UNPINNED_MANIFEST"):
            m.inspect(self.root, wrong)

    def test_manifest_order_and_digest_are_deterministic(self):
        first = self.inspect()
        second = m.inspect(self.root, dict(reversed(list(self.expected.items()))))
        self.assertEqual(first["manifest_sha256"], second["manifest_sha256"])
        self.assertEqual(first, second)

    def test_cli_has_only_inspect_no_implicit_apply(self):
        source = SCRIPT.read_text()
        self.assertIn('action="store_true", required=True', source)
        self.assertNotIn("shutil.copy", source)
        self.assertNotIn("os.replace", source)
        self.assertNotIn("os.rename", source)
        self.assertNotIn("systemctl", source.split("def main()", 1)[1])
        self.assertNotIn("chmod(", source)
        self.assertNotIn("prisma", source.lower())
        self.assertEqual(set(m.ALLOWED_FILES), set(self.assets))

if __name__ == "__main__":
    unittest.main()
