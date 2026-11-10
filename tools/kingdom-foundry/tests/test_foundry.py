import json
from pathlib import Path
import sys
import tempfile
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from foundry import connect, ingest, Rejected, safe_product_path

BASE = {
    "schema_version": "kingdom.foundry.event.v0",
    "event_id": "traffic-2026-11-09-rollup-gap-observation-001",
    "observed_utc": "2026-11-10T03:30:00Z",
    "source": "traffic-rollup", "lane": "PRODUCT_C", "kind": "traffic_gap",
    "severity": "warning", "source_sha": "a" * 40,
    "summary": "Canonical history gap", "evidence_ref": "receipt://event/abc",
}

class FoundryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.conn = connect(Path(self.tmp.name) / "foundry.db")
        self.addCleanup(self.conn.close)

    def event(self, **kw):
        return json.dumps(dict(BASE, **kw)).encode()

    def test_positive_queued(self):
        state, sha = ingest(self.conn, self.event())
        self.assertEqual(state, "QUEUED")
        self.assertEqual(len(sha), 64)
    def test_duplicate_is_not_second_task(self):
        ingest(self.conn, self.event())
        state, _ = ingest(self.conn, self.event())
        self.assertEqual(state, "DUPLICATE")
        self.assertEqual(self.conn.execute("SELECT count(*) FROM proposals").fetchone()[0], 1)
    def test_replay_changed_receipt_denied(self):
        ingest(self.conn, self.event())
        with self.assertRaises(Rejected):
            ingest(self.conn, self.event(summary="Different observation"))
    def test_financial_lane_denied(self):
        with self.assertRaises(Rejected): ingest(self.conn, self.event(lane="FINANCIAL"))
    def test_secret_denied(self):
        with self.assertRaises(Rejected): ingest(self.conn, self.event(summary="password=bad"))
    def test_extra_command_field_denied(self):
        obj = dict(BASE, command="rm -rf /")
        with self.assertRaises(Rejected): ingest(self.conn, json.dumps(obj).encode())
    def test_bad_evidence_uri_denied(self):
        with self.assertRaises(Rejected): ingest(self.conn, self.event(evidence_ref="file:///private/key"))
    def test_missing_sha_holds(self):
        state, _ = ingest(self.conn, self.event(source_sha="unknown"))
        self.assertEqual(state, "HOLD")
    def test_critical_holds(self):
        state, _ = ingest(self.conn, self.event(severity="critical"))
        self.assertEqual(state, "HOLD")
    def test_size_limit_denied(self):
        with self.assertRaises(Rejected): ingest(self.conn, b"{" + b"x" * 9000)
    def test_persist_on_reconnect(self):
        ingest(self.conn, self.event())
        self.conn.commit()
        conn2 = connect(Path(self.tmp.name) / "foundry.db")
        self.addCleanup(conn2.close)
        self.assertEqual(conn2.execute("SELECT count(*) FROM events").fetchone()[0], 1)
    def test_financial_db_path_denied(self):
        with self.assertRaises(Rejected):
            connect(Path(self.tmp.name) / "FINANCIAL" / "journal.db")
    def test_owner_key_path_denied(self):
        with self.assertRaises(Rejected):
            safe_product_path(Path(self.tmp.name) / ".wolo-owner-authority" / "private.json")
    def test_reject_raw_token(self):
        with self.assertRaises(Rejected): ingest(self.conn, self.event(summary="bearer abc"))

if __name__ == "__main__": unittest.main()
