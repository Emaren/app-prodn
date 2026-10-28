#!/usr/bin/env python3
"""Regression tests: opt-in Mac package cache recovery stays inside Storage OS."""
from __future__ import annotations

import importlib.util
import io
from pathlib import Path
import tempfile
from contextlib import redirect_stdout
import unittest

SOURCE = Path(__file__).resolve().parents[1] / "scripts" / "aoe2_storage.py"
SPEC = importlib.util.spec_from_file_location("aoe2_storage_under_test", SOURCE)
assert SPEC is not None and SPEC.loader is not None
storage = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(storage)


def place(home: Path, path: str, payload: bytes = b"regenerable"):
    target = home / path
    target.mkdir(parents=True, exist_ok=True)
    (target / "cache.bin").write_bytes(payload)
    return target


class MacExtendedCacheTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="aoe2war-mac-cache-test-")
        self.addCleanup(self.tmp.cleanup)
        self.home = Path(self.tmp.name) / "home"
        self.home.mkdir()
        self.old_receipt_dir = storage.LOCAL_RECEIPT_DIR
        storage.LOCAL_RECEIPT_DIR = Path(self.tmp.name) / "receipts"
        self.addCleanup(setattr, storage, "LOCAL_RECEIPT_DIR", self.old_receipt_dir)

    def run_maintenance(self, *, apply=False, extended=False, electron_only=False):
        with redirect_stdout(io.StringIO()):
            return storage.local_maintain(
                apply=apply, json_mode=False, extended=extended,
                electron_only=electron_only, home=self.home
            )

    def test_electron_only_preview_never_deletes_or_writes_receipt(self):
        electron = place(self.home, "Library/Caches/electron")
        builder = place(self.home, "Library/Caches/electron-builder")
        original = place(self.home, "Library/Caches/Yarn")
        protected = place(self.home, "aoe2war-recovery")
        self.assertEqual(self.run_maintenance(electron_only=True), 0)
        self.assertTrue(all((p / "cache.bin").exists() for p in (
            electron, builder, original, protected)))
        self.assertFalse(storage.LOCAL_RECEIPT_DIR.exists())

    def test_electron_opt_in_removes_exact_two_and_receipts(self):
        electron = place(self.home, "Library/Caches/electron")
        builder = place(self.home, "Library/Caches/electron-builder")
        original = place(self.home, "Library/Caches/Yarn")
        extended = place(self.home, ".npm/_cacache")
        protected = place(self.home, "Library/Application Support/CrossOver/Bottles/Steam")
        recovery = place(self.home, "aoe2war-recovery")
        self.assertEqual(self.run_maintenance(apply=True, electron_only=True), 0)
        self.assertFalse(electron.exists())
        self.assertFalse(builder.exists())
        self.assertTrue(all((p / "cache.bin").exists() for p in (
            original, extended, protected, recovery)))
        receipts = list(storage.LOCAL_RECEIPT_DIR.glob("*local-maintenance.json"))
        self.assertEqual(len(receipts), 1)
        import json
        data = json.loads(receipts[0].read_text())
        self.assertTrue(data["electron_only"])
        self.assertTrue(data["apply"])
        self.assertEqual([action["name"] for action in data["actions"]],
                         ["electron_binary_download_cache", "electron_builder_download_cache"])
        self.assertEqual(data["status"], "PASS")

    def test_electron_only_symlink_fails_before_other_cache_deletion(self):
        first = place(self.home, "Library/Caches/electron")
        outside = Path(self.tmp.name) / "external"
        outside.mkdir()
        (outside / "unique_evidence").write_text("protected")
        (self.home / "Library/Caches/electron-builder").symlink_to(
            outside, target_is_directory=True
        )
        with self.assertRaises(storage.StorageError):
            self.run_maintenance(apply=True, electron_only=True)
        self.assertTrue((first / "cache.bin").is_file())
        self.assertTrue((outside / "unique_evidence").is_file())
        self.assertFalse(storage.LOCAL_RECEIPT_DIR.exists())

    def test_electron_ancestor_symlink_and_regular_file_blocked(self):
        outside = Path(self.tmp.name) / "cache-other"
        outside.mkdir()
        (self.home / "Library").mkdir()
        (self.home / "Library/Caches").symlink_to(outside, target_is_directory=True)
        with self.assertRaises(storage.StorageError):
            self.run_maintenance(apply=True, electron_only=True)
        (self.home / "Library/Caches").unlink()
        (self.home / "Library/Caches").mkdir()
        (self.home / "Library/Caches/electron").write_text("not a folder")
        with self.assertRaises(storage.StorageError):
            self.run_maintenance(apply=True, electron_only=True)

    def test_electron_only_does_not_follow_symlinks_inside_cache(self):
        electron = place(self.home, "Library/Caches/electron")
        builder = place(self.home, "Library/Caches/electron-builder")
        outside = Path(self.tmp.name) / "recordings"
        outside.mkdir()
        (outside / "unique-recording.mp4").write_bytes(b"PROTECTED_VIDEO")
        (electron / "recordings").symlink_to(outside, target_is_directory=True)
        self.assertEqual(self.run_maintenance(apply=True, electron_only=True), 0)
        self.assertFalse(electron.exists())
        self.assertFalse(builder.exists())
        self.assertEqual((outside / "unique-recording.mp4").read_bytes(), b"PROTECTED_VIDEO")

    def test_electron_only_and_extended_combination_refused(self):
        electron = place(self.home, "Library/Caches/electron")
        with self.assertRaisesRegex(storage.StorageError, "cannot be combined"):
            self.run_maintenance(apply=True, extended=True, electron_only=True)
        self.assertTrue((electron / "cache.bin").is_file())

    def test_preview_never_deletes_any_cache(self):
        baseline = place(self.home, "Library/Caches/Yarn")
        extra = place(self.home, ".npm/_cacache")
        self.assertEqual(self.run_maintenance(), 0)
        self.assertTrue((baseline / "cache.bin").is_file())
        self.assertTrue((extra / "cache.bin").is_file())
        self.assertFalse(storage.LOCAL_RECEIPT_DIR.exists())

    def test_legacy_apply_does_not_expand_allowlist(self):
        baseline = place(self.home, "Library/Caches/Yarn")
        extra = place(self.home, ".npm/_cacache")
        protected = place(self.home, "aoe2war-recovery")
        self.assertEqual(self.run_maintenance(apply=True), 0)
        self.assertFalse(baseline.exists())
        self.assertTrue((extra / "cache.bin").exists())
        self.assertTrue((protected / "cache.bin").exists())
        self.assertEqual(len(list(storage.LOCAL_RECEIPT_DIR.glob("*local-maintenance.json"))), 1)

    def test_extended_opt_in_only_removes_eight_named_caches(self):
        originals = [place(self.home, str(p)) for _, p in storage.LOCAL_REGENERABLE_PATHS]
        extras = [place(self.home, str(p)) for _, p in storage.LOCAL_EXTENDED_REGENERABLE_PATHS]
        protected = place(self.home, "Library/Application Support/MobileSync/Backup")
        self.assertEqual(self.run_maintenance(apply=True, extended=True), 0)
        self.assertTrue(all(not p.exists() for p in originals + extras))
        self.assertTrue((protected / "cache.bin").is_file())

    def test_extended_symlink_refuses_before_deleting_original_cache(self):
        baseline = place(self.home, "Library/Caches/Yarn")
        outside = Path(self.tmp.name) / "elsewhere"
        outside.mkdir()
        (self.home / ".npm").mkdir()
        (self.home / ".npm/_cacache").symlink_to(outside, target_is_directory=True)
        with self.assertRaises(storage.StorageError):
            self.run_maintenance(apply=True, extended=True)
        self.assertTrue(baseline.exists())
        self.assertFalse(storage.LOCAL_RECEIPT_DIR.exists())

    def test_untrusted_extended_path_does_not_block_original_allowlist(self):
        baseline = place(self.home, "Library/Caches/Yarn")
        outside = Path(self.tmp.name) / "elsewhere"
        outside.mkdir()
        (self.home / ".npm").mkdir()
        (self.home / ".npm/_cacache").symlink_to(outside, target_is_directory=True)
        self.assertEqual(self.run_maintenance(apply=True), 0)
        self.assertFalse(baseline.exists())
        self.assertTrue((self.home / ".npm/_cacache").is_symlink())


if __name__ == "__main__":
    unittest.main()
