"""V2 recovery scope, exact source pins and non-replay. Mock-only."""
import base64
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("start_v2",ROOT/"scripts/r25_c_start_recovery_v2_root.py")
s=importlib.util.module_from_spec(spec)
spec.loader.exec_module(s)

class RecoveryV2Tests(unittest.TestCase):
    def payload(self):
        return {
            "v2_witness_b64":base64.b64encode((ROOT/"scripts/r25_b_namespace_recovery_witness.py").read_bytes()).decode(),
            "v2_dropin_b64":base64.b64encode((ROOT/"deploy/r25-b-3031.namespace-recovery.dropin.conf").read_bytes()).decode(),
        }

    def test_source_pins_are_exact_and_fail_closed(self):
        src=self.payload()
        self.assertEqual(len(s.approved_v2_sources(src)),2)
        for field in src:
            with self.subTest(field=field):
                tampered=dict(src)
                raw=bytearray(base64.b64decode(src[field]))
                raw[3]^=1
                tampered[field]=base64.b64encode(raw).decode()
                with self.assertRaisesRegex(s.Hold,"V2_EXACT_REVIEWED_SOURCE_DRIFT"):
                    s.approved_v2_sources(tampered)
        with self.assertRaisesRegex(s.Hold,"V2_SOURCE_NOT_PRESENT"):
            s.approved_v2_sources({})

    def test_separate_one_use_journal_never_replays_v1(self):
        self.assertNotEqual(s.JOURNAL,s.PREV_JOURNAL)
        self.assertEqual(s.JOURNAL.name,"start-3031-v2")
        self.assertEqual(s.PREV_JOURNAL.name,"start-3031-v1")
        self.assertNotEqual(s.V2_WITNESS_PATH.name,"approved-runtime-prestart.py")
        self.assertEqual(s.NEW_UNIT,"aoe2hdbets-web-r24.service")
        self.assertEqual(s.OLD_PID,2625090)
        self.assertEqual(s.LOCK_ID,(2064,6185747,1000,0o644))

    def test_plan_only_requires_real_consumed_v1_receipts(self):
        prior={
          "started.json":{"status":"START_ENTERED_DO_NOT_RETRY",
                          "public_cutover_authorized":False},
          "hold.json":{"status":"HOLD_NO_REPLAY",
                       "reason_type":"ProcessLookupError",
                       "public_cutover_authorized":False},
        }
        def proof(path,*args):
            return json.dumps(prior[path.name]).encode()
        def native(args,*more,**kwargs):
            if args[:2]==["/usr/bin/systemctl","show"]:
                return b"ActiveState=failed\nMainPID=0\nResult=exit-code\n"
            self.fail("unexpected native call")
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)
            with mock.patch.object(s.sys,"platform","linux"), mock.patch.object(s.os,"geteuid",return_value=0),                 mock.patch.object(s.socket,"gethostname",return_value=s.HOST),                 mock.patch.object(s,"reviewed"),                 mock.patch.object(s,"JOURNAL",p/"v2"),                 mock.patch.object(s,"V2_WITNESS_PATH",p/"new-witness"),                 mock.patch.object(s,"V2_DROPIN_PATH",p/"new-overlay"),                 mock.patch.object(s,"C_AUDIT",p),                 mock.patch.object(s,"root_file",side_effect=proof),                 mock.patch.object(s,"run",side_effect=native),                 mock.patch.object(s,"candidate_port_present",return_value=False),                 mock.patch.object(s,"b_recovery_historical_admission",return_value={"status":"PASS_B_HISTORICAL_V1_RECEIPTS_AND_FAILED_UNIT_PREPARED_FOR_V2"}),                 mock.patch.object(s,"c_build",return_value={"status":"BUILD_STAGED"}),                 mock.patch.object(s,"e_rollback",return_value={"status":"ACCEPTED"}),                 mock.patch.object(s,"protected_snapshot",return_value={"old":2625090}),                 mock.patch.object(s,"directory"),                 mock.patch.object(s.os,"mkdir") as mkdir:
                payload=self.payload()
                payload.update({"source_sha":"a"*40,"operator_sha256":"b"*64,
                                "review_body_sha256":"c"*64,"e_certificate":{}})
                _, plan=s.admit(payload)
                self.assertEqual(plan["schema"],"aoe2war.r25.c.start-plan.v2")
                self.assertEqual(plan["v2_witness_sha256"],s.V2_WITNESS_SHA)
                self.assertEqual(plan["v2_dropin_sha256"],s.V2_DROPIN_SHA)
                self.assertEqual(plan["protected_before"],{"old":2625090})
                mkdir.assert_not_called()
                # Bad old receipt is a hard block, never authorizing recovery.
                prior["hold.json"]["reason_type"]="OtherError"
                with self.assertRaisesRegex(s.Hold,"V1_CONSUMED_START_AND_HOLD_EVIDENCE_REQUIRED"):
                    s.admit(payload)
                mkdir.assert_not_called()

    def test_recovery_historical_B_checks_real_failed_unit_and_not_old_inactive_gate(self):
        # Actual v1 host 3031 is FAILED/0. Old repair.host_admission
        # accepts only INACTIVE, which deadlocked the first v2 candidate.
        from types import SimpleNamespace
        original_sha=s.sha
        old_status={"ActiveState":"active","MainPID":"2625090"}
        new_status={"LoadState":"loaded","ActiveState":"failed","MainPID":"0",
                    "User":s.USER,"WorkingDirectory":str(s.STAGE)}
        repairs=mock.Mock()
        witness=mock.Mock()
        repairs.JOURNAL=Path("/sealed-b-repair")
        repairs.OLD=Path("/sealed-installed-b-witness")
        repairs.GUARD=Path("/sealed-guard")
        repairs.DROPIN=Path("/sealed-original-b-dropin")
        repairs.BASE=Path("/sealed-original-b-base")
        repairs.OLD_SHA=original_sha(b"historical")
        repairs.GUARD_SHA=original_sha(b"guard")
        repairs.DROPIN_SHA=original_sha(b"dropin")
        repairs.BASE_SHA=original_sha(b"base")
        repairs.INSTALL_SHA="a"*64
        repairs.pwd.getpwnam.return_value=SimpleNamespace(pw_uid=s.UID)
        repairs.original_receipt.return_value=("1"*64,"2"*64)
        rec={"status":"WITNESS_ONLY_REPAIR_COMPLETE_NOT_PRESTART_AUTHORITY",
             "report_sha256":s.B_PHYSICAL_REPAIR_REPORT_SHA,
             "installed_witness_sha256":s.B_WITNESS_SHA,
             "original_install_report_sha256":repairs.INSTALL_SHA,
             "original_started_file_sha256":"1"*64,
             "original_receipt_file_sha256":"2"*64,
             "new_service_started":False,"public_cutover_authorized":False,
             "no_installer_rerun":True}
        repairs.json_root.return_value=rec
        repairs.canonical_sha.return_value=s.B_PHYSICAL_REPAIR_REPORT_SHA
        blobs={str(repairs.GUARD):b"guard",str(repairs.DROPIN):b"dropin",
               str(repairs.BASE):b"base",str(repairs.OLD):b"installed",
               str(repairs.JOURNAL/"old-witness.py"):b"historical"}
        repairs.trusted.side_effect=lambda path,**kwargs:blobs[str(path)]
        witness.systemd.side_effect=lambda unit:old_status if unit==s.OLD_UNIT else new_status
        witness.c_archive_source_identity.return_value=s.TARGET
        witness.nft_policy.return_value="e"*64
        witness.db_proof.return_value={"role":"aoe2war_r25_web_ro","server_transaction_ro":True}
        witness.root_db_envfile.return_value="dummy-private-db"
        repairs.C_PATH=Path("/mock-immutable-source-sha")
        repairs.C_BUILD="expected"
        fakepath=mock.Mock()
        repairs.C_PATH=fakepath
        fakepath.is_dir.return_value=True
        pins={"b_repair_b64":"pinned","b_witness_b64":"pinned"}
        def mock_pinned(*args):
            return repairs if args[-1]=="reviewed_b_repair" else witness
        def digest(data):
            return s.B_WITNESS_SHA if data==b"installed" else original_sha(data)
        with mock.patch.object(s,"pinned_module",side_effect=mock_pinned), \
             mock.patch.object(s,"sha",side_effect=digest), \
             mock.patch.object(s,"effective_unit",return_value="f"*64), \
             mock.patch.object(s,"Path",return_value=fakepath), \
             mock.patch.object(s,"need",wraps=s.need):
            fakepath.is_file.return_value=True
            fakepath.is_symlink.return_value=False
            fakepath.read_text.return_value="expected"
            # The source sidecar path is represented by mock Path only.
            outcome=s.b_recovery_historical_admission(pins)
            self.assertEqual(outcome["status"],
                 "PASS_B_HISTORICAL_V1_RECEIPTS_AND_FAILED_UNIT_PREPARED_FOR_V2")
            self.assertFalse(outcome["positive_v2_prestart_executed"])
            repairs.host_admission.assert_not_called()
            repairs.port_free.assert_called_once()
            witness.validate_filesystem_wall.assert_called_once()
            new_status["ActiveState"]="inactive"
            with self.assertRaisesRegex(s.Hold,"B_V1_FAILED_UNIT_STATE_REQUIRED"):
                s.b_recovery_historical_admission(pins)
            new_status["ActiveState"]="failed"
            witness.db_proof.return_value={"role":"postgres","server_transaction_ro":False}
            with self.assertRaisesRegex(s.Hold,"B_SELECT_ONLY_DATABASE_ROLE_UNPROVEN"):
                s.b_recovery_historical_admission(pins)

    def test_no_v2_journal_for_missing_or_incorrect_fresh_owner_consent(self):
        plan={"protected_before":{"old":2625090},"schema":"aoe2war.r25.c.start-plan.v2"}
        digest=s.sha(s.canonical(plan))
        nonce="f"*32
        approved="RECOVER-START-R25-3031-V2 "+nonce+" "+digest
        common={"plan_sha256":digest,"nonce":nonce,"owner_consent":approved}
        for mutation in ({"plan_sha256":"b"*64},
                         {"owner_consent":"v1 authorization is enough"},
                         {"nonce":"bad"}):
            payload={**common,**mutation}
            with self.subTest(mutation=mutation), \
                 mock.patch.object(s,"admit",return_value=("historical-witness",plan)), \
                 mock.patch.object(s.os,"mkdir") as mkdir, \
                 mock.patch.object(s,"run") as run:
                with self.assertRaises(s.Hold):
                    s.start(payload)
                mkdir.assert_not_called()
                run.assert_not_called()

    def test_v1_review_record_cannot_authorize_v2(self):
        legacy={"schema":"aoe2war.r25.c.start-source-review.v1",
                "decision":"ACCEPT","scope":"START_3031_ONLY",
                "independent_review":True,"reviewer":"/root/start_fix_review",
                "publisher_is_reviewer_identity":False,"source_sha":"a"*40,
                "operator_sha256":"b"*64,"operator_size":40000,"operator_blob":"c"*40,
                "exact_head_ci":{"run_id":123,"head_sha":"a"*40,"conclusion":"success",
                                 "all_three_jobs_success":True}}
        body="R25_START_INDEPENDENT_REVIEW\n```json\n"+json.dumps(legacy)+"\n```"
        payload={"review_body":body,"review_body_sha256":s.sha(body.encode()),
                 "source_sha":"a"*40,"operator_sha256":"b"*64,
                 "operator_size":40000,"operator_blob":"c"*40,
                 "review_author":"Emaren",
                 "review_issue_url":"https://api.github.com/repos/Emaren/app-prodn/issues/1084",
                 "review_url":"https://github.com/Emaren/app-prodn/pull/1084#issuecomment-1"}
        with self.assertRaisesRegex(s.Hold,"REVIEW_MANIFEST_FORMAT"):
            s.reviewed(payload)

    def test_exact_scope_does_not_claim_public_or_financial_authority(self):
        text=(ROOT/"scripts/r25_c_start_recovery_v2_root.py").read_text()
        self.assertIn("public_cutover_authorized",text)
        self.assertIn("financial_authorized",text)
        self.assertIn("RECOVER-START-R25-3031-V2",text)
        self.assertIn("V2_GENUINE_B_PRESTART_REQUIRED",text)
        self.assertIn("witness.runtime_private_run(pid)",text)
        self.assertIn("V2_RECOVERY_ALREADY_ATTEMPTED_NO_REPLAY",text)
        self.assertNotIn("systemctl\",\"restart\"",text)
        self.assertNotIn('run(["/usr/bin/systemctl","start",OLD_UNIT]',text)

if __name__=="__main__":
    unittest.main()
