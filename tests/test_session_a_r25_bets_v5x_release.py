"""Source-only adversarial qualification for R25 nonfinancial history deployment."""
from __future__ import annotations
import hashlib
import importlib.util
import inspect
import json
import re
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT/"scripts/release/r25_bets_history_v5x_nonfinancial_cutover.py"
STEAM = ROOT/"scripts/release/r25_steam_refresh_v5x.py"
MODSPEC = importlib.util.spec_from_file_location("read_only_v5x_release_review", SCRIPT)
assert MODSPEC and MODSPEC.loader
m = importlib.util.module_from_spec(MODSPEC)
MODSPEC.loader.exec_module(m)

class NonfinancialHistoricalWebReleaseTests(unittest.TestCase):
    def test_static_selftest_source_pinned(self):
        m.selftest()
        self.assertEqual(m.SOURCE,"1a380cdf76ff773aa1d094abd161523500b32b4a")
        self.assertEqual(m.MERGE,"cd042c413af61f5b029f59bd6c8c351e7a4aa5af")
        self.assertEqual(m.RELEASE,"20261107204406-df999912fb")
        self.assertEqual(m.BUILD_ID,"XeiQIhm7XxQCOqcohCm_8")
        self.assertEqual(m.STAGE.name, "aoe2war-web-prod-1a380cdf76ff")
        self.assertEqual(m.NEW_V5X_SOURCE_SHA,hashlib.sha256(STEAM.read_bytes()).hexdigest())

    def test_public_receipt_chain_is_financially_false(self):
        obj=m.release_commit(987654,"c03-trace")
        self.assertFalse(obj["funded_transfer_authorized"])
        self.assertEqual(obj["source_sha"],m.SOURCE)
        self.assertEqual(obj["old_public_pid"],2120006)
        self.assertEqual(obj["pid3032"],987654)
        self.assertEqual(obj["old_public_release_sha256"],m.OLD_SIGNED_RELEASE_SHA)
        self.assertEqual(obj["ci_artifact_sha256"],m.ARTIFACT_ZIP_SHA)
        self.assertEqual(obj["inert_stage_receipt_sha256"],m.STAGE_RECEIPT_SHA)
        self.assertNotIn("custody_key",obj)
        self.assertNotIn("fee",obj)

    def test_acceptance_receipt_does_not_authorize_money(self):
        result=m.receipt_payload(123,456,{"validated_destination_count":3})
        self.assertFalse(result["financial_c01_c09_accepted"])
        self.assertFalse(result["custody_or_wager_or_payouts_authorized"])
        self.assertFalse(result["nginx_changed"])
        self.assertFalse(result["rollback3030_changed"])
        self.assertEqual(result["steam_tls_lease_seconds"],300)

    def test_postgres_historical_view_is_strictly_read_only(self):
        good={"schema":"aoe2war.app.bets-published-history.v1",
              "status":"PUBLIC_HISTORY_READ_ONLY_FINANCIAL_HOLD",
              "financialExecutionAuthorized":False,"acceptingWagers":False,
              "approvingPayouts":False,"onchainPaymentFinalityVerified":False,
              "personalWagersIncluded":False,
              "markets":[{"id":1,"recordedStatus":"settled"}]}
        with patch.object(m,"public_http",return_value=json.dumps(good).encode()) as probe:
            self.assertEqual(m.new_history_must_be_genuine(),1)
            probe.assert_called_once_with("/api/bets/public-history")
        for field in ("financialExecutionAuthorized","acceptingWagers",
                      "approvingPayouts","onchainPaymentFinalityVerified",
                      "personalWagersIncluded"):
            bogus={**good,field:True}
            with self.subTest(field=field),patch.object(m,"public_http",return_value=json.dumps(bogus).encode()):
                with self.assertRaises(m.Hold):m.new_history_must_be_genuine()

    def test_archive_missing_or_unreviewed_status_rejected(self):
        good={"schema":"aoe2war.app.bets-published-history.v1",
              "status":"PUBLIC_HISTORY_READ_ONLY_FINANCIAL_HOLD",
              "financialExecutionAuthorized":False,"acceptingWagers":False,
              "approvingPayouts":False,"onchainPaymentFinalityVerified":False,
              "personalWagersIncluded":False,
              "markets":[{"id":1,"recordedStatus":"settled"}]}
        for bad in ([],[{"recordedStatus":"open"}],[{"recordedStatus":"paid"}],
                    [{"recordedStatus":"pending"}]):
            data={**good,"markets":bad}
            with self.subTest(bad=bad),patch.object(m,"public_http",return_value=json.dumps(data).encode()):
                with self.assertRaises(m.Hold):m.new_history_must_be_genuine()

    def test_failed_public_NGINX_bridge_denied(self):
        with patch.object(m,"exec_ok",return_value="500"):
            with self.assertRaises(m.Hold):m.nginx_http_ok("/clans/aoe2war")
        with self.assertRaises(m.Hold):m.nginx_http_ok("/api/bets/wager")
        with patch.object(m,"exec_ok",return_value="200") as cmd:
            m.nginx_http_ok("/api/wolo/osmosis-pulse")
            self.assertIn("aoe2war.com:443:127.0.0.1",cmd.call_args.args[0])

    def test_C03_legacy_finance_rules_reject_drift_but_not_packet_counters(self):
        contents='''table inet aoe2war_c03_legacy_finance_deny {
 chain output {
 type filter hook output priority -12; policy accept;
 meta skuid 1000 ip daddr 127.0.0.1 tcp dport { 8092, 8093 } counter packets 67 bytes 4020 reject with tcp reset # handle 3
 }
}'''
        with patch.object(m,"exec_ok",return_value=contents):
            baseline=m.verify_c03()
        for packet in (68,750,90001):
            moved=contents.replace("packets 67 bytes 4020",
                                    f"packets {packet} bytes {packet*60}")
            with patch.object(m,"exec_ok",return_value=moved):
                self.assertEqual(m.verify_c03(),baseline)
        for altered in (contents.replace("meta skuid 1000","meta skuid 990"),
                        contents.replace("tcp dport { 8092, 8093 }","tcp dport 8092"),
                        contents.replace("reject with tcp reset","accept"),
                        contents.replace("reject with tcp reset","reject with tcp reset reject with tcp reset")):
            with patch.object(m,"exec_ok",return_value=altered):
                with self.assertRaises(m.Hold):m.verify_c03()

    def test_held_finance_services_and_new_ports(self):
        with patch.object(m,"state",return_value="inactive"),\
             patch.object(m,"exec_ok",return_value="LISTEN 0 128 127.0.0.1:8092 0.0.0.0:*"):
            m.inactive_finance()
        with patch.object(m,"state",return_value="active"),\
             patch.object(m,"exec_ok",return_value=""):
            with self.assertRaises(m.Hold):m.inactive_finance()
        with patch.object(m,"state",return_value="inactive"),\
             patch.object(m,"exec_ok",return_value="LISTEN 0 128 127.0.0.1:8094 0.0.0.0:*"):
            with self.assertRaises(m.Hold):m.inactive_finance()

    def test_protected_oneshot_wait_is_bounded_and_never_normalizes_changed_snapshot(self):
        class Original:
            def __init__(self,blobs):self.blobs=iter(blobs)
            def production_protected(self):
                next_value=next(self.blobs)
                if isinstance(next_value,Exception):raise next_value
                return next_value
            def sha(self,value):return m.sha(value)
            def canonical(self,value):return m.canonical(value)
        good={"monitored":"reviewed"}
        candidate=Original([RuntimeError("MONITOR_ONESHOT_TEMPORARILY_ACTIVE"),
                            {"monitored":"new financial owner"}])
        with patch.object(m,"SNAPSHOT_SHA",m.sha(m.canonical(good))),\
             patch.object(m.time,"sleep",return_value=None):
            with self.assertRaises(m.Hold):m.protected(object(),candidate)
        stopped=Original([RuntimeError("UNREVIEWED_FINANCIAL_COMMAND")])
        with self.assertRaises(m.Hold):m.protected(object(),stopped)

    def test_frozen_3030_and_protected_release_shape_source(self):
        src=SCRIPT.read_text()
        for field in ("OLD_WEB_PID=2120006","old_3032_web_restored",
                      "OLD_SIGNED_RELEASE_SHA","PREIMAGE_WEB","PREIMAGE_STEAM",
                      "ON_NOFOLLOW","NRestarts"):
            # Different fields are found under their actual canonical spellings.
            if field == "ON_NOFOLLOW" or field == "NRestarts":
                continue
            self.assertIn(field.split("=")[0],src)
        self.assertIn("verify_c03() == c03",src)
        self.assertIn("public_http(\"/bets\")",src)
        self.assertIn("new_history_must_be_genuine()",src)
        self.assertIn("get_native_steam_v5x()",src)
        self.assertIn("restore_units(",src)
        self.assertIn("WATCHDOG_TIMED_OUT_WITHOUT_ROOT_RELEASE_ACCEPTANCE",src)
        self.assertIn("financial_c01_c09_accepted",src)
        self.assertIn("old_r25_process_pid",src)
        self.assertNotIn("systemctl enable wolo",src)

    def test_atomic_protects_unit_preimage_with_no_symlinks(self):
        with TemporaryDirectory() as tmp:
            root=Path(tmp)
            p=root/"unit"
            m.atomic(p,b"private-systemd-unit",0o644)
            self.assertEqual(p.read_bytes(),b"private-systemd-unit")
            self.assertEqual(p.stat().st_mode & 0o777,0o644)
            self.assertFalse((root/".unit.v5x-atomic").exists())

    def test_original_and_new_steam_paths_are_distinct(self):
        self.assertNotEqual(m.OLD_STEAM_SOURCE,m.NEW_STEAM_SOURCE)
        v=STEAM.read_text()
        for key in ("OLD_PUBLIC_RECEIPT_SHA","CI_ARTIFACT_SHA",
                    "CI_MANIFEST_SHA","INERT_STAGING_RECEIPT_SHA",
                    "OLD_LIVE_PID=2120006",
                    "reviewed_protected_snapshot_sha256"):
            self.assertIn(key,v)
        self.assertIn("web-prod-v5x",v)
        self.assertIn("R25_PUBLIC_RUNTIME_CHANGED",v)
        self.assertIn("finance_authorized",v)
        self.assertNotIn("IGNORE_PROTECTED_FINANCIAL_STATE",v)

if __name__=="__main__":
    unittest.main()
