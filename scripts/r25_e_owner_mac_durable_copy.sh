#!/bin/sh
# Run ONLY after independent F/C source review and exact-head CI confirmation.
# HEL1 PLAN is read-only. HEL1 COPY is a new, additive, separately typed owner
# action, one-use campaign; never restarts original, no cleanup or overwrite.
python3 -B - <<'PY'
import datetime,hashlib,json,os,pathlib,re,secrets,shlex,subprocess,sys,urllib.request

def hold(reason): raise SystemExit('HOLD:R25_E_OWNER_COPY:'+reason)
if sys.platform!='darwin' or os.geteuid()==0:
    hold('ORIGINAL_OWNER_NONROOT_MAC_REQUIRED')
commit='e217b99c830ebc01aa46c4a4b60b3a6cd14a218f'
source_sha='55ce776c75734121b4ba3f14a7f5edfbae10d9321d5cd6ac45cf1e568412bc87'
source_size=23254
url='https://raw.githubusercontent.com/Emaren/app-prodn/'+commit+'/scripts/aoe2_r25_e_durable_old_next_copy.py'
try:
    with urllib.request.urlopen(url,timeout=25) as r: worker=r.read(source_size+1)
except Exception as exc: hold('SOURCE_FETCH_'+type(exc).__name__)
if len(worker)!=source_size or hashlib.sha256(worker).hexdigest()!=source_sha:
    hold('PINNED_WORKER_SHA_OR_SIZE_MISMATCH')

def remote(*argv):
    command=['/usr/bin/python3','-I','-B','-',*argv]
    ssh=['/usr/bin/ssh','-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes',
         '-o','NumberOfPasswordPrompts=0','-o','ConnectTimeout=10',
         '-o','ConnectionAttempts=1','root@hel1',
         ' '.join(shlex.quote(x) for x in command)]
    try: return subprocess.run(ssh,input=worker,capture_output=True,timeout=1600)
    except Exception as exc: hold('STRICT_SSH_'+type(exc).__name__)

def parse_result(p,phase):
    if p.stderr:print(p.stderr.decode('utf-8','replace'),file=sys.stderr,flush=True)
    if p.returncode:
        if p.stdout: print(p.stdout.decode('utf-8','replace')[:1600],flush=True)
        hold('HOST_'+phase+'_HOLD_EXIT_'+str(p.returncode))
    try:return json.loads(p.stdout)
    except Exception:hold('HOST_'+phase+'_JSON_INVALID')

def canonical(x):return json.dumps(x,sort_keys=True,separators=(',',':'),ensure_ascii=True,allow_nan=False).encode()

plan=parse_result(remote('--phase','plan'),'PLAN')
stable=dict(plan);plan_hash=stable.pop('plan_sha256',None)
# Keep the physical capacity values for the reserve check; strip free-space drift
# ONLY from a separate copy used to reproduce the root worker's stable plan SHA.
cap=dict(stable.get('capacity') or {})
hash_cap=dict(cap)
hash_cap.pop('attached_free_before_bytes',None)
hash_cap.pop('root_free_before_bytes',None)
stable['capacity']=hash_cap
if not (
    plan.get('schema')=='aoe2war.r25.e.old-next-copy-plan.v1'
    and plan.get('mutations_authorized') is False
    and plan.get('host')=='ubuntu-4gb-hel1-11'
    and plan.get('original_pid')==2625090
    and plan.get('old_build_id')=='DQ2jMprNQ_Njq6QM8GHju'
    and plan.get('c_build_id')=='-dJl5VyecHu5BKNvfErJe'
    and plan.get('c_tree_sha256')=='5b0de1da545447f64cd1021839692060f5cf308210c19dbd7153f2f25090056d'
    and plan.get('source')=='/var/www/AoE2HDBets/app-prodn/.next'
    and plan.get('destination_root')=='/mnt/HC_Volume_105319120/aoe2war/rollbacks'
    and plan.get('root_device')!=plan.get('volume_device')
    and 0<plan.get('source_entries',0)<=160000
    and 0<plan.get('source_logical_bytes',0)<=16*1024**3
    and re.fullmatch('[0-9a-f]{64}',str(plan_hash))
    and plan_hash==hashlib.sha256(canonical(stable)).hexdigest()
    and cap.get('attached_free_before_bytes',0)>=cap.get('copy_budget_bytes',2**64)+4*1024**3
    and cap.get('root_free_before_bytes',0)>=4*1024**3):
    hold('READONLY_PLAN_PROVENANCE_OR_BUDGET_MISMATCH')

campaign=('r25-e-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
          +'-'+secrets.token_hex(10))
dest=plan['destination_root']+'/'+campaign+'/prior-next'
print('PASS:R25_E_SOURCE_PIN_AND_READONLY_PLAN',flush=True)
print('SOURCE_ENTRIES='+str(plan['source_entries']))
print('SOURCE_LOGICAL_BYTES='+str(plan['source_logical_bytes']))
print('SOURCE_ALLOCATED_BYTES='+str(cap['old_next_allocated_bytes']))
print('ATTACHED_FREE_BYTES='+str(cap['attached_free_before_bytes']))
print('COPY_BUDGET_BYTES='+str(cap['copy_budget_bytes']))
print('NEW_UNIQUE_CAMPAIGN='+campaign)
print('DESTINATION='+dest)
phrase='AUTHORIZE R25 E COPY OLD NEXT DQ2jMprNQ_Njq6QM8GHju '+campaign+' '+plan_hash
with open('/dev/tty','w') as tty:
    tty.write('\nNEW attached-volume copy ONLY; no existing campaign or original web mutation.\n')
    tty.write('Type this FULL one-use approval exactly:\n'+phrase+'\n> ')
    tty.flush()
with open('/dev/tty','r') as tty:
    if tty.readline().rstrip('\r\n')!=phrase:hold('FULL_TYPED_OWNER_APPROVAL_NOT_ENTERED_BEFORE_COPY')

receipt=parse_result(remote('--phase','copy','--campaign',campaign,
                            '--approved-plan-sha256',plan_hash),'COPY')
check=dict(receipt);fingerprint=check.pop('receipt_sha256',None)
if not (
    receipt.get('schema')=='aoe2war.r25.e.durable-old-next-copy.v1'
    and receipt.get('status')=='COPY_VERIFIED_NOT_RECOVERY_READY'
    and receipt.get('campaign')==campaign
    and receipt.get('destination')==dest
    and receipt.get('plan_sha256')==plan_hash
    and receipt.get('old_build_id')=='DQ2jMprNQ_Njq6QM8GHju'
    and receipt.get('original_pid')==2625090
    and receipt.get('original_start_ticks')==plan['original_pid_start_ticks']
    and receipt.get('c_build_id')=='-dJl5VyecHu5BKNvfErJe'
    and receipt.get('c_tree_sha256')=='5b0de1da545447f64cd1021839692060f5cf308210c19dbd7153f2f25090056d'
    and receipt.get('source_content_sha256')==plan['source_content_sha256']
    and receipt.get('source_metadata_sha256')==plan['source_metadata_sha256']
    and receipt.get('readback_content_sha256')==receipt['source_content_sha256']
    and receipt.get('readback_entries')==plan['source_entries']
    and receipt.get('logical_bytes')==plan['source_logical_bytes']
    and receipt.get('volume_free_after_bytes',0)>=4*1024**3
    and receipt.get('root_free_after_bytes',0)>=4*1024**3
    and receipt.get('release_authorized') is False
    and receipt.get('independent_E_readonly_witness_required') is True
    and re.fullmatch('[0-9a-f]{64}',str(fingerprint))
    and fingerprint==hashlib.sha256(canonical(check)).hexdigest()):
    hold('ROOT_COPY_RECEIPT_NOT_AUTHENTICATED_DO_NOT_RETRY')

out=pathlib.Path.home()/'Downloads'/('r25-e-copy-'+fingerprint[:18]+'.json')
try:
    fd=os.open(out,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'wb') as f:
        f.write(json.dumps(receipt,sort_keys=True,indent=2).encode()+b'\n');f.flush();os.fsync(f.fileno())
except OSError as exc:hold('MAC_RECEIPT_SAVE_'+type(exc).__name__)
print('PASS:R25_E_COPY_VERIFIED_NOT_RECOVERY_READY',flush=True)
print('DESTINATION='+dest,flush=True)
print('ROOT_COPY_RECEIPT_SHA256='+fingerprint,flush=True)
print('MAC_RECEIPT='+str(out),flush=True)
print('NEXT: Run INDEPENDENT R25 E read-only old/durable Next parity certificate; F owns acceptance.',flush=True)
PY
