#!/bin/sh
# AFTER successful distinct owner-authorized COPY_VERIFIED, run E existing
# independent SHA-pinned read-only full old .next vs on-volume copy certificate.
python3 -B - <<'PY'
import hashlib,json,os,pathlib,re,shlex,subprocess,sys,urllib.request

def hold(reason):raise SystemExit('HOLD:R25_E_OWNER_CERT:'+reason)
if sys.platform!='darwin' or os.geteuid()==0:hold('NONROOT_ORIGINAL_MAC_REQUIRED')
commit='d40ec0a55fda7f1484c4f9fa37f7168d56bb19e2'
sha='606b899cf51c0edc9140da727b1623792277d318a83e8f63b899604a3bc68184'
size=23108
url='https://raw.githubusercontent.com/Emaren/app-prodn/'+commit+'/scripts/aoe2_r25_e_parallel_certificate.py'
try:
    with urllib.request.urlopen(url,timeout=25) as response:worker=response.read(size+1)
except Exception as exc:hold('IMMUTABLE_E_SOURCE_FETCH_'+type(exc).__name__)
if len(worker)!=size or hashlib.sha256(worker).hexdigest()!=sha:hold('EXACT_E_WORKER_SHA_OR_SIZE_MISMATCH')
# The Python program itself arrives via a heredoc: sys.stdin is exhausted here.
# Read the operator's existing terminal explicitly; no server mutation occurs.
try:
    with open('/dev/tty','r+') as tty:
        tty.write('Paste exact NEW campaign from COPY_VERIFIED (r25-e-...): ')
        tty.flush()
        campaign=tty.readline(160).strip()
except OSError as exc:hold('OWNER_TTY_REQUIRED_'+type(exc).__name__)
if not re.fullmatch(r'r25-e-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{20}',campaign):
    hold('NEW_CAMPAIGN_ID_REQUIRED')
path='/mnt/HC_Volume_105319120/aoe2war/rollbacks/'+campaign+'/prior-next'
remote=['/usr/bin/python3','-I','-B','-','--candidate-max-bytes','8589934592',
        '--expected-old-pid','2625090','--durable-next',path,'--require-phase','RECOVERY_READY']
ssh=['/usr/bin/ssh','-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes',
     '-o','NumberOfPasswordPrompts=0','-o','ConnectTimeout=10',
     '-o','ConnectionAttempts=1','root@hel1',' '.join(shlex.quote(a) for a in remote)]
try:p=subprocess.run(ssh,input=worker,capture_output=True,timeout=1000)
except Exception as exc:hold('STRICT_SSH_'+type(exc).__name__)
if p.stderr:print(p.stderr.decode('utf-8','replace'),file=sys.stderr,flush=True)
if p.returncode:
    if p.stdout:print(p.stdout.decode('utf-8','replace')[:1800],flush=True)
    hold('E_PHYSICAL_RECOVERY_READY_NOT_PROVEN_EXIT_'+str(p.returncode))
try:report=json.loads(p.stdout)
except (ValueError,UnicodeDecodeError):hold('E_HOST_JSON_INVALID')
proof=report.get('certificate_sha256');base=dict(report);base.pop('certificate_sha256',None)
calc=hashlib.sha256(json.dumps(base,sort_keys=True,separators=(',',':')).encode()).hexdigest()
old=report.get('old_web') or {}; new=report.get('candidate') or {}; roll=report.get('durable_rollback') or {}
root=report.get('root') or {};vol=report.get('volume') or {};c=new.get('c_build_receipt') or {}
if not (
    report.get('schema')=='aoe2war.e.r25.parallel-website-certificate.v1'
    and report.get('phase')=='RECOVERY_READY'
    and report.get('storage_admission')=='PASS_E_READONLY_CAPACITY'
    and report.get('source_sha')=='0cee3c836c4b0760478280c145e02e81e470ce0e'
    and report.get('operations_performed')=='READ_ONLY'
    and report.get('release_authorized') is False
    and report.get('candidate_financial_isolation_proved') is False
    and report.get('archive',{}).get('sha256')=='c906c75d18ca56871bfdb9fbcdb6173e2c7643ae8f58e5f44735103c530f0101'
    and old.get('next_build_id')=='DQ2jMprNQ_Njq6QM8GHju'
    and old.get('process_pre_and_post',{}).get('mainpid')==2625090
    and new.get('stage_path')=='/var/lib/aoe2war-r25-web-0cee3c836c4b'
    and new.get('candidate_next_build_id')=='-dJl5VyecHu5BKNvfErJe'
    and c.get('c_tree_manifest_sha256_claim')=='5b0de1da545447f64cd1021839692060f5cf308210c19dbd7153f2f25090056d'
    and new.get('build_complete') is True
    and 0<new.get('bytes_allocated',0)<=8589934592
    and roll.get('path')==path and roll.get('build_id')=='DQ2jMprNQ_Njq6QM8GHju'
    and roll.get('content_matched') is True
    and roll.get('logical_file_bytes',0)>0 and roll.get('entries',0)>0
    and root.get('device')!=vol.get('device')
    and root.get('free_bytes',-1)>=root.get('required_free_bytes',2**63)
    and vol.get('free_bytes',-1)>=vol.get('required_free_bytes',2**63)
    and re.fullmatch('[0-9a-f]{64}',str(proof)) and proof==calc):
    hold('INDEPENDENT_HOST_EVIDENCE_BINDINGS_FAILED')
out=pathlib.Path.home()/'Downloads'/('r25-e-recovery-'+proof[:18]+'.json')
try:
    fd=os.open(out,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'wb') as f:
        f.write(p.stdout);f.flush();os.fsync(f.fileno())
except OSError as exc:hold('MAC_CERTIFICATE_SAVE_'+type(exc).__name__)
print('PASS:R25_E_PHYSICAL_RECOVERY_READY_STORAGE_ONLY_NOT_RELEASE_AUTHORIZATION')
print('CANDIDATE_ALLOCATED_BYTES='+str(new['bytes_allocated']))
print('ROOT_FREE_BYTES='+str(root['free_bytes']))
print('ATTACHED_FREE_BYTES='+str(vol['free_bytes']))
print('OLD_AND_DURABLE_SHA256='+str(roll['old_and_durable_tree_sha256']))
print('E_CERTIFICATE_SHA256='+proof)
print('CERTIFICATE='+str(out))
print('F #1083 must independently review before positive release acceptance.')
PY
