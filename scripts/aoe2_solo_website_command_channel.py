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
import base64,fcntl,json,os,pathlib,re,selectors,shlex,signal,stat,subprocess,sys,time
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
  # W1 original protected stage/activation must execute as real UID1000.
  argv=['/usr/bin/setpriv','--reuid=1000','--regid=1000',
   '--init-groups','/usr/bin/env','-i','HOME=/home/tony',
   'USER=tony','LOGNAME=tony','PATH=/usr/local/bin:/usr/bin:/bin',
   '/bin/bash','-lc',source]
 else:
  # Absolutely NO arbitrary root bash/script/program execution. Root commands
  # are an exact reviewed phase-helper argv, never shell-interpreted.
  parts=shlex.split(source)
  helper='/usr/local/libexec/aoe2war/solo-v1-root-phase'
  if len(parts)<4 or parts[0]!='python3' or parts[1]!=helper:
   raise PermissionError('root phase helper only')
  verb=parts[2]
  sizes={'consume':4,'consumed-proof':6,'mark-staged':6,
         'complete-activation':6,'reconcile-rollback':5,'issue':None}
  if verb not in sizes or (verb!='issue' and len(parts)!=sizes[verb]):
   raise PermissionError('unknown protected root verb')
  hex64=re.compile(r'[0-9a-f]{64}\Z')
  hex40=re.compile(r'[0-9a-f]{40}\Z')
  if verb=='issue':
   if (len(parts) not in (5,8) or
       parts[3] not in ('PRE_STAGE','PRE_ACTIVATE') or
       not hex40.fullmatch(parts[4])):
    raise PermissionError('invalid issuer phase/source')
   if parts[3]=='PRE_STAGE':
    if len(parts)!=5:raise PermissionError('stage issue must be fresh')
   elif len(parts)!=8 or not all(hex64.fullmatch(v) for v in parts[5:]):
    raise PermissionError('invalid activation issue identity')
  elif verb=='consume':
   if not re.fullmatch(r'[A-Za-z0-9+/=]{100,350000}',parts[3]):
    raise PermissionError('invalid owner packet encoding')
  else:
   if not hex64.fullmatch(parts[3]):
    raise PermissionError('invalid owner attempt')
   if verb=='consumed-proof':
    if parts[4] not in ('PRE_STAGE','PRE_ACTIVATE') or not hex64.fullmatch(parts[5]):
     raise PermissionError('bad root proof identity')
   elif verb=='complete-activation':
    if not hex40.fullmatch(parts[4]) or not re.fullmatch(r'[A-Za-z0-9_-]{8,128}',parts[5]):
     raise PermissionError('invalid release and BUILD_ID')
   elif verb=='reconcile-rollback':
    if not re.fullmatch(r'/mnt/HC_Volume_105319120/aoe2war/deploy-receipts/activate-[A-Za-z0-9_-]{12,160}',parts[4]):
     raise PermissionError('foreign activation rollback path')
   else:
    if not hex64.fullmatch(parts[4]) or not parts[5].startswith('/mnt/HC_Volume_105319120/aoe2war/deploy-receipts/stage-'):
     raise PermissionError('foreign stage receipt')
  argv=['/usr/bin/python3',helper,verb]+parts[3:]
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
def same_lease_rollback(phase,verified,dispatched,burned,attempt):
 return (phase is not None and phase[1]=='PRE_ACTIVATE' and
         phase[0]==attempt and verified is True and
         dispatched is True and burned is False)
try:
 if os.geteuid()!=0:raise PermissionError('root-only protected command lease required')
 if not lock.is_absolute() or lock.is_symlink():
  raise PermissionError('original release.lock path must exist and be unlinked')
 # UID1000 owns the original lock inode, so its containing directories
 # MUST NOT be UID1000-owned or writable by UID1000. Otherwise tony can
 # unlink+replace the lock while another process holds the old inode.
 for ancestor in (lock.parent,*lock.parent.parents):
  if ancestor.is_symlink():raise PermissionError('linked release ancestor')
  a=ancestor.stat()
  if not stat.S_ISDIR(a.st_mode)or a.st_uid!=0 or a.st_mode&0o022:
   raise PermissionError('release lock ancestor can be replaced by UID1000')
 st=lock.stat()
 if st.st_uid!=1000 or stat.S_IMODE(st.st_mode)!=0o644 or not stat.S_ISREG(st.st_mode):
  raise PermissionError('native UID1000 mode0644 release.lock identity mismatch')
 fd=os.open(lock,os.O_RDWR|os.O_NOFOLLOW|os.O_CLOEXEC)
 fs=os.fstat(fd)
 if (fs.st_dev,fs.st_ino)!=(st.st_dev,st.st_ino):
  raise PermissionError('release.lock inode changed')
 fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
 # Re-check the path identity under the physical flock. If a privileged
 # actor replaces the path, fail closed instead of admitting a split lock.
 again=os.lstat(lock)
 if (again.st_dev,again.st_ino)!=(fs.st_dev,fs.st_ino):
  raise PermissionError('canonical release.lock inode changed after flock')
 temp=meta.with_name('.'+meta.name+'.'+str(os.getpid()))
 with temp.open('x')as f:os.chmod(temp,0o600);f.write(holder+'\n');f.flush();os.fsync(f.fileno())
 os.replace(temp,meta)
 emit({'kind':'acquired'})
 # A stolen command SSH key alone cannot launch a UID1000 shell.
 # Root must first consume a REAL signed owner phase, then independently
 # verify that same immutable root journal phase before one website action.
 phase=None;phase_verified=False;website_dispatched=False;rollback_dispatched=False;issue_dispatched=False
 while True:
  line=sys.stdin.buffer.readline(800000)
  if not line:break
  if line==b'release\n':break
  if len(line)>=800000 or not line.endswith(b'\n'):raise ValueError('frame')
  x=json.loads(line)
  if set(x)!={'id','script','timeout','run_as'}or type(x['id'])is not str or len(x['id'])!=32:raise ValueError('request')
  current=os.lstat(lock)
  if (current.st_dev,current.st_ino)!=(fs.st_dev,fs.st_ino):
   raise PermissionError('canonical release.lock inode changed before dispatch')
  verb=None
  if x.get('run_as')=='tony':
   if phase is None or not phase_verified or website_dispatched:
    raise PermissionError('signed single-use website phase not armed')
   website_dispatched=True  # burn on attempt, including SSH loss/UNKNOWN
  else:
   parts=shlex.split(base64.b64decode(x['script'],validate=True).decode('utf-8'))
   verb=parts[2] if len(parts)>=3 else None
   if issue_dispatched:
    raise PermissionError('issuance-only lease cannot dispatch another operation')
   if verb=='issue':
    if phase is not None or website_dispatched:
     raise PermissionError('issue cannot follow consumed owner phase')
    issue_dispatched=True  # one issue per original FD200 lease
   elif verb=='consume':
    if phase is not None:raise PermissionError('owner phase already consumed')
   elif verb=='consumed-proof':
    if phase is None or phase_verified or website_dispatched:
     raise PermissionError('unexpected root proof sequence')
   elif verb in ('mark-staged','complete-activation'):
    if phase is None or not phase_verified or not website_dispatched:
     raise PermissionError('phase completion without verified website mutation')
   elif verb=='reconcile-rollback':
    # Only the same PRE_ACTIVATE SSH/FD200 lease may reconcile its own
    # original consumed packet and attempted website action, at most once.
    # A new lease on the same inode CANNOT inherit the old session state.
    if not same_lease_rollback(phase,phase_verified,website_dispatched,
                               rollback_dispatched,parts[3]):
     raise PermissionError('rollback requires same active owner activation lease')
    rollback_dispatched=True  # burn on attempt, including UNKNOWN/transport loss
  outcome=run(x)
  if x.get('run_as')=='root' and outcome['returncode']==0:
   try:
    reply=json.loads(base64.b64decode(outcome['stdout'],validate=True))
   except (ValueError,TypeError):
    raise PermissionError('malformed root nonce proof')
   if verb=='consume':
    if reply.get('status')!='ROOT_CONSUMED_SINGLE_USE':
     raise PermissionError('root phase not actually consumed')
    phase=(reply['attempt_id'],reply['phase'],reply['packet_sha256'])
   elif verb=='consumed-proof':
    if (reply.get('status')!='ROOT_CONSUMED_SINGLE_USE' or
        (reply.get('attempt_id'),reply.get('phase'),
         reply.get('packet_sha256'))!=phase):
     raise PermissionError('wrong owner nonce proof')
    phase_verified=True
  emit(outcome)
  current=os.lstat(lock)
  if (current.st_dev,current.st_ino)!=(fs.st_dev,fs.st_ino):
   raise PermissionError('canonical release.lock inode changed after dispatch')
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
 # Root SSH has a server-side authorized_keys forced-command: it accepts
 # this single fixed verb only; REMOTE is loaded from root-pinned installed
 # code on HEL1, NEVER transmitted as arbitrary user-supplied Python.
 command='aoe2war-solo-channel '+base64.b64encode(holder.encode('utf-8')).decode('ascii')
 from aoe2_solo_website_host_observer import (
  CONFIG_ROOT,KNOWN_HOSTS,host_fingerprint,protected_file
 )
 host_fingerprint()
 key=CONFIG_ROOT/'hel1-command-identity'
 protected_file(key,private=True)
 # Root-owned private key is intentionally inaccessible to Mac's user
 # process; use cached explicit owner sudo authentication, no prompt.
 p=subprocess.Popen(['/usr/bin/sudo','-n','/usr/bin/ssh',
  '-T','-o','BatchMode=yes','-o','IdentitiesOnly=yes',
  '-o','StrictHostKeyChecking=yes','-o','GlobalKnownHostsFile=/dev/null',
  '-o','UserKnownHostsFile='+str(KNOWN_HOSTS),
  '-o','HostKeyAlgorithms=ssh-ed25519','-o','ConnectTimeout=8',
  '-i',str(key),host,command],
  stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
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
