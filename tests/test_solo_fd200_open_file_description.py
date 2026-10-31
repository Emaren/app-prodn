"""R11: actual Linux flock/OFD lease ownership (no HEL1 access)."""
import fcntl
import inspect
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from aoe2_solo_website_nonce_ledger import Journal
import aoe2_solo_website_native_issuer as issuer

CHILD = r"""
import os, sys
from pathlib import Path
from aoe2_solo_website_nonce_ledger import Journal, Hold
# In a child process, impersonate ONLY the descriptor transport mechanics.
# This is not a live root authority or a production release command.
source=int(sys.argv[1])
os.dup2(source,200,inheritable=True)
if sys.argv[4]=="drop":
    os.close(200)
try:
    Journal(state=Path(sys.argv[3]),lock=Path(sys.argv[2]),
            test_mode=True).inherited_lease_fd()
except (Hold,OSError) as exc:
    print("HOLD:",exc,flush=True)
    sys.exit(2)
print("PASS: FD200_OWNS_ORIGINAL_OPEN_FILE_DESCRIPTION",flush=True)
"""

@unittest.skipUnless(sys.platform == "linux", "Linux flock/OFD contract")
class ActualOriginalFlockTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)
        self.lock=self.root/"release.lock"
        self.lock.touch(mode=0o600)
        self.journal=self.root/"journal"
        self.journal.mkdir(mode=0o700)
        self.descriptors=[]

    def open_fd(self, path=None):
        fd=os.open(path or self.lock,os.O_RDWR | os.O_NOFOLLOW)
        self.addCleanup(os.close,fd)
        self.descriptors.append(fd)
        return fd

    def child(self, fd, mode="keep"):
        # The real source process (original root command channel) itself has
        # FD200 before spawning root phase, then native issuer inherits twice.
        # Without this parent descriptor, an arbitrary same-inode child has
        # no authenticated channel ancestry and must fail.
        owner=None
        for candidate in self.descriptors:
            try:
                info=Path("/proc/self/fdinfo") .joinpath(str(candidate)).read_text()
                if any(" FLOCK " in line and " WRITE " in line
                       for line in info.splitlines() if line.startswith("lock:")):
                    owner=candidate
                    break
            except OSError:
                continue
        try: saved=os.dup(200)
        except OSError: saved=None
        try:
            if owner is not None:
                os.dup2(owner,200,inheritable=True)
                passing=tuple(sorted(set((fd,200))))
            else:
                passing=(fd,)
            return subprocess.run(
                [sys.executable,"-c",CHILD,str(fd),str(self.lock),
                 str(self.journal),mode],
                pass_fds=passing,stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,text=True,timeout=8,
                env={**os.environ,
                     "PYTHONPATH":str(Path(__file__).resolve().parents[1]/"scripts")},
                check=False)
        finally:
            if saved is None:
                try:os.close(200)
                except OSError:pass
            else:
                os.dup2(saved,200)
                os.close(saved)

    def test_inherited_same_ofd_proves_lock_owner_across_process(self):
        original=self.open_fd()
        fcntl.flock(original,fcntl.LOCK_EX|fcntl.LOCK_NB)
        result=self.child(original)
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
        self.assertIn("PASS: FD200_OWNS_ORIGINAL_OPEN_FILE_DESCRIPTION",result.stdout)
        # The child did not unlock/release the parent original lease.
        contender=self.open_fd()
        with self.assertRaises(BlockingIOError):
            fcntl.flock(contender,fcntl.LOCK_EX|fcntl.LOCK_NB)

    def test_same_inode_but_wrong_open_file_description_holds(self):
        original=self.open_fd()
        other=self.open_fd()
        self.assertEqual(os.fstat(original).st_ino,os.fstat(other).st_ino)
        fcntl.flock(original,fcntl.LOCK_EX|fcntl.LOCK_NB)
        result=self.child(other)
        self.assertEqual(result.returncode,2,result.stdout+result.stderr)
        self.assertIn("FD200 is not the original owning flock",result.stdout)

    def test_unlocked_fd_cannot_create_an_original_session(self):
        fresh=self.open_fd()
        result=self.child(fresh)
        self.assertEqual(result.returncode,2,result.stdout+result.stderr)
        self.assertIn("HOLD:",result.stdout)

    def test_lost_original_lock_cannot_resume_from_new_fd(self):
        original=self.open_fd()
        fcntl.flock(original,fcntl.LOCK_EX|fcntl.LOCK_NB)
        fcntl.flock(original,fcntl.LOCK_UN)
        replacement=self.open_fd()
        result=self.child(replacement)
        self.assertEqual(result.returncode,2,result.stdout+result.stderr)
        self.assertIn("global release lease not held",result.stdout)

    def test_cloexec_or_missing_fd200_holds(self):
        original=self.open_fd()
        fcntl.flock(original,fcntl.LOCK_EX|fcntl.LOCK_NB)
        result=self.child(original,mode="drop")
        self.assertEqual(result.returncode,2,result.stdout+result.stderr)
        self.assertIn("no inherited FD200 release lease",result.stdout)

    def test_substituted_inode_holds_even_with_other_lock(self):
        old=self.open_fd()
        fcntl.flock(old,fcntl.LOCK_EX|fcntl.LOCK_NB)
        foreign=self.root/"other.lock"
        foreign.touch(mode=0o600)
        forged=self.open_fd(foreign)
        result=self.child(forged)
        self.assertEqual(result.returncode,2,result.stdout+result.stderr)
        self.assertIn("inherited release lease inode mismatch",result.stdout)

    def test_real_native_issuer_calls_shared_original_ofd_owner_verifier(self):
        source=inspect.getsource(issuer.original_lease)
        self.assertIn("from aoe2_solo_website_nonce_ledger import Journal",source)
        self.assertIn("Journal().inherited_lease_fd(owner_depth=2)",source)
        self.assertIn("ORIGINAL_FD200_NOT_OWNED_BY_RELEASE_CHANNEL",source)
        # Never accept a fabricated replacement flock from native issuer.
        self.assertNotIn("flock(",source)

if __name__=="__main__":
    unittest.main()
