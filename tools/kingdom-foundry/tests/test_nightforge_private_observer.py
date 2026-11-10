"""F11 actual private one-shot observation / crash/duplicate/source-HOLD drills."""
from __future__ import annotations

from hashlib import sha256
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from unittest import TestCase
import json
import os
import sqlite3
import subprocess
import sys

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from foundry import Rejected
from foundry_secure import SecureJournal, TrustedRepo
from foundry_hold_only import preview_untrusted_observations
from nightforge_collectors import canonical, review_snapshot
from nightforge_host_probes import probe_systemd_local
from nightforge_private_observer import (
    record_one_untrusted_local_observation, _observation, _exact_clean_source
)

ROOT=Path(__file__).resolve().parents[3]
PRODUCT=ROOT.parent
HEAD=subprocess.check_output(["git","-C",str(ROOT),"rev-parse","HEAD"],
                              text=True).strip()
ORIGIN=subprocess.check_output(["git","-C",str(ROOT),"remote","get-url","origin"],
                                text=True).strip()
OBSERVED="2026-11-10T14:00:00Z"
NOW="2026-11-10T14:00:10Z"


def raw_systemd_observation(health="active",observed=OBSERVED):
    return probe_systemd_local(
        "kingdom-traders-paper.service",
        lane="PRODUCT_C",observed_utc=observed,
        runner=lambda *args,**kwargs:SimpleNamespace(
            returncode=0,
            stdout=(
                "Id=kingdom-traders-paper.service\n"
                f"ActiveState={health}\nLoadState=loaded\n"
            ).encode("ascii"),stderr=b"")
    )


class PrivateOneShotObserverTests(TestCase):
    def setUp(self):
        tmp=TemporaryDirectory(prefix="session-c-f11-test-private-",dir=PRODUCT)
        self.addCleanup(tmp.cleanup)
        self.private=Path(tmp.name)
        self.private.chmod(0o700)
        self.db=self.private/"foundry-f11-local-hold.sqlite"

    def record(self,raw=None,receipt_id="f11-test-a",source_sha=HEAD,
               private_dir=None,product_root=PRODUCT):
        return record_one_untrusted_local_observation(
            raw if raw is not None else raw_systemd_observation(),
            product_root=product_root,
            repo_checkout=ROOT,
            private_dir=private_dir if private_dir is not None else self.private,
            approved_source_sha=source_sha,
            receipt_id=receipt_id,owner_now_utc=NOW,
        )

    def assert_no_authority(self,out):
        self.assertEqual(out["status"],"PASS_OWNER_PRIVATE_UNATTESTED_HOLD_ONLY")
        self.assertTrue(out["locallyPinnedCodeNotRemoteAttestation"])
        self.assertFalse(out["sourceAuthenticated"])
        self.assertFalse(out["observationExternallyAttested"])
        self.assertFalse(out["hasVerifiedSchedulerAudit"])
        self.assertEqual(out["observationSourceSha"],"unknown")
        self.assertEqual(out["htmlModeOctal"],"0600")
        for k in ("networkCalls","webRoutesCreated","tasksDispatched",
                  "agentExecutions","financialMutations","newPaperOrders",
                  "realOrders","fundingOrWoloMoves"):
            self.assertEqual(out[k],0,k)

    def test_source_pinned_actual_F10_snapshot_to_private_F1_F9_HTML(self):
        out=self.record()
        self.assert_no_authority(out)
        self.assertEqual(out["locallyPinnedCodeSHA"],HEAD)
        self.assertEqual(out["journalResult"],"HOLD")
        self.assertEqual(out["journalSeq"],1)
        self.assertEqual(out["journalRecordsShown"],1)
        html=self.private/"foundry-private-f11-test-a.html"
        self.assertEqual(html.stat().st_mode & 0o777,0o600)
        self.assertEqual(self.db.stat().st_mode & 0o777,0o600)
        self.assertEqual(out["htmlSha256"],sha256(html.read_bytes()).hexdigest())
        self.assertIn(b"UNSEALED HOLD-ONLY OBSERVATIONS",html.read_bytes())
        self.assertIn(b"HOLD_SOURCE_UNVERIFIED",html.read_bytes())
        snapshot=preview_untrusted_observations(self.db,product_root=PRODUCT)
        self.assertEqual(snapshot["audit"]["status"],"NO_AUDIT_ALL_HOLDS")
        with sqlite3.connect(self.db) as db:
            self.assertEqual(db.execute(
                "SELECT trust FROM f1_events").fetchall(),[("HOLD",)])
            self.assertEqual(db.execute(
                "SELECT count(*) FROM sqlite_master WHERE name='f2_jobs'").fetchone()[0],0)

    def test_identical_replay_creates_new_private_view_not_new_event(self):
        first=self.record(receipt_id="f11-original")
        second=self.record(receipt_id="f11-repeat")
        self.assert_no_authority(second)
        self.assertEqual(first["journalResult"],"HOLD")
        self.assertEqual(second["journalResult"],"DUPLICATE")
        self.assertEqual(first["journalSeq"],second["journalSeq"])
        self.assertEqual(second["journalRecordsShown"],1)
        self.assertTrue((self.private/"foundry-private-f11-repeat.html").exists())

    def test_crash_like_overwrite_refusal_preserves_event_for_fresh_receipt(self):
        before=self.record(receipt_id="f11-crash")
        html=self.private/"foundry-private-f11-crash.html"
        original=html.read_bytes()
        changed=raw_systemd_observation("failed")
        with self.assertRaises(FileExistsError):
            self.record(changed,receipt_id="f11-crash")
        self.assertEqual(original,html.read_bytes())
        # F1 commit occurred BEFORE the failed HTML export, so retry
        # with a fresh name preserves two distinct source-UNKNOWN events.
        after=self.record(changed,receipt_id="f11-recovered")
        self.assert_no_authority(after)
        self.assertEqual(after["journalResult"],"DUPLICATE")
        self.assertEqual(after["journalSeq"],2)
        self.assertEqual(after["journalRecordsShown"],2)
        self.assertEqual(before["journalRecordsShown"],1)
        with sqlite3.connect(self.db) as db:
            self.assertEqual(db.execute("SELECT count(*) FROM f1_events").fetchone()[0],2)
            self.assertEqual(db.execute(
                "SELECT count(*) FROM f1_events WHERE trust='HOLD'").fetchone()[0],2)

    def test_reject_duplicate_HTML_symlink_and_public_directory(self):
        self.record(receipt_id="f11-valid")
        other=self.private/"foundry-private-f11-symlink.html"
        other.symlink_to(self.private/"foundry-private-f11-valid.html")
        with self.assertRaises(Rejected):
            self.record(receipt_id="f11-symlink")
        other.unlink()
        self.private.chmod(0o755)
        with self.assertRaisesRegex(Rejected,"OWNER_PRIVATE"):
            self.record(receipt_id="f11-public")
        self.private.chmod(0o700)

    def test_reject_wrong_source_PIN_without_writing_database(self):
        with self.assertRaises(Rejected):
            self.record(source_sha="0"*40)
        self.assertFalse(self.db.exists())
        with self.assertRaisesRegex(Rejected,"SOURCE_PIN_MISSING"):
            self.record(source_sha="unknown")
        self.assertFalse(self.db.exists())

    def test_reject_uncommitted_checkout_even_when_HEAD_matches(self):
        stray=ROOT/"f11-source-trust-untracked-probe.tmp"
        self.assertFalse(stray.exists())
        try:
            stray.write_text("HOLD unreviewed worktree bytes\n")
            with self.assertRaisesRegex(Rejected,"DIRTY_CODE_CHECKOUT"):
                self.record(receipt_id="f11-dirty")
            self.assertFalse(self.db.exists())
        finally:
            stray.unlink(missing_ok=True)
        success=self.record(receipt_id="f11-clean")
        self.assert_no_authority(success)

    def test_reject_F8_offline_fixture_even_if_digest_and_git_head_valid(self):
        report=json.loads(raw_systemd_observation())
        report["mode"]="SANITIZED_OFFLINE_FIXTURE_ONLY"
        report["claimed_source_sha"]=HEAD
        report["snapshot_sha256"]=sha256(canonical({
            k:v for k,v in report.items() if k!="snapshot_sha256"
        })).hexdigest()
        with self.assertRaisesRegex(Rejected,"SOURCE_ADMISSION_BREACH"):
            self.record(canonical(report))
        self.assertFalse(self.db.exists())

    def test_reject_preexisting_unsafe_hardlink_journal_without_mutation(self):
        existing=self.private/"other-source.sqlite"
        existing.write_bytes(b"sealed user data not SQLite")
        os.chmod(existing,0o600)
        os.link(existing,self.db)
        with self.assertRaisesRegex(Rejected,"PREEXISTING_JOURNAL_UNSAFE"):
            self.record()
        self.assertEqual(existing.read_bytes(),b"sealed user data not SQLite")
        self.db.unlink()
        existing.unlink()

    def test_reject_financial_or_wrong_PRODUCT_root_without_db_creation(self):
        with self.assertRaisesRegex(Rejected,"OWNER_PRIVATE"):
            self.record(product_root=ROOT)
        self.assertFalse(self.db.exists())
        with self.assertRaisesRegex(Rejected,"OWNER_PRIVATE"):
            self.record(private_dir=ROOT)
        self.assertFalse(self.db.exists())

    def test_reject_bad_raw_oversized_lanes_and_command_injection(self):
        for invalid in (b"",b"x"*4097,"string",None):
            with self.subTest(invalid=type(invalid)),self.assertRaises(Rejected):
                self.record(raw=invalid if invalid is not None else b"")
        for identifier in ("", "../financial", "a"*100, "x;rm -rf /",None):
            with self.subTest(identifier=identifier),self.assertRaises(Rejected):
                self.record(receipt_id=identifier)
        self.assertFalse(self.db.exists())

    def test_only_fixed_probes_admitted_by_public_library(self):
        for kind,unit in (
            ("manual-bash",None),
            ("systemd","wolo-reviewer.service"),
            ("systemd","../../FINANCIAL/private"),
            ("mac-storage","nginx.service"),
        ):
            with self.subTest(kind=kind,unit=unit),self.assertRaises(Rejected):
                _observation(kind,unit=unit,linux_pin=None,
                             lane="PRODUCT_C",observed_utc=OBSERVED)

    def test_verified_F1_record_in_existing_journal_blocks_entire_view(self):
        first=self.record()
        self.assertEqual(first["journalResult"],"HOLD")
        raw=raw_systemd_observation("failed")
        proposed=review_snapshot(raw,owner_now_utc=NOW)
        evidence=canonical({"schema":"kingdom.foundry.evidence.v1",
                            "source":proposed["event"]["source"],
                            "status":"FAILED"})
        modified=dict(proposed["event"])
        modified["source_sha"]=HEAD
        modified["evidence_ref"]="receipt://event/"+sha256(evidence).hexdigest()
        repo=_exact_clean_source(PRODUCT,ROOT,HEAD)
        journal=SecureJournal(self.db,PRODUCT,{
            ("PRODUCT_C",modified["source"]):repo})
        try:
            result=journal.ingest(canonical(modified),evidence)
            self.assertEqual(result["status"],"RECORDED")
        finally:
            journal.close()
        with self.assertRaises(Rejected):
            self.record(raw,receipt_id="f11-mixed")
        self.assertFalse((self.private/"foundry-private-f11-mixed.html").exists())

    def test_existing_tampered_journal_does_not_produce_dashboard(self):
        first=self.record()
        self.assertEqual(first["journalResult"],"HOLD")
        with sqlite3.connect(self.db) as db:
            db.execute("UPDATE f1_events SET body_sha256=?",("f"*64,))
        # Use a different source observation so F1 can commit a second
        # HOLD row, then F9 must detect the OLDER corrupted event.
        with self.assertRaisesRegex(Rejected,"CORRUPT"):
            self.record(raw_systemd_observation("failed"),
                        receipt_id="f11-tampered")
        self.assertFalse((self.private/"foundry-private-f11-tampered.html").exists())

    def test_manual_MAC_CLI_source_to_private_0600_html(self):
        if sys.platform!="darwin":
            self.skipTest("actual local M1 statvfs only; Linux has pinned stubs")
        cli=ROOT/"tools/kingdom-foundry/nightforge_private_observer.py"
        argv=[sys.executable,str(cli),"--mac-storage",
              "--product-root",str(PRODUCT),
              "--private-dir",str(self.private),
              "--approved-source-sha",HEAD,
              "--receipt-id","f11-cli-m1"]
        ran=subprocess.run(argv,shell=False,capture_output=True,text=True,
                           timeout=15)
        self.assertEqual(ran.returncode,0,ran.stderr)
        receipt=json.loads(ran.stdout)
        self.assert_no_authority(receipt)
        self.assertNotIn(str(self.private),ran.stdout)
        self.assertEqual(ran.stderr,"")
        output=self.private/"foundry-private-f11-cli-m1.html"
        self.assertEqual(output.stat().st_mode & 0o777,0o600)
        self.assertEqual(receipt["htmlSha256"],
                         sha256(output.read_bytes()).hexdigest())
        second=subprocess.run(argv,shell=False,capture_output=True,
                              text=True,timeout=15)
        self.assertEqual(second.returncode,2)
        self.assertIn("HOLD_F11_ONE_SHOT_SOURCE_OR_PRIVATE_RECEIPT",second.stderr)
        self.assertEqual(second.stdout,"")
        self.assertNotIn(str(self.private),second.stderr)

    def test_manual_cli_unknown_linux_PIN_never_claims_HEL1_or_writes(self):
        cli=ROOT/"tools/kingdom-foundry/nightforge_private_observer.py"
        ran=subprocess.run([sys.executable,str(cli),
            "--hel1-root","--product-root",str(PRODUCT),
            "--private-dir",str(self.private),
            "--approved-source-sha",HEAD,
            "--receipt-id","f11-should-hold"],
            shell=False,capture_output=True,text=True,timeout=10)
        self.assertEqual(ran.returncode,2)
        self.assertEqual(ran.stdout,"")
        self.assertIn("HOLD_F11_ONE_SHOT",ran.stderr)
        self.assertFalse(self.db.exists())

    def test_only_fixed_code_paths_not_order_or_network(self):
        source=(ROOT/"tools/kingdom-foundry/nightforge_private_observer.py").read_text()
        for forbidden in ("requests.", "urlopen(", "socket.",
            "http://", "https://api.", "os.system(", "shell=True",
            "create_order(", "place_order(", "wallet.transfer(",
            "psycopg2.connect(", "subprocess.Popen(",
        ):
            self.assertNotIn(forbidden,source)
        self.assertIn("source_sha",source)
        self.assertIn("UNKNOWN",source)

if __name__=="__main__":
    import unittest
    unittest.main()
