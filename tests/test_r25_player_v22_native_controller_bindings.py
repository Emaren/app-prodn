"""Inert exact V22 post-install host preflight qualification for stage0003."""
import hashlib
from pathlib import Path
import importlib.util
import re
import unittest

ROOT=Path(__file__).resolve().parents[1]
HELPER=ROOT/"scripts/release/r25_public_player_same_slot_preflight_v1.py"
CONTROLLER=ROOT/"scripts/release/r25_public_player_one_use_cutover_v1.py"
def import_guard():
    s=importlib.util.spec_from_file_location("post_v22_player_readonly_guard",HELPER)
    m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
class V22AdmissionPins(unittest.TestCase):
    def test_controller_exact_helper_binding(self):
        h=hashlib.sha256(HELPER.read_bytes()).hexdigest()
        c=CONTROLLER.read_text()
        self.assertIn('"'+h+'"',c)
        self.assertEqual(c.count('"'+h+'"'),1)
    def test_host_pin_is_v22_base_and_exact_lock_exception(self):
        h=import_guard()
        self.assertEqual(h.STEAM_UNIT_SHA,
            "44ad57ded3f26690eccf674297c4bc4aa00c0ae2ed563f631001ba6d2de1232a")
        self.assertEqual(h.STEAM_LOCK_ONLY_DROPIN_SHA,
            "34d66d8b1684ed23c3ddae2fb3cc66ca3b1ab26bc4f6bb1fae378012f03e5920")
        self.assertEqual(h.PIN["steam_lock_dropin_sha"],h.STEAM_LOCK_ONLY_DROPIN_SHA)
        self.assertEqual(h.PIN["steam_unit_sha"],h.STEAM_UNIT_SHA)
    def test_original_v20_inverse_binary_source_stays_pinned(self):
        h=import_guard()
        self.assertEqual(h.STEAM_SCRIPT_SHA,
          "7d432066f370b9eeb7f931f2143a12f2695177e6c174775b4400617e00909c4c")
    def test_approvable_only_from_existing_central_gate_threads(self):
        c=CONTROLLER.read_text()
        self.assertIn("pull/1316)#issuecomment-",c)
        self.assertIn("PERMIT_CENTRAL_APPROVAL_REFERENCE",c)
        self.assertNotIn("pull/1327|pull/1328",c)
    def test_source_does_not_weaken_financial_guard_or_rebuild_stage(self):
        c=CONTROLLER.read_text()
        for text in ("financial_writers_authorized","web_financial_mutations_authorized",
                     "STAGE_NOT_READY_OR_ALREADY_USED","ACTIVATION_STAGE_NONCE_OR_RECEIPT_DRIFT",
                     "candidate_build","strict_nft_lease_under_transition_lock",
                     "rollback_unit","steam_transition_lock"):
            self.assertIn(text,c)
if __name__=="__main__":unittest.main()
