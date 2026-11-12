"""Source-only HEL1 B root/signing review: ZERO real key/install/source changes."""
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import unittest

ROOT=Path(__file__).resolve().parents[1]
SIGNER=ROOT/"scripts/release/r25_b_hel1_m1_owner_signer_ENROLL_REVIEW_ONLY.py"
RUNNER=ROOT/"scripts/release/r25_b_hel1_source_install_entrypoint_REVIEW_ONLY.py"

def load(source,name):
    spec=importlib.util.spec_from_file_location(name,source)
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module
s=load(SIGNER,"b_hel1_signer_review")
w=load(RUNNER,"b_hel1_root_wrapper_review")

def review_body():
    pub="a"*64
    obj={
        "decision":"CENTRAL_SOURCE_INSTALL_ONLY_APPROVED",
        "packet_sha256":"1"*64,
        "nonce_sha256":"2"*64,
        "executor_sha256":"3"*64,
        "root_entrypoint_sha256":"4"*64,
        "reviewed_source_head_sha256":"5"*40,
        "root_modules_sha256":{x:"6"*64 for x in s.ROOT_MODULES},
        "observed_old_preimage":{
            "v22":"c6e633538fc17dad6fe887452516cb2ba1095855a0aab6f4bdda47f5985f6edc",
            "controller":None,"guard":None,
        },
        "central_signer_public_sha256":pub,
        "owner_receipt_sha256":"7"*64,
        "stage0003_sha256":"8"*64,
        "boot_id":w.KNOWN_BOOT,
        "fence_sha256":"9"*64,
        "no_public_activation":True,
        "no_financial_authority":True,
    }
    canonical=lambda o:s.CENTRAL_PREFIX.encode()+json.dumps(
        o,sort_keys=True,separators=(",",":"),ensure_ascii=False).encode()
    return obj,pub,canonical

class HEL1SeparateSourceReview(unittest.TestCase):
    def test_signer_and_root_entrypoint_are_not_usable_from_B_worktree(self):
        for source,args in ((SIGNER,["enroll-public-only"]),
                            (SIGNER,["sign-exact-central-comment"]),
                            (RUNNER,["source-install"]),
                            (RUNNER,["recover-exact-original"])):
            with self.subTest(source=source.name,args=args):
                cp=subprocess.run([sys.executable,"-B",str(source),*args],
                                  capture_output=True,text=True,timeout=5)
                self.assertEqual(cp.returncode,3)
                self.assertIn("HOLD:",cp.stdout)
                self.assertNotIn("PRIVATE KEY",cp.stdout)

    def test_signer_is_distinct_from_C_m1_key_and_requires_trusted_tty(self):
        self.assertEqual(s.HEL1_PRODUCTION_PUBLIC_PEM_SHA256,
                         "e9c5b0375d8457b69a3e69e12a7d190ed55ad754c89384348cb0feebeb41512f")
        self.assertEqual(str(s.ROOT),"/private/var/root/.aoe2war-b-hel1-prod-sign-v1")
        self.assertNotIn(".aoe2war-product-runner-control-v1",str(s.ROOT))
        with self.assertRaisesRegex(ValueError,"PHYSICAL_OWNER_ROOT_TTY"):
            s.safe_root_action(["enroll-public-only"])

    def test_root_installer_is_only_fixed_transaction_and_inverse(self):
        self.assertIn("r25_b_v22_source_install_coordinator_REVIEW_ONLY",RUNNER.read_text())
        self.assertIn("r25_b_v22_linux_host_adapter_REVIEW_ONLY",RUNNER.read_text())
        self.assertNotIn("systemctl restart",RUNNER.read_text())
        self.assertNotIn("pg_dump",RUNNER.read_text())
        self.assertEqual(w.HOST,"ubuntu-4gb-hel1-11")
        with self.assertRaisesRegex(ValueError,"EXACT_SOURCE_INSTALL_OPERATION"):
            w.admitted_root_only(["finance"])

    def test_valid_synthetic_comment_schema_without_real_signing(self):
        obj,pub,canonical=review_body()
        raw=canonical(obj)
        self.assertEqual(s.validate_signable_comment(raw,pub),hashlib.sha256(raw).hexdigest())

    def test_approval_requires_exact_absent_host_preimage(self):
        obj,pub,canonical=review_body()
        for label,val in (("controller","0"*64),("guard","f"*64)):
            with self.subTest(label=label):
                candidate=json.loads(json.dumps(obj))
                candidate["observed_old_preimage"][label]=val
                with self.assertRaisesRegex(ValueError,"SCOPE_MISMATCH"):
                    s.validate_signable_comment(canonical(candidate),pub)

    def test_finance_public_activation_cross_signing_and_unreviewed_modules_refused(self):
        obj,pub,canonical=review_body()
        for delta in (
            {"no_financial_authority":False},
            {"no_public_activation":False},
            {"central_signer_public_sha256":"b"*64},
            {"decision":"ENABLE_FINANCIAL_SETTLEMENT"},
            {"root_modules_sha256":{"unreviewed_root.py":"c"*64}},
        ):
            candidate={**obj,**delta}
            with self.subTest(delta=delta):
                with self.assertRaisesRegex(ValueError,"SCOPE_MISMATCH"):
                    s.validate_signable_comment(canonical(candidate),pub)

    def test_duplicate_json_keys_or_noncanonical_payload_denied(self):
        obj,pub,canonical=review_body()
        raw=canonical(obj)
        with self.assertRaisesRegex(ValueError,"DUPLICATE_APPROVAL"):
            s.validate_signable_comment(raw[:-1]+b',"no_financial_authority":true}',pub)
        with self.assertRaisesRegex(ValueError,"SCOPE_MISMATCH"):
            s.validate_signable_comment(canonical({**obj,"extra":"unreviewed"}),pub)
        with self.assertRaisesRegex(ValueError,"SCOPE_MISMATCH"):
            s.validate_signable_comment(canonical({**obj,"boot_id":"changed"}),pub)
        with self.assertRaisesRegex(ValueError,"UNKNOWN_APPROVAL_MESSAGE"):
            s.validate_signable_comment(b"approve everything",pub)

    def test_public_pin_matches_separate_hel1_verifier_not_C_key(self):
        verifier=(ROOT/"scripts/release/r25_b_v22_central_signature_REVIEW_ONLY.py").read_text()
        pin=s.HEL1_PRODUCTION_PUBLIC_PEM_SHA256
        self.assertIn('CENTRAL_OFFLINE_PUBLIC_KEY_SHA256="'+pin+'"',verifier)
        self.assertNotEqual(pin,"567d4d198159c9d3021dcad7d074eb43b53d8c40039b769f1bb8d27d0e4a5968")
        self.assertNotIn('PRIVATE KEY-----\n',verifier)
    def test_review_packet_matches_exact_seven_source_byte_hashes(self):
        doc=(ROOT/"docs/release/SESSION_B_HEL1_EXACT_ABSENT_PREIMAGE_SIGNER_APPROVAL_20261112.md").read_text()
        for name in (
            "r25_b_v22_linux_host_adapter_REVIEW_ONLY.py",
            "r25_b_v22_source_install_coordinator_REVIEW_ONLY.py",
            "r25_v22_root_install_admission_REVIEW_ONLY.py",
            "r25_b_v22_central_signature_REVIEW_ONLY.py",
            "r25_v22_three_source_transaction_REVIEW_ONLY.py",
            "r25_b_hel1_source_install_entrypoint_REVIEW_ONLY.py",
            "r25_b_hel1_m1_owner_signer_ENROLL_REVIEW_ONLY.py",
        ):
            raw=(ROOT/"scripts/release"/name).read_bytes()
            digest=hashlib.sha256(raw).hexdigest()
            self.assertIn(digest,doc,name)
        self.assertIn("controller",doc)
        self.assertIn("ABSENT",doc)
        self.assertIn("NOT a root",doc)

    def test_missing_source_sha_or_invalid_fingerprint_denied(self):
        obj,pub,canonical=review_body()
        with self.assertRaisesRegex(ValueError,"OWNER_PUBLIC_FINGERPRINT_FORMAT"):
            s.validate_signable_comment(canonical(obj),"not-a-hash")
        candidate={**obj,"reviewed_source_head_sha256":"wrong"}
        with self.assertRaisesRegex(ValueError,"SOURCE_SHA_FORMAT"):
            s.validate_signable_comment(canonical(candidate),pub)
        candidate={**obj,"root_modules_sha256":dict.fromkeys(s.ROOT_MODULES,"bad")}
        with self.assertRaisesRegex(ValueError,"SOURCE_SHA_FORMAT"):
            s.validate_signable_comment(canonical(candidate),pub)

if __name__=="__main__":
    unittest.main()
