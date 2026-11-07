"""Native DNS stub ownership: actual systemd-resolve user, never arbitrary UID."""
import importlib.util,os,stat,hashlib
from pathlib import Path
from types import SimpleNamespace
from unittest import TestCase,main,mock
P=Path(__file__).resolve().parents[1]/"scripts/r25_c_start_root.py"
spec=importlib.util.spec_from_file_location("r25_resolved_uid",P)
c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
stub=b"nameserver 127.0.0.53\n"
def state(uid=992,gid=992,mode=stat.S_IFREG|0o644,body=stub):
 return SimpleNamespace(st_mode=mode,st_uid=uid,st_gid=gid,st_nlink=1,st_size=len(body),
   st_dev=123,st_ino=456,st_mtime_ns=789)
def site(parent_uid=992,file_uid=992,body=stub):
 owner=SimpleNamespace(pw_uid=992,pw_gid=992)
 parent=state(uid=parent_uid,mode=stat.S_IFDIR|0o755)
 f=state(uid=file_uid,body=body)
 def lstat(path):return parent if path==Path("/run/systemd/resolve") else f
 def result(argv,**kwargs):
  if "/usr/bin/sha256sum" in argv:return (hashlib.sha256(body).hexdigest()+"  /etc/resolv.conf\n").encode()
  if "/usr/bin/getent" in argv:return b"23.12.156.233 STREAM steamcommunity.com\n"
  raise AssertionError(argv)
 return (mock.patch.object(c.pwd,"getpwnam",return_value=owner),
         mock.patch.object(c.os,"lstat",side_effect=lstat),
         mock.patch.object(c.os,"open",return_value=98),
         mock.patch.object(c.os,"fstat",return_value=f),
         mock.patch.object(c.os,"read",return_value=body),
         mock.patch.object(c.os,"close"),
         mock.patch.object(c,"run",side_effect=result))
class ResolverUid(TestCase):
 def run_case(self,**kw):
  from contextlib import ExitStack
  with ExitStack() as stack:
   for patch in site(**kw):stack.enter_context(patch)
   return c.production_resolver_namespace_probe(114223)
 def test_systemd_resolve_exact_owner_and_loopback_success(self):
  result=self.run_case()
  self.assertTrue(result["steam_dns_resolves"])
  self.assertEqual(result["readonly_resolver_sha256"],hashlib.sha256(stub).hexdigest())
 def test_arbitrary_user_denied(self):
  with self.assertRaisesRegex(c.Hold,"PRODUCTION_HOST_RESOLVER_FILE_UNSAFE"):self.run_case(file_uid=1001)
 def test_wrong_parent_denied(self):
  with self.assertRaisesRegex(c.Hold,"PRODUCTION_RESOLVER_DIRECTORY_UNSAFE"):self.run_case(parent_uid=0)
 def test_external_resolver_denied(self):
  with self.assertRaisesRegex(c.Hold,"PRODUCTION_RESOLVER_STUB_CONTENT_DRIFT"):
   self.run_case(body=b"nameserver 8.8.8.8\n")
if __name__=="__main__":main()
