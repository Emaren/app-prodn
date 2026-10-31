#!/usr/bin/env python3
"""Owner Mac R25 B: one immutable-source PLAN then explicitly consented NEW-only install.

This does not stage/build/start 3031, touch original 3030/Wolo, or cut public.
Root operator SHA+Git-blob verified before strict SSH; NO /dev/tty/keygen.
"""
import base64
import hashlib
import json
import os
import re
import shlex
import subprocess
import sys
import urllib.request

B_SOURCE="7f365a3d27f56d6321ad10a34706889814fe4131"
ROOT_REF="c9c8c89408ea85099ed5eccfffcb59e58ecc5c01"
ROOT_BLOB="831f1beef82e77385226e29330cfbe1e853d3ed4"
GUARD_SHA="dead2815b3f20b311ede29dfd99086cbb81dfd6a73f1a71f2b7b57ccd74e809d"
WITNESS_SHA="c13d42c7de3ab8c9e55a68008ede2a9e2b55375d4aeae735cd47cf368b0a5e80"
DROPIN_GIT_BLOB="c9dc1999ba5c62f149240e4bab11b579afeb69bc"
NFT_GIT_BLOB="4b7323c8fe81ef09e8543bf4f9cfc22e3729aaad"
CONSENT="INSTALL-R25-B-NEW-ONLY-"+B_SOURCE[:12]
FILES={
 "guard":"scripts/r25_b_guard.cjs",
 "witness":"scripts/r25_b_host_witness.py",
 "dropin":"deploy/r25-b-3031.service.dropin.in",
 "nft":"deploy/r25-b-3031-egress.nft.in",
}
SCHEMA="aoe2war.r25.b.additive-3031-setup.v1"

def hold(why):
    raise SystemExit("HOLD:R25_B_OWNER_MAC:"+why)

def fetch(ref,path,limit):
    url="https://raw.githubusercontent.com/Emaren/app-prodn/"+ref+"/"+path
    try:
        with urllib.request.urlopen(url,timeout=20) as stream:
            blob=stream.read(limit+1)
    except Exception as ex:
        hold("PINNED_SOURCE_FETCH_"+type(ex).__name__)
    if not blob or len(blob)>limit:
        hold("SOURCE_SIZE_INVALID:"+path)
    return blob

def gitblob(data):
    return hashlib.sha1(b"blob "+str(len(data)).encode()+b"\x00"+data).hexdigest()

def payloads():
    root=fetch(ROOT_REF,"scripts/r25_b_additive_3031_setup.py",20000)
    if gitblob(root)!=ROOT_BLOB:
        hold("ROOT_INSTALLER_EXACT_GIT_BLOB_DRIFT")
    assets={k:fetch(B_SOURCE,p,32768) for k,p in FILES.items()}
    if hashlib.sha256(assets["guard"]).hexdigest()!=GUARD_SHA:
        hold("GUARD_EXACT_SHA256_DRIFT")
    if hashlib.sha256(assets["witness"]).hexdigest()!=WITNESS_SHA:
        hold("WITNESS_EXACT_SHA256_DRIFT")
    if gitblob(assets["dropin"])!=DROPIN_GIT_BLOB or gitblob(assets["nft"])!=NFT_GIT_BLOB:
        hold("EXACT_B_TEMPLATE_GIT_BLOB_DRIFT")
    if b"__B_GUARD_SHA256__" not in assets["dropin"]:
        hold("B_DROPIN_PIN_TEMPLATE_MISSING")
    if b"__DEDICATED_UID__" not in assets["nft"]:
        hold("B_NFT_UID_TEMPLATE_MISSING")
    bundle=base64.b64encode(json.dumps({
        k:base64.b64encode(v).decode() for k,v in assets.items()
    },sort_keys=True,separators=(",",":")).encode()).decode()
    if len(bundle)>65536 or not re.fullmatch("[A-Za-z0-9+/=]+",bundle):
        hold("BUNDLE_BOUNDARY")
    print("PASS:B_IMMUTABLE_ROOT_INSTALLER_GIT_BLOB="+ROOT_BLOB,flush=True)
    print("PASS:B_GUARD_SHA256="+GUARD_SHA,flush=True)
    print("PASS:B_WITNESS_SHA256="+WITNESS_SHA,flush=True)
    return root,bundle

def host_call(phase,root,bundle,database,consent=""):
    fields=["/usr/bin/python3","-I","-B","-","--phase",phase,"--commit",B_SOURCE,
            "--database",database,"--bundle-b64",bundle]
    if phase=="install":
        fields.extend(["--consent",consent])
    remote=" ".join(shlex.quote(x) for x in fields)
    ssh=["/usr/bin/ssh","-T","-o","BatchMode=yes",
         "-o","StrictHostKeyChecking=yes",
         "-o","NumberOfPasswordPrompts=0","-o","ConnectTimeout=10",
         "root@hel1",remote]
    try:
        result=subprocess.run(ssh,input=root,stdout=subprocess.PIPE,
                              stderr=subprocess.DEVNULL,timeout=90,check=False)
    except (OSError,subprocess.TimeoutExpired):
        hold("STRICT_ROOT_SSH_UNAVAILABLE")
    try: output=json.loads(result.stdout)
    except Exception:hold("ROOT_RECEIPT_NOT_JSON")
    if result.returncode or output.get("schema")!=SCHEMA:
        why=str(output.get("reason","NATIVE_TRANSACTION_FAILED"))[:160]
        hold(why)
    return output

def main():
    if sys.platform!="darwin" or os.geteuid()==0:
        hold("ORIGINAL_OWNER_MAC_NONROOT_REQUIRED")
    root,bundle=payloads()
    print("NEW WEBSITE ONLY. Original web PID 2625090 must remain alive.")
    database=input("Exact existing AoE2WAR application PostgreSQL database name: ").strip()
    if not re.fullmatch(r"[a-zA-Z_][a-zA-Z0-9_]{0,62}",database):
        hold("INVALID_DATABASE_NAME")
    plan=host_call("plan",root,bundle,database)
    if plan.get("status")!="PASS_B_INSTALL_PLAN_ONLY_NO_WRITES":
        hold("PHYSICAL_PLAN_NOT_ACCEPTED")
    print(json.dumps(plan,sort_keys=True,indent=2),flush=True)
    print("This will create ONLY a new OS login if absent, new DB role + grants,")
    print("an ADDITIVE uid-scoped nft table, and NEW-only root-owned guard/drop-in.")
    print("No old service restart, no Wolo action, no public cutover.")
    print("If installation partially fails, DO NOT retry; preserve started.json.")
    typed=input("Type '"+CONSENT+"' to approve the additive installation: ").strip()
    if typed!=CONSENT:hold("EXPLICIT_OWNER_CONSENT_NOT_ENTERED_NO_INSTALL")
    receipt=host_call("install",root,bundle,database,typed)
    if (receipt.get("status")!="PASS_B_NEW_ONLY_SETUP_NOT_RUNTIME_OR_CUTOVER"
        or receipt.get("old_web_mainpid")!=2625090
        or receipt.get("new_guard_sha256")!=GUARD_SHA
        or receipt.get("new_witness_sha256")!=WITNESS_SHA
        or receipt.get("public_cutover_authorized") is not False):
        hold("INSTALLED_RECEIPT_NOT_ACCEPTED_DO_NOT_RETRY")
    print(json.dumps(receipt,sort_keys=True,indent=2),flush=True)
    print("PASS:R25_B_NEW_ONLY_SETUP_INSTALLED_NOT_3031_RUNNING_NOT_PUBLIC_CUTOVER")
    print("NEXT:C source BUILD_STAGED, review new unit, then B root PRESTART and POSTSTART.")

if __name__=="__main__":
    main()
