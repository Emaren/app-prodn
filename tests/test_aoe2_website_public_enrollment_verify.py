"""Nonproduction public trust enrollment tests; never create or sign a real review."""
from __future__ import annotations

import importlib.util
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

HERE=Path(__file__).resolve().parents[1]/"scripts"/"aoe2_website_public_enrollment_verify.py"
SPEC=importlib.util.spec_from_file_location("public_trust",HERE)
MODULE=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

class PublicReleaseEnrollmentTests(unittest.TestCase):
    def test_no_real_enrollment_never_authorizes(self):
        with tempfile.TemporaryDirectory() as root:
            path=Path(root)
            result=MODULE.verify(
                trust_root=path/"notinstalled",
                ledger=path/"notinstalled-ledger",
                witness=path/"notinstalled-witness",
                operator_uid=os.geteuid(),
            )
        self.assertEqual("HOLD",result["status"])
        self.assertFalse(result["approvals_issued"])
        self.assertFalse(result["reviewers_authenticated_as_real_humans"])
        self.assertFalse(result["funded_authorized"])
        self.assertTrue(result["wolo_p1_open"])
        self.assertFalse(result["trust_material_present"])

    def test_math_key_reuse_refused_even_in_nonprod_provisioned_fixture(self):
        with tempfile.TemporaryDirectory() as root:
            path=Path(root)
            trust=path/"public"
            trust.mkdir()
            paths=[trust/(role+".pem") for role in MODULE.ROLES]
            for p in paths:
                p.write_text("PLACEHOLDER PUBLIC KEY")
            stub=[f"{idx:064x}" for idx in range(6)]
            def fingerprints(path):
                if path.name.startswith("runtime_witness"):
                    return stub[0] # stolen owner key
                return stub[[p.name for p in paths].index(path.name)]
            with mock.patch.object(MODULE,"public_fingerprint",side_effect=fingerprints),\
                 mock.patch.object(MODULE,"inspected",return_value=True):
                report=MODULE.verify(
                    trust_root=trust,ledger=path/"nonce",witness=path/"exec",
                    operator_uid=os.geteuid())
        self.assertEqual("HOLD",report["status"])
        self.assertIn("reused_public_key_identity:runtime_witness",
                      report["problems"])
        self.assertFalse(report["mathematical_key_uniqueness_passed"])

    def test_mathematical_key_presence_is_explicitly_nonauthorizing(self):
        with tempfile.TemporaryDirectory() as root:
            path=Path(root)
            trust=path/"public"
            trust.mkdir()
            fingerprints={role:f"{i:064x}" for i,role in enumerate(MODULE.ROLES)}
            with mock.patch.object(MODULE,"public_fingerprint",
                  side_effect=lambda p:fingerprints[p.stem]),\
                 mock.patch.object(MODULE,"inspected",return_value=True),\
                 mock.patch.object(MODULE.os,"access",return_value=True):
                report=MODULE.verify(trust_root=trust,
                    ledger=path/"nonce",witness=path/"witness",
                    operator_uid=os.geteuid())
        self.assertEqual("PUBLIC_TRUST_MATERIAL_PRESENT_NONAUTHORIZING",report["status"])
        self.assertFalse(report["approvals_issued"])
        self.assertFalse(report["reviewers_authenticated_as_real_humans"])
        self.assertTrue(report["mathematical_key_uniqueness_passed"])

    def test_remote_deploy_diagnostic_does_not_conflate_tony_and_root(self):
        script=(HERE.parent/"aoe2_website_release_readonly_diag.sh").read_text()
        self.assertIn('RELEASE_HOST="${AOE2_RELEASE_HOST:-tony@hel1}"',script)
        self.assertIn('ssh -G "$RELEASE_HOST"',script)
        self.assertIn('"RELEASE_REMOTE_USER"',script)
        self.assertIn('"GLOBAL_LEASE_LOCK_WRITABLE"',script)
        self.assertIn('sudo -n -l /usr/bin/systemctl',script)
        syntax=subprocess.run(["bash","-n",str(HERE.parent/"aoe2_website_release_readonly_diag.sh")],
            stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        self.assertEqual(0,syntax.returncode,syntax.stderr)


if __name__=="__main__":
    unittest.main()
