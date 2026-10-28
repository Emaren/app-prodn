#!/usr/bin/env python3
"""Adversarial safety tests for Mac Downloads handoff script review."""
from __future__ import annotations

import importlib.util
import os
from pathlib import Path
import tempfile
import time
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "aoe2_storage_download_scripts.py"
SPEC = importlib.util.spec_from_file_location("aoe2_download_handoff_test", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
helper = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(helper)


class DownloadHandoffTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.home = Path(self.tmp.name) / "home"
        self.home.mkdir()
        (self.home / "Downloads").mkdir()
        (self.home / ".Trash").mkdir()
        self.now = time.time()

    def put(self, name: str, data: bytes = b"test", *, days: int = 21) -> Path:
        path = self.home / "Downloads" / name
        path.write_bytes(data)
        old = self.now - days * 86400
        os.utime(path, (old, old))
        return path

    def preview(self) -> dict:
        return helper.inventory(self.home, now=self.now)

    def test_private_chat_archives_and_nested_scripts_are_never_candidates(self):
        chat_dir = self.home / "Downloads" / "chat-export-2026"
        chat_dir.mkdir()
        (chat_dir / "chat.html").write_bytes(b"irreplaceable")
        (chat_dir / "conversations.json").write_bytes(b"irreplaceable")
        (chat_dir / "aoe2war_old.py").write_bytes(b"nested")
        self.put("aoe2war_chat_export.py")
        target = self.put("aoe2war_old.py")
        plan = self.preview()
        self.assertEqual([row["name"] for row in plan["candidates"]], [target.name])
        self.assertTrue((chat_dir / "conversations.json").exists())
        self.assertEqual(plan["reclaimed_bytes"], 0)

    def test_recent_and_high_authority_scripts_are_held(self):
        for name in (
            "AOE2WAR_owner_v5_enroll.py", "aoe2war_bank_proof.py",
            "aoe2war_wallet_key.sh", "aoe2war_stage_rollback.py",
            "aoe2war_restore_backup.sh", "aoe2war_financial_receipt.py",
            "personal.py", "aoe2war_archive_history.py",
        ):
            self.put(name)
        self.put("aoe2war_recent.py", days=1)
        self.assertEqual(self.preview()["candidates"], [])

    def test_symlinks_and_hardlinks_are_not_candidates(self):
        original = self.put("aoe2war_original.sh")
        (self.home / "Downloads" / "aoe2war_link.sh").symlink_to(original)
        os.link(original, self.home / "Downloads" / "aoe2war_other.sh")
        self.assertFalse(self.preview()["candidates"])

    def test_changed_bytes_invalidate_exact_plan(self):
        target = self.put("AOE2WAR_test.py")
        plan = self.preview()
        target.write_bytes(b"changed after plan")
        with self.assertRaises(helper.Hold):
            helper.move_to_trash(self.home, confirm=plan["plan_sha256"], now=self.now)
        self.assertTrue(target.is_file())
        self.assertFalse(list((self.home / ".Trash").iterdir()))

    def test_exact_plan_moves_only_selected_scripts_into_trash(self):
        a = self.put("aoe2war_old.py", b"alpha")
        b = self.put("AOE2WAR_old.sh", b"beta")
        chat = self.home / "Downloads" / "conversations.json"
        chat.write_bytes(b"PRIVATE")
        plan = self.preview()
        result = helper.move_to_trash(self.home, confirm=plan["plan_sha256"], now=self.now)
        dest = Path(result["trash_directory"])
        self.assertEqual(result["status"], "TRASHED_NOT_PURGED")
        self.assertEqual(result["reclaimed_bytes"], 0)
        self.assertFalse(a.exists())
        self.assertFalse(b.exists())
        self.assertEqual((dest / a.name).read_bytes(), b"alpha")
        self.assertEqual((dest / b.name).read_bytes(), b"beta")
        self.assertTrue((dest / "aoe2war-review-receipt.json").is_file())
        self.assertEqual(chat.read_bytes(), b"PRIVATE")

    def test_repeated_plan_cannot_overwrite_trash(self):
        self.put("aoe2war_old.py")
        p = self.preview()
        helper.move_to_trash(self.home, confirm=p["plan_sha256"], now=self.now)
        with self.assertRaises(helper.Hold):
            helper.move_to_trash(self.home, confirm=p["plan_sha256"], now=self.now)

    def test_parent_symlinks_fail_closed(self):
        (self.home / "Downloads").rmdir()
        other = Path(self.tmp.name) / "elsewhere"
        other.mkdir()
        (self.home / "Downloads").symlink_to(other, target_is_directory=True)
        with self.assertRaises(helper.Hold):
            self.preview()

    def test_missing_trash_refuses_before_any_move(self):
        a = self.put("aoe2war_old.sh")
        p = self.preview()
        (self.home / ".Trash").rmdir()
        with self.assertRaises(helper.Hold):
            helper.move_to_trash(self.home, confirm=p["plan_sha256"], now=self.now)
        self.assertTrue(a.is_file())


if __name__ == "__main__":
    unittest.main()
