"""Adversarial tests for the nonfunded, exact-source 3032 rollback drill."""
from __future__ import annotations
import contextlib
import hashlib
import importlib.util
import io
import json
import pathlib
import subprocess
import tempfile
import unittest
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE = ROOT / "scripts/release/r25_c03_restricted_rollback_drill_v1.py"
SPEC = importlib.util.spec_from_file_location("r25_c03_restricted_rollback_drill_v1", SOURCE)
assert SPEC and SPEC.loader
M = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)

class Suite(unittest.TestCase):
    def test_only_exact_candidate_to_restricted_rollback_unit_allowed(self):
        stage = M.SOURCE["candidate"]["stage"].encode()
        old = M.SOURCE["rollback"]["stage"].encode()
        raw = b"[Service]\n" + b"\n".join([b"ExecStart="+stage]*4)
        rollback = raw.replace(stage,old)
        records = {
            "candidate": {**M.SOURCE["candidate"], "unit_sha":M.sha(raw)},
            "rollback": {**M.SOURCE["rollback"], "unit_sha":M.sha(rollback)},
        }
        with mock.patch.object(M,"SOURCE",records):
            self.assertEqual(M.derive_rollback_unit(raw),rollback)
            for bad in (
                raw+b"\nEnvironment=UNREVIEWED", raw.replace(stage,b"/srv/unknown",1),
                raw.replace(stage,old,1), raw+stage,
            ):
                with self.assertRaises(M.ReleaseHold):
                    M.derive_rollback_unit(bad)
            self.assertNotEqual(M.sha(rollback),records["candidate"]["unit_sha"])

    def test_live_drill_requires_explicit_local_restart_intent(self):
        with mock.patch.object(M.sys,"argv",["x","--phase","execute"]):
            with mock.patch.object(M,"drill") as fn:
                with self.assertRaises(M.ReleaseHold):
                    M.main()
                fn.assert_not_called()

    def test_root_installed_reviewed_source_required_for_execute(self):
        with mock.patch.object(M.sys,"argv",[
            "x","--phase","execute","--admit-brief-public-restart"
        ]), mock.patch.object(M,"drill") as fn:
            with self.assertRaisesRegex(M.ReleaseHold,"REVIEWED_ROOT_CONTROLLER_NOT_INSTALLED"):
                M.main()
            fn.assert_not_called()

    def test_c03_active_observer_can_be_rechecked_only_with_new_full_proof(self):
        hold={"status":"HOLD_STEAM_V9","reason":"C03_OBSERVER_TEMPORARILY_ACTIVE",
              "finance_authorized":False}
        good={"status":"PASS_STEAM_V9_PROTECTED_READONLY",
              "protected_snapshot_sha256":M.FIN_SHA,"finance_authorized":False}
        responses=[
            subprocess.CompletedProcess(["guard"],3,stdout=json.dumps(hold)),
            subprocess.CompletedProcess(["guard"],3,stdout=json.dumps(hold)),
            subprocess.CompletedProcess(["guard"],0,stdout=json.dumps(good)),
        ]
        with mock.patch.object(M.subprocess,"run",side_effect=responses) as run:
            delays=[]
            M.source_steam_inspect(delays.append)
            self.assertEqual(run.call_count,3)
            self.assertEqual(delays,[0.55,0.55])

    def test_c03_changed_source_or_protected_finance_fails_with_no_retry(self):
        for bad in [
            {"status":"HOLD_STEAM_V9","reason":"C03_ORIGINAL_UNIT_SOURCE_DRIFT"},
            {"status":"HOLD_STEAM_V9","reason":"PROTECTED_FINANCE_SNAPSHOT_CHANGED"},
            {"status":"HOLD_STEAM_V9","reason":"C03_TIMER_IDENTITY_OR_ACTIVATION_DRIFT"},
        ]:
            with self.subTest(bad=bad["reason"]):
                response=subprocess.CompletedProcess(["guard"],3,stdout=json.dumps(bad))
                with mock.patch.object(M.subprocess,"run",return_value=response) as call:
                    delays=[]
                    with self.assertRaisesRegex(M.ReleaseHold,
                                              "STEAM_SOURCE_BOUND_FINANCE_INSPECTION_HOLD"):
                        M.source_steam_inspect(delays.append)
                    self.assertEqual(call.call_count,1)
                    self.assertEqual(delays,[])

    def test_c03_fake_success_receipt_cannot_pass(self):
        bad={"status":"PASS_STEAM_V9_PROTECTED_READONLY",
             "protected_snapshot_sha256":"0"*64,"finance_authorized":False}
        response=subprocess.CompletedProcess(["guard"],0,stdout=json.dumps(bad))
        with mock.patch.object(M.subprocess,"run",return_value=response):
            with self.assertRaises(M.ReleaseHold):
                M.source_steam_inspect(lambda _:None)

    def test_plan_has_zero_mutations(self):
        with mock.patch.object(M,"preflight",return_value=(b"candidate",b"rollback")), \
             mock.patch.object(M,"pg_capture_active") as capture, \
             mock.patch.object(M,"switch_and_accept") as switch, \
             mock.patch.object(M,"run") as run, \
             mock.patch.object(M,"free_resources") as free:
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                M.drill(execute=False)
            self.assertEqual(json.loads(buf.getvalue())["status"],
                             "PASS_R25_RESTRICTED_ROLLBACK_PREFLIGHT_NO_MUTATION")
            capture.assert_not_called()
            switch.assert_not_called()
            run.assert_not_called()
            free.assert_not_called()

    def fixture(self, *, pg=(False,False,False),switch_fail=()):
        tmp=tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        base=pathlib.Path(tmp.name)
        log=[]
        switch_count=0
        checks=iter(pg)
        def capture():
            try:return next(checks)
            except StopIteration:return False
        def run(argv,*a,**kw):
            log.append(("exec",tuple(argv)))
            if argv[-2:] == ["is-active",M.STEAM_TIMER]:
                return "active"
            return ""
        def execute_switch(profile,_raw):
            nonlocal switch_count
            switch_count+=1
            log.append(("profile",profile))
            if switch_count in switch_fail:
                raise M.ReleaseHold("HOLD:SYNTHETIC_STAGE_FAILURE")
            return 3000+switch_count
        def popen(argv,**kwargs):
            log.append(("subprocess",tuple(argv)))
            return subprocess.CompletedProcess(argv,0,stdout="",stderr="")
        patches=[
            mock.patch.object(M,"ROOT",base/"receipts"),
            mock.patch.object(M,"LOCK",base/"drill.lock"),
            mock.patch.object(M,"preflight",return_value=(b"candidate",b"rollback")),
            mock.patch.object(M,"pg_capture_active",side_effect=capture),
            mock.patch.object(M,"free_resources"),
            mock.patch.object(M,"root_private_lock",return_value=True),
            mock.patch.object(M,"root_private_receipt_dir",return_value=True),
            mock.patch.object(M,"wait_steam_inactive"),
            mock.patch.object(M,"run",side_effect=run),
            mock.patch.object(M,"switch_and_accept",side_effect=execute_switch),
            mock.patch.object(M,"source_steam_inspect"),
            mock.patch.object(M.time,"sleep"),
            mock.patch.object(M.subprocess,"run",side_effect=popen),
        ]
        for patcher in patches:
            patcher.start()
            self.addCleanup(patcher.stop)
        return base,log

    def test_execute_rolls_back_to_exact_old_then_restores_candidate(self):
        base,log=self.fixture()
        buf=io.StringIO()
        with contextlib.redirect_stdout(buf):
            M.drill(execute=True)
        files=list((base/"receipts").glob("*.json"))
        self.assertEqual(len(files),1)
        value=json.loads(files[0].read_text())
        self.assertEqual(value["status"],"PASS_RESTRICTED_3032_ROLLBACK_AND_RESTORATION")
        self.assertTrue(value["steam_timer_restarted_and_active"])
        self.assertFalse(value["legacy_3030_used_as_fallback"])
        self.assertEqual(value["financial_sql_writes"],0)
        self.assertEqual([x[1] for x in log if x[0]=="profile"],
                         ["rollback","candidate"])
        self.assertEqual([x[1][1] for x in log if x[0]=="exec" and
                          len(x[1])>1 and x[1][1] in ("start","stop")],
                         ["stop"])
        self.assertTrue(any(x[1][-2:] == ("start",M.STEAM_TIMER)
                      for x in log if x[0]=="subprocess"))
        self.assertFalse(any("aoe2hdbets-web.service" in str(x) for x in log))

    def test_failure_after_rollback_always_attempts_candidate_recovery(self):
        base,log=self.fixture(switch_fail=(2,))
        with self.assertRaisesRegex(M.ReleaseHold,"SYNTHETIC_STAGE_FAILURE"):
            with contextlib.redirect_stdout(io.StringIO()):
                M.drill(execute=True)
        self.assertEqual([x[1] for x in log if x[0]=="profile"],
                         ["rollback","candidate","candidate"])
        receipts=list((base/"receipts").glob("*.json"))
        self.assertEqual(len(receipts),1)
        status=json.loads(receipts[0].read_text())["status"]
        self.assertEqual(status,"HOLD_DRILL_BUT_RESTRICTED_CANDIDATE_RESTORED")
        self.assertTrue(any(x[1][-2:] == ("start",M.STEAM_TIMER)
                       for x in log if x[0]=="subprocess"))

    def test_failure_in_recovery_never_returns_pass_receipt(self):
        base,log=self.fixture(switch_fail=(2,3))
        with self.assertRaises(M.ReleaseHold):
            with contextlib.redirect_stdout(io.StringIO()):
                M.drill(execute=True)
        receipts=list((base/"receipts").glob("*.json"))
        self.assertEqual(len(receipts),1)
        self.assertEqual(json.loads(receipts[0].read_text())["status"],
                         "HOLD_CRITICAL_RESTRICTED_RESTORATION_UNVERIFIED")

    def test_live_pg_dump_blocks_all_web_mutation(self):
        base,log=self.fixture(pg=(True,))
        with self.assertRaisesRegex(M.ReleaseHold,"CAPTURE_IN_PROGRESS"):
            M.drill(execute=True)
        self.assertFalse((base/"receipts").exists())
        self.assertEqual(log,[])

    def test_racing_new_pg_capture_blocks_before_timer_stop(self):
        base,log=self.fixture(pg=(False,True))
        with self.assertRaisesRegex(M.ReleaseHold,"CAPTURE_STARTED_DURING_PREFLIGHT"):
            M.drill(execute=True)
        self.assertFalse((base/"receipts").exists())
        self.assertEqual(log,[])

    def test_pg_capture_during_timer_pause_restores_timer_without_web_restart(self):
        base,log=self.fixture(pg=(False,False,True))
        with self.assertRaisesRegex(M.ReleaseHold,"CAPTURE_STARTED_DURING_TIMER_PAUSE"):
            M.drill(execute=True)
        self.assertFalse(any(x[0]=="profile" for x in log))
        self.assertTrue(any(x[1][-2:] == ("start",M.STEAM_TIMER)
                       for x in log if x[0]=="subprocess"))

    def test_timer_resume_failure_forbids_success(self):
        base,log=self.fixture()
        with mock.patch.object(M.subprocess,"run",
                               return_value=subprocess.CompletedProcess(["x"],1)):
            with self.assertRaisesRegex(M.ReleaseHold,"TIMER_RESTART_UNVERIFIED"):
                M.drill(execute=True)
        receipts=list((base/"receipts").glob("*.json"))
        self.assertEqual(len(receipts),1)
        self.assertEqual(json.loads(receipts[0].read_text())["status"],
                         "HOLD_CRITICAL_STEAM_TIMER_RESTART_UNVERIFIED")

    def test_process_comm_backup_boundary(self):
        with mock.patch.object(M,"run",return_value="next-server\npostgres\npg_dump\n"):
            self.assertTrue(M.pg_capture_active())
        with mock.patch.object(M,"run",return_value="next-server\npostgres\npsql\n"):
            self.assertFalse(M.pg_capture_active())

    def test_precise_source_path_no_legacy_money_or_nginx_writes(self):
        src=SOURCE.read_text()
        self.assertNotIn("daemon-reload --system",src)
        self.assertNotIn('systemctl","restart","aoe2hdbets-web.service',src)
        self.assertNotIn("8092",src)
        self.assertNotIn("8093",src)
        self.assertNotIn("postgresql://",src)
        self.assertNotIn("ALTER TABLE",src)
        self.assertIn("r25_steam_refresh_traffic_v9.py",src)
        self.assertIn("C06_C07_POSTGRES_CAPTURE_IN_PROGRESS",src)

if __name__=="__main__":
    unittest.main()
