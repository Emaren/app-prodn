"""V15 source-only: expiry=0 is never admitted, only re-read at the nft GC edge.

These tests have no network, root, nft writes, wallet, port or systemd effects.
"""
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

SOURCE=Path(__file__).resolve().parents[1]/"scripts/release/r25_steam_refresh_traffic_v16.py"
spec=importlib.util.spec_from_file_location("steam_v16_exact_gc_zero",str(SOURCE))
v16=importlib.util.module_from_spec(spec)
spec.loader.exec_module(v16)


def set_json(expires=35, val="192.0.2.44", include_v6=True):
    sets=[{"set":{"family":"inet","name":"steam4","table":"aoe2war_web_prod",
                 "flags":["timeout"],"timeout":300,"elem":[{"elem":{"val":val,"expires":expires}}]}}]
    if include_v6:
        sets.append({"set":{"family":"inet","name":"steam6","table":"aoe2war_web_prod",
                            "flags":["timeout"],"timeout":300,"elem":[]}})
    return json.dumps({"nftables":sets})


def observed(payload):
    with patch.object(v16,"exec_out",return_value=payload):
        return v16.read_live_steam_lease_seconds()


class StrictExpiry(unittest.TestCase):
    def test_live_valid_seconds(self):
        self.assertEqual(observed(set_json(40)),[40])
    def test_zero_second_element_refused_without_using_it(self):
        with self.assertRaisesRegex(RuntimeError,"LEASE_EXPIRY_ZERO_AT_GC_BOUNDARY"):
            observed(set_json(0))
    def test_six_wrong_unit_or_unobserved_forms_refused(self):
        for value in (301,-1,"60","0",None,60.5):
            with self.subTest(value=value):
                with self.assertRaisesRegex(RuntimeError,"LEASE_EXPIRY_UNOBSERVABLE_OR_DIFFERENT_UNITS"):
                    observed(set_json(value))
    def test_missing_set_denied(self):
        with self.assertRaisesRegex(RuntimeError,"LEASE_SET_SCOPE_CHANGED"):
            observed(set_json(include_v6=False))
    def test_bad_val_denied(self):
        with self.assertRaisesRegex(RuntimeError,"LEASE_ADDRESS_UNOBSERVABLE"):
            observed(set_json(35,val=None))
    def test_zero_recovered_by_strict_read_only_poll(self):
        n=0; pauses=[]
        def read():
            nonlocal n
            n+=1
            if n==1:raise RuntimeError("HOLD:LEASE_EXPIRY_ZERO_AT_GC_BOUNDARY")
            return [30]
        self.assertEqual(v16.strict_lease_seconds_with_gc_retry(read,pauses.append),[30])
        self.assertEqual(n,2)
        self.assertEqual(pauses,[0.35])
    def test_zero_persistent_fails_closed(self):
        pauses=[]
        def read():raise RuntimeError("HOLD:LEASE_EXPIRY_ZERO_AT_GC_BOUNDARY")
        with self.assertRaisesRegex(RuntimeError,"LEASE_EXPIRY_ZERO_AT_GC_BOUNDARY"):
            v16.strict_lease_seconds_with_gc_retry(read,pauses.append)
        self.assertEqual(pauses,[0.35]*3)
    def test_different_units_fail_without_retry(self):
        pauses=[]
        def read():raise RuntimeError("HOLD:LEASE_EXPIRY_UNOBSERVABLE_OR_DIFFERENT_UNITS")
        with self.assertRaisesRegex(RuntimeError,"LEASE_EXPIRY_UNOBSERVABLE_OR_DIFFERENT_UNITS"):
            v16.strict_lease_seconds_with_gc_retry(read,pauses.append)
        self.assertEqual(pauses,[])
    def test_non_gc_guard_hold_does_not_retry(self):
        for reason in ("HOLD:LEASE_SET_SCOPE_CHANGED","HOLD:LEASE_ADDRESS_UNOBSERVABLE","HOLD:PROTECTED_FINANCE_TOPOLOGY_DRIFT"):
            pauses=[]
            def read():raise RuntimeError(reason)
            with self.subTest(reason=reason), self.assertRaisesRegex(RuntimeError,reason):
                v16.strict_lease_seconds_with_gc_retry(read,pauses.append)
            self.assertFalse(pauses)
    def test_systemd_sandbox_has_no_root_reads(self):
        source=SOURCE.read_text()
        self.assertNotIn('/root/',source)
        self.assertIn("ORIGINAL_UNIT_BACKUP = ROOT/",source)
        self.assertIn("CANDIDATE_STAGE_RECEIPT = ROOT/",source)
        self.assertIn("CANDIDATE_SOURCE_OVERLAY = ROOT/",source)

    def test_evidence_is_0400_and_scope_fails_closed(self):
        source=SOURCE.read_text()
        for variable in ("ORIGINAL_UNIT_BACKUP","CANDIDATE_STAGE_RECEIPT","CANDIDATE_SOURCE_OVERLAY"):
            self.assertIn("verified("+variable+",0o400)",source)
        self.assertIn("STEAM_V16_EFFECTIVE_SERVICE_UNIT_DRIFT",source)
        self.assertIn("ROOT_POLICY_ACL_DRIFT",source)

    def test_exact_release_pins(self):
        self.assertEqual(v16.PROFILES["rollback"]["unit_sha"],v16.FIRST_UNIT_SHA)
        self.assertEqual(v16.PROFILES["candidate"]["unit_sha"],v16.NEW_UNIT_SHA)
        self.assertEqual(v16.PROFILES["candidate"]["source"],"dd00367a9d648e66ebbe9f56e17f323efbdaca6f")
        self.assertNotEqual(v16.STEAM_V16_UNIT_SHA256,v16.V14_SHA256)
        self.assertIn("aoe2war.app.r25.steam-traffic-v16",SOURCE.read_text())
        self.assertIn("native_snapshot()",SOURCE.read_text())

if __name__=="__main__":
    unittest.main()
