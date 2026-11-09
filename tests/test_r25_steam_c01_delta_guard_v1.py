"""Exact read-only dual-C01 source guard. No real host mutation on import/test."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch,MagicMock

SOURCE=Path(__file__).resolve().parents[1]/'scripts/release/r25_steam_c01_delta_guard_v1.py'
spec=importlib.util.spec_from_file_location('source_guard',str(SOURCE))
g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)

class MockCanonical:
 def canonical(self,value):return json.dumps(value,sort_keys=True,separators=(',',':')).encode()
 def sha(self,body):return hashlib.sha256(body).hexdigest()

class StrictExactC01(unittest.TestCase):
 def setUp(self):
  self.m=MockCanonical()
  self.names=sorted(g.SERVICE_PROFILES)
  self.filemap={}
  self.commands={}
  self.pol={}
  self.snapshot={'units':{},'protected_sockets':{'3030':['old'], '8092':[],'8093':[], '5432':['pg']},'preview_nft_sha256':'frozen'}
  for name in self.names:
   old=g.OLD_VCS;new=g.NEW_VCS
   base=Path('/etc/systemd/system')/name
   drop=Path('/etc/systemd/system')/(name+'.d')/'40-c01-reviewed-executable.conf'
   filename='woloreviewerd' if 'reviewer' in name else 'wolosatcheld'
   bn=Path('/usr/local/libexec/wolo-c01')/new/filename
   basebytes=('ExecStart=/usr/local/libexec/wolo-c01/'+old+'/'+filename+'\n').encode()
   dropbytes=('ExecStart=/usr/local/libexec/wolo-c01/'+new+'/'+filename+'\nConditionPathExists=/run/wolo-c01-maintenance-hold-approved\n').encode()
   binbytes=('exact-'+name).encode()
   self.filemap.update({base:basebytes,drop:dropbytes,bn:binbytes})
   prefix=b'# '+str(base).encode()+b'\n'+basebytes
   cat=prefix+b'\n# '+str(drop).encode()+b'\n'+dropbytes
   cmd=('{ path=/usr/local/libexec/wolo-c01/'+new+'/'+filename+' ; argv[]=/usr/local/libexec/wolo-c01/'+new+'/'+filename+' --config config.json ; ignore_errors=no ; start_time=[n/a] ; stop_time=[n/a] ; pid=0 ; code=(null) ; status=0/0 }').encode()
   oldcmd=cmd.replace(new.encode(),old.encode())
   self.commands[('systemctl','cat',name)]=cat
   self.commands[('systemctl','show',name,'-p','ExecStart','--value')]=cmd+b'\n'
   kind='reviewer' if 'reviewer' in name else 'custody'
   user='wolo-reviewer' if 'reviewer' in name else 'wolo-satchel'
   self.pol[name]={
    'base_sha':g.sha(basebytes),'dropin_sha':g.sha(dropbytes),
    'current_config_sha':g.sha(cat),'old_config_sha':g.sha(prefix),
    'current_exec_sha':g.sha(cmd),'old_exec_sha':g.sha(oldcmd),
    'binary_name':filename,'binary_sha':g.sha(binbytes),
    'user':user,'dir':kind}
   self.snapshot['units'][name]={'properties':{'Id':name,'Type':'simple','ActiveState':'inactive','MainPID':'0','Result':'success','NeedDaemonReload':'no','ExecMainStartTimestampMonotonic':'0','DropInPaths':str(drop),'ExecStart_sha256':g.sha(cmd),'User':user,'WorkingDirectory':'/var/lib/wolo-financial-role-state/v1/'+kind},'start_ticks':None,'unit_config_sha256':g.sha(cat)}
  self.snapshot['units']['third-financial.service']={'properties':{'MainPID':'0'},'start_ticks':None}
  oldsnap=copy.deepcopy(self.snapshot)
  for name,policy in self.pol.items():
   oldsnap['units'][name]['properties']['ExecStart_sha256']=policy['old_exec_sha']
   oldsnap['units'][name]['properties']['DropInPaths']=''
   oldsnap['units'][name]['unit_config_sha256']=policy['old_config_sha']
  self.original=self.m.sha(self.m.canonical(oldsnap))
  self.current=self.m.sha(self.m.canonical(self.snapshot))
 def qualify(self,snap=None,filemap=None,commands=None):
  s=self.snapshot if snap is None else snap
  files=self.filemap if filemap is None else filemap
  cmds=self.commands if commands is None else commands
  sentinel=MagicMock()
  sentinel.exists.return_value=False
  sentinel.is_symlink.return_value=False
  with (
    patch.object(g,'SERVICE_PROFILES',self.pol),
    patch.object(g,'PRE_C01_SHA',self.original),
    patch.object(g,'POST_C01_SHA',self.current),
    patch.object(g,'SENTINEL',sentinel),
    patch.object(g,'rootfile',side_effect=lambda path,mode:files[path]),
    patch.object(g,'exec_readonly',side_effect=lambda command:cmds[tuple(command)]),
  ):
   return g.reconstruct_pre_c01(self.m,s)
 def test_real_pinned_scope_exactly_two(self):
  self.assertEqual(set(g.SERVICE_PROFILES),{'wolo-satchel-c01.service','wolo-reviewer-c01.service'})
  self.assertEqual(g.PRE_C01_SHA,'064a16dde48c64a3001621902b4ae7a028ec4975183fd4c24b8a16338c1a226c')
  self.assertEqual(g.POST_C01_SHA,'6bef38a7bbd89f4041e832eeebfa7c2213fa627633299b8d0ad45135b3018999')
 def test_untampered_two_delta_returns_qualified(self):
  result=self.qualify()
  self.assertEqual(result['status'],'PASS_EXACT_TWO_C01_INERT_UNIT_DELTAS_ONLY')
  self.assertFalse(result['finance_authorized'])
 def test_third_financial_unit_change_refused(self):
  altered=copy.deepcopy(self.snapshot)
  altered['units']['third-financial.service']['properties']['MainPID']='123'
  with self.assertRaisesRegex(RuntimeError,'EXACT_POST_C01_FINGERPRINT'):self.qualify(snap=altered)
 def test_active_or_running_c01_denied(self):
  for attr,val in [('ActiveState','active'),('MainPID','123'),('Result','exit-code'),('NeedDaemonReload','yes')]:
   with self.subTest(attr=attr):
    bad=copy.deepcopy(self.snapshot)
    bad['units'][self.names[0]]['properties'][attr]=val
    with self.assertRaises(RuntimeError):self.qualify(snap=bad)
 def test_wrong_source_dropin_exec_or_binary_denied(self):
  for kind in ['drop','base','binary','exec']:
   with self.subTest(kind=kind):
    files=copy.copy(self.filemap); cmds=copy.copy(self.commands);name=self.names[0]
    if kind=='exec':cmds[('systemctl','show',name,'-p','ExecStart','--value')]=b'/fake\n'
    else:
     key=next(x for x in files if (kind=='drop' and x.name=='40-c01-reviewed-executable.conf' and name in str(x)) or
                  (kind=='base' and x.name==name) or
                  (kind=='binary' and 'woloreviewerd' in str(x)))
     files[key]=b'tampered'
    with self.assertRaises(RuntimeError):self.qualify(filemap=files,commands=cmds)
 def test_missing_or_changed_original_baseline_refused(self):
  for name in self.names:
   with self.subTest(name=name):
    original=self.pol[name]['old_exec_sha']
    self.pol[name]['old_exec_sha']='0'*64
    try:
     with self.assertRaisesRegex(RuntimeError,'ORIGINAL_EXECSTART_PREIMAGE'):self.qualify()
    finally:self.pol[name]['old_exec_sha']=original
 def test_no_host_write_operations(self):
  source=SOURCE.read_text()
  for forbidden in ('systemctl start','systemctl stop','daemon-reload','nft add','nft insert','ALTER ROLE','GRANT ','os.system(','Popen('):
   self.assertNotIn(forbidden,source)

if __name__=='__main__':unittest.main()
