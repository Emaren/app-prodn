"""Solo-owner website v1 command channel inside the ORIGINAL release flock.

A phase runs through the already locked SSH connection; its bash child inherits
that SAME flock descriptor. Losing the Mac/SSH parent cannot expire a live
phase's lock and admit another release. No separate controller/lock namespace.
"""
from __future__ import annotations
import base64
import json
import os
from pathlib import Path
import select
import shlex
import subprocess
import threading
import time
from contextlib import contextmanager
class Hold(RuntimeError):
    pass

def require(cond, reason):
    if not cond:
        raise Hold("SOLO_WEBSITE_COMMAND_LEASE_HOLD: " + reason)

def no_duplicates(pairs):
    data = {}
    for key, value in pairs:
        require(key not in data, "duplicate JSON response")
        data[key] = value
    return data

MAX_SCRIPT=512*1024
MAX_FRAME=6*1024*1024
REMOTE=r'''
import base64,fcntl,json,os,pathlib,selectors,signal,stat,subprocess,sys,time
lock=pathlib.Path(sys.argv[1]);holder=sys.argv[2]
meta=pathlib.Path(str(lock)+'.meta');fd=None
MAX_SCRIPT=524288;MAX_OUTPUT=2097152

def emit(v):print(json.dumps(v,separators=(',',':')),flush=True)
def run(x):
 script=base64.b64decode(x['script'],validate=True)
 if not 0<len(script)<=MAX_SCRIPT or type(x['timeout'])is not int or not 1<=x['timeout']<=1800:raise ValueError('bounds')
 if x.get('run_as') not in ('root','tony'):raise ValueError('noncanonical phase principal')
 # The child retains the original physical flock even if this parent dies.
 os.dup2(fd,200,inheritable=True)
 source=script.decode('utf-8','strict')
 if x['run_as']=='tony':
  # The W1 native stage/activation engine expects the real UID1000
  # filesystem/deploy-key account. Root is reserved for nonce/witness.
  argv=['/usr/bin/setpriv','--reuid=1000','--regid=1000',
   '--init-groups','/usr/bin/env','-i','HOME=/home/tony',
   'USER=tony','LOGNAME=tony','PATH=/usr/local/bin:/usr/bin:/bin',
   '/bin/bash','-lc',source]
 else:argv=['/bin/bash','-lc',source]
 p=subprocess.Popen(argv,stdin=subprocess.DEVNULL,
  stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True,pass_fds=(200,))
 out={p.stdout:bytearray(),p.stderr:bytearray()};uncertain=False
 try:
  deadline=time.monotonic()+x['timeout']
  with selectors.DefaultSelector() as s:
   for f in out:os.set_blocking(f.fileno(),False);s.register(f,selectors.EVENT_READ)
   while s.get_map():
    if time.monotonic()>=deadline:raise TimeoutError()
    for k,_ in s.select(min(.25,max(0,deadline-time.monotonic()))):
     b=os.read(k.fileobj.fileno(),65536)
     if not b:s.unregister(k.fileobj);continue
     if len(out[k.fileobj])+len(b)>MAX_OUTPUT:raise ValueError('output')
     out[k.fileobj].extend(b)
  rc=p.wait(timeout=max(.001,deadline-time.monotonic()))
 except BaseException:
  uncertain=True
  try:os.killpg(p.pid,signal.SIGTERM)
  except ProcessLookupError:pass
  try:p.wait(timeout=180)
  except subprocess.TimeoutExpired:
   try:os.killpg(p.pid,signal.SIGKILL)
   except ProcessLookupError:pass
   p.wait(timeout=10)
  rc=124
 finally:
  p.stdout.close();p.stderr.close();os.close(200)
 return {'kind':'result','id':x['id'],'returncode':rc,'uncertain':uncertain,
  'stdout':base64.b64encode(out[p.stdout]).decode(),'stderr':base64.b64encode(out[p.stderr]).decode()}
try:
 if os.geteuid()!=0:raise PermissionError('root-only protected command lease required')
 if not lock.is_absolute() or lock.is_symlink() or lock.parent.is_symlink():
  raise PermissionError('original release.lock path must exist and be unlinked')
 st=lock.stat()
 if st.st_uid!=1000 or stat.S_IMODE(st.st_mode)!=0o644 or not stat.S_ISREG(st.st_mode):
  raise PermissionError('native UID1000 mode0644 release.lock identity mismatch')
 fd=os.open(lock,os.O_RDWR|os.O_NOFOLLOW|os.O_CLOEXEC)
 fs=os.fstat(fd)
 if (fs.st_dev,fs.st_ino)!=(st.st_dev,st.st_ino):
  raise PermissionError('release.lock inode changed')
 fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
 temp=meta.with_name('.'+meta.name+'.'+str(os.getpid()))
 with temp.open('x')as f:os.chmod(temp,0o600);f.write(holder+'\n');f.flush();os.fsync(f.fileno())
 os.replace(temp,meta)
 emit({'kind':'acquired'})
 while True:
  line=sys.stdin.buffer.readline(800000)
  if not line:break
  if line==b'release\n':break
  if len(line)>=800000 or not line.endswith(b'\n'):raise ValueError('frame')
  x=json.loads(line)
  if set(x)!={'id','script','timeout','run_as'}or type(x['id'])is not str or len(x['id'])!=32:raise ValueError('request')
  emit(run(x))
except BaseException as e:
 emit({'kind':'held','error_type':type(e).__name__})
finally:
 if fd is not None:
  try:
   if meta.read_text().strip()==holder:meta.unlink()
  except OSError:pass
  os.close(fd)
'''

class LeaseRunner:
 def __init__(self,process):self.process=process;self.lock=threading.Lock();self.buffer=bytearray();self.errors=bytearray()
 def frame(self,seconds):
  deadline=time.monotonic()+seconds
  while True:
   end=self.buffer.find(b'\n')
   if end>=0:
    raw=bytes(self.buffer[:end]);del self.buffer[:end+1]
    return json.loads(raw,object_pairs_hook=no_duplicates)
   left=deadline-time.monotonic()
   require(left>0,'production lease channel timed out; outcome UNKNOWN')
   ready,_,_=select.select([self.process.stdout,self.process.stderr],[],[],min(left,.5))
   for f in ready:
    chunk=os.read(f.fileno(),65536)
    require(bool(chunk),'production lease transport lost; outcome UNKNOWN')
    dest=self.buffer if f is self.process.stdout else self.errors
    require(len(dest)+len(chunk)<=(MAX_FRAME if dest is self.buffer else 16384),'production lease frame exceeded bounds')
    dest.extend(chunk)
 def assert_alive(self):require(self.process.poll() is None,'original production release lease lost')
 def run(self,script,*,timeout):
  return self._dispatch(script,timeout=timeout,run_as='root')
 def run_tony(self,script,*,timeout):
  return self._dispatch(script,timeout=timeout,run_as='tony')
 def _dispatch(self,script,*,timeout,run_as):
  require(self.lock.acquire(blocking=False),'release phase runner is nonreentrant')
  try:
   self.assert_alive();raw=script.encode('utf-8');require(0<len(raw)<=MAX_SCRIPT,'release script exceeds channel bound')
   import secrets
   identity=secrets.token_hex(16)
   request={'id':identity,'script':base64.b64encode(raw).decode('ascii'),
    'timeout':timeout,'run_as':run_as}
   self.process.stdin.write((json.dumps(request,separators=(',',':'))+'\n').encode());self.process.stdin.flush()
   answer=self.frame(timeout+200)
   require(type(answer)is dict and set(answer)=={'kind','id','returncode','uncertain','stdout','stderr'} and
    answer['kind']=='result'and answer['id']==identity and type(answer['returncode'])is int and
    answer['uncertain']is False,'phase result unavailable/uncertain; preserve CONSUMED and inspect original receipts')
   self.assert_alive()
   stdout=base64.b64decode(answer['stdout'],validate=True).decode('utf-8','strict')
   stderr=base64.b64decode(answer['stderr'],validate=True).decode('utf-8','strict')
   return subprocess.CompletedProcess(['protected-solo-owner-website-lease-phase'],answer['returncode'],stdout,stderr)
  finally:self.lock.release()

@contextmanager
def command_lease(path:Path,holder:str,*,host:str):
 # Same canonical path/holder contract as aoe2_release.remote_global_release_lease.
 command='python3 -u -c '+shlex.quote(REMOTE)+' '+shlex.quote(str(path))+' '+shlex.quote(holder)
 p=subprocess.Popen(['ssh','-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes',
  '-o','ConnectTimeout=8',host,command],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 runner=LeaseRunner(p)
 try:
  require(runner.frame(15)=={'kind':'acquired'},'original production release flock busy/unavailable')
  yield runner
 finally:
  if p.poll()is None:
   try:p.stdin.write(b'release\n');p.stdin.flush()
   except (OSError,BrokenPipeError):pass
  try:p.wait(timeout=10)
  except subprocess.TimeoutExpired:p.kill();p.wait(timeout=5)
  for stream in(p.stdin,p.stdout,p.stderr):stream.close()

# A systemd oneshot does not inherit the calling Bash descriptors. This small
# guardian keeps the SAME flock open after Bash/SSH death until its two exact
# ephemeral units are proven quiescent. It never stops or changes a unit. An
# unavailable manager retains the lock for explicit operator reconciliation.
STAGE_GUARD = r'''
import os,re,subprocess,sys,time
parent=int(sys.argv[1]);instance=sys.argv[2]
if not re.fullmatch('[A-Za-z0-9]{10}',instance):raise SystemExit(2)
os.fstat(200)
child=os.fork()
if child:
 print(child,flush=True);raise SystemExit(0)
os.setsid()
null=os.open('/dev/null',os.O_RDWR)
for fd in(0,1,2):os.dup2(null,fd)
if null not in(0,1,2,200):os.close(null)
units=['aoe2war-'+kind+'@'+instance+'.service'for kind in('deps','build')]
while True:
 try:os.kill(parent,0);alive=True
 except ProcessLookupError:alive=False
 if not alive:
  quiet=True
  for unit in units:
   try:
    p=subprocess.run(['systemctl','show',unit,'--property=ActiveState,MainPID,ControlPID'],capture_output=True,timeout=5,check=True)
    if len(p.stdout)>4096:raise ValueError('bound')
    row=dict(x.split('=',1)for x in p.stdout.decode('ascii').splitlines())
    quiet=quiet and set(row)=={'ActiveState','MainPID','ControlPID'}and row['ActiveState']in('inactive','failed')and row['MainPID']==row['ControlPID']=='0'
   except Exception:quiet=False
  if quiet:os.close(200);raise SystemExit(0)
 time.sleep(1)
'''
