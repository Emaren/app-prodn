#!/usr/bin/env python3
"""R18 F: new W1_SAFE source immutably bound across all integrated native lanes."""
from __future__ import annotations
import ast
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]
S=ROOT/"scripts"
NEW="4eff4b1ad1f90aef35738c25f523998a16174bd8"
OLD="a9525f46302edff88ed073743a7dfaed08be9e3e"
FROZEN="b46a51f1592c9f296839924ae55e722618b10d35"

class R18ExactIntegratedSource(unittest.TestCase):
    def test_native_six_lane_sources_bind_only_new_reviewed_safe_website(self):
        for path in ("aoe2_solo_website_engine_v1.py",
                     "aoe2_solo_website_financial_proof.py",
                     "aoe2_solo_website_native_issuer.py",
                     "aoe2_solo_website_producer_intake.py",
                     "aoe2_solo_website_producer_signer.py",
                     "aoe2_solo_website_root_phase.py"):
            with self.subTest(path=path):
                body=(S/path).read_text()
                self.assertIn(NEW,body)
                self.assertNotIn(OLD,body)
                ast.parse(body)

    def test_original_finance_frozen_w1_still_denied(self):
        root=(S/"aoe2_solo_website_root_phase.py").read_text()
        issuer=(S/"aoe2_solo_website_native_issuer.py").read_text()
        self.assertIn(FROZEN,root)
        self.assertIn(FROZEN,issuer)
        self.assertIn("W1_SAFE",root)
        self.assertIn("PRE_STAGE",root)
        self.assertIn("ROOT_PREISSUED_NOT_AUTHORIZED",root)

    def test_c_installer_includes_d_signed_input_intake_and_source_verified_root(self):
        root=(S/"aoe2_solo_root_install_v2.py").read_text()
        self.assertIn('"aoe2_solo_website_producer_intake.py"',root)
        self.assertIn('"solo-v1-producer-intake"',root)
        self.assertIn('"aoe2_solo_website_root_phase.py"',root)
        self.assertIn('"aoe2_solo_website_nonce_ledger.py"',root)
        self.assertIn('"aoe2_solo_website_command_channel.py"',root)
        self.assertIn('"aoe2_solo_website_native_issuer.py"',root)

    def test_d_signer_and_f_preissue_have_distinct_owner_approval_domains(self):
        signer=(S/"aoe2_solo_website_producer_signer.py").read_text()
        root=(S/"aoe2_solo_website_root_phase.py").read_text()
        self.assertIn("AOE2WAR.SOLO_WEBSITE.PRODUCER_INTENT.V1",signer)
        self.assertIn("AOE2WAR.SOLO_OWNER.WEBSITE.ADMISSION.V1",root)
        self.assertIn("AOE2WAR.SOLO_WEBSITE.NATIVE_PRODUCER_RECEIPT.V1",signer)
        self.assertIn("preissue",root)
        self.assertIn("owner_authorized",root)
        self.assertIn("financial_release_authorized",root)

if __name__=="__main__":
    unittest.main()
