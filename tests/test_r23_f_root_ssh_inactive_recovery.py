"""R23 F trust-recovery proposal: crypto/source/guard regression tests. No HEL1 mutation."""
from __future__ import annotations
import base64, importlib.util, json, os, pathlib, subprocess, sys, tempfile
import unittest
from datetime import datetime, timedelta, timezone

ROOT=pathlib.Path(__file__).resolve().parents[1]
SOURCE=ROOT/"deploy/solo-native-audit/r23_f_root_ssh_inactive_recovery_v1.py"
spec=importlib.util.spec_from_file_location("r23_recovery",SOURCE)
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

def envelope(private,public,operation="ENROLL_INACTIVE",target="",age=0,ttl=4):
    now=datetime.now(timezone.utc)+timedelta(minutes=age)
    iso=lambda t:t.isoformat(timespec="seconds").replace("+00:00","Z")
    body={"operation":operation,"host":m.HOST,"old_rsa_spki":m.OLD,
          "new_rsa_spki":m.public_spki(public),"nonce":"a"*32,
          "issued_at":iso(now),"expires_at":iso(now+timedelta(minutes=ttl)),
          "target_audit_id":target}
    with tempfile.TemporaryDirectory() as d:
        p=pathlib.Path(d)
        (p/"msg").write_bytes(m.DOM+m.canon(body))
        sig=subprocess.run(["openssl","dgst","-sha256","-sign",str(private),
                            str(p/"msg")],capture_output=True,check=True).stdout
    return {"schema":m.SCHEMA,"payload":body,
            "new_public_base64":base64.b64encode(public).decode(),
            "signature_base64":base64.b64encode(sig).decode()}

class R23FTrustRecovery(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.td=tempfile.TemporaryDirectory()
        cls.p=pathlib.Path(cls.td.name)
        cls.key=cls.p/"synthetic-key.pem"
        cls.pub=cls.p/"synthetic-public.pem"
        subprocess.run(["openssl","genpkey","-algorithm","RSA",
                        "-pkeyopt","rsa_keygen_bits:3072","-out",str(cls.key)],
                       capture_output=True,check=True)
        subprocess.run(["openssl","pkey","-in",str(cls.key),
                        "-pubout","-out",str(cls.pub)],capture_output=True,check=True)
        cls.pem=cls.pub.read_bytes()
    @classmethod
    def tearDownClass(cls):
        cls.td.cleanup()
    def test_compiles(self):
        compile(SOURCE.read_bytes(),str(SOURCE),"exec")
    def test_separate_new_authority_from_frozen_original(self):
        self.assertNotEqual(m.public_spki(self.pem),m.OLD)
        self.assertIn("solo-owner-recovery-v1",str(m.ROOT_NEW))
        self.assertIn("website-owner-v4/owner.pem",str(m.OLD_PUB))
        self.assertIn("root-helper-install-v2-approval.json",str(m.OLD_APPROVAL))
    def test_genuine_signature_enroll(self):
        e=envelope(self.key,self.pem)
        b,p,s=m.validate_envelope(m.canon(e))
        self.assertEqual(s,m.public_spki(self.pem))
        self.assertEqual(b["operation"],"ENROLL_INACTIVE")
    def test_genuine_signature_abort_separate_domain(self):
        e=envelope(self.key,self.pem,"ABORT_INACTIVE","r23-v1-"+"f"*32)
        b,p,s=m.validate_envelope(m.canon(e),"ABORT_INACTIVE")
        self.assertEqual(b["target_audit_id"],"r23-v1-"+"f"*32)
        with self.assertRaises(m.Hold):
            m.validate_envelope(m.canon(e),"ENROLL_INACTIVE")
    def test_tampered_after_signing_holds(self):
        e=envelope(self.key,self.pem)
        e["payload"]["old_rsa_spki"]="0"*64
        with self.assertRaises(m.Hold):
            m.validate_envelope(m.canon(e))
    def test_changed_new_identity_after_signing_holds(self):
        e=envelope(self.key,self.pem)
        e["payload"]["new_rsa_spki"]="1"*64
        with self.assertRaises(m.Hold):
            m.validate_envelope(m.canon(e))
    def test_expired_holds(self):
        e=envelope(self.key,self.pem,age=-8,ttl=4)
        with self.assertRaises(m.Hold):
            m.validate_envelope(m.canon(e))
    def test_over_five_minutes_holds(self):
        e=envelope(self.key,self.pem,ttl=6)
        with self.assertRaises(m.Hold):
            m.validate_envelope(m.canon(e))
    def test_wrong_host_holds(self):
        e=envelope(self.key,self.pem)
        e["payload"]["host"]="wrong-host"
        with self.assertRaises(m.Hold):
            m.validate_envelope(m.canon(e))
    def test_json_duplicate_fields_holds(self):
        with self.assertRaises(m.Hold):
            m.parse(b'{"schema":"a","schema":"b"}')
    def test_actual_nonroot_cannot_begin_hel1_mutation(self):
        if os.getuid()==0 and sys.platform.startswith("linux") and __import__("socket").gethostname()==m.HOST:
            self.skipTest("real HEL1 root must not execute tests")
        with self.assertRaises(m.Hold):
            m.original_shape()
    def test_frozen_original_never_written_or_rotated_in_source(self):
        src=SOURCE.read_text()
        self.assertNotIn('os.replace(OLD_PUB',src)
        self.assertNotIn('write_once(OLD_PUB',src)
        self.assertNotIn('os.chmod(LOCK',src)
        self.assertNotIn('os.chown(LOCK',src)
        self.assertIn('"INACTIVE_ONLY"',src)
        self.assertIn("INACTIVE_RECOVERY_ABORTED_V1",src)
    def test_strict_root_ssh_no_passwords(self):
        src=SOURCE.read_text()
        self.assertIn('StrictHostKeyChecking=yes',src)
        self.assertIn('BatchMode=yes',src)
        self.assertIn('NumberOfPasswordPrompts=0',src)
        self.assertIn('OWNER_REVIEWED_SOURCE_SHA256_DRIFT',src)
    def test_readonly_source_default_no_enroll_implicit(self):
        proc=subprocess.run([sys.executable,str(SOURCE)],capture_output=True,text=True)
        self.assertNotEqual(proc.returncode,0)
        self.assertNotIn("PASS: R23_INACTIVE_PUBLIC_TRUST_ENROLLED",proc.stdout)

if __name__=="__main__":unittest.main()
