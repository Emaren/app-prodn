"""R23 C root SSH candidate-trust recovery: no live server needed."""
import base64
from datetime import datetime, timedelta, timezone
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1] / "scripts"
SERVER = ROOT / "aoe2_owner_rootssh_trust_recovery_v6.py"
MAC = ROOT / "aoe2_owner_rootssh_trust_recovery_v6_mac.py"
FAKE_F = "f" * 40

def load(path):
    spec = importlib.util.spec_from_file_location(path.stem, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

class RecoveryV6Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.s = load(SERVER)
        cls.s.F_REVIEWED_C_SOURCE_SHA = FAKE_F  # synthetic test fixture ONLY
        cls.m = load(MAC)

    def make_envelope(self):
        with tempfile.TemporaryDirectory() as td:
            t = Path(td)
            private, pub, msg, sig = [t / s for s in ("private.pem", "public.pem", "message", "sig")]
            subprocess.run(["/usr/bin/openssl", "genpkey", "-algorithm", "RSA",
                            "-pkeyopt", "rsa_keygen_bits:3072", "-out", str(private)],
                           check=True, stderr=subprocess.DEVNULL)
            subprocess.run(["/usr/bin/openssl", "pkey", "-in", str(private),
                            "-pubout", "-out", str(pub)], check=True)
            der = subprocess.run(["/usr/bin/openssl", "pkey", "-pubin", "-in", str(pub),
                                  "-outform", "DER"], check=True, capture_output=True).stdout
            now = datetime.now(timezone.utc)
            iso = lambda x: x.isoformat(timespec="seconds").replace("+00:00", "Z")
            body = {
                "operation": "candidate_enroll", "version": 6, "nonce": "a" * 32,
                "issued_at": iso(now), "expires_at": iso(now + timedelta(minutes=5)),
                "original_rsa_spki_sha256": self.s.ORIGINAL_RSA_FP,
                "new_rsa_spki_sha256": self.s.digest(der),
                "original_controller": self.s.ORIGINAL_CONTROLLER,
                "original_website": self.s.ORIGINAL_WEBSITE,
                "f_reviewed_c_source_sha": FAKE_F,
                "scope": "PUBLIC_CANDIDATE_ONLY_NO_CONTROLLER_SWITCH"
            }
            msg.write_bytes(self.s.DOMAIN + self.s.canonical(body))
            subprocess.run(["/usr/bin/openssl", "dgst", "-sha256", "-sign",
                            str(private), "-out", str(sig), str(msg)], check=True)
            return {"schema": self.s.SCHEMA, "intent": body,
                    "new_public_pem_base64": base64.b64encode(pub.read_bytes()).decode(),
                    "signature_base64": base64.b64encode(sig.read_bytes()).decode()}

    def test_01_compile_both(self):
        compile(SERVER.read_bytes(), str(SERVER), "exec")
        compile(MAC.read_bytes(), str(MAC), "exec")

    def test_02_source_has_no_original_trust_rewrite(self):
        x = SERVER.read_text()
        self.assertNotIn("V4.unlink()", x)
        self.assertNotIn("V4.write_", x)
        self.assertNotIn("os.chmod(LOCK", x)
        self.assertNotIn("ssh-keygen", x)
        self.assertIn("NO_CONTROLLER_SWITCH", x)
        self.assertIn("OLD_APPROVAL.exists()", x)

    def test_03_source_starts_unapproved(self):
        # The public branch must hold: independent F must seal a NEW source.
        self.assertIn('F_REVIEWED_C_SOURCE_SHA = ""', SERVER.read_text())

    def test_04_wrong_host_fails(self):
        with mock.patch.object(self.s.socket, "gethostname", return_value="not-hel1"):
            with self.assertRaisesRegex(self.s.Hold, "EXACT_HEL1_ROOT_REQUIRED"):
                self.s.original_state()

    def test_05_not_original_root_fails(self):
        with mock.patch.object(self.s.socket, "gethostname", return_value=self.s.HOST):
            with mock.patch.object(self.s.os, "geteuid", return_value=1000):
                with self.assertRaisesRegex(self.s.Hold, "EXACT_HEL1_ROOT_REQUIRED"):
                    self.s.original_state()

    def test_06_envelope_positive_RSA3072_synthetic(self):
        a = self.make_envelope()
        b, pem = self.s.verify_new_key_proof(a)
        self.assertEqual(b["version"], 6)
        self.assertTrue(pem.startswith(b"-----BEGIN PUBLIC KEY-----"))

    def test_07_unsigned_tamper_holds(self):
        a = self.make_envelope()
        a["intent"]["nonce"] = "b" * 32
        with self.assertRaisesRegex(self.s.Hold, "NEW_PRIVATE_KEY_POSSESSION"):
            self.s.verify_new_key_proof(a)

    def test_08_wrong_old_identity_holds(self):
        a = self.make_envelope()
        a["intent"]["original_rsa_spki_sha256"] = "0" * 64
        with self.assertRaisesRegex(self.s.Hold, "ORIGINAL_SOURCE_DRIFT"):
            self.s.verify_new_key_proof(a)

    def test_09_wrong_controller_holds(self):
        a = self.make_envelope()
        a["intent"]["original_controller"] = "0" * 40
        with self.assertRaisesRegex(self.s.Hold, "ORIGINAL_SOURCE_DRIFT"):
            self.s.verify_new_key_proof(a)

    def test_10_expired_holds(self):
        a = self.make_envelope()
        future = datetime.now(timezone.utc) + timedelta(hours=2)
        with self.assertRaisesRegex(self.s.Hold, "OWNER_INTENT_EXPIRED"):
            self.s.verify_new_key_proof(a, now=future)

    def test_11_wrong_F_review_holds(self):
        a = self.make_envelope()
        a["intent"]["f_reviewed_c_source_sha"] = "e" * 40
        with self.assertRaisesRegex(self.s.Hold, "INDEPENDENT_F_SOURCE_APPROVAL"):
            self.s.verify_new_key_proof(a)

    def test_12_fake_scope_holds(self):
        a = self.make_envelope()
        a["intent"]["scope"] = "INSTALL_AND_DEPLOY"
        with self.assertRaisesRegex(self.s.Hold, "NO_RELEASE_AUTHORITY"):
            self.s.verify_new_key_proof(a)

    def test_13_duplicate_json_fails(self):
        with self.assertRaisesRegex(self.s.Hold, "DUPLICATE_JSON_KEY"):
            self.s.parse(b'{"x":1,"x":2}')

    def test_14_wrong_RSA_pub_holds(self):
        a = self.make_envelope()
        a["new_public_pem_base64"] = base64.b64encode(b"not a key").decode()
        with self.assertRaisesRegex(self.s.Hold, "NEW_PUBLIC_KEY_PEM"):
            self.s.verify_new_key_proof(a)

    def test_15_local_mac_guard(self):
        with mock.patch.object(self.m.sys, "platform", "linux"):
            with mock.patch.object(self.m.sys, "argv", [str(MAC)]):
                with self.assertRaises(SystemExit):
                    # argparse exits because args intentionally missing.
                    self.m.main()

    def test_16_audit_immutable_and_rollback_present(self):
        x = SERVER.read_text()
        self.assertIn('"/usr/bin/chattr", "+i"', x)
        self.assertIn('seal_audit(txn / "commit.json")', x.replace(
            'for name in ("intent.json", "original-owner-v4-public.pem",\n                     "new-owner-v6-public.pem", "commit.json"):\n            seal_audit(txn / name)',
            'seal_audit(txn / "commit.json")'))
        self.assertIn('seal_audit(txn / "rollback.json")', x)
        self.assertIn("RELEASE_LOCK_BUSY", x)

    def test_17_missing_F_seal_blocks(self):
        a = self.make_envelope()
        with mock.patch.object(self.s, "F_REVIEWED_C_SOURCE_SHA", ""):
            with self.assertRaisesRegex(self.s.Hold, "INDEPENDENT_F_SOURCE_APPROVAL"):
                self.s.verify_new_key_proof(a)

if __name__ == "__main__":
    unittest.main()
