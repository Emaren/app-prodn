"""F7 private static dashboard: source, HOLD, evidence and rollback refusals."""
from __future__ import annotations

from hashlib import sha256
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase
import json
import os
import subprocess
import sys

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from foundry import SCHEMA, Rejected
from foundry_secure import SecureJournal, TrustedRepo
from foundry_dispatch import DurableDispatcher
from foundry_dashboard import (
    read_model, render_private_html, write_private_export,
)

REPO = Path(__file__).resolve().parents[3]
HEAD = subprocess.check_output(
    ["git","-C",str(REPO),"rev-parse","HEAD"],text=True).strip()
ORIGIN = subprocess.check_output(
    ["git","-C",str(REPO),"remote","get-url","origin"],
    text=True).strip()
NOW = 1_800_000_000_000
EVIDENCE = json.dumps({
    "schema":"kingdom.foundry.evidence.v1",
    "source":"source-tests","status":"FAILED"
},sort_keys=True,separators=(",",":")).encode()
REF = "receipt://event/"+sha256(EVIDENCE).hexdigest()


class FoundryDashboardTests(TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory(prefix="f7-dashboard-",dir=REPO)
        self.addCleanup(self.temp.cleanup)
        self.private = Path(self.temp.name)
        self.private.chmod(0o700)
        self.binding = TrustedRepo("app-prodn",REPO,HEAD,ORIGIN)
        self.journal = SecureJournal(self.private/"test.sqlite",REPO,
            {("PRODUCT_C","source-tests"):self.binding})
        self.addCleanup(self.journal.close)
        self.scheduler = DurableDispatcher(self.journal)

    def event(self,index,*,kind="test_failure",source_sha=HEAD,
              severity="warning",summary="Known source regression"):
        body = {
            "schema_version":SCHEMA,
            "event_id":f"foundry-dashboard-record-{index:06d}",
            "observed_utc":"2026-11-10T14:45:00Z",
            "source":"source-tests","lane":"PRODUCT_C",
            "kind":kind,"severity":severity,"source_sha":source_sha,
            "summary":summary,"evidence_ref":REF,
        }
        return self.journal.ingest(json.dumps(body,sort_keys=True).encode(),
                                   EVIDENCE)

    def admitted(self):
        recorded=self.event(1)
        self.assertEqual(recorded["status"],"RECORDED")
        queued=self.scheduler.enqueue(recorded["sequence"],
            "app-prodn:foundry/owner-dashboard",now_ms=NOW,
            estimated_cost_cents=2)
        self.assertEqual(queued["status"],"WAITING")
        return queued["job_id"]

    def test_real_authenticated_local_git_and_audit_generate_restricted_view(self):
        self.admitted()
        observed=read_model(self.journal)
        self.assertEqual(observed["entriesShown"],1)
        item=observed["items"][0]
        self.assertEqual(item["recordId"],"KF-000000000001")
        self.assertEqual(item["lane"],"PRODUCT_C")
        self.assertEqual(item["state"],"WAITING")
        self.assertEqual(item["sourceSha"],HEAD)
        self.assertEqual(item["sourceStatus"],"LOCAL_GIT_HEAD_MATCH")
        self.assertTrue(item["evidence"].startswith("receipt://event/"))
        self.assertIn("do not execute",item["nextPermittedStep"])
        self.assertEqual(observed["audit"]["entries"],1)
        self.assertFalse(observed["audit"]["signed"])
        self.assertIsNone(observed["historicalSevenPositionMark"])
        self.assertIsNone(observed["historicalUnrealizedPnL"])
        self.assertIsNone(observed["currentMarketPrice"])
        self.assertFalse(observed["newPaperOrdersAllowed"])
        self.assertFalse(observed["realOrdersAllowed"])
        self.assertFalse(observed["walletOrWoloAllowed"])
        self.assertFalse(observed["websiteMounted"])

    def test_unknown_source_sha_from_research_collector_stays_visible_hold(self):
        self.admitted()
        event=self.event(9,kind="storage_pressure",source_sha="unknown")
        self.assertEqual(event["status"],"HOLD")
        report=read_model(self.journal)
        row=report["items"][0]
        self.assertEqual(row["sourceSha"],"unknown")
        self.assertEqual(row["state"],"HOLD_SOURCE_UNVERIFIED")
        self.assertEqual(row["sourceStatus"],"HOLD_CURRENT_SOURCE_UNVERIFIED")
        self.assertNotIn("MARKET",str(row["nextPermittedStep"]))

    def test_unknown_or_critical_event_never_looks_admitted(self):
        self.admitted()
        critical=self.event(2,kind="ci_failure",severity="critical")
        unknown=self.event(3,kind="storage_pressure",source_sha="0"*40)
        self.assertEqual(critical["status"],"HOLD")
        self.assertEqual(unknown["status"],"HOLD")
        report=read_model(self.journal)
        self.assertEqual(report["entriesShown"],3)
        statuses={r["recordId"]:r["state"] for r in report["items"]}
        self.assertEqual(statuses["KF-000000000002"],"HOLD_SOURCE_UNVERIFIED")
        self.assertEqual(statuses["KF-000000000003"],"HOLD_SOURCE_UNVERIFIED")
        self.assertEqual(report["totalByState"]["HOLD_SOURCE_UNVERIFIED"],2)

    def test_local_source_pin_changed_after_enqueue_makes_view_hold(self):
        from dataclasses import replace
        self.admitted()
        self.journal.bindings[("PRODUCT_C","source-tests")]=replace(
            self.binding,approved_commit="a"*40)
        report=read_model(self.journal)
        self.assertEqual(report["items"][0]["state"],"HOLD_SOURCE_UNVERIFIED")
        self.assertEqual(report["items"][0]["sourceStatus"],
                         "HOLD_CURRENT_SOURCE_UNVERIFIED")
        self.assertEqual(report["items"][0]["nextPermittedStep"],
                         "Verify pinned PRODUCT Git commit and evidence with an operator; no claim")

    def test_owner_private_html_creation_is_0600_and_never_overwrites(self):
        self.admitted()
        report=read_model(self.journal)
        out=self.private/"foundry-private-owner-20261110.html"
        receipt=write_private_export(report,out,private_root=self.private)
        self.assertEqual(receipt["status"],"PASS_OWNER_PRIVATE_SNAPSHOT_ONLY")
        self.assertEqual(receipt["executors"],0)
        self.assertFalse(receipt["publicWebsiteMounted"])
        self.assertEqual(out.stat().st_mode & 0o777,0o600)
        raw=out.read_bytes()
        self.assertEqual(receipt["bytes"],len(raw))
        self.assertEqual(receipt["sha256"],sha256(raw).hexdigest())
        self.assertIn(b"default-src 'none'",raw)
        self.assertIn(b"Content-Security-Policy",raw)
        with self.assertRaises(FileExistsError):
            write_private_export(report,out,private_root=self.private)
        self.assertEqual(out.read_bytes(),raw)
        self.assertEqual(list(self.private.glob(".foundry-private-*.tmp")),[])

    def test_world_readable_directory_symlink_and_wrong_destination_denied(self):
        self.admitted()
        report=read_model(self.journal)
        self.private.chmod(0o755)
        with self.assertRaises(Rejected):
            write_private_export(report,self.private/"foundry-private-x123.html",
                                 private_root=self.private)
        self.private.chmod(0o700)
        outside=self.private.parent/"foundry-private-outside.html"
        with self.assertRaises(Rejected):
            write_private_export(report,outside,private_root=self.private)
        destination=self.private/"foundry-private-x123.html"
        destination.symlink_to(self.private/"missing")
        with self.assertRaises(Rejected):
            write_private_export(report,destination,private_root=self.private)

    def test_no_executable_html_or_downloaded_assets(self):
        self.admitted()
        report=read_model(self.journal)
        page=render_private_html(report)
        for item in (
            "<!doctype html>",'lang="en"',
            "@media(max-width:640px)",
            "prefers-reduced-motion", 'aria-label="Queue summary"',
            "<caption", "No agent execution",
            "Current", "UNKNOWN",
            "script-src 'none'", "connect-src 'none'",
        ):
            self.assertIn(item,page)
        for forbidden in ("<script", "<iframe", "<img",
                          "<form", "<a href=", "fetch(", "WebSocket("):
            self.assertNotIn(forbidden,page)
        self.assertIn("historical accounting",page)
        # The warning must explicitly DENY a fabricated zero exposure.
        self.assertIn("never infer zero exposure",page.lower())

    def test_untrusted_html_in_data_is_escaped_not_rendered(self):
        self.admitted()
        report=read_model(self.journal)
        report["items"][0]["evidence"] = '<script>alert("escape")</script>'
        page=render_private_html(report)
        self.assertNotIn('<script>alert("escape")</script>',page)
        self.assertIn("&lt;script&gt;",page)
        self.assertNotIn("alert(\"escape\")",page)

    def test_tampered_internal_ledger_is_hold_no_success_dashboard(self):
        self.admitted()
        self.journal.conn.execute("DROP TRIGGER f6_audit_no_update")
        self.journal.conn.execute(
            "UPDATE f6_audit SET entry_sha=? WHERE seq=1",("f"*64,))
        with self.assertRaisesRegex(Rejected,"HASH_CHAIN_MISMATCH"):
            read_model(self.journal)

    def test_absent_audit_receipt_cannot_fake_source_qualified_html(self):
        self.event(1)
        with self.assertRaisesRegex(Rejected,"NO_AUDIT_EVIDENCE"):
            read_model(self.journal)

    def test_untrusted_report_or_funding_values_rejected(self):
        self.admitted()
        base=read_model(self.journal)
        for update in (
            {"executor":"ENABLED"},
            {"newPaperOrdersAllowed":True},
            {"realOrdersAllowed":True},
            {"walletOrWoloAllowed":True},
            {"historicalSevenPositionMark":"0"},
            {"audit":{"status":"HOLD"}},
            {"schema":"injected.fake.v1"},
        ):
            with self.subTest(update=update),self.assertRaises(Rejected):
                render_private_html({**base,**update})

    def test_bounds_and_no_live_network_or_private_credentials(self):
        self.admitted()
        for value in (True,0,161,-1):
            with self.subTest(value=value),self.assertRaises(Rejected):
                read_model(self.journal,max_rows=value)
        source=(REPO/"tools/kingdom-foundry/foundry_dashboard.py").read_text()
        for forbidden in ("requests.", "urllib.request", "subprocess.",
                          "os.system", "Popen(", "socket.", "client.responses.",
                          "create_order(", "finance_sql", "Bearer "):
            self.assertNotIn(forbidden,source)
        self.assertIn("No HTTP route",source)

    def test_audit_read_model_does_not_create_schema_or_write_sql(self):
        self.admitted()
        before=self.journal.conn.execute("PRAGMA data_version").fetchone()
        report=read_model(self.journal)
        after=self.journal.conn.execute("PRAGMA data_version").fetchone()
        self.assertEqual(before,after)
        self.assertEqual(report["audit"]["entries"],1)
