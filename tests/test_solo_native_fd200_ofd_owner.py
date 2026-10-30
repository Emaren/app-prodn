"""Native Linux original FD200 owner proof: actual inherited vs replacement FD."""
import fcntl,os,pathlib,subprocess,sys,tempfile,unittest
SCRIPTS=pathlib.Path(__file__).resolve().parents[1]/"scripts"
CHILD=r"""
import os,sys
from pathlib import Path
sys.path.insert(0,sys.argv[1])
from aoe2_solo_website_nonce_ledger import Journal,Hold
lock=Path(sys.argv[2]);state=Path(sys.argv[3]);mode=sys.argv[4]
if mode=="different-ofd":
    fd=os.open(lock,os.O_RDWR)
    os.dup2(fd,200,inheritable=True)
    if fd!=200:os.close(fd)
if mode=="closed":os.close(200)
try:
    Journal(state,lock,test_mode=True).inherited_lease_fd()
    print("PASS: ORIGINAL_OWNER_OFD")
except Hold as exc:
    print("HOLD: "+str(exc))
    sys.exit(2)
"""
@unittest.skipUnless(sys.platform=="linux" and pathlib.Path("/proc/locks").exists(),"Linux FLOCK only")
class NativeLeaseOwnership(unittest.TestCase):
    def test_kernel_proves_same_ofd_and_rejects_replacement_fd(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=pathlib.Path(tmp);lock=root/"release.lock";lock.touch(mode=0o600)
            state=root/"state";state.mkdir(mode=0o700)
            fd=os.open(lock,os.O_RDWR)
            backup=None
            try:
                fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
                try:backup=os.dup(200)
                except OSError:pass
                os.dup2(fd,200,inheritable=True)
                for kind,expected in (("owned",0),("different-ofd",2),("closed",2)):
                    proc=subprocess.run([sys.executable,"-B","-c",CHILD,str(SCRIPTS),
                          str(lock),str(state),kind],pass_fds=(200,),
                          capture_output=True,text=True,timeout=12)
                    with self.subTest(kind=kind):
                        self.assertEqual(proc.returncode,expected,proc.stdout+proc.stderr)
                        self.assertIn("PASS:" if expected==0 else "HOLD:",proc.stdout)
                probe=os.open(lock,os.O_RDONLY)
                try:
                    with self.assertRaises(BlockingIOError):
                        fcntl.flock(probe,fcntl.LOCK_EX|fcntl.LOCK_NB)
                finally:os.close(probe)
            finally:
                if backup is None:
                    try:os.close(200)
                    except OSError:pass
                else:os.dup2(backup,200);os.close(backup)
                fcntl.flock(fd,fcntl.LOCK_UN);os.close(fd)
    def test_issuer_and_audit_chain(self):
        issuer=(SCRIPTS/"aoe2_solo_website_native_issuer.py").read_text()
        adapter=(SCRIPTS/"aoe2_solo_website_native_audit_adapter.py").read_text()
        root=(SCRIPTS/"aoe2_solo_website_root_phase.py").read_text()
        self.assertIn("Journal().inherited_lease_fd(owner_depth=2)",issuer)
        self.assertIn("pass_fds=(200,)",adapter)
        self.assertIn("ledger.inherited_lease_fd()",root)
if __name__=="__main__":unittest.main()
