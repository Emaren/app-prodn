"""F9 physical owner-private HOLD-only preview, no scheduler audit forgery."""
from __future__ import annotations

from hashlib import sha256
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase
import json
import os
import sqlite3
import subprocess
import sys

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from foundry import SCHEMA, Rejected
from foundry_secure import SecureJournal, TrustedRepo
from foundry_dispatch import DurableDispatcher
from foundry_dashboard import render_private_html, write_private_export
from foundry_hold_only import preview_untrusted_observations
from nightforge_collectors import canonical,seal_offline_fixture,review_snapshot

ROOT=Path(__file__).resolve().parents[3]
HEAD=subprocess.check_output(["git","-C",str(ROOT),"rev-parse","HEAD"],
                             text=True).strip()
ORIGIN=subprocess.check_output(["git","-C",str(ROOT),"remote","get-url","origin"],
                                text=True).strip()
NOW="2026-11-10T14:00:10Z"
TICK=1_800_000_000_000

class HoldOnlyPreviewTests(TestCase):
    def setUp(self):
        temp=TemporaryDirectory(prefix="f9-hold-only-",dir=ROOT)
        self.addCleanup(temp.cleanup)
        self.dir=Path(temp.name);self.dir.chmod(0o700)
        self.db=self.dir/"offline.sqlite"
        self.roster={("PRODUCT_C","app-media"):TrustedRepo(
            "app-prodn",ROOT,HEAD,ORIGIN)}
        self.journal=SecureJournal(self.db,ROOT,self.roster)
        self.addCleanup(self.journal.close)

    def f8_event(self,missing, *,source_sha=None):
        fixture=seal_offline_fixture(
            kind="media",lane="PRODUCT_C",
            observed_utc="2026-11-10T14:00:00Z",
            data={"asset_group":"managed-portraits",
                  "missing_count":missing},
            claimed_source_sha=HEAD)
        report=review_snapshot(fixture,owner_now_utc=NOW)
        if source_sha is not None:
            report["event"]["source_sha"]=source_sha
        return report

    def ingest(self,missing, *,source_sha=None,expected="HOLD"):
        doc=self.f8_event(missing,source_sha=source_sha)
        result=self.journal.ingest(canonical(doc["event"]),doc["evidence_bytes"])
        self.assertEqual(result["status"],expected)
        return result

    def view(self,**kwargs):
        self.journal.close()
        return preview_untrusted_observations(self.db,product_root=ROOT,**kwargs)

    def test_two_original_F8_records_render_as_unsealed_HOLD_not_fake_audit(self):
        self.ingest(3)
        self.ingest(4)
        report=self.view()
        self.assertEqual(report["entriesShown"],2)
        self.assertEqual(report["status"],"HOLD_ONLY_UNSEALED_NO_SCHEDULER")
        self.assertEqual(report["audit"]["status"],"NO_AUDIT_ALL_HOLDS")
        self.assertEqual(report["audit"]["entries"],0)
        self.assertFalse(report["audit"]["signed"])
        self.assertFalse(report["audit"]["tamperProof"])
        self.assertEqual(report["totalByState"]["HOLD_SOURCE_UNVERIFIED"],2)
        self.assertEqual({r["sourceSha"] for r in report["items"]},{"unknown"})
        self.assertEqual({r["state"] for r in report["items"]},
                         {"HOLD_SOURCE_UNVERIFIED"})
        self.assertTrue(all(r["executionEnabled"] is False
                            for r in report["items"]))
        self.assertEqual(report["executor"],"DISABLED")
        self.assertIsNone(report["historicalSevenPositionMark"])
        self.assertIsNone(report["historicalUnrealizedPnL"])
        page=render_private_html(report)
        self.assertIn("UNSEALED HOLD-ONLY OBSERVATIONS",page)
        self.assertIn("No source attestation, scheduler job",page)
        self.assertNotIn("<script",page)
        self.assertIn("Current",page)

    def test_real_owner_private_HTML_export_without_overwrite(self):
        self.ingest(1)
        report=self.view()
        output=self.dir/"foundry-private-f9-hold-view.html"
        proof=write_private_export(report,output,private_root=self.dir)
        self.assertEqual(proof["status"],"PASS_OWNER_PRIVATE_SNAPSHOT_ONLY")
        self.assertEqual(output.stat().st_mode & 0o777,0o600)
        self.assertEqual(proof["sha256"],sha256(output.read_bytes()).hexdigest())
        self.assertIn(b"UNSEALED HOLD-ONLY",output.read_bytes())
        with self.assertRaises(FileExistsError):
            write_private_export(report,output,private_root=self.dir)
        self.assertFalse(proof["publicWebsiteMounted"])

    def test_verified_F1_event_without_audit_still_refused(self):
        sample=self.f8_event(1)
        evidence=canonical({"schema":"kingdom.foundry.evidence.v1",
                            "source":"app-media","status":"FAILED"})
        doc=dict(sample["event"])
        doc["source_sha"]=HEAD
        doc["evidence_ref"]="receipt://event/"+sha256(evidence).hexdigest()
        accepted=self.journal.ingest(canonical(doc),evidence)
        self.assertEqual(accepted["status"],"RECORDED")
        with self.assertRaisesRegex(Rejected,"NOT_ALL_UNVERIFIED_SOURCE"):
            self.view()

    def test_fake_pinned_Git_event_still_no_hold_only_proof(self):
        self.ingest(1,source_sha=HEAD)
        with self.assertRaisesRegex(Rejected,"NOT_ALL_UNVERIFIED_SOURCE"):
            self.view()

    def test_running_scheduler_or_audit_history_cannot_be_hidden(self):
        self.ingest(1)
        dispatcher=DurableDispatcher(self.journal)
        dispatcher.pause_lane("PRODUCT_C",TICK+1000,now_ms=TICK)
        with self.assertRaisesRegex(Rejected,"SCHEDULER_OR_AUDIT_EXISTS"):
            self.view()

    def test_duplicate_snapshot_replay_never_produces_second_row(self):
        first=self.ingest(3)
        again=self.ingest(3,expected="DUPLICATE")
        self.assertEqual(again["status"],"DUPLICATE")
        self.assertEqual(first["sequence"],again["sequence"])
        view=self.view()
        self.assertEqual(view["entriesShown"],1)

    def test_tampered_F1_body_digest_refused_without_escalation(self):
        self.ingest(1)
        self.journal.close()
        with sqlite3.connect(self.db) as mutable:
            mutable.execute("UPDATE f1_events SET body_sha256=?",
                            ("f"*64,))
        with self.assertRaisesRegex(Rejected,"CORRUPT_OR_REWRITTEN"):
            preview_untrusted_observations(self.db,product_root=ROOT)

    def test_ordinary_F1_event_body_mutation_refused(self):
        self.ingest(1)
        self.journal.close()
        with sqlite3.connect(self.db) as mutable:
            mutable.execute("UPDATE f1_events SET body=?",
                            ('{"schema_version":"fake"}',))
        with self.assertRaisesRegex(Rejected,"CORRUPT_EVENT_BODY"):
            preview_untrusted_observations(self.db,product_root=ROOT)

    def test_empty_database_refused(self):
        with self.assertRaisesRegex(Rejected,"NO_BOUNDED_F1_EVENTS"):
            self.view()

    def test_outside_symlink_world_readable_parent_and_hardlink_refused(self):
        self.ingest(2)
        self.journal.close()
        link=self.dir/"link.sqlite"
        link.symlink_to(self.db)
        with self.assertRaisesRegex(Rejected,"SYMLINK"):
            preview_untrusted_observations(link,product_root=ROOT)
        hard=self.dir/"hard.sqlite"
        os.link(self.db,hard)
        with self.assertRaisesRegex(Rejected,"NOT_PRIVATE_PRODUCT"):
            preview_untrusted_observations(self.db,product_root=ROOT)
        hard.unlink()
        self.dir.chmod(0o755)
        with self.assertRaisesRegex(Rejected,"NOT_PRIVATE_PRODUCT"):
            preview_untrusted_observations(self.db,product_root=ROOT)
        self.dir.chmod(0o700)
        with self.assertRaisesRegex(Rejected,"PRODUCT_ROOT_NOT_PRESENT"):
            preview_untrusted_observations(self.db,product_root=self.dir/"sub")

    def test_strict_bounded_pagination_and_HTML_authority_denial(self):
        for n in range(1,4):
            self.ingest(n)
        report=self.view(max_rows=2)
        self.assertEqual(report["entriesShown"],2)
        self.assertTrue(report["truncatedToMaxRows"])
        self.assertEqual(report["totalByState"]["HOLD_SOURCE_UNVERIFIED"],2)
        with self.assertRaises(Rejected):
            render_private_html({**report,
                "audit":{"status":"NO_AUDIT_ALL_HOLDS","entries":1}})
        with self.assertRaises(Rejected):
            render_private_html({**report,"items":[
                {**report["items"][0],"state":"DONE"}]})
        with self.assertRaises(Rejected):
            render_private_html({**report,"items":[
                {**report["items"][0],"sourceSha":HEAD}]})

    def test_older_verified_source_hidden_beyond_page_still_refused(self):
        # A page-1-only validation would incorrectly hide the first
        # verified event and bless the newer HOLD as "all HOLD".
        doc=self.f8_event(1)
        evidence=canonical({"schema":"kingdom.foundry.evidence.v1",
                            "source":"app-media","status":"FAILED"})
        event=dict(doc["event"])
        event["source_sha"]=HEAD
        event["evidence_ref"]="receipt://event/"+sha256(evidence).hexdigest()
        result=self.journal.ingest(canonical(event),evidence)
        self.assertEqual(result["status"],"RECORDED")
        self.ingest(2)
        self.journal.close()
        with self.assertRaisesRegex(Rejected,"NOT_ALL_UNVERIFIED_SOURCE"):
            preview_untrusted_observations(self.db,product_root=ROOT,
                                           max_rows=1)

    def test_requested_limit_boolean_zero_and_161_refused(self):
        self.ingest(1)
        self.journal.close()
        for limit in (0,161,True,"20"):
            with self.subTest(limit=limit),self.assertRaises(Rejected):
                preview_untrusted_observations(self.db,
                    product_root=ROOT,max_rows=limit)

    def test_actual_owner_cli_exports_hard_halt_0600_without_live_service(self):
        self.ingest(3)
        self.journal.close()
        output=self.dir/"foundry-private-cli-acceptance.html"
        argv=[sys.executable,str(ROOT/"tools/kingdom-foundry/private_hold_preview.py"),
             "--product-root",str(ROOT),
             "--journal",str(self.db),
             "--private-output-root",str(self.dir),
             "--output",str(output)]
        run=subprocess.run(argv,shell=False,capture_output=True,text=True,
                           timeout=10)
        self.assertEqual(run.returncode,0,run.stderr)
        proof=json.loads(run.stdout)
        self.assertEqual(proof["status"],
                         "PASS_OWNER_PRIVATE_UNSEALED_HOLD_ONLY_EXPORT")
        self.assertEqual(proof["records"],1)
        self.assertEqual(proof["auditReceipts"],0)
        self.assertFalse(proof["sourceAuthenticated"])
        self.assertEqual(proof["financeMutations"],0)
        self.assertEqual(proof["agentsExecuted"],0)
        self.assertEqual(proof["networkCalls"],0)
        self.assertEqual(proof["paperNewOrdersPermitted"],False)
        self.assertEqual(output.stat().st_mode & 0o777,0o600)
        self.assertEqual(proof["sha256"],sha256(output.read_bytes()).hexdigest())
        self.assertIn(b"UNSEALED HOLD-ONLY OBSERVATIONS",output.read_bytes())
        self.assertNotIn(str(self.db),run.stdout)

    def test_cli_existing_output_refused_without_leaking_private_paths(self):
        self.ingest(2)
        self.journal.close()
        output=self.dir/"foundry-private-cli-duplicate.html"
        args=[sys.executable,str(ROOT/"tools/kingdom-foundry/private_hold_preview.py"),
              "--product-root",str(ROOT),"--journal",str(self.db),
              "--private-output-root",str(self.dir),"--output",str(output)]
        first=subprocess.run(args,shell=False,capture_output=True,text=True,
                             timeout=10)
        self.assertEqual(first.returncode,0,first.stderr)
        original=output.read_bytes()
        second=subprocess.run(args,shell=False,capture_output=True,text=True,
                              timeout=10)
        self.assertEqual(second.returncode,2)
        self.assertIn("HOLD_F9_PRIVATE_SOURCE_OR_OUTPUT_NOT_ADMITTED",second.stderr)
        self.assertNotIn(str(self.db),second.stderr)
        self.assertNotIn(str(self.dir),second.stderr)
        self.assertEqual(original,output.read_bytes())

    def test_no_network_or_model_or_execution_helpers(self):
        code=(ROOT/"tools/kingdom-foundry/foundry_hold_only.py").read_text()
        for banned in ("subprocess", "requests.", "urlopen(", "socket.",
                       "os.system", "Popen(", "exec(", "eval(", "openai.",
                       "create_order(", "psycopg2", "systemctl"):
            self.assertNotIn(banned,code)
        self.assertIn('mode=ro',code)

if __name__=="__main__":
    import unittest
    unittest.main()
