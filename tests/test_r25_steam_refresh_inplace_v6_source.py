"""Fail-closed source qualification of installed Steam-only postcutover adapter."""
import ast
import hashlib
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "scripts/release/r25_steam_refresh_inplace_r25_v6.py"
EXPECTED_SHA = "88343a6405e263e2227c94744e058b53fa4d067c4fd53070d99c15f43b5546ce"

class SteamV6SourceContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = SOURCE.read_bytes()
        cls.code = cls.data.decode("utf8")
        cls.tree = ast.parse(cls.code)

    def test_exact_installed_source_sha(self):
        self.assertEqual(hashlib.sha256(self.data).hexdigest(), EXPECTED_SHA)

    def test_pinned_live_source_and_site_unit(self):
        for literal in (
            "e0586a7b7c355c3b29037d78c71fe26d528d2475",
            "bUr1xs_EMHgXFD-U-sZ4Z",
            "20261108044653-2983e18532",
            "13958b7f63ed1342368e8ae9f4c8594268ae7725ad6910c757dd3b9b24c923a5",
            "1f2970c685e53d0f426b86baeb1910c4f73f346a6e18baf97b064ef1fae7bbe3",
            "47a748c75444f561f476a261e534462cd9959a2706362e4380856ff93f503fe0",
        ):
            self.assertIn(literal, self.code)

    def test_immutable_reviewed_guard_is_not_reimplemented(self):
        self.assertIn("3e54151c10ad39889a6341f000ae36dc1a89f9a3278608c918e707bd068fbb07", self.code)
        self.assertIn("digest(regular(OLD))==OLD_SHA", self.code)
        self.assertIn("o.bound_public_commit=normalized_proof", self.code)
        self.assertIn("o.refresh()", self.code)
        self.assertIn("o.expected_policy=expected", self.code)
        self.assertNotIn("nft -f", self.code)
        self.assertNotIn("iptables", self.code)

    def test_exact_one_allowed_service_mutation_and_denied_finance(self):
        self.assertIn("a.count(old_path)==4 and a.replace(old_path,new_path)==b", self.code)
        self.assertIn("j.get('financial_gates_closed') is False", self.code)
        self.assertIn("j.get('c03_legacy_finance_writers_unchanged') is True", self.code)
        self.assertIn("'financial_authorized':False", self.code)
        # The original reviewed bound_runtime_pid() carries the exact STEAM_ONLY
        # authorization scope; this adapter must never override that validator.
        self.assertNotIn("o.bound_runtime_pid=", self.code)
        self.assertNotIn("8094", self.code)
        self.assertNotIn("8095", self.code)
        self.assertNotIn("GRANT ", self.code)
        self.assertNotIn("UPDATE public.", self.code)

    def test_policy_proofs_require_strict_root_mode(self):
        self.assertIn("st.st_uid!=0", self.code)
        self.assertIn("st.st_nlink!=1", self.code)
        self.assertIn("stat.S_IMODE(st.st_mode)&0o022", self.code)
        self.assertIn("regular(RELEASE_RECEIPT,0o600)", self.code)
        self.assertIn("regular(ROOT_BACKUP,0o600)", self.code)
        self.assertIn("POLICY.parent.name=='web-prod-v6'", self.code)

if __name__ == "__main__":
    unittest.main()
