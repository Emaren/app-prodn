import hashlib,json,sys,tempfile,unittest,zipfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parents[1]/"scripts"))
import aoe2_product_release as R
sha=lambda x:hashlib.sha256(x).hexdigest()
class CacheTests(unittest.TestCase):
 def setUp(self):
  self.t=tempfile.TemporaryDirectory();self.addCleanup(self.t.cleanup)
  self.w=Path(self.t.name);self.w.chmod(0o700)
  self.a={"sourceSha":"a"*40,"buildId":"test","runId":1,"artifactId":2,"artifactBytes":999,"artifactSha256":"b"*64}
  self.s=self.w/("a"*12);self.s.mkdir(mode=0o700)
  self.i=self.s/"independent-verification";self.i.mkdir(mode=0o700)
  self.r=self.s/"runtime.tar.gz";self.write(self.r,b"runtime")
  self.p=self.s/"b-linux-independent-review-v2.json"
  self.z=self.i/"download.zip"
  self.m=self.s/"m1-cache-normalization.json"
  self.proof={"status":"PASS_INDEPENDENT_LINUX_RUNTIME_BYTES_AND_EACH_TAR_MEMBER","source_commit":self.a["sourceSha"],"build_id":"test","run_id":1,"os":"linux","arch":"x86_64","node":"v22.22.0","financial_authorized":False,"root_stage_authorized":False,"public_3032_activation_authorized":False,"runtime_entries_verified":2000,"runtime_archive_bytes":7,"runtime_archive_sha256":sha(b"runtime"),"github_artifact_id":2,"github_artifact_zip_bytes":999,"github_artifact_zip_sha256":"b"*64}
  self.write(self.p,json.dumps(self.proof).encode())
  with zipfile.ZipFile(self.z,"w") as z:z.writestr(self.p.name,self.p.read_bytes())
  self.z.chmod(0o600)
  self.a.update(proofArtifactBytes=self.z.stat().st_size,proofArtifactSha256=sha(self.z.read_bytes()),proofSha256=sha(self.p.read_bytes()))
  self.receipt={"schema":"aoe2war.m1.verified-download-envelope-cleanup.v1","source":self.a["sourceSha"],"github_artifact_id":2,"outer_zip_sha256":"b"*64,"duplicate_download_envelope_removed":True,"deployment_authorized":False,"runtime_retained":str(self.r),"independent_receipt_retained":str(self.p),"archive_sha256":sha(b"runtime")}
  self.write(self.m,json.dumps(self.receipt).encode())
 def write(self,p,b):p.write_bytes(b);p.chmod(0o600)
 def test_pass(self):self.assertEqual(R.normalized_cache(self.a,self.w)[0],self.s)
 def test_absent(self):self.m.unlink();self.assertIsNone(R.normalized_cache(self.a,self.w))
 def test_runtime_tamper(self):
  self.write(self.r,b"changed")
  with self.assertRaises(RuntimeError):R.normalized_cache(self.a,self.w)
 def test_proof_tamper(self):
  self.write(self.p,b"changed")
  with self.assertRaises(RuntimeError):R.normalized_cache(self.a,self.w)
 def test_receipt_tamper(self):
  self.receipt["deployment_authorized"]=True;self.write(self.m,json.dumps(self.receipt).encode())
  with self.assertRaises(RuntimeError):R.normalized_cache(self.a,self.w)
 def test_wrong_artifact(self):
  self.a["artifactId"]=3
  with self.assertRaises(RuntimeError):R.normalized_cache(self.a,self.w)
 def test_mode(self):
  self.r.chmod(0o644)
  with self.assertRaises(RuntimeError):R.normalized_cache(self.a,self.w)
 def test_duplicate_keys(self):
  self.write(self.m,b'{"schema":"wrong",'+self.m.read_bytes()[1:])
  with self.assertRaises(RuntimeError):R.normalized_cache(self.a,self.w)
 def test_symlink(self):
  self.r.unlink();self.r.symlink_to(self.p)
  with self.assertRaises(RuntimeError):R.normalized_cache(self.a,self.w)
