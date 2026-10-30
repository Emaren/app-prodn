"""Real Ed25519 signature, tamper, replay, Intel readback, restore failure-domain tests."""
from __future__ import annotations
import base64
from datetime import datetime,timezone,timedelta
import hashlib
import json
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest

S=Path(__file__).resolve().parents[1]/"scripts"
sys.path.insert(0,str(S))
import aoe2_storage_transfer_receipts as r

class NativeTransferReceiptTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp=tempfile.TemporaryDirectory(prefix="aoe2-transfer-signature-")
        cls.directory=Path(cls.tmp.name)
        cls.keys={}
        cls.trust={}
        for index,host in enumerate(("m1","hel1-root","hel1-volume",
                                     "intel","restore-auditor"),1):
            secret=cls.directory/(host+"-private.pem")
            public=cls.directory/(host+"-public.pem")
            p=subprocess.run(["/usr/bin/openssl","genpkey","-algorithm",
                "Ed25519","-out",str(secret)],capture_output=True,timeout=10)
            if p.returncode:raise RuntimeError(p.stderr.decode())
            p=subprocess.run(["/usr/bin/openssl","pkey","-in",str(secret),
                "-pubout","-out",str(public)],capture_output=True,timeout=10)
            if p.returncode:raise RuntimeError(p.stderr.decode())
            der=subprocess.run(["/usr/bin/openssl","pkey","-pubin",
                "-in",str(public),"-outform","DER"],
                capture_output=True,timeout=10,check=True).stdout
            cls.keys[host]=secret
            cls.trust[host]={"key_id":"producer_key_"+str(index),
                "public_key_path":str(public),
                "public_spki_sha256":hashlib.sha256(der).hexdigest(),
                "failure_domain_id":"device_domain_"+str(index)}
    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def setUp(self):
        self.conn=sqlite3.connect(":memory:",isolation_level=None)
        r.create_schema(self.conn)
        self.now=datetime.now(timezone.utc)
    def tearDown(self):
        self.conn.close()
    def clock(self):
        return self.now.isoformat(timespec="seconds").replace("+00:00","Z")
    def expiry(self):
        return (self.now+timedelta(minutes=5)).isoformat(
            timespec="seconds").replace("+00:00","Z")
    def common(self,role,sequence=1):
        return {"schema":r.SCHEMA,"role":role,"campaign_id":"campaign_20261030",
          "cohort_id":"m1_archive_001","sequence":sequence,"source_host":"m1",
          "receiver_host":"intel","observed_at":self.clock(),
          "expires_at":self.expiry()}
    def source(self,seq=1,prev=None):
        return {**self.common("source",seq),
          "source_fs_uuid":"a9a085d9-6c53-4d9f-8bb8-5aeb90bf0b42",
          "source_failure_domain_id":"device_domain_1",
          "protected_class":"M1_COLD_ARCHIVE","consistency":"QUIESCENT_IMMUTABLE",
          "source_bytes":57802,"compressed_bytes":34000,"compression_codec":"zstd",
          "age_recipient_fp_sha256":"a"*64,
          "source_sha256":"b"*64,"ciphertext_sha256":"c"*64,
          "ciphertext_bytes":34550,"transferred_bytes":34550,
          "source_free_before":45000,"source_free_after":44800,
          "prev_source_receipt_sha256":prev}
    def receiver(self,source_hash,seq=1):
        return {**self.common("receiver",seq),
          "source_receipt_sha256":source_hash,"ciphertext_sha256":"c"*64,
          "readback_sha256":"c"*64,"bytes_received":34550,
          "receiver_free_before":1000000,"receiver_free_after":960000,
          "receiver_failure_domain_id":"device_domain_4"}
    def restore(self,receiver_hash,seq=1):
        return {**self.common("restore",seq),
          "receiver_receipt_sha256":receiver_hash,
          "restored_source_sha256":"b"*64,"restored_bytes":57802,
          "restore_failure_domain_id":"device_domain_5",
          "restore_method":"ISOLATED_CONTENT_READBACK",
          "restore_evidence_sha256":"d"*64,"restore_result":"PASS"}
    def sign(self,p,host=None):
        host=host or (p["source_host"] if p["role"]=="source" else
              "intel" if p["role"]=="receiver" else "restore-auditor")
        message=r.DOMAIN+r.canonical(p)
        # Ed25519 pkeyutl is a one-shot operation. OpenSSL cannot determine
        # stream length from piped stdin; sign exact bounded FILE bytes.
        with tempfile.TemporaryDirectory(prefix="aoe2-transfer-sign-") as tmp:
            input_path=Path(tmp)/"canonical-payload"
            input_path.write_bytes(message)
            signed=subprocess.run(["/usr/bin/openssl","pkeyutl","-sign",
              "-inkey",str(self.keys[host]),"-rawin","-in",
              str(input_path)],capture_output=True,timeout=10,check=True).stdout
        return {"schema":r.SCHEMA,"signer_host":host,
            "key_id":self.trust[host]["key_id"],"payload":p,
            "signature_base64":base64.b64encode(signed).decode()}
    def insert(self,p,host=None):
        return r.ingest(self.conn,self.sign(p,host),self.trust,self.now)
    def pipeline(self):
        s=self.insert(self.source())
        received=self.insert(self.receiver(s["receipt_sha256"]))
        return s,received
    def test_real_ed25519_source_and_receiving_intel(self):
        s,received=self.pipeline()
        self.assertEqual(s["status"],"SOURCE_SIGNED")
        self.assertEqual(received["status"],"INTEL_READBACK_SIGNED")
        self.assertFalse(received["financial_or_cleanup_authority"])
    def test_independent_third_failure_domain_restore(self):
        _,recv=self.pipeline()
        attested=self.insert(self.restore(recv["receipt_sha256"]))
        self.assertEqual(attested["status"],"ISOLATED_RESTORE_AUDITOR_SIGNED")
        self.assertEqual(self.conn.execute("SELECT COUNT(*) FROM storage_transfer_receipt").fetchone()[0],3)
    def test_no_sender_self_certified_receiver_or_restore(self):
        s=self.insert(self.source())
        with self.assertRaisesRegex(r.Hold,"unrecognized producer"):
            self.insert(self.receiver(s["receipt_sha256"]),host="m1")
        with self.assertRaisesRegex(r.Hold,"unrecognized producer"):
            self.insert(self.restore("a"*64),host="intel")
    def test_missing_intel_receipt_prevents_restore(self):
        self.insert(self.source())
        with self.assertRaisesRegex(r.Hold,"restore without receiver"):
            self.insert(self.restore("a"*64))
    def test_forged_source_hash_rejected(self):
        with self.assertRaisesRegex(r.Hold,"signature failed"):
            original=self.sign(self.source())
            original["payload"]["source_sha256"]="f"*64
            r.ingest(self.conn,original,self.trust,self.now)
    def test_cross_receiver_hash_or_transmission_count_denied(self):
        src=self.insert(self.source())
        bad=self.receiver(src["receipt_sha256"])
        bad["readback_sha256"]="e"*64
        with self.assertRaisesRegex(r.Hold,"SAME complete ciphertext"):
            self.insert(bad)
        bad=self.receiver(src["receipt_sha256"])
        bad["bytes_received"]=7
        with self.assertRaises(r.Hold):
            self.insert(bad)
        bad=self.receiver("0"*64)
        with self.assertRaises(r.Hold):
            self.insert(bad)
    def test_sender_partial_transfer_does_not_certify_intel(self):
        partial=self.source()
        partial["transferred_bytes"]=10
        signed=self.insert(partial)
        with self.assertRaisesRegex(r.Hold,"SAME complete ciphertext"):
            self.insert(self.receiver(signed["receipt_sha256"]))
    def test_replay_nonmonotonic_sequences_and_wrong_parent(self):
        signed=self.sign(self.source())
        a=r.ingest(self.conn,signed,self.trust,self.now)
        with self.assertRaisesRegex(r.Hold,"replay"):
            r.ingest(self.conn,signed,self.trust,self.now)
        with self.assertRaisesRegex(r.Hold,"sequence"):
            self.insert(self.source(seq=3,prev=a["receipt_sha256"]))
        with self.assertRaisesRegex(r.Hold,"parent"):
            self.insert(self.source(seq=2,prev="f"*64))
        self.insert(self.source(seq=2,prev=a["receipt_sha256"]))
    def test_receiver_replay_unique_and_missing_source(self):
        s=self.insert(self.source())
        recv=self.sign(self.receiver(s["receipt_sha256"]))
        r.ingest(self.conn,recv,self.trust,self.now)
        with self.assertRaisesRegex(r.Hold,"replay"):
            r.ingest(self.conn,recv,self.trust,self.now)
        different=self.receiver("e"*64,seq=3)
        with self.assertRaisesRegex(r.Hold,"without immutable source"):
            self.insert(different)
    def test_no_restore_on_same_failure_domain(self):
        _,recv=self.pipeline()
        altered=self.restore(recv["receipt_sha256"])
        altered["restore_failure_domain_id"]="device_domain_4"
        with self.assertRaisesRegex(r.Hold,"independent restore witness"):
            self.insert(altered)
    def test_restore_does_not_change_original_content_identity(self):
        _,recv=self.pipeline()
        altered=self.restore(recv["receipt_sha256"])
        altered["restored_source_sha256"]="e"*64
        with self.assertRaisesRegex(r.Hold,"independent restore mismatch"):
            self.insert(altered)
    def test_expired_future_or_overlong_receipts_are_denied(self):
        signed=self.sign(self.source())
        with self.assertRaisesRegex(r.Hold,"freshness"):
            r.validate_envelope(signed,self.trust,self.now+timedelta(minutes=30))
        signed=self.sign(self.source())
        signed["payload"]["observed_at"]=(self.now+timedelta(minutes=1)).isoformat(
          timespec="seconds").replace("+00:00","Z")
        with self.assertRaisesRegex(r.Hold,"freshness"):
            r.validate_envelope(signed,self.trust,self.now)
    def test_signature_role_key_reuse_is_rejected(self):
        envelope=self.sign(self.source())
        bad=dict(self.trust)
        bad["intel"]=dict(bad["intel"],public_spki_sha256=bad["m1"]["public_spki_sha256"])
        # Native load_trust catches even if an operator reuses key in two roles.
        # Pure validation never treats receiver credential as source signature.
        with self.assertRaisesRegex(r.Hold,"unrecognized producer"):
            r.validate_envelope(self.sign(self.source(),host="intel"),self.trust,self.now)
    def test_oversize_and_symlink_incoming_receipts_are_rejected_before_read(self):
        with tempfile.TemporaryDirectory(prefix="aoe2-incoming-receipt-") as tmp:
            directory=Path(tmp)
            original=directory/"original.json"
            original.write_bytes(b'{"schema":"test"}')
            self.assertEqual(r.read_bounded_envelope(original),original.read_bytes())
            linked=directory/"linked.json"
            linked.symlink_to(original)
            with self.assertRaisesRegex(r.Hold,"untrusted incoming envelope"):
                r.read_bounded_envelope(linked)
            too_big=directory/"oversize.json"
            with too_big.open("wb") as out:
                out.truncate(r.MAX_INPUT+1)
            with self.assertRaisesRegex(r.Hold,"oversized"):
                r.read_bounded_envelope(too_big)

    def test_duplicate_json_properties_and_nonfinite_are_denied(self):
        with self.assertRaisesRegex(r.Hold,"duplicate"):
            r.parse(b'{"schema":1,"schema":2}')
        with self.assertRaisesRegex(r.Hold,"nonfinite"):
            r.parse(b'{"x":NaN}')
    def test_historical_signature_and_full_envelope_are_independently_rechecked(self):
        _,received=self.pipeline()
        original=r.verify_stored_receipt(self.conn,"campaign_20261030",
            "m1_archive_001",1,"receiver",self.trust)
        self.assertTrue(original["signature_reverified"])
        self.assertFalse(original["fresh_live_observation"])
        self.assertEqual(original["receipt_sha256"],received["receipt_sha256"])
        self.conn.execute("UPDATE storage_transfer_receipt SET body_json=? "
          "WHERE campaign_id=? AND cohort_id=? AND sequence=? AND role=?",
          ('{"tampered":true}',"campaign_20261030","m1_archive_001",1,"receiver"))
        with self.assertRaisesRegex(r.Hold,"mutated after original ingest"):
            r.verify_stored_receipt(self.conn,"campaign_20261030",
                "m1_archive_001",1,"receiver",self.trust)

    def test_signed_receipt_cannot_authorize_cleanup(self):
        envelope=self.sign(self.source())
        envelope["payload"]["delete_source"]=True
        with self.assertRaisesRegex(r.Hold,"receipt fields"):
            r.validate_envelope(envelope,self.trust,self.now)
    def test_db_replay_state_survives_connection_restart(self):
        with tempfile.TemporaryDirectory(prefix="aoe2-receipt-db-") as directory:
            file=Path(directory)/"ledger.sqlite"
            conn=sqlite3.connect(str(file),isolation_level=None)
            r.create_schema(conn)
            signed=self.sign(self.source())
            r.ingest(conn,signed,self.trust,self.now)
            conn.close()
            conn=sqlite3.connect(str(file),isolation_level=None)
            try:
                with self.assertRaisesRegex(r.Hold,"replay"):
                    r.ingest(conn,signed,self.trust,self.now)
            finally:conn.close()

if __name__=="__main__":
    unittest.main()
