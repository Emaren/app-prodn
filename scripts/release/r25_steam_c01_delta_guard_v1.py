#!/usr/bin/env python3
"""Source-pinned, read-only proof: exactly two inactive C01 unit drop-in deltas.

Reconstructs the *authentic accepted* pre-C01 C03/C04 snapshot entirely
in memory, and rejects any third service/socket/nft/command change.
No permit, systemd reload, netfilter write, signer or wallet access.
"""
from __future__ import annotations
import copy
import hashlib
import os
from pathlib import Path
import re
import stat
import subprocess

PRE_C01_SHA='064a16dde48c64a3001621902b4ae7a028ec4975183fd4c24b8a16338c1a226c'
POST_C01_SHA='6bef38a7bbd89f4041e832eeebfa7c2213fa627633299b8d0ad45135b3018999'
OLD_VCS='f7b5a74928e041a6a90ac983d87649e0484677a4'
NEW_VCS='f2ac58a9793ba02acf8dbbaf828ee8fe1aee4b0b'
SENTINEL=Path('/run/wolo-c01-maintenance-hold-approved')
SERVICE_PROFILES={
 'wolo-satchel-c01.service':{
  'base_sha':'aae18c68e6ca71986cab71b991ed97b72fd6afa48a9cf14ec04585b6e6f1da63',
  'dropin_sha':'c7f5541ef28228cbf64ec2bf083995fedaafeacf25313e6a4f6c4c13252b09eb',
  'current_config_sha':'09345231256daf861f20c0a1440663e2f2bda7f409446f249982f58337748bc6',
  'old_config_sha':'e839b40cdc78fea111e4e919f6b5f8991ecc91e41936b112be78f2b2a4e66bae',
  'current_exec_sha':'8b279b760e8f6c254eadd362bc87eb69758b7fb1683745ec4cbdaa4b998d89e2',
  'old_exec_sha':'52b714f1936f14da48a39b6d7581d962563c5c0e25bc5a97c8e8e9fa7c29cbe7',
  'binary_name':'wolosatcheld',
  'binary_sha':'0e9692c124269866f53f9b2b28b7eac59f5ad384970876b143b6ef61470b525e',
  'user':'wolo-satchel',
  'dir':'custody',
 },
 'wolo-reviewer-c01.service':{
  'base_sha':'8c31bab9df52e091618a2469b2567f44720145ab4f11a4efe5881976a1d3fc30',
  'dropin_sha':'d8f7c807030ddf4189afef72d2de82f76102b3b78541b1b9db4e829ed9301166',
  'current_config_sha':'4f03387b9ab2f4f27cb34e5089916a66b0af46ec60cb5a1195de273ed325aa3d',
  'old_config_sha':'fc3d844cdaf018264298d6354213f08db01a249f616a1cd7fabe4090b25e005f',
  'current_exec_sha':'6ed24456a25429e90a1708bfc4c6aa6d9bdf50c383a8a7195f8ca8ebceec06ef',
  'old_exec_sha':'97f55e0df89af7a4c9715018240cce1f4f3efde418baa6a911f52237a6e6692c',
  'binary_name':'woloreviewerd',
  'binary_sha':'17165fa6c590da1d20e761546bffc4795e884cf4bce8310e333373e9bfdf36de',
  'user':'wolo-reviewer',
  'dir':'reviewer',
 },
}

def hold(label):
 raise RuntimeError('HOLD:C01_EXACT_DELTA_'+label)

def require(ok,label):
 if not ok:hold(label)

def sha(b):
 return hashlib.sha256(b).hexdigest()

def rootfile(path:Path,mode:int)->bytes:
 st=path.lstat()
 require(stat.S_ISREG(st.st_mode) and st.st_uid==0
         and st.st_gid==0 and st.st_nlink==1 and
         stat.S_IMODE(st.st_mode)==mode,'SOURCE_ACL')
 fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
 with os.fdopen(fd,'rb') as f:return f.read()

def exec_readonly(args):
 p=subprocess.run(args,capture_output=True,timeout=12,check=False)
 require(p.returncode==0,'NATIVE_READONLY_COMMAND')
 return p.stdout

def reconstruct_pre_c01(m,snapshot):
 # Snapshot was already produced by the immutable C03 V1 + C04 guard. It is
 # never written back; no exception modifies financial unit source or state.
 require(type(snapshot) is dict and type(snapshot.get('units')) is dict,'SNAPSHOT_SCHEMA')
 require(m.sha(m.canonical(snapshot))==POST_C01_SHA,'EXACT_POST_C01_FINGERPRINT')
 require(not SENTINEL.exists() and not SENTINEL.is_symlink(),'MAINTENANCE_SENTINEL_PRESENT')
 prior=copy.deepcopy(snapshot)
 for unit,policy in SERVICE_PROFILES.items():
  props=snapshot['units'].get(unit,{}).get('properties',{})
  require(props.get('Id')==unit and props.get('Type')=='simple'
   and props.get('ActiveState')=='inactive' and props.get('MainPID')=='0'
   and props.get('Result')=='success' and props.get('NeedDaemonReload')=='no'
   and props.get('ExecMainStartTimestampMonotonic')=='0','NATIVE_C01_SERVICE_NOT_INERT')
  require(snapshot['units'][unit].get('start_ticks') is None,'C01_START_TICKS_CHANGED')
  base=Path('/etc/systemd/system')/unit
  drop=Path('/etc/systemd/system')/(unit+'.d')/'40-c01-reviewed-executable.conf'
  require(props.get('DropInPaths')==str(drop),'DROPIN_SCOPE')
  rawbase=rootfile(base,0o644); rawdrop=rootfile(drop,0o644)
  require(sha(rawbase)==policy['base_sha'] and sha(rawdrop)==policy['dropin_sha'],
          'C01_REVIEWED_SOURCE_HASH')
  require(b'ConditionPathExists=/run/wolo-c01-maintenance-hold-approved' in rawdrop,
          'MISSING_INERT_START_CONDITION')
  require(rawbase.count(OLD_VCS.encode())==1 and rawdrop.count(NEW_VCS.encode())==1,
          'C01_EXECUTABLE_SCOPE')
  unitcat=exec_readonly(['systemctl','cat',unit])
  require(sha(unitcat)==policy['current_config_sha'] and
          snapshot['units'][unit].get('unit_config_sha256')==policy['current_config_sha'],
          'UNIT_CONFIG_SHA_CHANGED')
  before=b'# '+str(base).encode()+b'\n'+rawbase
  require(sha(before)==policy['old_config_sha'],'AUTHENTIC_BASE_UNIT_PREIMAGE')
  cmd=exec_readonly(['systemctl','show',unit,'-p','ExecStart','--value']).strip()
  require(cmd.count(NEW_VCS.encode())==2
          and sha(cmd)==policy['current_exec_sha']
          and props.get('ExecStart_sha256')==policy['current_exec_sha'],
          'EFFECTIVE_EXECSTART_CHANGED')
  oldcmd=cmd.replace(NEW_VCS.encode(),OLD_VCS.encode())
  require(sha(oldcmd)==policy['old_exec_sha'],'ORIGINAL_EXECSTART_PREIMAGE')
  newbin=Path('/usr/local/libexec/wolo-c01')/NEW_VCS/policy['binary_name']
  require(sha(rootfile(newbin,0o555))==policy['binary_sha'],
          'QUALIFIED_C01_BINARY_DRIFT')
  require(props.get('User')==policy['user']
          and props.get('WorkingDirectory')=='/var/lib/wolo-financial-role-state/v1/'+policy['dir'],
          'C01_ROLE_IDENTITY_DRIFT')
  # Only three authorized differences per exact service.
  prior['units'][unit]['properties']['ExecStart_sha256']=policy['old_exec_sha']
  prior['units'][unit]['properties']['DropInPaths']=''
  prior['units'][unit]['unit_config_sha256']=policy['old_config_sha']
 require(m.sha(m.canonical(prior))==PRE_C01_SHA,'AUTHENTIC_PRE_C01_FINGERPRINT')
 return {'status':'PASS_EXACT_TWO_C01_INERT_UNIT_DELTAS_ONLY',
         'pre_c01_sha256':PRE_C01_SHA,
         'post_c01_sha256':POST_C01_SHA,
         'delta_units':sorted(SERVICE_PROFILES),
         'finance_authorized':False}

if __name__=='__main__':
 # Diagnostic intentionally cannot be called directly to mutate any host state.
 print('SOURCE_ONLY_IMPORT_AND_TEST; no production admission')
