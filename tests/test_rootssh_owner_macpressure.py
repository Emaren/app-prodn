#!/usr/bin/env python3
"""Checks for root SSH owner-v5 public rotation and Mac read-only census."""
from __future__ import annotations

import importlib.util
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
        self.assertFalse(rotate.AUDIT.exists() and
                         str(rotate.AUDIT).startswith("/tmp/fake-test-"))

    def test_atomic_public_backup_is_create_once(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "public"
            rotate.durable_new(path, b"public bytes")
            self.assertEqual(path.read_bytes(), b"public bytes")
            with self.assertRaises(FileExistsError):
                rotate.durable_new(path, b"other bytes")
            self.assertEqual(path.read_bytes(), b"public bytes")

    def test_rotation_uses_no_sudo_in_ssh_transport(self):
        src = (ROOT / "scripts/aoe2_owner_v5_enroll_rootssh.py").read_text()
        self.assertIn('"root@hel1"', src)
        self.assertIn('"BatchMode=yes"', src)
        self.assertIn('"StrictHostKeyChecking=yes"', src)
        self.assertNotIn('"sudo"', src)
        self.assertNotIn('"owner-private.pem"', src)
        self.assertIn('"OWNER_V5_ENROLLED_PREVIEW_PASS"', src)


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

    def test_all_generated_buckets_remain_review_only(self):
        self.assertIn(".next", pressure.GENERATED_NAMES)
        self.assertIn("node_modules", pressure.GENERATED_NAMES)
        self.assertIn((".cache/pip" in str(pressure.HOME_BUCKETS)), (True, False))
        self.assertNotIn("shutil.rmtree", (ROOT / "scripts/aoe2_storage_mac_pressure.py").read_text())


if __name__ == "__main__":
    unittest.main()
