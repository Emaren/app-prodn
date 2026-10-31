"""R10 original lock issuance invariants; no host operations."""
import inspect
import pathlib
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/"scripts"))
from aoe2_solo_website_nonce_ledger import Journal
import aoe2_solo_website_root_phase as phase

class OriginalIssue(unittest.TestCase):
    def test_root_audit_requires_inherited_fd_first(self):
        code=inspect.getsource(phase.issue)
        self.assertLess(code.index("ledger.inherited_lease_fd()"),
                        code.index("report=audit(candidate,phase,attempt)"))
    def test_issuer_uses_no_nested_flock(self):
        code=inspect.getsource(Journal.issue)
        self.assertIn("under_original_lease=True",inspect.getsource(phase.issue))
        self.assertIn("nullcontext() if under_original_lease",code)
    def test_missing_fd_denies_native_audit(self):
        with patch.object(phase,"Journal") as journal,patch.object(
            phase,"native",return_value={"mounted":True,"free_bytes":40*2**30,
                "effective_used_pct":86,"finish_used_pct":86,
                "source_sha":phase.TRAINS["W1"][1],"build_id":"old",
                "web_service":"active"}):
            journal.return_value.inherited_lease_fd.side_effect=phase.Hold("FD200 missing")
            with self.assertRaisesRegex(phase.Hold,"FD200 missing"):
                phase.issue(["PRE_STAGE",phase.TRAINS["W1_SAFE"][0],"a"*64])
if __name__=="__main__":
    unittest.main()
