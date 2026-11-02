"""Regression: G requalification must bind to F's exact committed nginx after hash."""
import importlib.util,pathlib,unittest
from unittest import mock
ROOT=pathlib.Path(__file__).resolve().parents[1]
SPEC=importlib.util.spec_from_file_location("g_fhash",ROOT/"scripts/aoe2_r25_f_g_parallel_observer.py")
g=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(g)
class GCommittedHash(unittest.TestCase):
    def test_root_snapshot_requalification_receives_f_root_approved_hash_not_truncated_context(self):
        s=(ROOT/"scripts/aoe2_r25_f_g_parallel_observer.py").read_text()
        self.assertIn('"nginx_after_sha256":history["approved_after_nginx_sha256"]',s)
        self.assertIn('H64.fullmatch(history["approved_after_nginx_sha256"])',s)
        self.assertIn('result["candidate_runtime_lineage"]=runtime_lineage(base,lineage_plan,phase)',s)
        self.assertNotIn('result["candidate_runtime_lineage"]=runtime_lineage(base,context,phase)',s)
    def test_c_after_rejects_missing_or_drifting_hash_before_any_sensitive_key_read(self):
        namespace={"session_identity":mock.Mock(side_effect=AssertionError("secret read"))}
        with self.assertRaisesRegex(g.Hold,"G_AFTER_EXACT_NGINX_SHA_REQUIRED"):
            g.c_after_native_requalification(namespace,"a"*64,None,"/etc/nginx/sites-available/aoe2war.com")
        namespace["session_identity"].assert_not_called()
    def test_root_commit_and_owner_plan_sha_are_verified_before_after_context(self):
        s=(ROOT/"scripts/aoe2_r25_f_g_parallel_observer.py").read_text()
        self.assertIn('record.get("plan_sha256")==digest(canon(plan))==manifest.get("plan_sha256")',s)
        self.assertIn('plan.get(field)==manifest[field],"AUTHORIZED_TRANSACTION_SOURCE_DRIFT:"',s)
        self.assertIn('need(commit.get(key)==value,"COMMIT_AUTHORIZED_TRANSACTION_DRIFT:"',s)
        self.assertIn('need(current==(commit.get("old_nginx_sha256") if phase=="rollback"',s)
if __name__=="__main__":unittest.main()
