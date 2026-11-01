"""V3 one-use A01 recovery contracts. No live host mutations."""
import base64
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest import mock

ROOT=Path(__file__).resolve().parents[1]
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,ROOT/path)
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module
s=load("r25_v3_root","scripts/r25_c_start_recovery_v3_root.py")
mac=load("r25_v3_mac","scripts/r25_c_start_recovery_v3_mac.py")
V3=ROOT/"deploy/r25-b-3031.prestart-host-mount-v3.dropin.conf"

class RecoveryV3Tests(unittest.TestCase):
    def test_new_one_use_journal_and_exact_previous_receipts(self):
        self.assertEqual(s.JOURNAL.name,"start-3031-v3")
        self.assertEqual(s.PREV_JOURNAL.name,"start-3031-v2")
        self.assertEqual(s.V1_JOURNAL.name,"start-3031-v1")
        self.assertEqual(len({s.JOURNAL,s.PREV_JOURNAL,s.V1_JOURNAL}),3)
        self.assertEqual(s.V1_STARTED_SHA,"cbb0e36523991cf39a8b7562268141ed8fbde5109d60d59abdcf16923e783a53")
        self.assertEqual(s.V2_HOLD_SHA,"1ad48d5a0419ed9c09e37b04653192386dbd044049b1553774668b23b6709863")
        self.assertNotEqual(s.JOURNAL,s.PREV_JOURNAL)

    def test_exact_source_binding_and_tampering(self):
        raw=V3.read_bytes()
        self.assertEqual(s.sha(raw),s.V3_DROPIN_SHA)
        self.assertEqual(len(raw),s.V3_DROPIN_SIZE)
        self.assertEqual(mac.V3_DROPIN_SHA,s.V3_DROPIN_SHA)
        self.assertEqual(mac.V3_DROPIN_SIZE,s.V3_DROPIN_SIZE)
        self.assertEqual(mac.blob(raw),mac.V3_DROPIN_BLOB)
        self.assertEqual(s.approved_v3_dropin({"v3_dropin_b64":base64.b64encode(raw).decode()}),raw)
        for candidate in (raw+b"\\n",raw.replace(b"ExecStartPre=+",b"ExecStartPre=-",1),raw.replace(b"--mount",b"--net",1)):
            with self.subTest(candidate=candidate[:30]):
                with self.assertRaises(s.Hold):
                    s.approved_v3_dropin({"v3_dropin_b64":base64.b64encode(candidate).decode()})
        with self.assertRaisesRegex(s.Hold,"V3_PINNED_SOURCE_REQUIRED"):
            s.approved_v3_dropin({})

    def test_private_run_and_exact_root_scope_survive(self):
        private=(ROOT/"deploy/r25-b-3031.namespace-recovery.dropin.conf").read_text()
        self.assertIn("TemporaryFileSystem=/run:ro",private)
        new=V3.read_text()
        self.assertIn("ExecStartPre=+/usr/bin/nsenter --target 1 --mount --",new)
        self.assertNotIn("TemporaryFileSystem=",new)
        self.assertNotIn("ExecStart=",new)
        self.assertNotIn("ReadWritePaths=",new)
        root=(ROOT/"scripts/r25_c_start_recovery_v3_root.py").read_text()
        self.assertIn("effective_unit_v3(witness)",root)
        self.assertIn("witness.runtime_private_run(pid)",root)
        self.assertNotIn("exclusive_root_source(V2_DROPIN_PATH,",root)
        self.assertNotIn("exclusive_root_source(V2_WITNESS_PATH,",root)
        self.assertIn("exclusive_root_source(V3_DROPIN_PATH,",root)

    def test_no_journal_for_missing_fresh_consent(self):
        plan={"protected_before":{"old":2625090},"schema":"aoe2war.r25.c.start-plan.v3"}
        digest=s.sha(s.canonical(plan))
        nonce="e"*32
        phrase="RECOVER-START-R25-3031-V3 "+nonce+" "+digest
        for diff in ({"owner_consent":"v2 consent"}, {"nonce":"bad"}, {"plan_sha256":"b"*64}):
            payload={"plan_sha256":digest,"nonce":nonce,"owner_consent":phrase,**diff}
            with mock.patch.object(s,"admit",return_value=(None,plan)),mock.patch.object(s.os,"mkdir") as created:
                with self.assertRaises(s.Hold):
                    s.start(payload)
                created.assert_not_called()

    def test_existing_or_corrupt_journal_refused_pre_start(self):
        with tempfile.TemporaryDirectory() as td:
            old=Path(td)/"already-started"
            old.mkdir()
            with mock.patch.object(s.sys,"platform","linux"),mock.patch.object(s.os,"geteuid",return_value=0),mock.patch.object(s.socket,"gethostname",return_value=s.HOST),mock.patch.object(s,"reviewed"),mock.patch.object(s,"JOURNAL",old):
                with self.assertRaisesRegex(s.Hold,"V3_RECOVERY_ALREADY_ATTEMPTED_NO_REPLAY"):
                    s.admit({})
            old.rmdir()
            with mock.patch.object(s.sys,"platform","linux"),mock.patch.object(s.os,"geteuid",return_value=0),mock.patch.object(s.socket,"gethostname",return_value=s.HOST),mock.patch.object(s,"reviewed"),mock.patch.object(s,"JOURNAL",old),mock.patch.object(s,"root_file",return_value=b"tampered"):
                with self.assertRaisesRegex(s.Hold,"CONSUMED_JOURNAL_EXACT_BYTES_CHANGED"):
                    s.admit({})

    def test_v3_historical_B_uses_current_pinned_v2_wall_not_obsolete_original(self):
        # Actual v1 host 3031 is FAILED/0. Old repair.host_admission
        # accepts only INACTIVE, which deadlocked the first v2 candidate.
        from types import SimpleNamespace
        original_sha=s.sha
        old_status={"ActiveState":"active","MainPID":"2625090"}
        new_status={"LoadState":"loaded","ActiveState":"failed","MainPID":"0",
                    "User":s.USER,"WorkingDirectory":str(s.STAGE)}
        repairs=mock.Mock()
        witness=mock.Mock()
        current=mock.Mock()
        witness.validate_filesystem_wall.side_effect=RuntimeError("STALE_V1_WALL_FORBIDDEN")
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
        pins={"b_repair_b64":"pinned","b_witness_b64":"pinned",
              "v2_witness_b64":"current-source-pinned"}
        def mock_pinned(*args):
            if args[-1]=="reviewed_b_repair":
                return repairs
            if args[-1]=="reviewed_b_witness":
                return witness
            if args[-1]=="reviewed_b_v2_historical_current_wall":
                return current
            self.fail("unexpected source identity: "+repr(args[-1]))
        def digest(data):
            return s.B_WITNESS_SHA if data==b"installed" else original_sha(data)
        with mock.patch.object(s,"pinned_module",side_effect=mock_pinned), \
             mock.patch.object(s,"sha",side_effect=digest), \
             mock.patch.object(s,"effective_unit_v2",return_value="f"*64) as verified_v2, \
             mock.patch.object(s,"effective_unit",side_effect=AssertionError("stale original verifier must not run")), \
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
            witness.validate_filesystem_wall.assert_not_called()
            verified_v2.assert_called_once_with(current)
            self.assertEqual(outcome["current_v2_wall_effective_sha256"],"f"*64)
            new_status["ActiveState"]="inactive"
            with self.assertRaisesRegex(s.Hold,"B_V1_FAILED_UNIT_STATE_REQUIRED"):
                s.b_recovery_historical_admission(pins)
            new_status["ActiveState"]="failed"
            witness.db_proof.return_value={"role":"postgres","server_transaction_ro":False}
            with self.assertRaisesRegex(s.Hold,"B_SELECT_ONLY_DATABASE_ROLE_UNPROVEN"):
                s.b_recovery_historical_admission(pins)

    def test_actual_hel1_private_run_unit_wall_requires_all_original_finance_paths(self):
        # Owner-native systemctl showed these exact effective values at the
        # v3 PLAN HOLD. Validate them under the reviewed current witness.
        guard = load("r25_v2_current_finance_wall","scripts/r25_b_namespace_recovery_witness.py")
        state = {"ProtectSystem":"strict","ProtectHome":"yes",
                 "NoNewPrivileges":"yes","PrivateTmp":"yes",
                 "TemporaryFileSystem":"/run:ro",
                 "InaccessiblePaths":"/etc/aoe2hdbets /mnt/HC_Volume_105319120 /var/www/AoE2HDBets/app-prodn",
                 "ReadWritePaths":str(guard.SOURCE/".next"/"cache")+" /var/cache/aoe2war-r25-b-next-cache",
                 "CacheDirectory":"aoe2war-r25-b-next-cache",
                 "CacheDirectoryMode":"0700",
                 "BindPaths":"/var/cache/aoe2war-r25-b-next-cache:"+str(guard.SOURCE/".next"/"cache")+":rbind"}
        pre="/usr/bin/python3 -I -B "+str(s.V2_WITNESS_PATH)+" --phase prestart --expected-guard-sha256 "+s.B_GUARD_SHA
        unit=("NeedDaemonReload=no\nUser="+s.USER+"\nGroup="+s.USER+
              "\nWorkingDirectory="+str(s.STAGE)+"\n"+
              "ExecStart={ path=/usr/bin/node ; argv[]=/usr/bin/node ./node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3031 ; ignore_errors=no ; }\n"+
              "ExecStartPre={ path=/usr/bin/python3 ; argv[]="+pre+" ; ignore_errors=no ; }\n")
        with mock.patch.object(guard,"systemd",return_value=state), mock.patch.object(s,"run",return_value=unit.encode()):
            self.assertEqual(s.effective_unit_v2(guard),s.sha(unit.encode()))
            for key,value in (
                ("InaccessiblePaths","/etc/aoe2hdbets /var/www/AoE2HDBets/app-prodn"),
                ("InaccessiblePaths",state["InaccessiblePaths"]+" /run"),
                ("TemporaryFileSystem",""),
            ):
                with self.subTest(field=key,value=value):
                    altered=dict(state,**{key:value})
                    with mock.patch.object(guard,"systemd",return_value=altered):
                        with self.assertRaisesRegex(RuntimeError,r"R25_B_HOST_HOLD:|V2_EFFECTIVE_SANDBOX_DRIFT"):
                            s.effective_unit_v2(guard)

    def test_owner_v3_source_scope_and_no_funded_permissions(self):
        root=(ROOT/"scripts/r25_c_start_recovery_v3_root.py").read_text()
        launcher=(ROOT/"scripts/r25_c_start_recovery_v3_mac.py").read_text()
        for content in (root,launcher):
            self.assertIn("R25_START_V3_OWNER_NONFINANCIAL_ACCEPT",content)
            self.assertIn("RECOVERY_START_3031_V3_ONLY",content)
            self.assertIn("1115",content)
            self.assertNotIn("RECOVER-START-R25-3031-V2",content)
        self.assertIn('\"financial_authorized\": False',root)
        self.assertIn('\"public_cutover_authorized\": False',root)

if __name__=="__main__":
    unittest.main()
