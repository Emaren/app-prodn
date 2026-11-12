"""Synthetic Ed25519 Central detached-approval signature adversarial tests.

Disposable fixtures only. NO owner/Intel/M1 real signing key is opened, read,
created in account custody or copied to GitHub.
"""
from __future__ import annotations

import hashlib
import importlib.util
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT/"scripts/release/r25_b_v22_central_signature_REVIEW_ONLY.py"
spec=importlib.util.spec_from_file_location("b_central_signer",SRC)
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class DetachedCentralSignature(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix="b-central-ephemeral-sig-")
        self.addCleanup(self.temp.cleanup)
        d=Path(self.temp.name)
        self.priv=d/"synthetic-not-real-private.pem"
        self.pub=d/"synthetic-public.pem"
        self.message=d/"approval-body.txt"
        self.signature=d/"approval.sig"
        self.openssl=subprocess.run(["/usr/bin/which","openssl"],capture_output=True,text=True)
        self.assertEqual(self.openssl.returncode,0)
        self.openssl=self.openssl.stdout.strip()
        def cmd(*args):
            p=subprocess.run([self.openssl,*args],capture_output=True,text=True,timeout=8)
            self.assertEqual(p.returncode,0,p.stderr)
        cmd("genpkey","-algorithm","ED25519","-out",str(self.priv))
        cmd("pkey","-in",str(self.priv),"-pubout","-out",str(self.pub))
        self.body=b"AOE2WAR_CENTRAL_SOURCE_INSTALL_V22_APPROVED_V1:{\"nonce\":\"TEST_ONLY\"}"
        self.message.write_bytes(self.body)
        cmd("pkeyutl","-sign","-inkey",str(self.priv),"-rawin",
            "-in",str(self.message),"-out",str(self.signature))
        self.pub.chmod(0o400)
        self.message.chmod(0o400)
        self.signature.chmod(0o400)
        self.pin=hashlib.sha256(self.pub.read_bytes()).hexdigest()

    def verify(self,**overrides):
        req={
            "public_key":self.pub,"message":self.message,
            "signature":self.signature,
            "exact_github_comment_body":self.body,
            "expected_public_sha256":self.pin,
            "trusted_uid":os.getuid(),
            "openssl":self.openssl,
        }
        req.update(overrides)
        return m.verify_central_detached_signature(**req)

    def test_direct_module_refuses(self):
        p=subprocess.run([sys.executable,"-B",str(SRC)],capture_output=True,text=True)
        self.assertEqual(p.returncode,3)
        self.assertIn("NOT_PINNED",p.stdout)

    def test_owner_attested_production_fingerprint_is_pinned_but_not_installed(self):
        self.assertEqual(m.CENTRAL_OFFLINE_PUBLIC_KEY_SHA256,
                         "e9c5b0375d8457b69a3e69e12a7d190ed55ad754c89384348cb0feebeb41512f")
        self.assertNotEqual(m.CENTRAL_OFFLINE_PUBLIC_KEY_SHA256,
                            "567d4d198159c9d3021dcad7d074eb43b53d8c40039b769f1bb8d27d0e4a5968")
        self.assertIn("HOLD:INDEPENDENT_CENTRAL_PUBLIC_KEY_NOT_PINNED",SRC.read_text())

    def test_actual_disposable_ed25519_signature_positive(self):
        self.assertEqual(self.verify()["status"],
                         "PASS_CENTRAL_OFFLINE_SIGNED_SOURCE_INSTALL_MESSAGE")

    def test_key_pin_missing_denied(self):
        with self.assertRaisesRegex(m.Hold,"NO_SOURCE_PINNED"):
            self.verify(expected_public_sha256=None)

    def test_wrong_trusted_public_fingerprint_denied(self):
        with self.assertRaisesRegex(m.Hold,"UNTRUSTED_SIGNER_PUBLIC"):
            self.verify(expected_public_sha256="0"*64)

    def test_comment_body_byte_change_denied(self):
        with self.assertRaisesRegex(m.Hold,"GITHUB_COMMENT"):
            self.verify(exact_github_comment_body=self.body+b" changed")

    def test_signature_mutation_denied(self):
        self.signature.chmod(0o600)
        raw=bytearray(self.signature.read_bytes())
        raw[-1]^=1
        self.signature.write_bytes(raw)
        self.signature.chmod(0o400)
        with self.assertRaisesRegex(m.Hold,"INVALID_DETACHED"):
            self.verify()

    def test_wrong_public_key_source_symlink_denied(self):
        alias=Path(self.temp.name)/"alias.pub"
        alias.symlink_to(self.pub)
        with self.assertRaisesRegex(m.Hold,"UNTRUSTED_FILE"):
            self.verify(public_key=alias)

    def test_hardlinked_signature_denied(self):
        alias=Path(self.temp.name)/"second-sig"
        os.link(self.signature,alias)
        with self.assertRaisesRegex(m.Hold,"UNTRUSTED_FILE"):
            self.verify()

if __name__=="__main__":unittest.main()
