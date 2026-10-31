#!/usr/bin/env python3
"""R22 C, owner-side OFF-HEL1 RSA signer. Never generates or transfers a key.
Run only on the host already holding the authorized owner's private RSA key.
Output: a signed, short-lived JSON envelope (not a key).
"""
import argparse, base64, hashlib, json, os, pathlib, subprocess, sys, tempfile
from datetime import datetime, timedelta, timezone

CONTROLLER = '18052e01a191b15525664c1a058de80d7a8bc150'
MANIFEST = '874a27ecac946360e492420390fceb7e8b2409047033a0be641003c0da3408dc'
KEY_FP = '3ac8653650acd9c545f4ffa5d007db981bd634ab2f94fa08e687fed92948f1fd'
DOM = b'AOE2WAR.SOLO_OWNER.ROOT_HELPER_INSTALL.V2\n'
SCHEMA = 'aoe2war.hel1.root-install.permit.v2'

def canonical(obj):
    return json.dumps(obj, sort_keys=True, separators=(',', ':'), ensure_ascii=True, allow_nan=False).encode('ascii')

def hold(why):
    raise SystemExit('HOLD:R22C_SIGN:'+why)

def cmd(args, stdin=None):
    # OpenSSL passphrase prompts remain on the owner's local terminal.
    r=subprocess.run(args,stdout=subprocess.PIPE,stderr=None)
    if r.returncode:hold('OPENSSL_FAILED_'+str(r.returncode))
    return r.stdout

def sign(key,output,minutes=10):
    if sys.platform != 'darwin':hold('REQUIRES_EXISTING_OWNER_MAC_CUSTODY')
    if not 0<minutes<=15:hold('VALIDITY_EXCEEDS_15_MINUTES')
    k=pathlib.Path(key).expanduser(); out=pathlib.Path(output).expanduser()
    if not k.is_absolute() or k.is_symlink() or not k.is_file():hold('EXISTING_OWNER_KEY_PATH_REQUIRED')
    if out.exists() or out.is_symlink() or not out.parent.is_dir():hold('OUTPUT_MUST_BE_NEW')
    # Confirm exact public key corresponding to existing private RSA key. Only public DER leaves OpenSSL.
    der=cmd(['/usr/bin/openssl','pkey','-in',str(k),'-pubout','-outform','DER'])
    if hashlib.sha256(der).hexdigest()!=KEY_FP:hold('OWNER_RSA_KEY_FINGERPRINT_MISMATCH')
    now=datetime.now(timezone.utc).replace(microsecond=0)
    payload={'operation':'install','manifest_sha256':MANIFEST,'controller_commit':CONTROLLER,
             'issued_at':now.isoformat().replace('+00:00','Z'),
             'expires_at':(now+timedelta(minutes=minutes)).isoformat().replace('+00:00','Z')}
    message=DOM+canonical(payload)
    # The encrypted RSA key prompts locally. Do not pipe the message through stdin,
    # which may instead be needed for OpenSSL's interactive passphrase prompt.
    with tempfile.TemporaryDirectory(prefix='aoe2war-r22c-owner-') as td:
        m=pathlib.Path(td)/'message';m.write_bytes(message)
        sg=pathlib.Path(td)/'signature'
        cmd(['/usr/bin/openssl','dgst','-sha256','-sign',str(k),'-out',str(sg),str(m)])
        sig=sg.read_bytes()
    envelope={'schema':SCHEMA,'payload':payload,'signature_base64':base64.b64encode(sig).decode('ascii')}
    raw=canonical(envelope)+b'\n'
    fd=os.open(out,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    try:
        with os.fdopen(fd,'wb') as f:f.write(raw);f.flush();os.fsync(f.fileno())
    except BaseException:
        try:out.unlink()
        except OSError:pass
        raise
    print('PASS:R22_OWNER_RSA_SIGNED_ENVELOPE_ONLY')
    print('PERMIT_SHA256='+hashlib.sha256(raw).hexdigest())
    print('PERMIT_EXPIRES='+payload['expires_at'])
    print('KEY_EXPORTED=false; HEL1_INSTALL_NOT_RUN')

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--existing-owner-private-key',default='~/.config/aoe2war/website-owner-v4/owner-private.pem')
    p.add_argument('--output',required=True)
    p.add_argument('--valid-minutes',type=int,default=10)
    a=p.parse_args()
    sign(a.existing_owner_private_key,a.output,a.valid_minutes)