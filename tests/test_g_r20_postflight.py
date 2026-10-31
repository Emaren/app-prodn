"""G R20 tests: synthetic negative fixtures are NOT native release evidence."""
import copy, importlib.util, pathlib, subprocess, sys, tempfile, unittest

SCRIPT=pathlib.Path(__file__).resolve().parents[1]/"scripts/aoe2_g_r20_postflight.py"
spec=importlib.util.spec_from_file_location("g_r20_postflight",SCRIPT)
g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)

class R20PostflightTests(unittest.TestCase):
    @staticmethod
    def fixture():
        attempt="a"*64;old="33e0f42b3d34d324b6cbab6c0347d4f5aff6fb8a"
        before={"phase":"PRE_ACTIVATE","attempt_id":attempt,"observed_at":"2026-10-31T01:00:00Z",
                "finance":{"protected":{"8092":{"pid":11},"8093":{"pid":22}},
                           "exposure":{"balances_sha256":"B"}},
                "mount":{"source_sha":old,"active_build_id":"old-next-valid"}}
        after={"phase":"POST_ACTIVATE","attempt_id":attempt,"observed_at":"2026-10-31T01:05:00Z",
               "finance":{"protected":copy.deepcopy(before["finance"]["protected"]),
                          "exposure":copy.deepcopy(before["finance"]["exposure"]),
                          "financial_movement_authorized":False,"wolo_finance_p1":"HOLD"},
               "rollback":{"preserved":True,"previous_source_sha":old,"active_build_id":"old-next-valid"},
               "mount":{"source_sha":g.CANDIDATE,"active_build_id":"new-next-valid"},
               "receipt_provenance":{"signed_source_receipts_verified":True,
                                     "original_root_measurements":True}}
        after["mount"]["rollback_sha256"]=g.digest(g.canonical(after["rollback"]))
        stage={"stage_receipt_sha256":"f"*64,
               "receipt":{"staged_build_id":"new-next-valid","release_sha":g.CANDIDATE}}
        approved={"candidate_sha":g.CANDIDATE,"attempt_id":attempt,
                  "stage_receipt_sha256":"f"*64}
        completed={"status":"ROOT_ACTIVATION_NATIVE_VERIFIED","candidate_sha":g.CANDIDATE,
                   "attempt_id":attempt,"policy":g.POLICY,"financial_release_authorized":False,
                   "build_id":"new-next-valid","stage_receipt_sha256":"f"*64,
                   "post_activation_native_sha256":g.digest(g.canonical(after)),
                   "rollback_available":True,
                   "finance_fingerprint_sha256":g.digest(g.canonical(after["finance"]["protected"]))}
        return [approved,completed,stage,before,after,attempt]

    def test_structural_lineage_good_fixture_not_production(self):
        self.assertEqual(g.verify_lineage(*self.fixture()),"new-next-valid")

    def test_fail_closed_on_mutations_to_stage_finance_rollback_and_provenance(self):
        mutations=[
          lambda a:a[0].__setitem__("candidate_sha","b"*40),
          lambda a:a[1].__setitem__("status","UNKNOWN"),
          lambda a:a[1].__setitem__("financial_release_authorized",True),
          lambda a:a[1].__setitem__("post_activation_native_sha256","0"*64),
          lambda a:a[1].__setitem__("build_id","wrong-build"),
          lambda a:a[2].__setitem__("stage_receipt_sha256","d"*64),
          lambda a:a[3]["finance"]["exposure"].__setitem__("balances_sha256","changed"),
          lambda a:a[4]["finance"].__setitem__("wolo_finance_p1","GO"),
          lambda a:a[4]["rollback"].__setitem__("preserved",False),
          lambda a:a[4]["rollback"].__setitem__("previous_source_sha","b"*40),
          lambda a:a[4]["receipt_provenance"].__setitem__("signed_source_receipts_verified",False),
          lambda a:a[4]["mount"].__setitem__("source_sha","a"*40),
          lambda a:a[4].__setitem__("observed_at","2026-10-31T00:00:00Z"),
        ]
        for i,edit in enumerate(mutations):
            with self.subTest(i=i):
                f=self.fixture();edit(f)
                with self.assertRaises(g.Hold):g.verify_lineage(*f)

    def test_real_openssl_ed25519_and_rsa_public_verification(self):
        with tempfile.TemporaryDirectory() as d:
            root=pathlib.Path(d);message=root/"message";message.write_bytes(b"G R20 CI TEST ONLY")
            private=root/"ed25519.key";public=root/"ed25519.pub"
            subprocess.run(["openssl","genpkey","-algorithm","Ed25519","-out",str(private)],
                           capture_output=True,check=True)
            subprocess.run(["openssl","pkey","-in",str(private),"-pubout","-out",str(public)],
                           capture_output=True,check=True)
            sig=subprocess.run(["openssl","pkeyutl","-sign","-inkey",str(private),
                                "-rawin","-in",str(message)],capture_output=True,check=True).stdout
            g.verify_openssl(public,message.read_bytes(),sig,True)
            with self.assertRaises(g.Hold):
                g.verify_openssl(public,b"altered",sig,True)
            private=root/"rsa.key";public=root/"rsa.pub"
            subprocess.run(["openssl","genpkey","-algorithm","RSA",
                            "-pkeyopt","rsa_keygen_bits:2048","-out",str(private)],
                           capture_output=True,check=True)
            subprocess.run(["openssl","pkey","-in",str(private),"-pubout","-out",str(public)],
                           capture_output=True,check=True)
            sig=subprocess.run(["openssl","dgst","-sha256","-sign",str(private)],
                               input=message.read_bytes(),capture_output=True,check=True).stdout
            g.verify_openssl(public,message.read_bytes(),sig)
            with self.assertRaises(g.Hold):
                g.verify_openssl(public,b"altered",sig)

    def test_untrusted_source_and_missing_root_journal_never_claim_success(self):
        r=subprocess.run([sys.executable,str(SCRIPT),"--read-only-post-activate",
            "--owner-envelope","/nonexistent/G_R20_OWNER_RSA_PACKET.json"],
            capture_output=True,text=True,timeout=8)
        self.assertEqual(r.returncode,2)
        self.assertIn("G_R20_POSTFLIGHT_HOLD:",r.stderr)
        code=SCRIPT.read_text()
        self.assertIn('UNREVIEWED_ROOT_EXECUTABLE_PATH',code)
        self.assertIn('production_browser_375_768_1440":"NOT_RUN"',code)
        self.assertIn('G_rollback_drill_performed":False',code)
        self.assertIn('method="GET"',code)
        self.assertNotIn('method="POST"',code)
        self.assertEqual(g.CANDIDATE,"0cee3c836c4b0760478280c145e02e81e470ce0e")
        self.assertEqual(g.CONTROLLER,"18052e01a191b15525664c1a058de80d7a8bc150")

    def test_untrusted_json_duplicates_and_nonfinite_rejected(self):
        with self.assertRaises(g.Hold):g.parse(b'{"a":1,"a":2}')
        with self.assertRaises(g.Hold):g.parse(b'{"x":NaN}')

if __name__=="__main__":unittest.main()
