"""Negative contract tests for the separate signed website-only engine."""
from __future__ import annotations
import importlib.util, pathlib, sys, tempfile, unittest
from unittest.mock import patch

ROOT=pathlib.Path(__file__).resolve().parents[1]
S=ROOT/"scripts"
if str(S) not in sys.path:sys.path.insert(0,str(S))
import aoe2_solo_website_engine_source as source
import aoe2_solo_website_phase_authority as phase
import aoe2_solo_website_native_audit_adapter as native
import aoe2_solo_website_root_phase as root

class Guards(unittest.TestCase):
    def test_no_candidate_environment(self):
        with patch.dict("os.environ",{},clear=True):
            with self.assertRaises(source.Hold):
                source.exact_candidate_script_dir()
    def test_root_phase_has_no_auto_signing(self):
        with self.assertRaises(root.Hold):
            root.verify_signature({
                "schema":1,"policy":root.POLICY,"payload":{},
                "signature_base64":"this-is-not-an-owner-signature!"})
    def test_no_physical_native_audit_approval(self):
        with patch.object(native,"owner_approved_installed_binary",
                          side_effect=native.Hold("owner-pinned root audit absent")):
            with self.assertRaises(native.Hold):
                native.audit(root.TRAINS["W1"][0],"PRE_STAGE","a"*64)
    def test_stage_capability_requires_original_lease(self):
        with self.assertRaises(phase.Hold):
            phase.require_phase_capability("PRE_STAGE",None,None,
                manifest={"release_sha":root.TRAINS["W1"][0]},
                manifest_sha="b"*64,gate_sha="c"*64,
                active_build_id="expected-build")
    def test_root_lease_cannot_be_faked_by_packet(self):
        from aoe2_solo_website_nonce_ledger import Journal,Hold
        with tempfile.TemporaryDirectory() as t:
            d=pathlib.Path(t)
            state=d/"state";state.mkdir(mode=0o700)
            lock=d/"release.lock";lock.touch(mode=0o600)
            ledger=Journal(state,lock,test_mode=True)
            with self.assertRaises(Hold):
                ledger.inherited_lease_fd()
    def test_bad_phase_must_not_consume(self):
        with self.assertRaises(root.Hold):
            root.consume(["not-valid-base64"])

if __name__=="__main__":
    unittest.main()
