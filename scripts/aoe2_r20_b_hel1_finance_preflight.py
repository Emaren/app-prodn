#!/usr/bin/env python3
"""B R20: read-only, unprivileged HEL1 financial-continuity preflight.

No privilege elevation, network requests, files written, keys opened, service
changes, root phase, financial queries or claimed signed evidence. An incomplete
operator view is HOLD, not a forged independent release receipt.
"""
import hashlib, json, os, pathlib, re, socket, stat, subprocess, sys
from datetime import datetime, timezone

HOST='ubuntu-4gb-hel1-11'
WEBSITE='0cee3c836c4b0760478280c145e02e81e470ce0e'
CONTROLLER='18052e01a191b15525664c1a058de80d7a8bc150'
REQUIRED=set('''
aoe2hdbets-web.service aoe2hdbets-api.service
aoe2dewarwagers-web.service aoe2dewarwagers-api.service
aoe2hdbets-bet-stake-reconcile.service aoe2hdbets-bet-stake-reconcile-plan.service
aoe2hdbets-challenge-reconcile.service aoe2hdbets-replay-auto-recovery.service
aoe2hdbets-staking-rewards.service aoe2hdbets-trophy-tributes.service
aoe2-wolo-transfer-heartbeat.service aoe2war-prewarm.service
wolochaind-mainnet.service wolochaind-testnet.service
wolochain-mainnet-settlement.service wolochain-founder-rewards-settlement.service
wolochain-settlement.service wolochain-mainnet-osmosis-relayer.service
aoe2hdbets-bet-stake-reconcile.timer aoe2hdbets-challenge-reconcile.timer
aoe2hdbets-replay-auto-recovery.timer aoe2hdbets-staking-rewards.timer
aoe2hdbets-trophy-tributes.timer aoe2-wolo-transfer-heartbeat.timer
aoe2war-prewarm.timer'''.split())
PREFIX=('aoe2hdbets-','aoe2dewarwagers-','wolochain-','wolochaind-',
        'aoe2-wolo-','aoe2war-prewarm.','wolo-','tokenchain-','tokenchaind-',
        'tokentap-','traffic-')
SYSD='/usr/bin/systemctl'
PROP=('Id','LoadState','ActiveState','SubState','MainPID','User','Group',
      'ControlGroup','FragmentPath','DropInPaths','ExecStart','Environment',
      'EnvironmentFiles','Unit')
def digest(b):return hashlib.sha256(b).hexdigest()
def canon(x):return json.dumps(x,sort_keys=True,separators=(',',':'),ensure_ascii=True).encode()
def cmd(args,timeout=12):
    try:
        p=subprocess.run(args,capture_output=True,timeout=timeout,check=False)
        if p.returncode or len(p.stdout)>2_000_000: return None
        return p.stdout
    except (OSError,subprocess.TimeoutExpired):return None
def proc(pid):
    if pid<=1:return None
    p=pathlib.Path('/proc')/str(pid)
    try:
        a=(p/'stat').read_text(); idx=a.rfind(')'); start=int(a[idx+2:].split()[19])
        status=(p/'status').read_text()
        uid=int(next(x.split()[1] for x in status.splitlines() if x.startswith('Uid:')))
        cg=(p/'cgroup').read_bytes()
        exe=os.readlink(p/'exe')
        b=(p/'stat').read_text(); idx2=b.rfind(')')
        if start != int(b[idx2+2:].split()[19]):return None
        return {'pid':pid,'uid':uid,'start_ticks':start,'cgroup_sha256':digest(cg),
                'exe_path_sha256':digest(exe.encode())}
    except (OSError,ValueError,IndexError,StopIteration):return None
def sockets():
    out={}
    for port in (8092,8093,5432):
        entries=[]; errors=[]
        for name in ('tcp','tcp6'):
            try:
                rows=(pathlib.Path('/proc/net')/name).read_text().splitlines()[1:]
                for row in rows:
                    cells=row.split(); addr=cells[1].split(':')
                    if len(addr)==2 and int(addr[1],16)==port and cells[3]=='0A':
                        entries.append({'protocol':name,'inode':cells[9]})
            except (OSError,ValueError,IndexError):errors.append(name)
        out[str(port)]={'listener_count':len(entries),
                        'listener_inode_sha256':digest(canon(sorted(entries,key=lambda x:x['inode']))),
                        'unreadable':errors,'pid_owner_link':'NOT_PROVEN_NONROOT'}
    try:
        unix=pathlib.Path('/proc/net/unix').read_text()
        out['postgres_unix']={'socket_count':sum('.s.PGSQL.' in s for s in unix.splitlines()),
                              'snapshot_sha256':digest(unix.encode())}
    except OSError:out['postgres_unix']={'status':'UNREADABLE'}
    return out
def cron():
    roots=('/etc/crontab','/etc/cron.d','/etc/cron.hourly','/etc/cron.daily',
           '/etc/cron.weekly','/etc/cron.monthly','/var/spool/cron/crontabs',
           '/var/spool/cron','/etc/at.deny','/etc/at.allow')
    data={}; gaps=[]
    for name in roots:
        p=pathlib.Path(name)
        try:
            s=p.lstat()
            if stat.S_ISLNK(s.st_mode):
                data[name]={'type':'SYMLINK_UNRESOLVED'};gaps.append('cron_symlink:'+name)
            elif stat.S_ISREG(s.st_mode):
                if s.st_size>1_000_000:raise ValueError('oversized')
                data[name]={'type':'file','sha256':digest(p.read_bytes())}
            elif stat.S_ISDIR(s.st_mode):
                entries=[]
                for x in sorted(p.iterdir(),key=lambda z:z.name):
                    if len(entries)>=500:raise ValueError('entry_cap')
                    t=x.lstat()
                    if stat.S_ISREG(t.st_mode) and t.st_size<=1_000_000:
                        try: h=digest(x.read_bytes())
                        except OSError:h=None;gaps.append('cron_file_unreadable:'+name)
                    else:h=None;gaps.append('cron_entry_unresolved:'+name)
                    entries.append((x.name,t.st_mode & 0o777,h))
                data[name]={'type':'dir','entries':len(entries),'sha256':digest(canon(entries))}
            else:data[name]={'type':'ABSENT_OR_OTHER'}
        except FileNotFoundError:data[name]={'type':'ABSENT'}
        except (OSError,ValueError):data[name]={'type':'UNREADABLE'};gaps.append('cron_unreadable:'+name)
    c=cmd(['/usr/bin/crontab','-l']) if pathlib.Path('/usr/bin/crontab').exists() else None
    data['operator_crontab']={'sha256':digest(c) if c is not None else None,
                               'status':'READABLE' if c is not None else 'NO_CRONTAB_OR_UNREADABLE'}
    atq=cmd(['/usr/bin/atq']) if pathlib.Path('/usr/bin/atq').exists() else None
    data['operator_atq']={'sha256':digest(atq) if atq is not None else None,
                          'status':'READABLE' if atq is not None else 'UNAVAILABLE'}
    # Cron/at of other identities cannot be signed off by the tony account.
    gaps += ['root_cron_and_other_users_unattested','external_ingress_unattested']
    return data,gaps
def source():
    root=pathlib.Path('/var/www/AoE2HDBets/app-prodn')
    live=cmd(['/usr/bin/git','-C',str(root),'rev-parse','HEAD']) if pathlib.Path('/usr/bin/git').exists() else None
    try:
        p=root/'.next/BUILD_ID';s=p.lstat()
        bid=p.read_text().strip() if stat.S_ISREG(s.st_mode) and not stat.S_ISLNK(s.st_mode) and s.st_size<=128 else None
    except OSError:bid=None
    fast=[]
    try:
        for p in root.iterdir():
            if p.name.startswith('.next-rollback-'):
                fast.append({'name':p.name,'type':'symlink' if p.is_symlink() else 'directory' if p.is_dir() else 'other'})
        fast=sorted(fast,key=lambda x:x['name'])[:30]
    except OSError:fast=[]
    return {'checkout_sha':live.decode().strip() if live else None,
            'build_id':bid,'fast_rollback_candidates':fast,
            'source_matches_target':bool(live and live.decode().strip()==WEBSITE)}
def main():
    phase=os.environ.get('AOE2WAR_B_PHASE','BEFORE')
    if phase not in ('BEFORE','AFTER','ROLLBACK'):
        print('HOLD: AOE2WAR_B_PHASE must be BEFORE/AFTER/ROLLBACK');return 2
    if sys.platform!='linux' or socket.gethostname().split('.')[0]!=HOST or os.getuid()!=1000 or os.geteuid()!=1000:
        print('HOLD: expected physical HEL1 nonroot tony UID1000');return 2
    if os.environ.get('SUDO_USER') or os.environ.get('SUDO_COMMAND'):
        print('HOLD: no sudo, run as original operator');return 2
    units_raw=cmd([SYSD,'list-unit-files','--all','--type=service','--type=timer','--no-legend','--no-pager'])
    if units_raw is None:
        print('HOLD: original nonroot systemd discovery failed');return 2
    discovered=set()
    for line in units_raw.decode('utf8','replace').splitlines():
        cells=line.split()
        if cells and re.fullmatch(r'[A-Za-z0-9_@.-]+\.(service|timer)',cells[0]) and cells[0].startswith(PREFIX):
            discovered.add(cells[0])
    found={};gaps=[]
    for name in sorted(discovered|REQUIRED):
        raw=cmd([SYSD,'show',name,'--no-pager','--property='+','.join(PROP)])
        cat=cmd([SYSD,'cat',name,'--no-pager'])
        if raw is None or cat is None:
            gaps.append('unit_unreadable:'+name);continue
        fields=dict(line.split('=',1) for line in raw.decode('utf8','replace').splitlines() if '=' in line)
        pid=int(fields.get('MainPID','0')) if fields.get('MainPID','0').isdigit() else 0
        record={'state':fields.get('ActiveState'),'substate':fields.get('SubState'),
                'load':fields.get('LoadState'),'pid':pid,'process':proc(pid),
                'unit_sha256':digest(cat),'exec_sha256':digest(fields.get('ExecStart','').encode()),
                'env_sha256':digest((fields.get('Environment','')+'\n'+fields.get('EnvironmentFiles','')).encode()),
                'dropin_sha256':digest(fields.get('DropInPaths','').encode()),
                'cgroup_sha256':digest(fields.get('ControlGroup','').encode()),
                'declared_user':fields.get('User') or 'root'}
        found[name]=record
        if record['load']!='loaded' or name not in discovered:gaps.append('unit_missing_or_not_loaded:'+name)
        if pid>0 and record['process'] is None:gaps.append('process_unreadable:'+name)
    missing=sorted(REQUIRED-set(discovered))
    if missing:gaps.append('required_finance_units_missing')
    cron_data,cron_gaps=cron();gaps+=cron_gaps
    sock=sockets()
    for port in ('8092','8093'):
        if sock[port]['listener_count']!=1 or sock[port]['unreadable']:
            gaps.append('listener_missing_or_ambiguous:'+port)
    topo={k:{f:v.get(f) for f in ('unit_sha256','exec_sha256','env_sha256','dropin_sha256','declared_user')}
          for k,v in found.items()}
    live={k:{f:v.get(f) for f in ('state','pid','process')} for k,v in found.items()}
    data={'schema':'aoe2war.b.r20.nonroot-hel1-finance-preflight.v1',
          'host':HOST,'real_uid':os.getuid(),'effective_uid':os.geteuid(),
          'phase':phase,'utc':datetime.now(timezone.utc).isoformat(),
          'boot_id':pathlib.Path('/proc/sys/kernel/random/boot_id').read_text().strip(),
          'expected_website_sha':WEBSITE,'expected_controller_sha':CONTROLLER,
          'required_units':len(REQUIRED),'discovered_units':len(discovered),
          'missing_required':missing,'additional_units':sorted(discovered-REQUIRED),
          'unit_discovery_sha256':digest(units_raw),
          'stable_topology_sha256':digest(canon(topo)),'runtime_snapshot_sha256':digest(canon(live)),
          'units':found,'listeners':sock,'cron':cron_data,'website':source(),
          'unresolved':sorted(set(gaps+['database_financial_rows_unattested',
                                      'independent_root_pid_executable_attestation_unavailable',
                                      'six_independent_signer_receipts_unavailable',
                                      'six_offhost_protected_restores_unavailable'])),
          'status':'UNSIGNED_OPERATOR_OBSERVATION__NOT_RELEASE_ADMISSION',
          'finance_authorized':False,'release_authorized':False}
    data['report_sha256']=digest(canon(data))
    print(json.dumps(data,sort_keys=True,separators=(',',':')))
    return 0
if __name__=='__main__':sys.exit(main())
