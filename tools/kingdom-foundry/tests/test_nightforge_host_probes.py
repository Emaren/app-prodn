"""F10 fixed local host probes: no finance probes, no external authority."""
from __future__ import annotations

from hashlib import sha256
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from unittest.mock import patch
import json
import os
import subprocess
import sys
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from foundry import Rejected
from nightforge_host_probes import (
    HOST_SYSTEMD, VOLUMES, _decode_systemctl, probe_systemd_local,
    probe_local_storage, evaluate_untrusted_local_probe,
)
from nightforge_collectors import (
    LOCAL_MODE, canonical, review_snapshot, review_batch,
)
from foundry_secure import SecureJournal, TrustedRepo
from foundry_hold_only import preview_untrusted_observations
from foundry_dashboard import write_private_export
import nightforge_host_probes as host_probes

ROOT=Path(__file__).resolve().parents[3]
OBSERVED="2026-11-10T14:00:00Z"
OWNER_NOW="2026-11-10T14:00:10Z"
DEFAULT_UNIT="kingdom-traders-paper.service"


class F10ReadOnlyHostProbes(unittest.TestCase):
    def setUp(self):
        self.calls=[]
        self.reply=SimpleNamespace(returncode=0,stdout=(
            b"Id=kingdom-traders-paper.service\n"
            b"ActiveState=active\n"
            b"LoadState=loaded\n"),stderr=b"")

    def runner(self, argv, **kwargs):
        self.calls.append((argv,kwargs))
        return self.reply

    def systemd(self,unit=DEFAULT_UNIT,*,lane="PRODUCT_C",
                observed_utc=OBSERVED):
        return probe_systemd_local(
            unit,lane=lane,observed_utc=observed_utc,runner=self.runner)

    def check_untrusted(self,raw):
        body=json.loads(raw)
        self.assertEqual(body["mode"],LOCAL_MODE)
        self.assertEqual(body["claimed_source_sha"],"unknown")
        proof=evaluate_untrusted_local_probe(raw,owner_now_utc=OWNER_NOW)
        self.assertEqual(proof["status"],
            "HOLD_UNVERIFIED_SOURCE_NO_TASK_ADMISSION")
        self.assertEqual(proof["sourceAttribution"],
            "UNATTESTED_LOCAL_READONLY_PROBE")
        self.assertEqual(proof["sourceGitSHA"],"unknown")
        self.assertFalse(proof["sourceIndependenceVerified"])
        self.assertFalse(proof["observedTimeExternallyAttested"])
        self.assertFalse(proof["nativeServiceStateVerified"])
        self.assertFalse(proof["collectorSourceApproved"])
        self.assertFalse(proof["dispatchAllowed"])
        self.assertFalse(proof["executionEnabled"])
        self.assertFalse(proof["financeAllowed"])
        self.assertFalse(proof["newPaperOrdersAllowed"])
        self.assertFalse(proof["realExchangeOrdersAllowed"])
        return proof

    def test_fixed_systemd_show_argv_env_no_shell_or_network(self):
        raw=self.systemd()
        result=self.check_untrusted(raw)
        self.assertEqual(result["code"],"SYSTEMD_ACTIVE_NOT_SERVICE_CERTIFICATION")
        self.assertEqual(len(self.calls),1)
        argv,kwargs=self.calls[0]
        self.assertEqual(argv,[
            "/usr/bin/systemctl", "--no-pager", "--no-legend",
            "show","--property=Id,ActiveState,LoadState",
            "--",DEFAULT_UNIT])
        self.assertIs(kwargs["shell"],False)
        self.assertTrue(kwargs["capture_output"])
        self.assertIs(kwargs["check"],False)
        self.assertEqual(kwargs["timeout"],2)
        self.assertEqual(kwargs["env"]["PATH"],"/usr/bin:/bin")
        self.assertEqual(json.loads(raw)["data"]["timer_age_sec"],None)

    def test_known_systemd_failed_unit_is_warning_not_live_certification(self):
        self.reply.stdout=(
            b"Id=kingdom-traders-paper.service\n"
            b"ActiveState=failed\nLoadState=loaded\n")
        proof=self.check_untrusted(self.systemd())
        self.assertEqual(proof["code"],"SYSTEMD_UNIT_UNHEALTHY")
        self.assertEqual(proof["severity"],"error")
        self.assertFalse(proof["nativeServiceStateVerified"])

    def test_unknown_financial_units_and_command_injection_refused_pre_runner(self):
        for unit in (
            "wolo-signer.service","wolo-reviewer.service",
            "wolo-custody.service","financial.service",
            "../../FINANCIAL/keys",
            DEFAULT_UNIT+"; curl attacker",DEFAULT_UNIT+"\n",
            "ssh","--help",None,True,
        ):
            with self.subTest(unit=unit),self.assertRaises(Rejected):
                self.systemd(unit)
        self.assertEqual(len(self.calls),0)

    def test_other_fixed_systemd_units_are_allowlisted_not_broker_commands(self):
        for unit in HOST_SYSTEMD:
            self.reply.stdout=(
                f"Id={unit}\nActiveState=inactive\nLoadState=loaded\n"
            ).encode("ascii")
            result=self.check_untrusted(self.systemd(unit))
            self.assertEqual(result["code"],"SYSTEMD_UNIT_UNHEALTHY")
        self.assertEqual(len(self.calls),len(HOST_SYSTEMD))

    def test_missing_duplicate_and_extra_systemd_properties_refused(self):
        for stdout in (
            b"ActiveState=active\nLoadState=loaded\n",
            b"Id="+DEFAULT_UNIT.encode()+b"\nActiveState=active\n",
            b"Id="+DEFAULT_UNIT.encode()+b"\nActiveState=active\nLoadState=loaded\nExecStart=sudo bash\n",
            b"Id="+DEFAULT_UNIT.encode()+b"\nActiveState=active\nActiveState=failed\nLoadState=loaded\n",
            b"Id="+DEFAULT_UNIT.encode()+b"\nActiveState=active\nLoadState=masked\n",
            b"Id="+DEFAULT_UNIT.encode()+b"\nActiveState=loading\nLoadState=loaded\n",
            b"Id="+DEFAULT_UNIT.encode()+b"\nActiveState=active\nLoadState=loaded\n\n",
            b"Id="+DEFAULT_UNIT.encode()+b"\nActiveState=active\nLoadState=loaded\n" + bytes([255]),
        ):
            with self.subTest(stdout=stdout[:75]),self.assertRaises(Rejected):
                self.systemd() if (setattr(self.reply,"stdout",stdout) is None) else None

    def test_unexpected_stdout_size_stderr_nonzero_exit_timeout_refused(self):
        self.reply.stdout=b"X"*2049
        with self.assertRaises(Rejected):self.systemd()
        self.reply.stdout=(b"Id="+DEFAULT_UNIT.encode()+
            b"\nActiveState=active\nLoadState=loaded\n")
        self.reply.stderr=b"root PRIVATE KEY"
        with self.assertRaises(Rejected):self.systemd()
        self.reply.stderr=b""
        self.reply.returncode=1
        with self.assertRaises(Rejected):self.systemd()
        def timeout(*a,**kw):
            raise subprocess.TimeoutExpired(a,kw.get("timeout",2))
        with self.assertRaises(Rejected):
            probe_systemd_local(DEFAULT_UNIT,lane="PRODUCT_C",
                observed_utc=OBSERVED,runner=timeout)

    def test_future_stale_and_invalid_clock_rejected_before_any_query(self):
        for utc in ("2026-11-10T14:00:60Z","not a time","",
                    "2026-11-10T14:00:00+00:00"):
            with self.subTest(utc=utc),self.assertRaises(Rejected):
                self.systemd(observed_utc=utc)
        self.assertEqual(len(self.calls),0)
        raw=self.systemd()
        for now in ("2026-11-10T13:59:59Z",
                    "2026-11-10T15:00:01Z"):
            with self.subTest(now=now),self.assertRaises(Rejected):
                evaluate_untrusted_local_probe(raw,owner_now_utc=now)

    def test_mode_cannot_be_promoted_or_claim_external_certificate(self):
        raw=self.systemd()
        obj=json.loads(raw)
        for mode in ("PRODUCTION_ATTESTED","AUTHENTICATED_NATIVE","SIGNED"):
            new={**obj,"mode":mode}
            parts={k:v for k,v in new.items() if k!="snapshot_sha256"}
            new["snapshot_sha256"]=sha256(canonical(parts)).hexdigest()
            with self.subTest(mode=mode),self.assertRaises(Rejected):
                evaluate_untrusted_local_probe(canonical(new),
                    owner_now_utc=OWNER_NOW)
        # Even a real valid-looking pinned commit in claimed_source_sha
        # cannot turn a local probe into a production-authorized source.
        fake={**obj,"claimed_source_sha":"a"*40}
        fake["snapshot_sha256"]=sha256(canonical({
            k:v for k,v in fake.items() if k!="snapshot_sha256"
        })).hexdigest()
        proof=evaluate_untrusted_local_probe(
            canonical(fake),owner_now_utc=OWNER_NOW)
        self.assertEqual(proof["claimedSourceGitSHA"],"a"*40)
        self.assertEqual(proof["sourceGitSHA"],"unknown")
        self.assertFalse(proof["dispatchAllowed"])
        self.assertFalse(proof["sourceIndependenceVerified"])

    def test_storage_mount_is_platform_bound_and_not_fake_backup_proof(self):
        platform="M1_MAC_LOCAL" if sys.platform=="darwin" else "HEL1_ROOT_LOCAL"
        raw=probe_local_storage(platform,lane="PRODUCT_C",
                                observed_utc=OBSERVED)
        report=self.check_untrusted(raw)
        data=json.loads(raw)["data"]
        self.assertEqual(data["plane"],
            "mac" if sys.platform=="darwin" else "hel1-root")
        self.assertIs(type(data["available_mib"]),int)
        self.assertGreater(data["available_mib"],0)
        self.assertFalse(data["visual_signed"])
        self.assertEqual(report["code"],"STORAGE_VISUAL_SOURCE_NOT_TRUSTED")

    def test_storage_other_host_unknown_volume_and_financial_path_refused(self):
        for p in ("FINANCIAL","INTEL_RECOVERY","HEL1_VOLUME_LOCAL",
                  "M1_MAC_LOCAL/../../FINANCIAL",None,"",True):
            with self.subTest(p=p),self.assertRaises(Rejected):
                probe_local_storage(p,lane="PRODUCT_C",
                    observed_utc=OBSERVED)
        wrong="HEL1_ROOT_LOCAL" if sys.platform=="darwin" else "M1_MAC_LOCAL"
        with self.assertRaisesRegex(Rejected,"PLATFORM_MISMATCH"):
            probe_local_storage(wrong,lane="PRODUCT_C",
                observed_utc=OBSERVED)

    def test_tampered_statvfs_and_negative_device_bytes_refused(self):
        platform="M1_MAC_LOCAL" if sys.platform=="darwin" else "HEL1_ROOT_LOCAL"
        class Stat:
            def __init__(self,block,available):
                self.f_frsize=block;self.f_bavail=available
        for stats in (Stat(-1,100),Stat(0,100),Stat(4096,-1),
                      Stat(1_000_000_001,5),
                      Stat(4096,10**16),Stat(True,100),
                      Stat(4096,3*10**12)):
            with self.subTest(stats=stats.__dict__),self.assertRaises(Rejected):
                probe_local_storage(platform,lane="PRODUCT_C",
                    observed_utc=OBSERVED,statvfs=lambda _:stats)

    def test_source_approved_untrusted_modes_still_one_hold_batch(self):
        raw=self.systemd()
        platform="M1_MAC_LOCAL" if sys.platform=="darwin" else "HEL1_ROOT_LOCAL"
        disk=probe_local_storage(platform,lane="PRODUCT_C",
                                 observed_utc=OBSERVED)
        batch=review_batch((raw,disk),owner_now_utc=OWNER_NOW)
        self.assertEqual(batch["count"],2)
        self.assertFalse(batch["dispatchAllowed"])
        self.assertEqual(batch["networkCalls"],0)
        self.assertEqual({x["sourceGitSHA"] for x in batch["reports"]},
                         {"unknown"})

    def test_linux_root_requires_out_of_band_machine_id_sha_no_ci_masquerade(self):
        # A random Linux runner cannot label its / volume HEL1 without
        # a separately supplied pinned machine identifier.
        fake_id=b"b"*32
        expected=sha256(fake_id).hexdigest()
        class FakeFS:
            f_frsize=4096
            f_bavail=2_000_000
        with patch.object(host_probes.sys,"platform","linux"):
            with self.assertRaisesRegex(Rejected,"LINUX_PIN_REQUIRED"):
                probe_local_storage("HEL1_ROOT_LOCAL",lane="PRODUCT_C",
                    observed_utc=OBSERVED,statvfs=lambda _:FakeFS())
            with self.assertRaisesRegex(Rejected,"IDENTITY_MISMATCH"):
                probe_local_storage("HEL1_ROOT_LOCAL",lane="PRODUCT_C",
                    observed_utc=OBSERVED,
                    approved_linux_machine_id_sha256="c"*64,
                    machine_id_reader=lambda:fake_id,
                    statvfs=lambda _:FakeFS())
            good=probe_local_storage(
                "HEL1_ROOT_LOCAL",lane="PRODUCT_C",observed_utc=OBSERVED,
                approved_linux_machine_id_sha256=expected,
                machine_id_reader=lambda:fake_id,
                statvfs=lambda _:FakeFS())
        proof=self.check_untrusted(good)
        self.assertEqual(json.loads(good)["data"]["plane"],"hel1-root")
        self.assertFalse(proof["sourceIndependenceVerified"])
        self.assertFalse(proof["dispatchAllowed"])
        self.assertFalse(proof["nativeServiceStateVerified"])

    def test_reject_invalid_machine_ids_wrong_platform_pin_and_overflow(self):
        class FakeFS:
            f_frsize=4096
            f_bavail=10
        fake=b"b"*32
        expected=sha256(fake).hexdigest()
        with patch.object(host_probes.sys,"platform","linux"):
            for invalid in (b"not-id",b"b"*129,b"",b"b"*31,b"q"*32,
                            b"b"*31+bytes([255]),"b"*32,None):
                with self.subTest(invalid=invalid),self.assertRaises(Rejected):
                    probe_local_storage(
                        "HEL1_ROOT_LOCAL",lane="PRODUCT_C",
                        observed_utc=OBSERVED,
                        approved_linux_machine_id_sha256=expected,
                        machine_id_reader=lambda:invalid,
                        statvfs=lambda _:FakeFS())
        with patch.object(host_probes.sys,"platform","darwin"):
            with self.assertRaisesRegex(Rejected,"WRONG_PLATFORM_IDENTITY_PIN"):
                probe_local_storage("M1_MAC_LOCAL",lane="PRODUCT_C",
                    observed_utc=OBSERVED,
                    approved_linux_machine_id_sha256=expected,
                    statvfs=lambda _:FakeFS())

    def test_actual_local_disk_observation_enters_private_F1_hold_and_F9_0600(self):
        platform="M1_MAC_LOCAL" if sys.platform=="darwin" else "HEL1_ROOT_LOCAL"
        pinned={}
        if platform=="HEL1_ROOT_LOCAL":
            fake_id=b"b"*32
            pinned={"approved_linux_machine_id_sha256":sha256(fake_id).hexdigest(),
                    "machine_id_reader":lambda:fake_id}
        with TemporaryDirectory(prefix="f10-readonly-physical-",dir=ROOT) as dirname:
            folder=Path(dirname)
            folder.chmod(0o700)
            raw=probe_local_storage(platform,lane="PRODUCT_C",
                observed_utc=OBSERVED,**pinned)
            reported=self.check_untrusted(raw)
            head=subprocess.check_output(["git","-C",str(ROOT),
                "rev-parse","HEAD"],text=True).strip()
            origin=subprocess.check_output(["git","-C",str(ROOT),
                "remote","get-url","origin"],text=True).strip()
            bindings={("PRODUCT_C","storage-os"):TrustedRepo(
                "app-prodn",ROOT,head,origin)}
            db=folder/"observer.sqlite"
            journal=SecureJournal(db,ROOT,bindings)
            try:
                outcome=journal.ingest(
                    canonical(reported["event"]),reported["evidence_bytes"])
                self.assertEqual(outcome["status"],"HOLD")
                self.assertFalse(outcome["source_verified"])
            finally:
                journal.close()
            state=preview_untrusted_observations(db,product_root=ROOT)
            self.assertEqual(state["entriesShown"],1)
            self.assertEqual(state["audit"]["status"],"NO_AUDIT_ALL_HOLDS")
            self.assertEqual(state["items"][0]["state"],"HOLD_SOURCE_UNVERIFIED")
            html=folder/"foundry-private-f10-disk.html"
            receipt=write_private_export(state,html,private_root=folder)
            self.assertEqual(receipt["status"],"PASS_OWNER_PRIVATE_SNAPSHOT_ONLY")
            self.assertEqual(html.stat().st_mode & 0o777,0o600)
            self.assertEqual(receipt["sha256"],sha256(html.read_bytes()).hexdigest())
            self.assertIn(b"UNSEALED HOLD-ONLY OBSERVATIONS",html.read_bytes())
            with self.assertRaises(FileExistsError):
                write_private_export(state,html,private_root=folder)

    def test_source_does_not_contain_general_executor_network_or_finance(self):
        source=(ROOT/"tools/kingdom-foundry/nightforge_host_probes.py").read_text()
        for bad in ("requests.", "urlopen(", "socket.", "ssh ",
                    "OpenAI(", "create_order(", "place_order(",
                    "psycopg2", "sqlite3.connect(", "git push",
                    "os.system(", "shell=True", "http://", "https://"):
            self.assertNotIn(bad,source)
        self.assertIn('"/usr/bin/systemctl"',source)
        self.assertIn("Fixed systemctl",source)

if __name__=="__main__":
    unittest.main()
