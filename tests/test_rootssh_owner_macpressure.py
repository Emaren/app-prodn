#!/usr/bin/env python3
"""Checks for root SSH owner-v5 public rotation and Mac read-only census."""
from __future__ import annotations

import importlib.util
import os
import json
from pathlib import Path
import tempfile
from unittest import TestCase, mock
import unittest


ROOT = Path(__file__).resolve().parents[1]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


rotate = load("aoe2_owner_v5_enroll_rootssh_test", "scripts/aoe2_owner_v5_enroll_rootssh.py")
pressure = load("aoe2_storage_mac_pressure_test", "scripts/aoe2_storage_mac_pressure.py")


class RootAuthorityContract(TestCase):
    def test_pins_are_exact_and_distinct(self):
        self.assertEqual(len(rotate.EXPECTED_OLD), 64)
        self.assertEqual(len(rotate.EXPECTED_NEW), 64)
        self.assertNotEqual(rotate.EXPECTED_OLD, rotate.EXPECTED_NEW)
        self.assertEqual(len(rotate.CONTROLLER_SHA), 64)

    def test_refuses_malformed_public_key_before_mutation(self):
        with mock.patch.object(rotate.os, "geteuid", return_value=0):
            with self.assertRaises((RuntimeError, ValueError)):
                rotate.rotate_root("bm90LWEta2V5")
        # Malformed public key is rejected before any filesystem changes.

    def test_atomic_public_backup_is_create_once(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "public"
            rotate.durable_new(path, b"public bytes")
            self.assertEqual(path.read_bytes(), b"public bytes")
            with self.assertRaises(FileExistsError):
                rotate.durable_new(path, b"other bytes")
            self.assertEqual(path.read_bytes(), b"public bytes")

    def test_observed_tony_shared_release_lease_is_not_root_private(self):
        # Mirrors independently observed HEL1 ownership/modes, without
        # constructing a privileged process or touching any real server.
        with tempfile.TemporaryDirectory() as tmp:
            control = Path(tmp).resolve() / "os-control"
            control.mkdir(mode=0o750)
            locks = control / "locks"
            locks.mkdir(mode=0o755)
            lock = locks / "release.lock"
            lock.touch(mode=0o664)
            lock.chmod(0o664)
            original = rotate.LEASE
            rotate.LEASE = lock
            try:
                device, inode, mode = rotate.shared_release_lock_shape(
                    operator_uid=os.getuid())
                self.assertEqual(mode & 0o777, 0o664)
                self.assertEqual((device, inode), (lock.stat().st_dev, lock.stat().st_ino))
                # After narrow chmod the mode-tightening transaction must
                # not be blindly replayable against unexpected starting state.
                lock.chmod(0o644)
                with self.assertRaisesRegex(RuntimeError, "0664"):
                    rotate.shared_release_lock_shape(operator_uid=os.getuid())
            finally:
                rotate.LEASE = original

    def test_shared_release_lease_rejects_group_writable_parent(self):
        with tempfile.TemporaryDirectory() as tmp:
            control = Path(tmp).resolve() / "os-control"
            control.mkdir(mode=0o750)
            locks = control / "locks"
            locks.mkdir(mode=0o775)
            locks.chmod(0o775)
            lock = locks / "release.lock"
            lock.touch(mode=0o664)
            lock.chmod(0o664)
            original = rotate.LEASE
            rotate.LEASE = lock
            try:
                with self.assertRaisesRegex(RuntimeError, "ownership/mode drift"):
                    rotate.shared_release_lock_shape(operator_uid=os.getuid())
            finally:
                rotate.LEASE = original

    def test_shared_release_lock_rejects_symlinked_ancestor(self):
        # A physical temp root is permitted, but a true symlink introduced
        # anywhere in the protected lock path must remain forbidden.
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve()
            control = root / "os-control"
            locks = control / "locks"
            locks.mkdir(parents=True)
            lock = locks / "release.lock"
            lock.write_bytes(b"")
            alias = root / "os-control-link"
            alias.symlink_to(control, target_is_directory=True)
            original = rotate.LEASE
            rotate.LEASE = alias / "locks" / "release.lock"
            try:
                with self.assertRaisesRegex(RuntimeError, "linked/non-directory"):
                    rotate.shared_release_lock_shape(operator_uid=os.getuid())
            finally:
                rotate.LEASE = original

    def test_rotation_uses_no_sudo_in_ssh_transport(self):
        src = (ROOT / "scripts/aoe2_owner_v5_enroll_rootssh.py").read_text()
        self.assertIn('"root@hel1"', src)
        self.assertIn('"BatchMode=yes"', src)
        self.assertIn('"StrictHostKeyChecking=yes"', src)
        self.assertNotIn('"sudo"', src)
        self.assertNotIn('"owner-private.pem"', src)
        self.assertIn('"OWNER_V5_ENROLLED_PREVIEW_PASS"', src)
        self.assertIn("ENROLL OWNER V5 AND TIGHTEN RELEASE LOCK", src)
        self.assertIn("mode 0664->0644", src)


class MacPressureContract(TestCase):
    def test_census_is_readonly_and_protects_user_paths(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp) / "home"
            home.mkdir()
            project = home / "projects/AoE2HDBets"
            project.mkdir(parents=True)
            (home / "Downloads").mkdir()
            (home / "Downloads/test.zip").write_bytes(b"keep" * 1024)
            (project / "app-prodn").mkdir()
            (project / "app-prodn/.next").mkdir()
            (project / "app-prodn/.next/BUILD_ID").write_text("still here")
            result = pressure.census(home, project, limit=30)
            self.assertEqual(result["status"], "READ_ONLY")
            self.assertIs(result["mutation_allowed"], False)
            self.assertTrue((home / "Downloads/test.zip").exists())
            self.assertTrue((project / "app-prodn/.next/BUILD_ID").exists())
            self.assertTrue(all(row["mutation_allowed"] is False
                                for row in result["measured"]))

    def test_named_census_coverage_is_explicit_and_never_whole_disk(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp) / "home"
            home.mkdir()
            project = home / "projects/AoE2HDBets"
            project.mkdir(parents=True)
            result = pressure.census(home, project, limit=300)
            self.assertEqual(result["coverage"], "NAMED_PATHS_ONLY_NOT_WHOLE_DISK")
            self.assertIs(result["mutation_allowed"], False)
            self.assertEqual(result["displayed_path_count"], result["observed_path_count"])
            self.assertTrue(result["named_census_complete"])
            self.assertEqual(result["incomplete_reasons"], [])
            capped = pressure.census(home, project, limit=5)
            self.assertFalse(capped["named_census_complete"])
            self.assertIn("DISPLAY_ROW_LIMIT", capped["incomplete_reasons"])

    def test_newly_named_review_and_protection_do_not_grant_deletion(self):
        names = dict((name, classification)
                     for name, _path, classification in pressure.HOME_BUCKETS)
        self.assertTrue(names["codex_worktrees"].startswith("PROTECTED"))
        self.assertTrue(names["crossover"].startswith("PROTECTED"))
        self.assertTrue(names["docker_virtual_disks"].startswith("PROTECTED"))
        self.assertTrue(names["electron_binary_cache"].startswith("REVIEW"))
        self.assertTrue(names["chrome_browser_cache"].startswith("REVIEW"))
        self.assertNotIn("rmtree", (ROOT / "scripts/aoe2_storage_mac_pressure.py").read_text())

    def test_all_generated_buckets_remain_review_only(self):
        self.assertIn(".next", pressure.GENERATED_NAMES)
        self.assertIn("node_modules", pressure.GENERATED_NAMES)
        self.assertTrue(all(item[2].startswith(("REVIEW", "PROTECTED")) for item in pressure.HOME_BUCKETS))
        self.assertNotIn("shutil.rmtree", (ROOT / "scripts/aoe2_storage_mac_pressure.py").read_text())


if __name__ == "__main__":
    unittest.main()
