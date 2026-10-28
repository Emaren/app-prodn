"""Red-team tests: signed, one-use, non-destructive retirement-only boundary."""
from __future__ import annotations

import base64
from datetime import datetime, timedelta, timezone
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest import mock

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/aoe2_release_retire_stage.py"
SPEC = importlib.util.spec_from_file_location("aoe2_release_retire_stage", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class StageOwnerPermitTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.private = root / "private.pem"
        self.public = root / "public.pem"
        self.source = root / "verified-controller.py"
        self.source.write_text("reviewed tool\n")
        self.evidence = {
            "old_source_sha": MODULE.SOURCE_SHA,
            "old_build_id": MODULE.OLD_BUILD,
            "old_artifact_sha256": "a" * 64,
            "old_dependency_sha256": "b" * 64,
            "stage_status_sha256": "c" * 64,
            "manifest_sha256": "d" * 64,
            "gate_sha256": "e" * 64,
            "stage_receipt_sha256": "f" * 64,
            "stage_receipt_dir": "/mnt/example/stage-receipt",
            "live_source_sha": "6" * 40,
            "live_build_id": "s5lkg31SfI18yR-eQN8iT",
            "machine_id_sha256": "1" * 64,
        }
        self.now = datetime(2026, 10, 27, 22, 0, tzinfo=timezone.utc)
        result = subprocess.run(["openssl", "genpkey", "-algorithm", "ed25519",
                                 "-out", str(self.private)], capture_output=True)
        if result.returncode:
            self.skipTest("OpenSSL Ed25519 unavailable")
        subprocess.run(["openssl", "pkey", "-in", str(self.private), "-pubout",
                        "-out", str(self.public)], check=True, capture_output=True)

    def signed(self, change=None):
        payload = {
            "kind": "aoe2war.retire-stage-only.v1",
            "action": "PARK_ONLY",
            "nonce": "A" * 40,
            "controller_sha256": MODULE.digest(self.source),
            "no_publish_stage_activate": True,
            "funded_wolo_authorized": False,
            "intended_release_sha": "a" * 40,
            "source_stage_path": str(MODULE.APP / ".next-release"),
            "dependency_stage_path": str(MODULE.APP / ".node_modules-release"),
            "archive_root": str(MODULE.ARCHIVE),
            "global_lock_path": str(MODULE.GLOBAL_LOCK),
            "issued_at": self.now.isoformat(),
            "expires_at": (self.now + timedelta(minutes=10)).isoformat(),
            **self.evidence,
        }
        if change:
            payload.update(change)
        message = Path(self.temp.name) / "message"
        signature = Path(self.temp.name) / "signature"
        message.write_bytes(MODULE.DOMAIN + MODULE.canonical(payload))
        subprocess.run(["openssl", "pkeyutl", "-sign", "-rawin",
                        "-inkey", str(self.private), "-in", str(message),
                        "-out", str(signature)], check=True, capture_output=True)
        return {"payload": payload,
                "signature_base64": base64.b64encode(signature.read_bytes()).decode()}

    def verify(self, packet):
        with mock.patch.object(MODULE, "protected_file"):
            return MODULE.verify_owner(packet, self.evidence, key=self.public,
                                       source_path=self.source, now=self.now)

    def test_valid_real_ed25519_permit(self):
        self.assertEqual("PARK_ONLY", self.verify(self.signed())["action"])

    def test_wrong_signer_rejected(self):
        other = Path(self.temp.name) / "other.pem"
        subprocess.run(["openssl", "genpkey", "-algorithm", "ed25519",
                        "-out", str(other)], check=True, capture_output=True)
        subprocess.run(["openssl", "pkey", "-in", str(other), "-pubout",
                        "-out", str(self.public)], check=True, capture_output=True)
        with self.assertRaisesRegex(MODULE.Hold, "wrong owner-v4 signer"):
            self.verify(self.signed())

    def test_poisoned_digest_rejected_even_if_signed(self):
        with self.assertRaisesRegex(MODULE.Hold, "signed stage evidence drift"):
            self.verify(self.signed({"old_dependency_sha256": "0" * 64}))

    def test_expiry_wrong_purpose_unreviewed_source(self):
        for changed in (
            {"expires_at": (self.now - timedelta(seconds=1)).isoformat()},
            {"action": "ACTIVATE"},
            {"funded_wolo_authorized": True},
            {"controller_sha256": "0" * 64},
        ):
            with self.subTest(changed=changed), self.assertRaises(MODULE.Hold):
                self.verify(self.signed(changed))

    def test_signature_tamper_rejected(self):
        packet = self.signed()
        packet["payload"]["gate_sha256"] = "1" * 64
        with self.assertRaises(MODULE.Hold):
            self.verify(packet)

    def test_duplicate_json_keys_rejected(self):
        with self.assertRaisesRegex(MODULE.Hold, "duplicate JSON field"):
            MODULE.unique_pairs([("nonce", "a"), ("nonce", "b")])


class RetirementIsolationTests(unittest.TestCase):
    def setUp(self):
        self.real_no_link_directory = MODULE.no_link_directory
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.app = self.root / "app"
        self.app.mkdir()
        for name in (".next-release", ".node_modules-release"):
            (self.app / name).mkdir()
            (self.app / name / "evidence").write_text(name)
        (self.app / ".next").mkdir()
        (self.app / ".next" / "BUILD_ID").write_text("live-build")
        self.archive = self.root / "archive"
        self.archive.mkdir(mode=0o700)
        self.state = self.root / "state"
        self.state.mkdir(mode=0o700)
        (self.state / "nonces").mkdir(mode=0o700)
        (self.state / "receipts").mkdir(mode=0o700)
        self.lock = self.root / "release.lock"
        self.lock.write_text("")
        self.lock.chmod(0o600)
        self.receipts = self.root / "evidence"
        self.receipts.mkdir()
        self.data = {"live_source_sha": "6" * 40, "live_build_id": "live-build"}
        self.inodes = {
            name: os.lstat(self.app / name)
            for name in (".next-release", ".node_modules-release")
        }
        self.packet = {"payload": {"nonce": "R" * 40}}
        def fake_stat(path):
            st = os.lstat(path)
            return type("Stat", (), {"st_uid": 0, "st_mode": 0o700,
                                    "st_dev": st.st_dev, "st_ino": st.st_ino})()
        self.patches = [
            mock.patch.object(MODULE.os, "geteuid", return_value=0),
            mock.patch.object(MODULE, "no_link_directory", side_effect=fake_stat),
            mock.patch.object(MODULE, "stage_evidence",
                              return_value=(self.data, self.inodes)),
            mock.patch.object(MODULE, "verify_owner",
                              return_value=self.packet["payload"]),
            mock.patch.object(MODULE, "active_consumers", return_value=True),
            mock.patch.object(MODULE, "command",
                              side_effect=lambda *args: (
                                  "active" if args[0] == "systemctl" else
                                  "LISTEN :8092\nLISTEN :8093" if args[0] == "ss" else "6" * 40)),
        ]
        for patch in self.patches:
            patch.start()
            self.addCleanup(patch.stop)

    def invoke(self):
        return MODULE.apply(self.packet, app=self.app, receipts=self.receipts,
                            archive=self.archive, state=self.state, lock=self.lock)

    def test_park_preserves_both_trees_no_delete_no_activation(self):
        result = self.invoke()
        self.assertEqual(result["status"], "PARKED_NO_DELETE")
        parked = Path(result["destination"])
        for name in (".next-release", ".node_modules-release"):
            self.assertFalse((self.app / name).exists())
            self.assertEqual((parked / name / "evidence").read_text(), name)
            self.assertEqual(os.lstat(parked / name).st_ino, self.inodes[name].st_ino)
        self.assertTrue((self.state / "receipts" / ("R" * 40) / "complete.json").is_file())
        self.assertFalse((self.app / ".next" / "BUILD_ID").read_text() != "live-build")

    def test_nonce_replay_fails_without_second_mutation(self):
        self.invoke()
        with self.assertRaisesRegex(MODULE.Hold, "already consumed"):
            self.invoke()

    def test_active_consumer_holds_before_nonce(self):
        with mock.patch.object(MODULE, "active_consumers",
                               side_effect=MODULE.Hold("active consumer")):
            with self.assertRaisesRegex(MODULE.Hold, "active consumer"):
                self.invoke()
        self.assertFalse(list((self.state / "nonces").iterdir()))
        self.assertTrue((self.app / ".next-release").is_dir())

    def test_crash_after_first_rename_is_unknown_no_replay(self):
        original = os.rename
        calls = []
        def crash(src, dst):
            calls.append((src, dst))
            if len(calls) == 2:
                raise OSError("simulated crash")
            return original(src, dst)
        with mock.patch.object(MODULE.os, "rename", side_effect=crash):
            with self.assertRaisesRegex(MODULE.Hold, "UNKNOWN_NO_REPLAY"):
                self.invoke()
        receipt = self.state / "receipts" / ("R" * 40)
        self.assertTrue((receipt / "unknown.json").exists())
        self.assertTrue((self.state / "nonces" / (("R" * 40) + ".json")).exists())
        self.assertFalse((receipt / "complete.json").exists())

    def test_unsafe_global_lock_fails_closed(self):
        self.lock.chmod(0o666)
        with self.assertRaisesRegex(MODULE.Hold, "unsafe canonical shared release lock"):
            self.invoke()
        self.assertTrue((self.app / ".next-release").exists())

    def test_symlinked_stage_path_is_denied(self):
        real = self.root / "real-dir"
        real.mkdir()
        linked = self.root / "linked-dir"
        linked.symlink_to(real, target_is_directory=True)
        with self.assertRaises(MODULE.Hold):
            self.real_no_link_directory(linked)

    def test_privileged_consumer_reference_is_denied(self):
        with mock.patch.object(MODULE.os, "readlink",
                               return_value=str(self.app / ".next-release" / "server.js")):
            with self.assertRaisesRegex(MODULE.Hold, "active staged inode consumer"):
                MODULE.check_proc_link(Path("/proc/100/fd/9"),
                                       [str(self.app / ".next-release")])

    def test_simultaneous_global_lease_refuses_second_operator(self):
        import fcntl
        with self.lock.open("r+b") as competing:
            fcntl.flock(competing.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            with self.assertRaises(BlockingIOError):
                self.invoke()
            fcntl.flock(competing.fileno(), fcntl.LOCK_UN)
        self.assertFalse(list((self.state / "nonces").iterdir()))
        self.assertTrue((self.app / ".next-release").exists())

    def test_failed_durable_prestate_writes_never_consume_or_move(self):
        with mock.patch.object(MODULE, "durable_json", side_effect=OSError("disk write failed")):
            with self.assertRaises(OSError):
                self.invoke()
        self.assertFalse(list((self.state / "nonces").iterdir()))
        self.assertTrue((self.app / ".next-release").exists())

    def test_no_publication_activation_finance_or_removal_capabilities(self):
        text = SCRIPT.read_text()
        for forbidden in ("aoe2_release_auto", "aoe2_release_ship", "ship_all(",
                          "stage_release(", "activate_release(", "prisma migrate",
                          "/api/bets", "shutil.rmtree(", "os.remove(", "unlink(",
                          "rm -rf", "git push"):
            self.assertNotIn(forbidden, text)


if __name__ == "__main__":
    unittest.main()
