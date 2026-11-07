"""A05: exact consumed Steam failure, not a generic or replayable restart."""
import hashlib
import importlib.util
from pathlib import Path
from types import SimpleNamespace
from unittest import TestCase,main
from unittest.mock import Mock

ROOT=Path(__file__).resolve().parents[1]
def load(rel,name):
    spec=importlib.util.spec_from_file_location(name,ROOT/rel)
    m=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m
c=load("scripts/r25_c_start_root.py","native_c")
r=load("scripts/r25_c_stopped_steam_recovery_cffee3.py","steam_stopped")

class Recovery(TestCase):
    def test_exact_source_and_consumed_failure(self):
        self.assertEqual(r.OLD,"88621f9798ea2a0982751abdac1aee93bc820d67")
        self.assertEqual(r.NEW,"cffee3b8fd208f0081470594b4c7d0fac1a71816")
        self.assertEqual(r.CONTROLLER_SHA,hashlib.sha256((ROOT/"scripts/r25_c_start_root.py").read_bytes()).hexdigest())
        self.assertEqual(r.NEW_CONTROLLER_SHA,r.CONTROLLER_SHA)
        self.assertEqual(r.NEW_CONTROLLER_SIZE,(ROOT/"scripts/r25_c_start_root.py").stat().st_size)
        self.assertEqual(r.FAILED_ENTERED_SHA,"ca17858647124fdd1595d40c1f6467734ef28330e0f3ab4b830888e159bfac36")
        self.assertEqual(r.FAILED_STOPPED_SHA,"0991b669eb7c8c0c19d375dc43c13b66a0582b1d7893bf84c34d8605c1532cb0")
        self.assertEqual(r.FAILED_HOLD_SHA,"a5c17de1fea1acd53cc9857b137996b909a3b943e0afde82b337ace53f56c995")
        self.assertEqual(r.OLD_ADMISSION_SHA,"29a21659c8e6576c56f938972d6c11e80fd87e7239dd89a228d92dbdb3a9b5b6")
        self.assertEqual(r.SCOPE,"RECOVER_STOPPED_NONFINANCIAL_3032_ONLY")
    def test_pinned_artifact_and_canonical_dns_unit(self):
        self.assertEqual(r.ARTIFACT_SHA,"b8fdf221f679372c95c5c8c2df44a1355fa1a26e128aad8bd848975fd96f37b6")
        self.assertEqual(r.STAGE_RECEIPT_SHA,"612822d5d37f905d0b919869ef1e8bc9619da06b3b29a8cc0b4577c0620ddd1d")
        self.assertEqual(r.BUILD_VERSION,"20261105181134-0ba51cfcd0")
        self.assertEqual(r.BUILD_ID,"io9We0f4HD2LVLndzYYjn")
        old=c.production_unit_bytes(Path(r.OLD_STAGE))
        new=r.render_unit(old)
        self.assertEqual(new,c.production_unit_bytes(Path(r.NEW_STAGE)))
        bind=b"BindReadOnlyPaths=/run/systemd/resolve/stub-resolv.conf:/run/systemd/resolve/stub-resolv.conf\n"
        self.assertEqual(old.count(bind),1)
        self.assertEqual(new.count(bind),1)
        self.assertNotIn(b"ReadWritePaths=/run",new)
    def test_exact_13_routes_and_restricted_authority(self):
        self.assertEqual(len(r.ROUTES),13)
        for path in ("/players","/war-chest","/game-stats","/ai","/kingdom",
                     "/kingdom-bettors","/oracle","/war-engine"):
            self.assertIn(path,r.ROUTES)
        source=(ROOT/"scripts/r25_c_stopped_steam_recovery_cffee3.py").read_text()
        for flag in ("FAILED_STEAM_RECEIPTS_CHANGED","STOPPED_STEAM_FAILURE_CONTEXT_CHANGED",
                     "OLD_ADMISSION_SHA","EXACT_STOPPED_RECOVERY_REQUIRED",
                     "ISOLATED_3032_LISTENER_STILL_PRESENT",
                     "PUBLIC_3030_PID_CHANGED","public_nginx_changes",
                     "public_cutover_authorized","financial_authorized",
                     "rollback_unit = unit"):
            self.assertIn(flag,source)
        self.assertNotIn("nft flush",source)
        self.assertNotIn("systemctl restart nginx",source)
    def test_steam_probe_one_attempt_if_valid(self):
        expected={"steam_tls_verification_reachable":True,
                  "unauthenticated_probe_rejected":True,"completed_user_sign_in":False}
        mock=SimpleNamespace(
            Hold=type("Hold",(RuntimeError,),{}),
            production_admission_steam_refresh=Mock(return_value=["95.100.176.225"]),
            production_steam_probe=Mock(return_value=expected))
        profile={}
        proof,count=r.bounded_steam_admission(mock,{},"/sealed",profile)
        self.assertEqual((proof,count),(expected,1))
        self.assertEqual(profile["steam_addresses"],["95.100.176.225"])
        self.assertEqual(mock.production_steam_probe.call_count,1)
        self.assertEqual(mock.production_admission_steam_refresh.call_count,1)
    def test_transient_exit3_only_one_retry_under_fresh_approved_sets(self):
        class NativeHold(RuntimeError):pass
        expected={"steam_tls_verification_reachable":True,
                  "unauthenticated_probe_rejected":True,"completed_user_sign_in":False}
        mock=SimpleNamespace(
            Hold=NativeHold,
            production_admission_steam_refresh=Mock(side_effect=[["95.100.176.225"],["2.23.88.217"]]),
            production_steam_probe=Mock(side_effect=[NativeHold("PRODUCTION_REAL_NODE_STEAM_TLS_PROBE_FAILED:EXIT_3"),expected]))
        profile={}
        proof,count=r.bounded_steam_admission(mock,{},"/sealed",profile)
        self.assertEqual((proof,count),(expected,2))
        self.assertEqual(mock.production_admission_steam_refresh.call_count,2)
        self.assertEqual(profile["steam_addresses"],["2.23.88.217"])
    def test_persistent_failure_and_unexpected_reason_fail_closed(self):
        class NativeHold(RuntimeError):pass
        mock=SimpleNamespace(
            Hold=NativeHold,
            production_admission_steam_refresh=Mock(return_value=["95.100.176.225"]),
            production_steam_probe=Mock(side_effect=NativeHold("PRODUCTION_REAL_NODE_STEAM_TLS_PROBE_FAILED:EXIT_3")))
        with self.assertRaisesRegex(r.Hold,"FAILED_AFTER_TWO"):
            r.bounded_steam_admission(mock,{},"/sealed",{})
        self.assertEqual(mock.production_steam_probe.call_count,2)
        mock.production_steam_probe=Mock(side_effect=NativeHold("PRODUCTION_NETWORK_BOUNDARY_FAILED"))
        mock.production_admission_steam_refresh.reset_mock()
        with self.assertRaisesRegex(NativeHold,"PRODUCTION_NETWORK_BOUNDARY_FAILED"):
            r.bounded_steam_admission(mock,{},"/sealed",{})
        self.assertEqual(mock.production_admission_steam_refresh.call_count,1)
        self.assertEqual(mock.production_steam_probe.call_count,1)

if __name__=="__main__":main()
