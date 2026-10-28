"""Focused source-owned operator-path tests. No HEL1, no finance, no signing secrets."""
from __future__ import annotations

import base64
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


def load(name):
    path = ROOT / "scripts" / (name + ".py")
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


MAC = load("aoe2_release_retire_permit_mac")
INSTALL = load("aoe2_release_retire_install")


class OwnerOnlyPermitBuilderTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.private = root / "owner-private.pem"
        result = subprocess.run(
            ["openssl", "genpkey", "-algorithm", "ed25519", "-out", str(self.private)],
            capture_output=True,
        )
        if result.returncode != 0:
            self.skipTest("OpenSSL Ed25519 unavailable")
        self.public = root / "owner-public.pem"
        subprocess.run(["openssl", "pkey", "-in", str(self.private), "-pubout",
                        "-out", str(self.public)], check=True, capture_output=True)
        self.spki = INSTALL.spki_digest(self.public.read_bytes())
        self.controller = "a" * 64
        self.evidence = {
            "old_source_sha": "14ce71045150fcad4a25f0e3c3858c1c3cc7aab6",
            "old_build_id": "u842UVpDjLRLz-paxPv2U",
            "old_artifact_sha256":
                "b3d2705478f35b5e247ae7e2f55e6588bd24654e6a4248e9f68abc712a7ce25a",
            "old_dependency_sha256":
                "cb143d07fffdb7e0a73cf0d3916e1e7cf09607556ae24c613d7ed032b5076aff",
            "stage_status_sha256": "c" * 64,
            "manifest_sha256": "d" * 64,
            "gate_sha256": "e" * 64,
            "stage_receipt_sha256": "f" * 64,
            "stage_receipt_dir": "/mnt/HC_Volume_105319120/aoe2war/deploy-receipts/stage-test",
            "live_source_sha": "6" * 40,
            "live_build_id": "s5lkg31SfI18yR-eQN8iT",
            "machine_id_sha256": "1" * 64,
        }
        self.preview = {
            "status": "PREVIEW_ONLY",
            "authorization": "HOLD_NOT_CONSUMED",
            "approved_target_sha": MAC.TARGET,
            "controller_sha256": self.controller,
            "owner_spki_sha256": self.spki,
            "evidence": self.evidence,
        }

    def sign(self, preview=None, *, expected_owner=None, expected_controller=None):
        return MAC.sign_preview(
            self.preview if preview is None else preview,
            private_key=self.private,
            expected_owner_spki=expected_owner or self.spki,
            expected_controller=expected_controller or self.controller,
            now=datetime(2026, 10, 28, 1, 0, tzinfo=timezone.utc),
            nonce="Q" * 40,
        )

    def test_actual_preview_signature_valid_with_pinned_owner(self):
        packet = self.sign()
        self.assertEqual(packet["payload"]["intended_release_sha"], MAC.TARGET)
        self.assertEqual(packet["payload"]["action"], "PARK_ONLY")
        self.assertEqual(packet["payload"]["old_source_sha"], self.evidence["old_source_sha"])
        with tempfile.TemporaryDirectory() as tmp:
            msg, sig = Path(tmp) / "msg", Path(tmp) / "sig"
            msg.write_bytes(MAC.DOMAIN + MAC.canonical(packet["payload"]))
            sig.write_bytes(base64.b64decode(packet["signature_base64"]))
            r = subprocess.run(["openssl", "pkeyutl", "-verify", "-pubin",
                                "-inkey", str(self.public), "-rawin",
                                "-in", str(msg), "-sigfile", str(sig)],
                               capture_output=True)
            self.assertEqual(r.returncode, 0)

    def test_wrong_controller_key_target_or_evidence_rejected(self):
        for field, value in (
            ("controller_sha256", "0" * 64),
            ("owner_spki_sha256", "0" * 64),
            ("approved_target_sha", "b" * 40),
        ):
            with self.subTest(field=field):
                value_preview = dict(self.preview, **{field: value})
                with self.assertRaises(ValueError):
                    self.sign(value_preview)
        with self.assertRaises(ValueError):
            self.sign(dict(self.preview, evidence={**self.evidence,
                       "old_artifact_sha256": "f" * 64}))
        with self.assertRaises(ValueError):
            self.sign(expected_owner="0" * 64)
        with self.assertRaises(ValueError):
            self.sign(expected_controller="0" * 64)

    def test_no_automatic_host_write_or_release_calls(self):
        text = (ROOT / "scripts/aoe2_release_retire_permit_mac.py").read_text()
        for token in ("ssh ", "sudo ", "scp ", "os.rename(", "ship_all(",
                      "stage_release(", "activate_release(", "npx prisma"):
            self.assertNotIn(token, text)


class PublicEnrollmentTests(unittest.TestCase):
    def test_installer_has_no_private_signing_key_or_apply_path(self):
        text = (ROOT / "scripts/aoe2_release_retire_install.py").read_text()
        for token in ("os.rename(", "stage_release(",
                      "activate_release(", "ship_all(", "/api/bets"):
            self.assertNotIn(token, text)

    def test_reject_private_pem(self):
        with self.assertRaises(RuntimeError):
            INSTALL.spki_digest(b"-----BEGIN PRIVATE KEY-----\nBAD\n")

    def test_install_once_cannot_overwrite(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "enrollment"
            INSTALL.install_once(path, b"first", 0o600)
            with self.assertRaises(RuntimeError):
                INSTALL.install_once(path, b"changed", 0o600)
            self.assertEqual(path.read_bytes(), b"first")

    def test_duplicate_fields_rejected(self):
        with self.assertRaises(ValueError):
            MAC.unique_pairs([("nonce", "first"), ("nonce", "second")])


if __name__ == "__main__":
    unittest.main()
