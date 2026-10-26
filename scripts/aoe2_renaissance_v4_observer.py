"""Read-only v4 supplement to the unchanged v3 financial runtime sensor.

Same operator trust domain, never independent financial certification. Adds
socket PID ownership and the effective startup-writer flag, plus process start,
cwd, pre-start BUILD_ID and the passive compiled version response. No secret
values other than the single nonsecret boolean policy flag are returned.
"""
from __future__ import annotations
from aoe2_renaissance_v4_scope import require
import aoe2_website_owner_observer_v3 as v3

SUPPLEMENT = r'''
_original_collect=collect

def listener(port,pid):
 raw=command(['ss','-H','-ltnp','sport = :'+str(port)])
 lines=raw.splitlines()
 if len(lines)!=1:fail('missing/ambiguous protected listener')
 fields=lines[0].split()
 if len(fields)<6 or fields[3]!='127.0.0.1:'+str(port):fail('non-loopback protected listener')
 pids=set(int(x) for x in re.findall(r'pid=([0-9]+)',lines[0]))
 if pids!={pid}:fail('protected listener is not owned by protected PID')
 return {'port':port,'pid':pid,'loopback':True}

def web_binding(pid,build_id,web_source):
 import urllib.request
 root='/var/www/AoE2HDBets/app-prodn'
 if os.readlink('/proc/'+str(pid)+'/cwd')!=root:fail('website process cwd differs')
 with open('/proc/'+str(pid)+'/stat')as f:
  raw=f.read(16385)
 if len(raw)>16384:fail('oversized process stat')
 ticks=int(raw.rsplit(')',1)[1].split()[19])
 with open('/proc/stat')as f:
  boot=next(int(x.split()[1])for x in f if x.startswith('btime '))
 start_ns=int((boot+ticks/os.sysconf('SC_CLK_TCK'))*1000000000)
 fd=os.open(root+'/.next/BUILD_ID',os.O_RDONLY|os.O_NOFOLLOW)
 try:
  st=os.fstat(fd);value=os.read(fd,129).decode('ascii').strip()
 finally:os.close(fd)
 if value!=build_id or st.st_mtime_ns>start_ns:fail('BUILD_ID changed after process start; running build unbound')
 with open('/proc/'+str(pid)+'/environ','rb')as f:env=f.read(524289)
 if len(env)>524288:fail('oversized process environment')
 rows=[x for x in env.split(b'\0')if x.startswith(b'WARGRAPH_RUNTIME_DISABLED=')]
 disabled=len(rows)==1 and rows[0]==b'WARGRAPH_RUNTIME_DISABLED=true'
 import shlex
 effective=shlex.split(command(['systemctl','show',SETTINGS['web_unit'],'-p','Environment','--value']))
 flags=[x for x in effective if x.startswith('WARGRAPH_RUNTIME_DISABLED=')]
 restart_disabled=flags==['WARGRAPH_RUNTIME_DISABLED=true']
 # This one static, passive endpoint never imports financial workers.
 with urllib.request.urlopen('http://127.0.0.1:3030/api/deployment-version',timeout=3)as response:
  if response.status!=200:fail('passive version unavailable')
  raw=response.read(513)
 if len(raw)>512:fail('oversized passive version')
 version=json.loads(raw)['buildVersion']
 with open(root+'/.aoe2war-build-version')as f:expected=f.read(129).strip()
 if version!=expected or not re.fullmatch('[A-Za-z0-9_.-]{8,128}',version):fail('compiled running version differs')
 return {'pid':pid,'cwd':root,'start_ticks':ticks,'start_epoch_ns':start_ns,
  'build_id':build_id,'build_id_inode':st.st_ino,'build_id_mtime_ns':st.st_mtime_ns,
  'compiled_version':version,'wargraph_runtime_disabled':disabled,'restart_runtime_disabled':restart_disabled}

def collect():
 packet=_original_collect()
 wanted={'8092':packet['immutable']['wolo8092']['pid'],'8093':packet['immutable']['wolo8093']['pid'],'3030':packet['website']['pid']}
 before={p:listener(int(p),pid)for p,pid in wanted.items()}
 binding=web_binding(packet['website']['pid'],packet['website']['build_id'],packet['website']['source_sha'])
 after={p:listener(int(p),pid)for p,pid in wanted.items()}
 if before!=after or unit(SETTINGS['web_unit'])['MainPID']!=binding['pid']:fail('process/listener changed during v4 supplement')
 packet['v4_runtime']={'listeners':after,'web_process':binding}
 packet['collection_finished_at']=packet['observed_at']=stamp()
 return packet
'''
REMOTE_PROGRAM=v3.REMOTE_PROGRAM.replace("if __name__=='__main__':",SUPPLEMENT+"\nif __name__=='__main__':")

def validate_observation(packet,*,now=None,max_age_seconds=90):
 require(type(packet)is dict and 'v4_runtime'in packet,'v4 process/listener evidence missing')
 v3.validate_observation({k:v for k,v in packet.items()if k!='v4_runtime'},now=now,max_age_seconds=max_age_seconds)
 extra=packet['v4_runtime']
 require(type(extra)is dict and set(extra)=={'listeners','web_process'},'unknown v4 runtime scope')
 listeners=extra['listeners'];website=packet['website'];web=extra['web_process']
 require(type(listeners)is dict and set(listeners)=={'8092','8093','3030'},'incomplete protected listener evidence')
 for port,label in(('8092','wolo8092'),('8093','wolo8093'),('3030',None)):
  pid=packet['immutable'][label]['pid']if label else website['pid']
  require(listeners[port]=={'port':int(port),'pid':pid,'loopback':True},'protected socket PID mismatch')
 require(type(web)is dict and set(web)=={'pid','cwd','start_ticks','start_epoch_ns','build_id','build_id_inode','build_id_mtime_ns','compiled_version','wargraph_runtime_disabled','restart_runtime_disabled'},'incomplete running build binding')
 require(web['pid']==website['pid']and web['build_id']==website['build_id']and
  web['cwd']=='/var/www/AoE2HDBets/app-prodn'and all(type(web[k])is int and web[k]>0 for k in('start_ticks','start_epoch_ns','build_id_inode','build_id_mtime_ns'))and
  web['build_id_mtime_ns']<=web['start_epoch_ns']and type(web['compiled_version'])is str and v3.re.fullmatch('[A-Za-z0-9_.-]{8,128}',web['compiled_version'])is not None,'running process/build/source mismatch')
 require(web['wargraph_runtime_disabled']is True and web['restart_runtime_disabled']is True,'startup-finance-writer-active: existing WARGRAPH_RUNTIME_DISABLED=true not proven; no configuration mutation authorized')
 return packet
