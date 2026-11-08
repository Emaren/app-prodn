#!/usr/bin/env python3
"""HEL1: unpack exact CI Linux runtime after digest/manifest replay, never start it.

No builds, git, network, production service changes, grants or funded actions.
All operations are confined to an exclusive new root-owned staging directory.
"""
from __future__ import annotations
import datetime
import hashlib
import io
import json
import os
import pathlib
import shutil
import stat
import sys
import tarfile
import zipfile

P = pathlib.Path
SOURCE='4ab96cc7c1c0ba43a0403795485d3f410a6ba07f'
BUILD='YF_YxSAxc0izAfRG0ARsc'
VERSION='20261108182649-ca81f00609'
ZIP_BYTES=615809452
ZIP_SHA='72e856c3bebd0f91bcc66910016f47490e9c59ea2b13d58bd4a0500752489330'
TAR_BYTES=615808600
TAR_SHA='7be8e6f9401f7d29be176c0704339e9b2a38001ae0122b6353196fc23840f42f'
MANIFEST_SHA='ab1071cd5928591fe11a16eab25d9884d19eaa60ebadd43e23a73918cd86b2d4'
TREE_SHA='ae328965e9db1dba2b3fc052195ea44b72528139c0030ffab45ca3d015cc3f9d'
ENTRIES=44954
RECEIPT_SHA='c41c7e2bffd7287e8637a620e84e12cc38e05bce4bc86081115cebf4621ba701'
ZIP=P('/root/aoe2war-session-b-linux-candidate-4ab96cc7-20261108/github-artifact.zip')
ROOT=P('/root/aoe2war-session-b-linux-candidate-4ab96cc7-20261108')
STAGE=P('/var/lib/aoe2war-web-prod-4ab96cc7c1c0')
ADMISSION=P('/etc/aoe2war/web-prod-v8')
WEB=P('/etc/systemd/system/aoe2hdbets-web-prod.service')
OLD_WEB='be8165a050a3fa2c224d6a29c26dca2045a6599c7f18ab41e2e83bb85eacf6e6'
NEW_WEB='42bcd2f3833b3e8db5dddaf3be8058f7b265de0fb388e3e9508149de59e72621'

def digest(raw):return hashlib.sha256(raw).hexdigest()
def need(ok,reason):
 if not ok:raise RuntimeError('HOLD_'+reason)
def hash_file(path):
 h=hashlib.sha256()
 with path.open('rb') as f:
  for b in iter(lambda:f.read(1048576),b''):h.update(b)
 return h.hexdigest()
def regular_file(path):
 st=path.lstat()
 need(stat.S_ISREG(st.st_mode) and st.st_uid==0 and st.st_nlink==1
      and not st.st_mode&0o022,'SOURCE_FILE_PERMISSIONS')
def member_rel(name):
 rel=P(name)
 need(bool(name) and not rel.is_absolute() and '\\' not in name
      and '..' not in rel.parts and '.git' not in rel.parts
      and len(rel.parts)<35 and len(name)<500,'TAR_MEMBER_PATH_UNSAFE')
 need(not rel.name.startswith('.env') or name=='.env.production.example','ENV_FILE_IN_RUNTIME')
 return rel
def validate_symlink(path,target):
 need(bool(target) and not P(target).is_absolute() and '\x00' not in target,
      'RUNTIME_SYMLINK_ABSOLUTE_OR_INVALID')
 resolved=(path.parent/target).resolve(strict=False)
 need(resolved.is_relative_to(STAGE),'RUNTIME_SYMLINK_ESCAPE')
def secure_parent(path):
 need(path.is_relative_to(STAGE),'PARENT_OUTSIDE_STAGE')
 rel=path.relative_to(STAGE)
 cursor=STAGE
 for part in rel.parts:
  cursor=cursor/part
  if cursor.exists() or cursor.is_symlink():
   need(cursor.is_dir() and not cursor.is_symlink(),'RUNTIME_PARENT_SYMLINK')
  else:
   cursor.mkdir(mode=0o755)
def write_file(path,stream,info):
 secure_parent(path.parent)
 need(not path.exists() and not path.is_symlink(),'RUNTIME_MEMBER_OVERWRITES')
 need(info.mode&0o022==0 and info.mode&0o6000==0,'RUNTIME_FILE_MODE_UNSAFE')
 fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,info.mode&0o755)
 h=hashlib.sha256();size=0
 with os.fdopen(fd,'wb') as out:
  while True:
   b=stream.read(1048576)
   if not b:break
   out.write(b);h.update(b);size+=len(b)
  out.flush()
  os.fchmod(out.fileno(),info.mode)
 need(size==info.size,'RUNTIME_MEMBER_SIZE_DRIFT')
 return {'path':str(path.relative_to(STAGE)),'type':'file','size':size,
         'sha256':h.hexdigest(),'mode':info.mode}
def atomic(path,body,mode):
 fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode)
 with os.fdopen(fd,'wb') as f:f.write(body);f.flush();os.fsync(f.fileno())
def stage():
 need(os.geteuid()==0,'ROOT_REQUIRED')
 need(len(ZIP_SHA)==64 and all(ch in '0123456789abcdef' for ch in ZIP_SHA),
      'ZIP_SHA_NOT_PHYSICALLY_PINNED')
 regular_file(ZIP)
 need(ZIP.stat().st_size==ZIP_BYTES and hash_file(ZIP)==ZIP_SHA,
      'OUTER_ZIP_EXACT_BYTES_NOT_QUALIFIED')
 need(not STAGE.exists() and not STAGE.is_symlink(),'CANDIDATE_STAGE_ALREADY_PRESENT')
 need(not ADMISSION.exists() and not ADMISSION.is_symlink(),'EXACT_RELEASE_ROOT_ALREADY_PRESENT')
 need(shutil.disk_usage('/').free>=7*1024**3,'ROOT_RESERVE_BELOW_7GIB')
 unit=WEB.read_bytes()
 need(digest(unit)==OLD_WEB and unit.count(b'/var/lib/aoe2war-web-prod-0a7450f9c8c1')==4,
      'LIVE_WEB_UNIT_PREIMAGE_DRIFT')
 candidate=unit.replace(b'/var/lib/aoe2war-web-prod-0a7450f9c8c1',
                       b'/var/lib/aoe2war-web-prod-4ab96cc7c1c0')
 need(digest(candidate)==NEW_WEB,'CANDIDATE_UNIT_NOT_REVIEWED')
 with zipfile.ZipFile(ZIP,'r') as archive:
  names=archive.namelist()
  need(set(names)=={'artifact.json','runtime.tar.gz'} and len(names)==2,
       'OUTER_ARCHIVE_UNREVIEWED_MEMBERS')
  meta=json.loads(archive.read('artifact.json'))
  need(meta.get('schema')=='aoe2war.runtime-artifact.v1'
       and meta.get('source_sha')==SOURCE and meta.get('build_id')==BUILD
       and meta.get('build_version')==VERSION and meta.get('sha256')==TAR_SHA
       and meta.get('bytes')==TAR_BYTES and meta.get('manifest_sha256')==MANIFEST_SHA
       and meta.get('tree_sha256')==TREE_SHA and meta.get('files')==ENTRIES
       and meta.get('machine')=='x86_64','CI_ARTIFACT_MANIFEST_IDENTITY_DRIFT')
  need(archive.getinfo('runtime.tar.gz').file_size==TAR_BYTES,
       'RUNTIME_GZIP_SIZE_DRIFT')
  STAGE.mkdir(mode=0o755)
  actual={};seen=set();manifest_raw=None;source_marker=None
  with archive.open('runtime.tar.gz','r') as gz,tarfile.open(fileobj=gz,mode='r|gz') as members:
   for info in members:
    rel=member_rel(info.name);name=str(rel)
    need(name not in seen,'DUPLICATE_TAR_MEMBER');seen.add(name)
    if name=='.aoe2war-runtime-manifest.json':
     need(info.isfile() and info.size<=16_000_000,'MANIFEST_KIND_OR_SIZE')
     manifest_raw=members.extractfile(info).read()
     continue
    if name=='.aoe2war-source-sha':
     need(info.isfile() and info.size<=120,'SOURCE_MARKER_KIND_OR_SIZE')
     source_marker=members.extractfile(info).read().strip().decode()
     continue
    dst=STAGE/rel
    if info.isfile():
     actual[name]=write_file(dst,members.extractfile(info),info)
    elif info.issym():
     need(not dst.exists() and not dst.is_symlink(),'RUNTIME_SYMLINK_OVERWRITE')
     secure_parent(dst.parent)
     validate_symlink(dst,info.linkname)
     os.symlink(info.linkname,dst)
     actual[name]={'path':name,'type':'symlink','target':info.linkname,'mode':info.mode}
    else:raise RuntimeError('HOLD_UNREVIEWED_TAR_MEMBER_KIND')
  need(source_marker==SOURCE and manifest_raw is not None
       and digest(manifest_raw)==MANIFEST_SHA,'INNER_SOURCE_OR_MANIFEST_DRIFT')
  manifest=json.loads(manifest_raw)
  rows=manifest['rows']
  need(manifest['source_sha']==SOURCE and manifest['build_id']==BUILD
       and manifest['build_version']==VERSION and len(rows)==ENTRIES
       and len(actual)==ENTRIES and len(seen)==ENTRIES+2,'RUNTIME_ENTRY_COUNT_DRIFT')
  canonical=json.dumps(rows,sort_keys=True,separators=(',',':'),ensure_ascii=True).encode()
  need(digest(canonical)==TREE_SHA,'RUNTIME_TREE_MANIFEST_DRIFT')
  for row in rows:
   need(actual.get(row['path'])==row,'SOURCE_FILE_HASH_OR_MODE_MISMATCH')
  for name,expected in (('.aoe2war-build-version',VERSION),('.next/BUILD_ID',BUILD)):
   need((STAGE/name).read_text().strip()==expected,'STAGED_BUILD_VERSION_DRIFT')
  for item in actual.values():
   if item['type']=='symlink':
    p=STAGE/item['path']
    validate_symlink(p,item['target'])
    need(p.resolve().exists(),'RUNTIME_SYMLINK_MISSING_TARGET')
  for bind in ('.next/cache','public/downloads'):
   path=STAGE/bind
   secure_parent(path.parent)
   if not path.exists():path.mkdir(mode=0o755)
   need(path.is_dir() and not path.is_symlink(),'RUNTIME_BIND_TARGET_UNSAFE')
 need(shutil.disk_usage('/').free>=5*1024**3,'POSTSTAGE_ROOT_RESERVE_LOW')
 receipt={'schema':'aoe2war.app.r25.ci-runtime-exact-staging.v1',
  'status':'PASS_EXACT_RUNTIME_STAGED_NOT_STARTED','source_sha':SOURCE,
  'build_id':BUILD,'build_version':VERSION,'runtime_tar_sha256':TAR_SHA,
  'runtime_manifest_sha256':MANIFEST_SHA,'runtime_entries':ENTRIES,
  'finance_authorized':False,'public_deployed':False}
 raw=(json.dumps(receipt,sort_keys=True,separators=(',',':'))+'\n').encode()
 need(digest(raw)==RECEIPT_SHA,'PHYSICAL_STAGE_RECEIPT_PREIMAGE_DRIFT')
 atomic(ROOT/'candidate-3032-unit-NOT-INSTALLED.service',candidate,0o600)
 atomic(ROOT/'physical-stage-acceptance.json',raw,0o600)
 ADMISSION.mkdir(mode=0o500,parents=False)
 atomic(ADMISSION/'candidate-stage-acceptance.json',raw,0o600)
 print(json.dumps({'status':'PASS_STAGED_4AB96_LINUX_CI_RUNTIME_NOT_STARTED',
       'source':SOURCE,'files':ENTRIES,'receipt_sha256':RECEIPT_SHA,
       'unit_sha256':NEW_WEB,'public_deployed':False,'financial_authorized':False,
       'utc':datetime.datetime.now(datetime.timezone.utc).isoformat()},sort_keys=True),flush=True)

if __name__=='__main__':
 try:stage()
 except Exception as e:
  print(json.dumps({'status':'HOLD_NO_WEBSITE_OR_CHAIN_CHANGE',
     'failure_class':type(e).__name__,'phase':'inert_ci_artifact_stage'},
     sort_keys=True),flush=True)
  sys.exit(3)
