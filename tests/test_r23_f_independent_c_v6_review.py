"""F independent, source-specific review of C's R23 v6 new public trust candidate."""
import ast
import importlib.util
import pathlib
import unittest

ROOT=pathlib.Path(__file__).resolve().parents[1]
ROOT_SCRIPT=ROOT/"scripts/aoe2_owner_rootssh_trust_recovery_v6.py"
MAC=ROOT/"scripts/aoe2_owner_rootssh_trust_recovery_v6_mac.py"
ORIGINAL_C="318bd18a6fef630ea4ea32c2140199975cb3d834"

def load(path):
    spec=importlib.util.spec_from_file_location(path.stem,path)
    obj=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(obj)
    return obj

class IndependentFReviewV6(unittest.TestCase):
    def test_exact_original_c_source_approved_not_same_f_commit(self):
        root=load(ROOT_SCRIPT)
        self.assertEqual(root.F_REVIEWED_C_SOURCE_SHA,ORIGINAL_C)
        self.assertEqual(root.ORIGINAL_CONTROLLER,
                         "18052e01a191b15525664c1a058de80d7a8bc150")
        self.assertEqual(root.ORIGINAL_WEBSITE,
                         "0cee3c836c4b0760478280c145e02e81e470ce0e")
    def test_explicit_mac_source_approval_gate(self):
        mac=MAC.read_text()
        self.assertIn('F_GOVERNED_APPROVAL_SEAL_NOT_IN_REVIEWED_SOURCE',mac)
        self.assertIn('F_RUNNER_SOURCE_BYTES_NOT_APPROVED',mac)
        self.assertIn('EXPLICIT_OWNER_CONSENT_NOT_GIVEN',mac)
    def test_original_protected_trust_only_read(self):
        root=ROOT_SCRIPT.read_text()
        self.assertIn('ORIGINAL_RSA_FP = "3ac8653650acd9c545f4ffa5d007db981bd634ab2f94fa08e687fed92948f1fd"',root)
        self.assertNotIn("os.replace(V4",root)
        self.assertNotIn("write_once(V4",root)
        self.assertNotIn("V4.write",root)
        self.assertIn("ORIGINAL_RELEASE_LOCK_CHANGED",root)
        self.assertIn("ORIGINAL_INSTALL_ALREADY_AUTHORIZED_OR_RECEIPTED",root)
    def test_new_public_only_and_immutable_audit(self):
        root=ROOT_SCRIPT.read_text()
        self.assertIn('NEW = Path("/etc/aoe2war/website-owner-v6")',root)
        self.assertIn("os.O_CREAT | os.O_EXCL",root)
        self.assertIn('"chattr", "+i"',root)
        self.assertIn("commit.json",root)
        self.assertIn("rollback.json",root)
        self.assertIn('"candidate_only": True',root)
    def test_key_possession_is_not_original_rsa_approval(self):
        root=ROOT_SCRIPT.read_text()
        self.assertIn("NEW_PRIVATE_KEY_POSSESSION_NOT_VERIFIED",root)
        self.assertIn("INDEPENDENT_F_SOURCE_APPROVAL_NOT_ENROLLED",root)
        self.assertIn("NO_RELEASE_AUTHORITY",root)
        self.assertIn('"helpers_installed": False',root)
        self.assertIn('"finance_authorized": False',root)
    def test_root_v6_requires_exact_hel1_identity(self):
        root=load(ROOT_SCRIPT)
        self.assertEqual(root.HOST,"ubuntu-4gb-hel1-11")
        self.assertEqual(root.LOCK_ID,(2064,6185747,1000,0o644))
        self.assertEqual(root.CONFIG.as_posix(),"/etc/aoe2war/solo-owner-website-v1")
    def test_mac_ssh_private_key_never_sent(self):
        mac=MAC.read_text()
        self.assertIn('"StrictHostKeyChecking=yes"',mac)
        self.assertIn('"BatchMode=yes"',mac)
        self.assertIn('input=runner',mac)
        self.assertNotIn('input=private',mac)
        self.assertNotIn('input=key.read_bytes()',mac)
    def test_source_parse(self):
        ast.parse(ROOT_SCRIPT.read_text())
        ast.parse(MAC.read_text())

if __name__=="__main__":
    unittest.main()
