"""Native 3032-only repair guards. Never grants production custody authority."""
import importlib.util
import pathlib
import tempfile
from types import SimpleNamespace
import unittest
from unittest import mock

ROOT=pathlib.Path(__file__).resolve().parents[1]
PATH=ROOT/"scripts/r25_c_scoped_upgrade_v1.py"
spec=importlib.util.spec_from_file_location("scoped_upgrade",PATH)
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class Upgrade(unittest.TestCase):
    def test_pinned_stage_and_financial_scope(self):
        self.assertEqual(m.SOURCE,"175e896c59bf48eda44c15d664d940f5ac40b436")
        self.assertEqual(m.OLD_SOURCE,"886dac221e73167621d6bbfa89cd30edf6b632a3")
        self.assertEqual(m.STAGE.name,"aoe2war-web-prod-"+m.SOURCE[:12])
        self.assertEqual(m.UNIT.name,"aoe2hdbets-web-prod.service")
        self.assertEqual(len(m.TABLES),6)
        self.assertEqual(m.COLUMNS["trophies"],("id","display_name"))
        self.assertFalse(any("wolo" in t or "wager" in t or "claim" in t or "users" in t for t in m.TABLES+tuple(m.COLUMNS.keys())))

    def test_exact_grants_and_revokes_never_mutate_finance(self):
        for enabled in (True,False):
            sql=m.acl_delta(enabled)
            self.assertIn("BEGIN;",sql)
            self.assertIn("COMMIT;",sql)
            self.assertIn("SET LOCAL lock_timeout=",sql)
            self.assertEqual(sql.count(" ON "),4)
            self.assertEqual(sql.count("aoe2war_web_prod;"),4)
            for table in m.TABLES: self.assertIn("public."+table,sql)
            for table,fields in m.COLUMNS.items():
                self.assertIn("(" + ",".join(fields) + ") ON public."+table,sql)
            for forbidden in ("pending_wolo_claims","bet_wagers","users","CREATE ROLE",
                              "ALTER ROLE","DROP ROLE","UPDATE ","INSERT ","DELETE "):
                self.assertNotIn(forbidden,sql)
        self.assertIn("GRANT SELECT",m.acl_delta(True))
        self.assertIn("REVOKE SELECT",m.acl_delta(False))

    def test_visible_parser_excludes_injected_script_content(self):
        source='<html><script>Monday Night Mayhem</script><style>fake</style>' + (
            '<main>Monday Night Mayhem</main><noscript>other</noscript></html>')
        self.assertEqual(m.visible(source)," Monday Night Mayhem ".strip())

    def test_nonce_cannot_be_replayed_or_guessed(self):
        for invalid in ("","ABC","ab"*15,"ab"*17,"_"*32):
            self.assertIsNone(m.re.fullmatch(r"[0-9a-f]{32}",invalid))
        self.assertIsNotNone(m.re.fullmatch(r"[0-9a-f]{32}","a"*32))

    def test_public_content_rejects_july_fallback_and_empty_traffic(self):
        with mock.patch.object(m,"native_sql",return_value="BEGIN\nMonday Night Mayhem\nROLLBACK"):
            with mock.patch.object(m,"page",side_effect=[
                "Monday Night Mayhem","WOLOMANIA I"
            ]):
                with self.assertRaisesRegex(m.Hold,"CANDIDATE_PUBLISHED_EVENT_MISSING"):
                    m.candidate_content()
            with mock.patch.object(m,"page",side_effect=[
                "Monday Night Mayhem","Monday Night Mayhem","LAST PUBLISHED UTC DAY: 2026-10-19",
                "LAST PUBLISHED UTC DAY: 2026-10-19 Loading provisional observed activity"
            ]):
                with self.assertRaisesRegex(m.Hold,"CANDIDATE_CERTIFIED_AND_OBSERVED_TRAFFIC_MISSING"):
                    m.candidate_content()

    def test_consumed_failed_upgrade_is_never_replayed(self):
        with mock.patch.object(m, "prepare") as prepare:
            with self.assertRaisesRegex(m.Hold, "NONCE_ALREADY_USED"):
                m.upgrade(SimpleNamespace(nonce=m.FAILED_NONCE))
            prepare.assert_not_called()

    def test_altered_failed_receipt_is_rejected_before_any_mutation(self):
        with mock.patch.object(m, "safe_bytes", return_value=b"changed"):
            with self.assertRaisesRegex(m.Hold, "CONSUMED_UPGRADE_JOURNAL_DRIFT"):
                m.prior_failure({})

    def test_stopped_candidate_rejects_an_unowned_listener(self):
        with mock.patch.object(m, "unit_properties", side_effect=[
            {"ActiveState": "inactive", "MainPID": "0"},
            {"ActiveState": "inactive"}, {"ActiveState": "failed"},
        ]), mock.patch.object(m, "invoke", return_value=b"LISTEN 127.0.0.1:3032"):
            with self.assertRaisesRegex(m.Hold, "ISOLATED_3032_LISTENER_STILL_PRESENT"):
                m.stopped_candidate(m.UNIT.name)

    def test_steam_refresh_requires_qualified_successes_beyond_original_ttl(self):
        clock = SimpleNamespace(now=0)
        def sleep(seconds):
            clock.now += seconds
        with mock.patch.object(m.time, "monotonic", side_effect=lambda: clock.now), \
             mock.patch.object(m.time, "sleep", side_effect=sleep), \
             mock.patch.object(m, "refresh_invocation", return_value={"InvocationID": "old"}), \
             mock.patch.object(m, "invoke") as command, \
             mock.patch.object(m, "unit_properties", return_value={"ActiveState": "active"}), \
             mock.patch.object(m, "check_refresh_success", side_effect=lambda _: (
                 (str(clock.now), clock.now != 60) if clock.now % 60 == 0 else None
             )), mock.patch.object(m, "steam_elements", return_value=[{"elem": "present"}]):
            result = m.soak_refresh()
        self.assertGreater(result["elapsed_seconds"], 300)
        self.assertIn("60", result["monitor_holds"])
        self.assertFalse(result["persistent_start_authorized"])
        command.assert_called_once_with("/usr/bin/systemctl", "start", m.TIMER, timeout=45)

    def test_timer_set_expiry_is_a_hold(self):
        with mock.patch.object(m, "refresh_invocation", return_value={"InvocationID": "old"}), \
             mock.patch.object(m, "invoke"), \
             mock.patch.object(m, "unit_properties", return_value={"ActiveState": "active"}), \
             mock.patch.object(m, "check_refresh_success", return_value=None), \
             mock.patch.object(m, "steam_elements", return_value=[]):
            with self.assertRaisesRegex(m.Hold, "STEAM_DESTINATIONS_EXPIRED_DURING_SOAK"):
                m.soak_refresh()

    def test_failed_bootstrap_consumes_nonce_and_restores_stopped_baseline(self):
        with tempfile.TemporaryDirectory() as tmp:
            journals = pathlib.Path(tmp)
            args = SimpleNamespace(nonce="ab" * 16, protected_sha256="p", ci_run=5)
            before = {key: m.digest(b"original") for key in m.FILES}
            plan = {"before_policy_bytes": before, "source_bytes_sha256": before,
                    "public_nginx_sha256": m.digest(b"original")}
            args.plan_hash = m.digest(m.canonical({**plan, "ci_artifact": {"run_id": 5}}))
            old = mock.Mock()
            new = mock.Mock()
            new.production_proxy_bytes.return_value = b"proxy"
            new.production_unit_bytes.return_value = b"unit"
            new.production_runtime_environment.return_value = ({}, "db", "fixture")
            new.production_database_witness.return_value = {"read_acl_sha256": "new"}
            plan["before_read_acl_sha256"] = "old"
            args.plan_hash = m.digest(m.canonical({**plan, "ci_artifact": {"run_id": 5}}))
            journal = journals / ("upgrade-" + args.nonce)
            def fail_bootstrap():
                self.assertTrue((journal / "entered.json").is_file())
                raise m.Hold("failed fixture bootstrap")
            new.production_admission_steam_refresh.side_effect = fail_bootstrap
            with mock.patch.multiple(m, JOURNALS=journals,
                prepare=mock.Mock(return_value=(old, new, {}, plan)), bind_plan=mock.Mock(return_value=plan),
                qualify=mock.Mock(return_value={"comment_id": 42}), assert_protected=mock.Mock(),
                stopped_candidate=mock.Mock(), steam_elements=mock.Mock(return_value=[]),
                safe_bytes=mock.Mock(return_value=b"original"), atomic=mock.Mock(), invoke=mock.Mock(),
                native_sql=mock.Mock(), restore_stopped=mock.Mock()):
                with self.assertRaisesRegex(m.Hold, "failed fixture bootstrap"):
                    m.upgrade(args)
                self.assertNotIn(mock.call("/usr/bin/systemctl", "start", new.PROD_UNIT, timeout=90),
                                 m.invoke.call_args_list)
                m.restore_stopped.assert_called_once()
                self.assertTrue(m.restore_stopped.call_args.args[-1])
                self.assertIn("PASS_EXACT_STOPPED_3032_PREIMAGE_RESTORED",
                              (journal / "rollback.json").read_text())
                with self.assertRaisesRegex(m.Hold, "NONCE_ALREADY_USED"):
                    m.upgrade(args)

if __name__=="__main__":
    unittest.main()
