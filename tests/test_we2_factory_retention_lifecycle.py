"""No-fixture-production, no-HEL1, synthetic tests for WE2 retention source."""
import datetime as dt
import hashlib
import hmac
import json
import os
from pathlib import Path
import sys
import tempfile
import time
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import we2_factory_retention_lifecycle as retention


class RetentionPolicyTests(unittest.TestCase):
    def setUp(self):
        self.now = dt.datetime.now(dt.timezone.utc)
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "rebuildable"
        self.root.mkdir(mode=0o700)
        self.key = bytes.fromhex("5a" * 32)
        self.a = "a" * 40
        self.b = "b" * 40
        self.c = "c" * 40
        self.d = "d" * 40

    def item(self, name="artifact-20261102-cache-01.part"):
        target = self.root / name
        target.write_bytes(b"synthetic disposable cache bytes")
        target.chmod(0o600)
        old = self.now.timestamp() - 10 * 86400
        os.utime(target, (old, old))
        s = target.stat()
        return {"name": name, "sha256": retention.sha(target.read_bytes()),
                "bytes": s.st_size, "inode": s.st_ino, "mtimeNs": s.st_mtime_ns}

    def permit(self, rows):
        p = {"schema": "aoe2war.we2.factory-disposable-cache.v1",
             "class": retention.DISPOSABLE,
             "issuedAt": (self.now - dt.timedelta(seconds=5)).isoformat().replace("+00:00", "Z"),
             "expiresAt": (self.now + dt.timedelta(seconds=125)).isoformat().replace("+00:00", "Z"),
             "items": rows,
             "financialAuthorized": False,
             "protectedArtifactAuthorized": False,
             "ownerApprovedCacheClass": True}
        digest = hmac.new(self.key, b"AOE2WAR_FACTORY_DISPOSABLE_V1\0"
                          + retention.canon(p), hashlib.sha256).hexdigest()
        return {"payload": p, "hmac_sha256": digest}

    def test_capacity_reserves_margin_not_just_factory_minimum(self):
        required = 6 * retention.GIB + 620000000
        self.assertEqual(retention.disk_admission(required, 620000000,
                         1400000000, False)["admission"], "HOLD")
        self.assertEqual(retention.disk_admission(required + retention.MARGIN,
                         620000000, 1400000000, False)["admission"], "PASS")
        self.assertLess(retention.disk_admission(6200000000, 0,
                        1400000000, True)["availableBytes"], 6 * retention.GIB)

    def test_exact_protected_states_never_auto_retired(self):
        rows = [{"sourceSha": x, "buildId": "build_12345678"}
                for x in (self.a, self.b, self.c, self.d)]
        classified = retention.classify(rows, active=self.a, rollback=self.b,
                                        emergency=self.c,
                                        explicitly_recoverable={self.d})
        self.assertEqual([x["retentionState"] for x in classified],
                         ["ACTIVE", "ROLLBACK", "EMERGENCY", "RETIRABLE"])
        self.assertTrue(all(x["automaticDeletePermitted"] is False
                            for x in classified))
        with self.assertRaises(retention.RetentionHold):
            retention.classify(rows, active=self.a, rollback=self.a,
                               emergency=self.c)

    def test_dry_run_then_exact_nonprotected_cleanup(self):
        row = self.item()
        p = self.permit([row])
        preview = retention.cleanup_only_disposable(p, self.key,
                    now=self.now, approved_dir=self.root)
        self.assertEqual(preview["state"], "PREVIEW")
        self.assertEqual(preview["deleted"], 0)
        self.assertTrue((self.root / row["name"]).is_file())
        done = retention.cleanup_only_disposable(p, self.key,
                    now=self.now, approved_dir=self.root, commit=True)
        self.assertEqual(done["deleted"], 1)
        self.assertEqual(done["protectedDeleted"], 0)
        self.assertFalse((self.root / row["name"]).exists())

    def test_unknown_scope_and_tamper_fail_closed(self):
        row = self.item()
        p = self.permit([row])
        p["payload"]["financialAuthorized"] = True
        with self.assertRaises(retention.RetentionHold):
            retention.cleanup_only_disposable(p, self.key, now=self.now,
                                              approved_dir=self.root)
        p = self.permit([row])
        p["payload"]["class"] = "root-release-runtime"
        with self.assertRaises(retention.RetentionHold):
            retention.cleanup_only_disposable(p, self.key, now=self.now,
                                              approved_dir=self.root)
        p = self.permit([row])
        p["hmac_sha256"] = "0" * 64
        with self.assertRaises(retention.RetentionHold):
            retention.cleanup_only_disposable(p, self.key, now=self.now,
                                              approved_dir=self.root)

    def test_stale_and_symlink_and_hardlink_denied(self):
        row = self.item()
        p = self.permit([row])
        p["payload"]["issuedAt"] = (self.now - dt.timedelta(hours=2)).isoformat().replace("+00:00","Z")
        with self.assertRaises(retention.RetentionHold):
            retention.cleanup_only_disposable(p, self.key, now=self.now,
                                              approved_dir=self.root)
        target = self.root / row["name"]
        link = self.root / "artifact-20261102-cache-02.part"
        os.link(target, link)
        p = self.permit([row])
        with self.assertRaises(retention.RetentionHold):
            retention.cleanup_only_disposable(p, self.key, now=self.now,
                                              approved_dir=self.root)
        link.unlink()
        target.unlink()
        link.symlink_to(Path(self.temp.name)/"other")
        p["payload"]["items"][0]["name"] = link.name
        with self.assertRaises(retention.RetentionHold):
            retention.cleanup_only_disposable(p, self.key, now=self.now,
                                              approved_dir=self.root)

    def test_protected_receipt_chain_t10_digests(self):
        folder = Path(self.temp.name) / "seals"
        folder.mkdir()
        stages = [{"event": "T7", "state": "pass"},
                  {"event": "T8", "state": "pass"},
                  {"event": "T9", "state": "pass"},
                  {"event": "T10", "state": "pass"}]
        ledger = b"synthetic-T10-events\n"
        summary = retention.canon({"sourceSha": self.a,
                                   "buildId": "build_12345678",
                                   "stages": stages})
        (folder / "release-events-v1.jsonl").write_bytes(ledger)
        (folder / "release-summary-v1.json").write_bytes(summary)
        body = {"schema": "aoe2war.product.release-seal.v1",
                "sourceSha": self.a, "buildId": "build_12345678",
                "financialAuthorized": False,
                "ledgerSha256": retention.sha(ledger),
                "summarySha256": retention.sha(summary),
                "lastEventHash": "d" * 64}
        (folder / "release-seal-v1.json").write_bytes(retention.canon(body))
        parsed = retention.seal_identity(folder, owner=None)
        self.assertEqual(parsed["sourceSha"], self.a)
        (folder / "release-summary-v1.json").write_bytes(summary + b"tampered")
        with self.assertRaises(retention.RetentionHold):
            retention.seal_identity(folder, owner=None)


if __name__ == "__main__":
    unittest.main()
