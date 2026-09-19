#!/usr/bin/env python3
"""Explicit, ledger-bound expiry of superseded application runtime bodies."""
from __future__ import annotations
import argparse
import datetime as dt
import fcntl
import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import re
import shutil
import shlex
import stat
import subprocess
import sys
import time
import urllib.request

ROOT = Path('/mnt/HC_Volume_105319120/aoe2war')
APP = Path('/var/www/AoE2HDBets/app-prodn')
CONTROL = ROOT / 'os-control'
ROLL = ROOT / 'rollbacks'
ARCH = ROOT / 'rollback-archives'
RECEIPTS = CONTROL / 'rollback-archive-receipts'
EXPIRY = CONTROL / 'storage-expiry'
GEN = re.compile(r'activate-\d{8}T\d{6}Z-[0-9a-f]{12}')
MILESTONE = 'activate-20260818T003527Z-1a4e983b86d4'
RUNTIME_NAMES = {'next', 'node_modules', 'source-sha', 'build-version'}

def digest(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for data in iter(lambda: f.read(1048576), b''): h.update(data)
    return h.hexdigest()

def encoded(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':'))+'\n').encode()

def seal(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('xb') as f:
        f.write(encoded(value)); f.flush(); os.fsync(f.fileno())
    path.chmod(0o444)

def checked(args):
    if args[0]=='git': args=['runuser','-u','tony','--',*args]
    return subprocess.check_output(args, text=True, stderr=subprocess.PIPE).strip()

def runtime():
    services = ['aoe2hdbets-web.service', 'aoe2hdbets-api.service',
                'wolochaind-mainnet.service', 'wolochain-mainnet-settlement.service',
                'wolochain-founder-rewards-settlement.service']
    out = {'source': checked(['git','-C',str(APP),'rev-parse','HEAD']),
           'build': (APP/'.next/BUILD_ID').read_text().strip(),
           'version': (APP/'.aoe2war-build-version').read_text().strip()}
    if checked(['git','-C',str(APP),'status','--porcelain','--untracked-files=all']):
        raise RuntimeError('production checkout is dirty')
    for s in services:
        if checked(['systemctl','is-active',s]) != 'active': raise RuntimeError(s)
        out[s] = checked(['systemctl','show',s,'-p','MainPID','-p','NRestarts',
                          '-p','ActiveEnterTimestampMonotonic'])
    for port in (8092,8093):
        if len(checked(['ss','-ltnH','sport','=',f':{port}']).splitlines()) != 1:
            raise RuntimeError(f'listener {port}')
    for n in ['.next-release','.node_modules-release']:
        if (APP/n).exists(): raise RuntimeError('release staging active')
    return out

def height():
    with urllib.request.urlopen('http://127.0.0.1:27657/status',timeout=5) as r:
        s=json.load(r)['result']['sync_info']
    when=dt.datetime.fromisoformat(s['latest_block_time'].replace('Z','+00:00'))
    if (dt.datetime.now(dt.timezone.utc)-when).total_seconds()>20:
        raise RuntimeError('Wolo block stale')
    return int(s['latest_block_height'])

def locks():
    handles=[]
    for name in ['release.lock','storage-retention.lock','rollback-archive.lock']:
        p=CONTROL/'locks'/name
        if p.is_symlink() or not p.is_file(): raise RuntimeError(f'unsafe lock {p}')
        f=p.open('r+'); fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB); handles.append(f)
    return handles

def identity(path):
    s=path.lstat()
    row={'path':str(path),'mode':s.st_mode,'dev':s.st_dev,'ino':s.st_ino,
         'size':s.st_size,'mtime_ns':s.st_mtime_ns,'ctime_ns':s.st_ctime_ns,
         'uid':s.st_uid,'gid':s.st_gid,'nlink':s.st_nlink}
    if stat.S_ISLNK(s.st_mode): row['target']=os.readlink(path)
    elif not (stat.S_ISDIR(s.st_mode) or stat.S_ISREG(s.st_mode)):
        raise RuntimeError(f'special file {path}')
    return row

def tree(path, manifest=None, hash_content=False):
    path=Path(path)
    if path.is_symlink() or not path.is_dir(): raise RuntimeError(f'unsafe tree {path}')
    device=path.stat().st_dev
    if sys.platform.startswith('linux'):
        for line in Path('/proc/self/mountinfo').read_text().splitlines():
            mount=line.split()[4].replace('\\040',' ')
            if mount==str(path) or mount.startswith(str(path)+'/'):
                raise RuntimeError(f'mounted subtree {mount}')
    h=hashlib.sha256(); count=0; allocated=0
    stream=gzip.open(manifest,'xb') if manifest else None
    stack=[path]
    try:
        while stack:
            p=stack.pop(); row=identity(p)
            if row['dev']!=device: raise RuntimeError(f'filesystem boundary {p}')
            h.update(encoded(row)); count+=1; allocated+=p.lstat().st_blocks*512
            if stat.S_ISDIR(row['mode']):
                stack.extend(sorted(p.iterdir(),reverse=True))
            elif stat.S_ISREG(row['mode']) and hash_content:
                row['sha256']=digest(p)
                if identity(p)!={k:v for k,v in row.items() if k!='sha256'}:
                    raise RuntimeError(f'file changed while hashing {p}')
            if stream: stream.write(encoded(row))
    finally:
        if stream: stream.close()
    return {'identity_sha256':h.hexdigest(),'entries':count,'allocated_bytes':allocated}

def _sealed_regular(path, max_bytes):
    path=Path(path)
    try: before=path.lstat()
    except OSError: return None
    if path.is_symlink() or not stat.S_ISREG(before.st_mode) or before.st_mode & 0o222:
        return None
    if before.st_size<=0 or before.st_size>max_bytes:
        return None
    try:
        with path.open('rb') as stream:
            data=stream.read(max_bytes+1)
            after=os.fstat(stream.fileno())
    except OSError:
        return None
    signature=lambda s:(s.st_dev,s.st_ino,s.st_size,s.st_mtime_ns,s.st_ctime_ns)
    if len(data)>max_bytes or signature(before)!=signature(after):
        return None
    return data

def _manifest_matches_tree(data, root, expected):
    root=Path(root);h=hashlib.sha256();count=0;regular=0
    try:
        with gzip.GzipFile(fileobj=io.BytesIO(data),mode='rb') as stream:
            for raw in stream:
                row=json.loads(raw)
                if not isinstance(row,dict) or not isinstance(row.get('path'),str):
                    return False
                p=Path(row['path'])
                try: p.relative_to(root)
                except ValueError: return False
                mode=row.get('mode')
                if type(mode) is not int:
                    return False
                if stat.S_ISREG(mode):
                    if not re.fullmatch(r'[0-9a-f]{64}',str(row.get('sha256') or '')):
                        return False
                    regular+=1
                elif not (stat.S_ISDIR(mode) or stat.S_ISLNK(mode)):
                    return False
                identity_row={k:v for k,v in row.items() if k!='sha256'}
                h.update(encoded(identity_row));count+=1
                if count>expected['entries']:
                    return False
    except (OSError,EOFError,gzip.BadGzipFile,json.JSONDecodeError,TypeError,ValueError):
        return False
    return (count==expected['entries'] and regular>0
            and h.hexdigest()==expected['identity_sha256'])

def _write_new(data,destination):
    destination=Path(destination)
    if destination.exists() or destination.is_symlink():
        raise RuntimeError(f'manifest destination already exists {destination}')
    with destination.open('xb') as dst:
        dst.write(data);dst.flush();os.fsync(dst.fileno())

def reuse_content_manifest(row,current,destination):
    """Reuse a prior content-hashed manifest only when current metadata identity is exact."""
    destination=Path(destination)
    for ledger in sorted(EXPIRY.glob('campaign-*/ledger.json'),reverse=True):
        if ledger.parent==destination.parent:
            continue
        data=_sealed_regular(ledger,64*1024*1024)
        if data is None:
            continue
        try: prior=json.loads(data)
        except (json.JSONDecodeError,UnicodeDecodeError):
            continue
        if prior.get('schema')!=1 or prior.get('kind')!='aoe2war-lean-retention-ledger':
            continue
        matches=[candidate for candidate in prior.get('rows',[]) if
                 isinstance(candidate,dict) and candidate.get('generation')==row.get('generation')
                 and candidate.get('kind')=='expanded']
        if len(matches)!=1:
            continue
        candidate=matches[0]
        if any(candidate.get(key)!=row.get(key) for key in ('path','source_sha','build_id')):
            continue
        if candidate.get('identity_sha256')!=current['identity_sha256'] or candidate.get('entries')!=current['entries']:
            continue
        source=Path(str(candidate.get('manifest') or ''))
        if source.parent!=ledger.parent or source.name!=row['generation']+'.tree.jsonl.gz':
            continue
        source_bytes=_sealed_regular(source,128*1024*1024)
        if source_bytes is None:
            continue
        source_sha=hashlib.sha256(source_bytes).hexdigest()
        if source_sha!=candidate.get('manifest_sha256'):
            continue
        if not _manifest_matches_tree(source_bytes,Path(row['path']),current):
            continue
        _write_new(source_bytes,destination)
        copied_sha=digest(destination)
        if copied_sha!=source_sha:
            destination.unlink(missing_ok=True)
            raise RuntimeError('reused manifest copy digest mismatch')
        after=tree(row['path'])
        if after!=current:
            destination.unlink(missing_ok=True)
            continue
        destination.chmod(0o444)
        return {'mode':'reused_sealed_manifest',
                'source_ledger':str(ledger),'source_ledger_sha256':hashlib.sha256(data).hexdigest(),
                'source_manifest':str(source),'source_manifest_sha256':source_sha}
    return None

def select_checkpoints(modern, archives):
    hot=sorted(modern,reverse=True)[:2]
    cold=[]; weeks=set()
    for name in sorted(archives,reverse=True):
        day=dt.datetime.strptime(name[9:17],'%Y%m%d').date()
        week=day.isocalendar()[:2]
        if week not in weeks:
            cold.append(name); weeks.add(week)
        if len(cold)==2: break
    if MILESTONE in archives and MILESTONE not in cold: cold.append(MILESTONE)
    if len(hot)!=2 or len(cold)!=3:
        raise RuntimeError('two hot and three proven cold checkpoints required')
    return hot,cold

def archive_namespace(manifest):
    count=0
    with Path(manifest).open() as f:
        for line in f:
            row=json.loads(line);name=row['path'];parts=Path(name).parts
            if (name!='.' and (not parts or parts[0] not in RUNTIME_NAMES
                               or '..' in parts or Path(name).is_absolute())):
                raise RuntimeError('archive contains non-runtime evidence')
            if row.get('type') not in {'dir','file','symlink'}:
                raise RuntimeError('archive manifest has unsupported member')
            count+=1
    if count<4: raise RuntimeError('archive manifest incomplete')
    return count

def inspect_inventory():
    rows=[]
    for p in sorted(ROLL.iterdir()):
        if p.is_symlink() or not p.is_dir():
            rows.append({'path':str(p),'kind':'unknown','action':'KEEP','reason':'non-directory'});continue
        names=set(q.name for q in p.iterdir())
        row={'path':str(p),'generation':p.name,'top_level':sorted(names)}
        if GEN.fullmatch(p.name) and names <= RUNTIME_NAMES and {'next','source-sha'} <= names:
            source=(p/'source-sha').read_text().strip()
            build=(p/'next/BUILD_ID').read_text().strip()
            if not re.fullmatch('[a-f0-9]{40}',source) or not re.fullmatch('[A-Za-z0-9_-]{1,256}',build):
                raise RuntimeError(f'invalid runtime identity {p}')
            row.update(kind='expanded',source_sha=source,build_id=build,
                       build_version=(p/'build-version').read_text().strip() if 'build-version' in names else None,
                       activation_receipt=str(ROOT/'deploy-receipts'/p.name))
            if not (ROOT/'deploy-receipts'/p.name).is_dir():
                row.update(action='KEEP',reason='activation receipt absent')
        else:
            row.update(kind='legacy',action='KEEP',reason='legacy metadata or unique source; individual review only')
            # Enumerate bounded generated Next bodies separately; retain every other legacy entry.
            for n in ['.next','next']:
                q=p/n
                if q.is_dir() and not q.is_symlink() and (q/'BUILD_ID').is_file():
                    row.setdefault('runtime_children',[]).append(str(q))
        rows.append(row)
    for p in sorted(ARCH.glob('*.tar.zst')):
        name=p.name[:-8]
        v=RECEIPTS/(name+'.verified.json'); r=RECEIPTS/(name+'.replaced.json')
        if not GEN.fullmatch(name) or p.is_symlink() or not v.is_file() or not r.is_file():
            rows.append({'path':str(p),'generation':name,'kind':'unknown','action':'KEEP','reason':'archive proof absent'});continue
        proof=json.loads(v.read_text()); repl=json.loads(r.read_text())
        if not (proof.get('round_trip_manifest_exact') is True and proof.get('round_trip_extract_verified') is True and
                proof['archive_sha256']==repl['archive_sha256'] and proof['generation']==name):
            raise RuntimeError(f'archive proof mismatch {name}')
        rows.append({'path':str(p),'generation':name,'kind':'archive','source_sha':proof['source_sha'],
                     'build_id':proof['source_build_id'],'archive_sha256':proof['archive_sha256'],
                     'archive_identity':identity(p),'allocated_bytes':p.stat().st_blocks*512,
                     'tree_manifest_path':proof['tree_manifest_path'],'tree_manifest_sha256':proof['tree_manifest_sha256'],
                     'verified_receipt':str(v),'verified_receipt_sha256':digest(v),
                     'replaced_receipt':str(r),'replaced_receipt_sha256':digest(r)})
    hot,cold=select_checkpoints([r['generation'] for r in rows if r['kind']=='expanded' and 'action' not in r],
                                [r['generation'] for r in rows if r['kind']=='archive'])
    for r in rows:
        if 'action' in r: continue
        source=r.get('source_sha','')
        ancestry=subprocess.run(['runuser','-u','tony','--','git','-C',str(APP),'merge-base','--is-ancestor',source,'HEAD'],
                                stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        if ancestry.returncode:
            r.update(action='KEEP',reason='source ancestry not proven in current production history')
            continue
        keep=r['generation'] in (hot if r['kind']=='expanded' else cold)
        r.update(action='KEEP' if keep else 'EXPIRE',
                 reason=('immediate rollback' if r['kind']=='expanded' else 'compressed checkpoint') if keep else 'superseded application runtime; source and release evidence retained')
    return {'schema':1,'kind':'aoe2war-lean-retention-inventory','policy':{'hot':2,'cold':3,'milestone':MILESTONE},
            'tool_sha256':digest(__file__),
            'created_at':dt.datetime.now(dt.timezone.utc).isoformat(),'runtime':runtime(),
            'protected_hot':hot,'protected_cold':cold,'rows':rows,'wolo_mutated':False}

def prepare(directory):
    directory=Path(directory)
    if directory.parent!=EXPIRY or directory.exists(): raise RuntimeError('new canonical campaign directory required')
    directory.mkdir(parents=True)
    held=locks(); inv=inspect_inventory(); seal(directory/'inventory.json',inv)
    for i,r in enumerate(inv['rows']):
        if r['kind']=='expanded':
            manifest=directory/(r['generation']+'.tree.jsonl.gz')
            current=tree(r['path'])
            proof=reuse_content_manifest(r,current,manifest)
            if proof is None:
                r.update(tree(r['path'],manifest,hash_content=True))
                manifest.chmod(0o444)
                proof={'mode':'fresh_hash','tool_sha256':inv['tool_sha256']}
            else:
                r.update(current)
            r.update(manifest=str(manifest),manifest_sha256=digest(manifest),
                     content_proof=proof)
        elif r['kind']=='archive':
            if digest(r['path'])!=r['archive_sha256']: raise RuntimeError('archive hash mismatch')
            if digest(r['tree_manifest_path'])!=r['tree_manifest_sha256']: raise RuntimeError('archive manifest mismatch')
            archive_namespace(r['tree_manifest_path'])
            if digest(r['verified_receipt'])!=r['verified_receipt_sha256'] or digest(r['replaced_receipt'])!=r['replaced_receipt_sha256']:
                raise RuntimeError('archive receipt changed')
        else:
            r['allocated_bytes']=int(checked(['du','-skx',r['path']]).split()[0])*1024
        if i%5==0: print('PROGRESS',i+1,len(inv['rows']),r.get('generation'),flush=True)
    if runtime()!=inv['runtime']: raise RuntimeError('runtime changed during preparation')
    inv['kind']='aoe2war-lean-retention-ledger'
    inv['wolo_height']=height()
    inv['reclaim_bytes']=sum(r.get('allocated_bytes',0) for r in inv['rows'] if r['action']=='EXPIRE')
    inv['content_proof_summary']={
        'fresh_hash':sum(r.get('content_proof',{}).get('mode')=='fresh_hash' for r in inv['rows']),
        'reused_sealed_manifest':sum(r.get('content_proof',{}).get('mode')=='reused_sealed_manifest' for r in inv['rows'])
    }
    seal(directory/'ledger.json',inv)
    print('CONTENT_PROOF','fresh',inv['content_proof_summary']['fresh_hash'],
          'reused',inv['content_proof_summary']['reused_sealed_manifest'],flush=True)
    print('LEDGER',directory/'ledger.json','SHA256',digest(directory/'ledger.json'),'RECLAIM',inv['reclaim_bytes'],flush=True)

def verify_row(r):
    p=Path(r['path'])
    if p.is_symlink(): raise RuntimeError('target is symlink')
    if r['kind']=='expanded':
        if p.parent!=ROLL or not GEN.fullmatch(p.name): raise RuntimeError('target namespace')
        if set(q.name for q in p.iterdir())-RUNTIME_NAMES: raise RuntimeError('unexpected runtime member')
        if tree(p)['identity_sha256']!=r['identity_sha256']: raise RuntimeError('tree drift')
        if digest(r['manifest'])!=r['manifest_sha256']: raise RuntimeError('manifest drift')
    elif r['kind']=='archive':
        if p.parent!=ARCH or p.name!=r['generation']+'.tar.zst': raise RuntimeError('archive namespace')
        if identity(p)!=r['archive_identity'] or digest(p)!=r['archive_sha256']: raise RuntimeError('archive drift')
        if digest(r['tree_manifest_path'])!=r['tree_manifest_sha256']: raise RuntimeError('archive manifest drift')
        archive_namespace(r['tree_manifest_path'])
        for k in ['verified_receipt','replaced_receipt']:
            if digest(r[k])!=r[k+'_sha256']: raise RuntimeError('receipt drift')
    else: raise RuntimeError('only proven application runtime bodies may expire')

def apply_one(ledger_path, expected, generation):
    ledger_path=Path(ledger_path)
    if ledger_path.parent.parent!=EXPIRY or ledger_path.name!='ledger.json' or digest(ledger_path)!=expected:
        raise RuntimeError('ledger identity mismatch')
    ledger=json.loads(ledger_path.read_text())
    matches=[r for r in ledger['rows'] if r.get('generation')==generation and r['action']=='EXPIRE']
    if len(matches)!=1: raise RuntimeError('exact unprotected generation required')
    r=matches[0]; held=locks()
    before=runtime()
    if before!=ledger['runtime']: raise RuntimeError('runtime differs from ledger')
    if generation in ledger['protected_hot']+ledger['protected_cold']: raise RuntimeError('protected checkpoint')
    current=sorted([p.name for p in ROLL.iterdir() if p.is_dir() and GEN.fullmatch(p.name)],reverse=True)[:2]
    if generation in current: raise RuntimeError('current immediate rollback')
    for name in ledger['protected_hot']:
        if not (ROLL/name/'next/BUILD_ID').is_file(): raise RuntimeError('retained hot checkpoint absent')
    for name in ledger['protected_cold']:
        if not (ARCH/(name+'.tar.zst')).is_file(): raise RuntimeError('retained cold checkpoint absent')
    h=height(); verify_row(r)
    if runtime()!=before: raise RuntimeError('runtime changed before deletion')
    if height()<=h:
        time.sleep(6)
        if height()<=h: raise RuntimeError('Wolo did not advance')
    out=ledger_path.parent/(generation+'.expired.json')
    intent=ledger_path.parent/(generation+'.intent.json')
    if out.exists() or intent.exists(): raise RuntimeError('existing transaction needs receipt review')
    receipt={'schema':1,'kind':'aoe2war-runtime-expiry','generation':generation,'path':r['path'],
             'ledger_path':str(ledger_path),'ledger_sha256':expected,'runtime':before,
             'object':r,'wolo_height_before':h,'wolo_mutated':False,
             'started_at':dt.datetime.now(dt.timezone.utc).isoformat()}
    seal(intent,{**receipt,'status':'VERIFIED_DELETE_INTENT'})
    p=Path(r['path'])
    if r['kind']=='expanded': shutil.rmtree(p)
    else: p.unlink()
    if p.exists() or p.is_symlink(): raise RuntimeError('target remains after expiry')
    if runtime()!=before: raise RuntimeError('runtime changed after deletion')
    after=height()
    if after<=h: raise RuntimeError('Wolo progress absent after expiry')
    receipt.update(status='EXPIRED_SUPERSEDED_RUNTIME',wolo_height_after=after,
                   completed_at=dt.datetime.now(dt.timezone.utc).isoformat(),
                   allocated_reclaim_bytes=r['allocated_bytes'])
    seal(out,receipt)
    if r['kind']=='archive':
        seal(RECEIPTS/(generation+'.expired.json'),receipt)
    print('EXPIRED',generation,'BYTES',r['allocated_bytes'],'RECEIPT',out,flush=True)

def main():
    p=argparse.ArgumentParser(description=__doc__)
    sub=p.add_subparsers(dest='command',required=True)
    sub.add_parser('inventory')
    q=sub.add_parser('prepare');q.add_argument('directory')
    q=sub.add_parser('apply-one');q.add_argument('ledger');q.add_argument('sha256');q.add_argument('generation')
    args=p.parse_args()
    if sys.platform == 'darwin':
        import aoe2_storage
        if args.command != 'inventory': aoe2_storage.operator_baseline()
        source=Path(__file__).read_text()
        sha=hashlib.sha256(source.encode()).hexdigest()
        remote=('from pathlib import Path\nimport subprocess,hashlib\n'
                f'source={source!r}\n'
                f'p=Path({str(EXPIRY / "tools" / (sha+".py"))!r})\n'
                'p.parent.mkdir(parents=True,exist_ok=True)\n'
                'if not p.exists():\n p.write_text(source);p.chmod(0o444)\n'
                f'assert hashlib.sha256(p.read_bytes()).hexdigest()=={sha!r}\n'
                f'args={sys.argv[1:]!r}\n'
                'cmd=["python3",str(p),*args]\n'
                'if args[0]!="inventory": cmd=["/usr/local/sbin/aoe2war-maintenance-run","storage-runtime-expiry","--",*cmd]\n'
                'raise SystemExit(subprocess.run(cmd).returncode)\n')
        raise SystemExit(subprocess.run(['ssh','-o','BatchMode=yes','root@hel1','python3','-'],input=remote,text=True).returncode)
    if args.command=='inventory': print(json.dumps(inspect_inventory(),sort_keys=True))
    elif args.command=='prepare': prepare(args.directory)
    else: apply_one(args.ledger,args.sha256,args.generation)

if __name__=='__main__':
    try: main()
    except Exception as e:
        print('STOP:',str(e),file=sys.stderr);sys.exit(2)
