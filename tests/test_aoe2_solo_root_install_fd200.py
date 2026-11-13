"""Independent Linux kernel owner/OFD subprocess checks; no live release.lock.

The original F/D runtime tests separately verify real Journal+issuer authorization.
"""
from __future__ import annotations
import os, pathlib, subprocess, sys, tempfile, unittest

# Parent process is the original command lease. Phase and issuer are subprocesses.
GRANDCHILD=r'''
import fcntl,os,pathlib,sys
p=pathlib.Path(sys.argv[1]); mode=sys.argv[2]
held=os.fstat(200); actual=p.stat()
assert (held.st_dev,held.st_ino)==(actual.st_dev,actual.st_ino),"foreign inode"
parent=os.getppid()
rows=(pathlib.Path('/proc')/str(parent)/'status').read_text().splitlines()
channel=int(next(x.split()[1] for x in rows if x.startswith('PPid:')))
locks=pathlib.Path('/proc/locks').read_text().splitlines()
owner=[]
for row in locks:
    x=row.split()
    if len(x)>=8 and x[1:4]==['FLOCK','ADVISORY','WRITE']:
        major,minor,ino=x[5].split(':')
        if (int(major,16),int(minor,16),int(ino))==(os.major(held.st_dev),os.minor(held.st_dev),held.st_ino):owner.append(int(x[4]))
assert owner==[channel],f'wrong original command PID: {owner} != {channel}'
assert (pathlib.Path('/proc')/str(channel)/'fd'/'200').stat().st_ino==actual.st_ino
probe=os.open(p,os.O_RDONLY)
try:
    try:fcntl.flock(probe,fcntl.LOCK_EX|fcntl.LOCK_NB)
    except BlockingIOError:pass
    else:raise AssertionError('independent OFD acquired a supposedly held lock')
finally:os.close(probe)
dup=os.dup(200)
try:fcntl.flock(dup,fcntl.LOCK_EX|fcntl.LOCK_NB)
finally:os.close(dup) # never LOCK_UN, same original OFD
print('PASS: ORIGINAL_GRANDPARENT_OWNS_LOCKED_FD200',flush=True)
'''
PHASE=r'''
import os,subprocess,sys
p=sys.argv[1];mode=sys.argv[2]
if mode=='drop':os.close(200)
if mode=='replace':
    other=os.open(p,os.O_RDONLY)
    os.dup2(other,200,inheritable=True)
    os.close(other)
r=subprocess.run([sys.executable,'-c',sys.argv[3],p,mode],pass_fds=(200,) if mode!='drop' else (),capture_output=True,text=True,timeout=5)
print(r.stdout,end='');print(r.stderr,end='',file=sys.stderr)
sys.exit(r.returncode)
'''

@unittest.skipUnless(sys.platform=='linux' and pathlib.Path('/proc/locks').exists(),"Linux /proc FLOCK required")
class OriginalFd200Kernel(unittest.TestCase):
    def test_original_and_replacement_and_missing_fd(self):
        import fcntl
        with tempfile.TemporaryDirectory() as folder:
            path=pathlib.Path(folder)/'release.lock';path.write_text('')
            fd=os.open(path,os.O_RDWR)
            try:
                fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
                try:saved=os.dup(200)
                except OSError:saved=None
                try:
                    os.dup2(fd,200,inheritable=True)
                    for mode,expected in [('keep',0),('replace',1),('drop',1)]:
                        # For drop, child skips passing FD200: original channel continues holding it.
                        p=subprocess.run([sys.executable,'-c',PHASE,str(path),mode,GRANDCHILD],
                           pass_fds=(200,),capture_output=True,text=True,timeout=7)
                        with self.subTest(mode=mode):
                            if expected==0:
                                self.assertEqual(p.returncode,0,p.stderr)
                                self.assertIn('PASS: ORIGINAL_GRANDPARENT',p.stdout)
                            else:self.assertNotEqual(p.returncode,0,p.stdout)
                    distinct=os.open(path,os.O_RDWR)
                    try:
                        with self.assertRaises(BlockingIOError):
                            fcntl.flock(distinct,fcntl.LOCK_EX|fcntl.LOCK_NB)
                    finally:os.close(distinct)
                finally:
                    if saved is None:os.close(200)
                    else:os.dup2(saved,200);os.close(saved)
            finally:os.close(fd)
    def test_unlocked_descriptor_cannot_claim_original_owner(self):
        with tempfile.TemporaryDirectory() as folder:
            p=pathlib.Path(folder)/'release.lock';p.write_text('')
            fd=os.open(p,os.O_RDWR)
            try:
                try:saved=os.dup(200)
                except OSError:saved=None
                try:
                    os.dup2(fd,200,inheritable=True)
                    r=subprocess.run([sys.executable,'-c',PHASE,str(p),'keep',GRANDCHILD],
                                     pass_fds=(200,),capture_output=True,text=True,timeout=7)
                    self.assertNotEqual(r.returncode,0,r.stdout)
                finally:
                    if saved is None:os.close(200)
                    else:os.dup2(saved,200);os.close(saved)
            finally:os.close(fd)

if __name__=='__main__':unittest.main()
