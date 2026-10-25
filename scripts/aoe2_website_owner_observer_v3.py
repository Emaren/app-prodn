#!/usr/bin/env python3
"""Bounded READ-ONLY, same-owner SSH observations for website policy v3.

This is not an independent attestation, a complete financial-writer census, bank
proof or authority to change Wolo. No keys/signing, SQL, financial HTTP routes,
service mutation or production files are written. Only configured unit state,
protected configuration digests and executing process/file identity are read.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import selectors
import signal
import subprocess
import time
from datetime import datetime, timedelta, timezone

from aoe2_website_release_v2 import Hold, canonical, require, utc_time

KIND = "aoe2war-owner-runtime-observation-v3"
MAX_OUTPUT = 1024 * 1024
MAX_STDERR = 16 * 1024
MAX_SECONDS = 45
# A bounded allowance for authenticated hel1's UTC clock running slightly
# ahead of the Mac. This does NOT extend the 90-second/1200-second stale limits.
# A future timestamp >5s remains a hard HOLD; source/unit/PID fences unchanged.
MAX_REMOTE_CLOCK_LEAD_SECONDS = 5
WOLO_SOURCE = "78c25985420ee41a6678c42fab8ea8d6c3b1b519"
REVIEWED_WOLO_SOURCE = "4ce11c4965da64e3d4dee6a8681b6198e1aba1eb"
WOLO_SERVICES = {
    "wolo8092": "wolochain-mainnet-settlement.service",
    "wolo8093": "wolochain-founder-rewards-settlement.service",
    "consensus": "wolochaind-mainnet.service",
}
EXPECTED_EXECUTABLES = {
    "wolo8092": "040126a2884946caf1651a50b7d8115c5a6fb2d5aa94fcbbe150694602d451a5",
    "wolo8093": "040126a2884946caf1651a50b7d8115c5a6fb2d5aa94fcbbe150694602d451a5",
    "consensus": "4b77f622191db7550cb87cafb8f1886a0aadebee3eb6565f9f90036f809e61d3",
}
WEB_UNIT = "aoe2hdbets-web.service"
TIMER_FAMILIES = (
    "aoe2hdbets-bet-stake-reconcile", "aoe2hdbets-challenge-reconcile",
    "aoe2hdbets-replay-auto-recovery", "aoe2hdbets-staking-rewards",
    "aoe2hdbets-trophy-tributes", "aoe2-wolo-transfer-heartbeat",
)
UNITS = tuple(sorted({*WOLO_SERVICES.values(), WEB_UNIT,
                     "aoe2hdbets-api.service", "aoe2dewarwagers-web.service",
                     "aoe2dewarwagers-api.service",
                     *(name + suffix for name in TIMER_FAMILIES
                       for suffix in (".service", ".timer"))}))
HEX40 = re.compile(r"[0-9a-f]{40}\Z")
HEX64 = re.compile(r"[0-9a-f]{64}\Z")

# This exact program is sent over an authenticated, host-key-checked SSH channel.
# It accepts no operator-supplied observation, unit name, file path or command.
REMOTE_PROGRAM = r'''
import datetime,hashlib,json,os,pwd,re,selectors,signal,stat,subprocess,sys,time
SETTINGS=__SETTINGS__
MAX_FILE=1024*1024
MAX_CONFIG_TOTAL=8*1024*1024
config_bytes=0

def fail(message):raise RuntimeError(message)
def stamp():return datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00','Z')
def command(args):
 p=subprocess.Popen(args,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,
                    env={'PATH':'/usr/sbin:/usr/bin:/sbin:/bin','LC_ALL':'C','GIT_CONFIG_NOSYSTEM':'1','GIT_CONFIG_GLOBAL':'/dev/null'})
 deadline=time.monotonic()+3;data=bytearray()
 try:
  with selectors.DefaultSelector() as selector:
   os.set_blocking(p.stdout.fileno(),False);selector.register(p.stdout,selectors.EVENT_READ)
   while selector.get_map():
    left=deadline-time.monotonic()
    if left<=0:fail('bounded read command timed out')
    for key,_ in selector.select(min(left,0.25)):
     chunk=os.read(key.fileobj.fileno(),65536)
     if not chunk:selector.unregister(key.fileobj);continue
     if len(data)+len(chunk)>262144:fail('bounded read command output exceeded')
     data.extend(chunk)
  left=deadline-time.monotonic()
  if left<=0 or p.wait(timeout=left)!=0:fail('bounded read command unavailable')
  return bytes(data).decode('utf-8','strict').strip()
 finally:
  if p.poll() is None:p.kill()
  p.wait(timeout=2);p.stdout.close()
def canonical(value):return json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=True,allow_nan=False).encode('ascii')
def digest(value):return hashlib.sha256(canonical(value)).hexdigest()
def unit(name):
 raw=command(['systemctl','show','--all',name,'--property=LoadState,ActiveState,SubState,UnitFileState,MainPID,FragmentPath,DropInPaths,EnvironmentFiles'])
 row={}
 for line in raw.splitlines():
  key,sep,value=line.partition('=')
  if not sep or (key in row and key!='EnvironmentFiles'):fail('malformed unit response')
  if key=='EnvironmentFiles' and key in row:
   row[key]=' '.join(x for x in (row[key],value) if x)
  else:row[key]=value
 basic={'LoadState','ActiveState','SubState','UnitFileState','FragmentPath','DropInPaths'}
 expected=basic|{'MainPID','EnvironmentFiles'}
 # Timer units do not have the service execution-context DBus interface.
 # Absence of service-only properties is structural, not a missing timer state.
 if name.endswith('.timer'):
  if not basic.issubset(row) or not set(row).issubset(expected):fail('configured timer metadata unavailable')
  if row.get('MainPID','0')!='0' or row.get('EnvironmentFiles',''):fail('unexpected timer execution context')
  row['MainPID']='0';row['EnvironmentFiles']=''
 else:
  if not (basic|{'MainPID'}).issubset(row) or not set(row).issubset(expected):fail('configured service metadata unavailable')
  # systemctl omits an empty EnvironmentFiles array even with --all on
  # some versions. Unit fragment/drop-in bytes are still hashed below.
  row.setdefault('EnvironmentFiles','')
 if row['LoadState']!='loaded':fail('configured unit unavailable')
 if not row['MainPID'].isdigit():fail('invalid unit PID')
 row['MainPID']=int(row['MainPID'])
 return row

def open_config_file(path):
 # Pin directory descriptors; no intermediate or final symlink may redirect
 # the read between realpath admission and open, including the private API env.
 pieces=path.strip('/').split('/')
 parent=os.open('/',os.O_RDONLY|os.O_DIRECTORY)
 try:
  for piece in pieces[:-1]:
   child=os.open(piece,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=parent)
   os.close(parent);parent=child
  return os.open(pieces[-1],os.O_RDONLY|os.O_NOFOLLOW,dir_fd=parent)
 finally:os.close(parent)

def hash_config(path,optional=False):
 global config_bytes
 if not path.startswith('/') or '\\' in path or '..' in path.split('/') or '\x00' in path:fail('unsafe configured path')
 # Resolve Debian's /lib symlink, but admit only this explicit configuration scope.
 actual=os.path.realpath(path)
 roots=('/etc/systemd/system/','/usr/lib/systemd/system/','/etc/aoe2hdbets/','/etc/aoe2dewarwagers/','/etc/wolochain/','/etc/wolo/')
 default_ok=actual.startswith('/etc/default/') and os.path.basename(actual).startswith(('aoe2','wolo'))
 exact_root_files={'/etc/wolochain-founder-rewards-settlement.env','/etc/wolochain-mainnet-settlement.env','/etc/wolochain-mainnet/wolochaind-mainnet.env'}
 api_path='/var/www/AoE2HDBets/api-prodn/.env.production'
 api_private=path==actual==api_path and not os.path.islink(path)
 if not (actual.startswith(roots) or default_ok or actual in exact_root_files or api_private):fail('configuration source outside approved scope')
 try:fd=open_config_file(actual)
 except FileNotFoundError:
  if optional:return [path,'missing-optional']
  raise
 try:
  before=os.fstat(fd)
  owner_ok=before.st_uid==0 and not before.st_mode&0o022
  if api_private:owner_ok=before.st_uid==pwd.getpwnam('tony').pw_uid and stat.S_IMODE(before.st_mode)==0o600
  if not stat.S_ISREG(before.st_mode) or not owner_ok or before.st_size>MAX_FILE:fail('unprotected/oversized configured file')
  value=b''
  while True:
   chunk=os.read(fd,65536)
   if not chunk:break
   value+=chunk
   if len(value)>MAX_FILE:fail('configured file grew beyond bound')
  after=os.fstat(fd)
  current=os.stat(actual,follow_symlinks=False)
  ident=lambda x:(x.st_dev,x.st_ino,x.st_size,x.st_mtime_ns,x.st_ctime_ns,x.st_uid,x.st_gid,x.st_mode)
  if ident(before)!=ident(after) or ident(after)!=ident(current):fail('configuration changed during read')
  config_bytes+=len(value)
  if config_bytes>MAX_CONFIG_TOTAL:fail('configuration inventory exceeds bound')
  return [path,actual,before.st_uid,before.st_gid,stat.S_IMODE(before.st_mode),hashlib.sha256(value).hexdigest()]
 finally:os.close(fd)

def config(row):
 paths=[(row['FragmentPath'],False)] if row['FragmentPath'] else []
 paths.extend((x,False) for x in row['DropInPaths'].split())
 raw=row['EnvironmentFiles']
 if raw:
  entries=re.findall(r'(/[^\s]+) \(ignore_errors=(yes|no)\)',raw)
  if not entries or ' '.join(p+' (ignore_errors='+e+')' for p,e in entries)!=raw:fail('unreviewable environment-file references')
  paths.extend((p,e=='yes') for p,e in entries)
 if not paths or len(paths)>32:fail('empty/oversized unit configuration scope')
 return digest([hash_config(p,optional) for p,optional in paths])

def execution(name,row):
 pid=row['MainPID']
 if pid<=0 or row['ActiveState']!='active' or row['SubState']!='running':fail('protected service not active/running')
 path='/proc/'+str(pid)+'/exe'
 fd=os.open(path,os.O_RDONLY)
 try:
  before=os.fstat(fd)
  if not stat.S_ISREG(before.st_mode) or before.st_size>1024*1024*1024:fail('invalid executable size/type')
  h=hashlib.sha256();size=0
  while True:
   chunk=os.read(fd,1024*1024)
   if not chunk:break
   size+=len(chunk)
   if size>1024*1024*1024:fail('executable exceeds read bound')
   h.update(chunk)
  after=os.fstat(fd);current=os.stat(path)
  ident=lambda x:(x.st_dev,x.st_ino,x.st_size,x.st_mtime_ns,x.st_ctime_ns)
  if ident(before)!=ident(after) or ident(after)!=ident(current):fail('executing inode changed during hash')
  if unit(name)['MainPID']!=pid:fail('protected PID changed during hash')
  return {'pid':pid,'inode':before.st_ino,'device':before.st_dev,'exe_sha256':h.hexdigest()}
 finally:os.close(fd)

def source(path):
 sha=command(['git','-c','safe.directory='+path,'-C',path,'rev-parse','HEAD'])
 dirty=command(['git','-c','safe.directory='+path,'-C',path,'status','--porcelain=v1','--untracked-files=all'])
 if not re.fullmatch('[0-9a-f]{40}',sha) or dirty:fail('unavailable/dirty runtime source checkout')
 return sha

def collect():
 global config_bytes
 started=stamp()
 rows={name:unit(name) for name in SETTINGS['units']}
 configs={name:config(row) for name,row in rows.items()}
 identities={label:execution(name,rows[name]) for label,name in SETTINGS['wolo_services'].items()}
 website_identity=execution(SETTINGS['web_unit'],rows[SETTINGS['web_unit']])
 wolo_source=source('/var/www/WoloChain-wolo-1')
 web_source=source('/var/www/AoE2HDBets/app-prodn')
 fd=os.open('/var/www/AoE2HDBets/app-prodn/.next/BUILD_ID',os.O_RDONLY|os.O_NOFOLLOW)
 try:
  if os.fstat(fd).st_size>128:fail('oversized website BUILD_ID')
  build_id=os.read(fd,129).decode('ascii','strict').strip()
 finally:os.close(fd)
 if not re.fullmatch('[A-Za-z0-9_-]{8,128}',build_id):fail('invalid active BUILD_ID')
 # Repeat all configuration/state reads before completing the snapshot.
 config_bytes=0
 for name,row in rows.items():
  again=unit(name)
  if row!=again or configs[name]!=config(again):fail('configured service/writer state changed during capture')
 for label,name in SETTINGS['wolo_services'].items():
  value=identities[label];current=os.stat('/proc/'+str(value['pid'])+'/exe')
  if current.st_ino!=value['inode'] or current.st_dev!=value['device']:fail('executing Wolo inode changed before capture completed')
 current=os.stat('/proc/'+str(website_identity['pid'])+'/exe')
 if current.st_ino!=website_identity['inode'] or current.st_dev!=website_identity['device']:fail('executing website inode changed before capture completed')
 if source('/var/www/WoloChain-wolo-1')!=wolo_source or source('/var/www/AoE2HDBets/app-prodn')!=web_source:fail('runtime source changed during capture')
 with open('/var/www/AoE2HDBets/app-prodn/.next/BUILD_ID','r',encoding='ascii') as handle:
  if handle.read(129).strip()!=build_id:fail('website BUILD_ID changed during capture')
 states={name:{k:row[k] for k in ('LoadState','ActiveState','SubState','UnitFileState','MainPID')} for name,row in rows.items()}
 # Website PID is expected to change on authorized activation, never finances.
 states[SETTINGS['web_unit']].pop('MainPID')
 immutable={**identities,'financial_units':states,'unit_config_sha256':configs,
            'wolo_source_sha':wolo_source,'source_p1_original':{
             'key':'vps-source-drift','status':'BLOCKED','observed_source':wolo_source,
             'reviewed_source':SETTINGS['reviewed_source'],
             'detail':'VPS='+wolo_source+' implementation_baseline='+SETTINGS['reviewed_source']}}
 ended=stamp()
 return {'schema':3,'kind':SETTINGS['kind'],'observation_independent':False,
         'observation_scope':'configured_services_and_executing_binaries_only',
         'financial_writers_completely_enumerated':False,
         'financial_release_authorized':False,'custody_authorized':False,'claim_889_resolved':False,
         'source_p1_open':True,'collection_started_at':started,'collection_finished_at':ended,'observed_at':ended,
         'immutable':immutable,'website':{'source_sha':web_source,'build_id':build_id,**website_identity}}

if __name__=='__main__':
 signal.signal(signal.SIGALRM,lambda *_:fail('bounded remote observation timed out'));signal.alarm(38)
 try:print(json.dumps(collect(),sort_keys=True,separators=(',',':'),allow_nan=False))
 except BaseException as exc:
  reason=str(exc) if type(exc) is RuntimeError else type(exc).__name__
  print('READ_ONLY_RUNTIME_OBSERVATION_UNAVAILABLE:'+reason,file=sys.stderr);sys.exit(2)
'''.replace("__SETTINGS__", repr({"kind": KIND, "units": UNITS,
                                   "wolo_services": WOLO_SERVICES,
                                   "web_unit": WEB_UNIT,
                                   "reviewed_source": REVIEWED_WOLO_SOURCE}))


def _bounded_ssh(args: list[str], program: bytes) -> bytes:
    """Bound all pipes and wall time while never buffering arbitrary SSH output."""
    process = subprocess.Popen(args, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                               stderr=subprocess.PIPE, start_new_session=True)
    buffers = {"stdout": bytearray(), "stderr": bytearray()}
    deadline = time.monotonic() + MAX_SECONDS
    pending = memoryview(program)
    with selectors.DefaultSelector() as selector:
        assert process.stdin and process.stdout and process.stderr
        for stream, label, event in ((process.stdin, "stdin", selectors.EVENT_WRITE),
                                     (process.stdout, "stdout", selectors.EVENT_READ),
                                     (process.stderr, "stderr", selectors.EVENT_READ)):
            os.set_blocking(stream.fileno(), False)
            selector.register(stream, event, label)
        try:
            while selector.get_map():
                remaining = deadline - time.monotonic()
                require(remaining > 0, "runtime SSH observation timed out")
                for key, _mask in selector.select(min(remaining, 1)):
                    stream, label = key.fileobj, key.data
                    if label == "stdin":
                        try:
                            written = os.write(stream.fileno(), pending[:4096])
                        except BrokenPipeError:
                            written = len(pending)
                        pending = pending[written:]
                        if not pending:
                            selector.unregister(stream)
                            stream.close()
                    else:
                        chunk = os.read(stream.fileno(), 65536)
                        if not chunk:
                            selector.unregister(stream)
                            stream.close()
                            continue
                        limit = MAX_OUTPUT if label == "stdout" else MAX_STDERR
                        require(len(buffers[label]) + len(chunk) <= limit,
                                "runtime SSH output exceeds resource bound")
                        buffers[label].extend(chunk)
            remaining = deadline - time.monotonic()
            require(remaining > 0, "runtime SSH observation timed out")
            code = process.wait(timeout=remaining)
            if code != 0:
                reason = bytes(buffers["stderr"]).decode("utf-8", "replace").strip()
                match = re.fullmatch(r"READ_ONLY_RUNTIME_OBSERVATION_UNAVAILABLE:([A-Za-z /_-]{1,160})", reason)
                raise Hold("read-only runtime SSH observation unavailable" +
                           (": " + match[1] if match else ""))
            return bytes(buffers["stdout"])
        except BaseException:
            if process.poll() is None:
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
            process.wait(timeout=5)
            raise
        finally:
            for stream in (process.stdin, process.stdout, process.stderr):
                if stream and not stream.closed:
                    stream.close()


def _strict_packet(raw: bytes) -> dict:
    require(0 < len(raw) <= MAX_OUTPUT, "empty/oversized runtime observation")
    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result, "duplicate runtime observation key")
            result[key] = value
        return result
    try:
        value = json.loads(raw.decode("utf-8"), object_pairs_hook=pairs,
                           parse_constant=lambda _: (_ for _ in ()).throw(Hold("nonfinite runtime observation")))
    except (UnicodeError, ValueError, TypeError) as exc:
        raise Hold("malformed runtime observation") from exc
    require(type(value) is dict, "invalid runtime observation object")
    return value


def validate_observation(packet: dict, *, now=None, max_age_seconds=90) -> dict:
    require(type(packet) is dict and set(packet) == {
        "schema", "kind", "observation_independent", "observation_scope",
        "financial_writers_completely_enumerated", "financial_release_authorized",
        "custody_authorized", "claim_889_resolved", "source_p1_open",
        "collection_started_at", "collection_finished_at", "observed_at", "immutable", "website"},
        "unknown or incomplete runtime observation fields")
    require(type(packet) is dict and type(packet.get("schema")) is int and
            packet["schema"] == 3 and packet.get("kind") == KIND,
            "unsupported owner runtime observation")
    require(packet.get("observation_independent") is False and
            packet.get("financial_writers_completely_enumerated") is False and
            packet.get("observation_scope") == "configured_services_and_executing_binaries_only",
            "same-owner observation cannot assert independent/complete finance authority")
    for flag in ("financial_release_authorized", "custody_authorized", "claim_889_resolved"):
        require(packet.get(flag) is False, "runtime observation attempted financial authorization")
    require(packet.get("source_p1_open") is True, "runtime observation attempted P1 closure")
    require(type(max_age_seconds) is int and 0 < max_age_seconds <= 1200,
            "invalid runtime freshness bound")
    current = now or datetime.now(timezone.utc)
    started = utc_time(packet.get("collection_started_at"))
    ended = utc_time(packet.get("collection_finished_at"))
    observed = utc_time(packet.get("observed_at"))
    require(ended == observed and timedelta(0) <= ended - started <= timedelta(seconds=40),
            "invalid/overlong runtime capture")
    age = current - observed
    # The observer's time is measured on hel1, but verified on the owner's Mac.
    # NTP may leave 1-3s offset while both hosts retain correct UTC time.
    # Refuse timestamps more than 5s ahead; NEVER forgive stale observations.
    require(timedelta(seconds=-MAX_REMOTE_CLOCK_LEAD_SECONDS) <= age <=
            timedelta(seconds=max_age_seconds),
            "stale/future runtime observation")
    immutable = packet.get("immutable")
    require(type(immutable) is dict and set(immutable) == {
        *WOLO_SERVICES, "financial_units", "unit_config_sha256", "wolo_source_sha", "source_p1_original"},
        "incomplete or unknown immutable runtime scope")
    def identity(value):
        require(type(value) is dict and set(value) == {"pid", "inode", "device", "exe_sha256"},
                "incomplete executing identity")
        require(all(type(value.get(key)) is int and value[key] > 0 for key in ("pid", "inode", "device")) and
                type(value.get("exe_sha256")) is str and HEX64.fullmatch(value["exe_sha256"]) is not None,
                "invalid executing identity")
    for label, expected in EXPECTED_EXECUTABLES.items():
        identity(immutable[label])
        require(immutable[label]["exe_sha256"] == expected, "protected Wolo executing bytes changed")
    require(immutable["wolo_source_sha"] == WOLO_SOURCE, "protected Wolo checkout changed")
    p1 = immutable["source_p1_original"]
    require(type(p1) is dict and p1 == {
        "key": "vps-source-drift", "status": "BLOCKED", "observed_source": WOLO_SOURCE,
        "reviewed_source": REVIEWED_WOLO_SOURCE,
        "detail": "VPS=" + WOLO_SOURCE + " implementation_baseline=" + REVIEWED_WOLO_SOURCE},
        "original source P1 was changed or omitted")
    rows, configs = immutable["financial_units"], immutable["unit_config_sha256"]
    require(type(rows) is dict and set(rows) == set(UNITS) and
            type(configs) is dict and set(configs) == set(UNITS),
            "configured financial runtime scope unavailable")
    for name, row in rows.items():
        expected_keys = {"LoadState", "ActiveState", "SubState", "UnitFileState"}
        if name != WEB_UNIT:
            expected_keys.add("MainPID")
        require(type(row) is dict and set(row) == expected_keys and row["LoadState"] == "loaded" and
                all(type(row[k]) is str and 0 < len(row[k]) <= 64 for k in expected_keys - {"MainPID"}),
                "malformed configured unit state")
        if name != WEB_UNIT:
            require(type(row["MainPID"]) is int and row["MainPID"] >= 0,
                    "invalid configured unit PID")
        require(type(configs[name]) is str and HEX64.fullmatch(configs[name]) is not None and configs[name] != "0" * 64,
                "missing actual unit configuration digest")
    for label, name in WOLO_SERVICES.items():
        require(rows[name]["ActiveState"] == "active" and rows[name]["SubState"] == "running" and
                rows[name]["MainPID"] == immutable[label]["pid"], "protected settlement/consensus service is not active")
    for family in TIMER_FAMILIES:
        row = rows[family + ".timer"]
        require(row["ActiveState"] == "active" and row["UnitFileState"] == "enabled",
                "known financial timer state changed from active/enabled")
    website = packet.get("website")
    require(type(website) is dict and set(website) == {"source_sha", "build_id", "pid", "inode", "device", "exe_sha256"},
            "incomplete website runtime identity")
    identity({k: website[k] for k in ("pid", "inode", "device", "exe_sha256")})
    require(type(website["source_sha"]) is str and HEX40.fullmatch(website["source_sha"]) is not None and
            type(website["build_id"]) is str and re.fullmatch(r"[A-Za-z0-9_-]{8,128}", website["build_id"]) is not None and
            rows[WEB_UNIT]["ActiveState"] == "active" and rows[WEB_UNIT]["SubState"] == "running",
            "invalid active website source/build state")
    return packet


def observe(*, host="root@hel1", now=None) -> dict:
    require(type(host) is str and re.fullmatch(r"(?:[A-Za-z_][A-Za-z0-9_-]*@)?[A-Za-z0-9][A-Za-z0-9.-]{0,252}", host) is not None,
            "invalid authenticated observation SSH target")
    raw = _bounded_ssh(["ssh", "-T", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes",
                        "-o", "ConnectTimeout=10", "-o", "ConnectionAttempts=1",
                        host, "python3", "-"], REMOTE_PROGRAM.encode("utf-8"))
    return validate_observation(_strict_packet(raw), now=now)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="root@hel1")
    args = parser.parse_args()
    try:
        result = observe(host=args.host)
    except (Hold, OSError, subprocess.SubprocessError) as exc:
        print(json.dumps({"status": "HOLD", "kind": KIND, "reason": str(exc),
                          "observation_independent": False, "production_mutated": False}, sort_keys=True))
        return 2
    print(json.dumps(result, sort_keys=True, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
