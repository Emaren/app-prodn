#!/usr/bin/env python3
"""Deterministic W1_SAFE root helper source pins and owner-gated HEL1 installer.

BUILD is unprivileged; PLAN is root read-only. INSTALL and ROLLBACK require a
separate, fresh, owner-RSA-signed EXACT digest permit and interactive consent.
This DOES NOT authorize SSH key enrollment, lock parent chown, stage, activation,
producer enrollment, financial writes, or native signing. No arbitrary shell.
"""
from __future__ import annotations
import argparse, ast, base64, fcntl, gzip, hashlib, io, json, os, pathlib, re
import socket, stat, subprocess, sys, tarfile, tempfile
from datetime import datetime, timezone, timedelta

HOST="ubuntu-4gb-hel1-11"
DEST=pathlib.Path("/usr/local/libexec/aoe2war")
CONFIG=pathlib.Path("/etc/aoe2war/solo-owner-website-v1")
TRUST=CONFIG/"approved-helpers.json"
MANIFEST_RECEIPT=CONFIG/"root-helper-install-v2-receipt.json"
APPROVAL=CONFIG/"root-helper-install-v2-approval.json"
# Durable, one-time permit consumption. Preserve across rollback and failed install.
KEY=pathlib.Path("/etc/aoe2war/website-owner-v4/owner.pem")
KEY_FP="3ac8653650acd9c545f4ffa5d007db981bd634ab2f94fa08e687fed92948f1fd"
LOCK=pathlib.Path("/mnt/HC_Volume_105319120/aoe2war/os-control/locks/release.lock")
EXPECTED_LOCK=(2064,6185747,1000,0o644)
FINGERPRINTS={"observer":"SHA256:V22glaX3l75+/XtA+mA7krroZSN6PST15xkByE2bAOs",
              "command":"SHA256:qyEAVAE0w3YEvO4xDxMtO25IHoA5gaE8hs6lhwELr8Q"}
DOM=b"AOE2WAR.SOLO_OWNER.ROOT_HELPER_INSTALL.V2\n"
MODULES={
 "aoe2_solo_website_forced_ssh.py": ("solo-v1-forced-ssh.py",),
 "aoe2_solo_website_hel1_observer.py": ("solo-v1-readonly-observer","aoe2_solo_website_hel1_observer.py"),
 "aoe2_solo_website_command_channel.py": ("solo-v1-command-channel.py",),
 "aoe2_solo_website_root_phase.py": ("solo-v1-root-phase","aoe2_solo_website_root_phase.py"),
 "aoe2_solo_website_host_security_install.py": ("solo-v1-host-security.py",),
 "aoe2_solo_website_nonce_ledger.py": ("aoe2_solo_website_nonce_ledger.py",),
 "aoe2_solo_website_native_audit_adapter.py": ("aoe2_solo_website_native_audit_adapter.py",),
 "aoe2_solo_website_financial_proof.py": ("aoe2_solo_website_financial_proof.py",),
 "aoe2_solo_website_financial_collector.py": ("aoe2_solo_website_financial_collector.py",),
 "aoe2_solo_website_producer_receipts.py": ("aoe2_solo_website_producer_receipts.py",),
 "aoe2_solo_website_native_issuer.py": ("solo-v1-native-admission",),
 "aoe2_solo_website_producer_intake.py": ("solo-v1-producer-intake",),
}
TRUST_MAP={"observer":"solo-v1-readonly-observer","channel":"solo-v1-command-channel.py",
           "phase":"solo-v1-root-phase"}
HEX40=re.compile(r"[0-9a-f]{40}\Z")
HEX64=re.compile(r"[0-9a-f]{64}\Z")

class Hold(Exception):pass
def need(ok,reason):
    if not ok:raise Hold(reason)
def canonical(v):return json.dumps(v,sort_keys=True,separators=(",",":"),ensure_ascii=True,allow_nan=False).encode("ascii")
def hash256(x):return hashlib.sha256(x).hexdigest()
def blobid(x):return hashlib.sha1(b"blob "+str(len(x)).encode()+b"\0"+x).hexdigest()
def nodups(pairs):
    out={}
    for k,v in pairs:
        need(k not in out,"DUPLICATE_JSON_FIELD")
        out[k]=v
    return out
def parse(data):
    return json.loads(data,object_pairs_hook=nodups,parse_constant=lambda _: (_ for _ in ()).throw(Hold("NONFINITE_JSON")))

def git(repo,*args):
    p=subprocess.run(["/usr/bin/git","-C",str(repo),*args],capture_output=True,timeout=15)
    need(p.returncode==0,"GIT_SOURCE_NOT_AVAILABLE:"+" ".join(args[:2]))
    return p.stdout

def literal(py,name):
    tree=ast.parse(py)
    for node in tree.body:
        if isinstance(node,ast.Assign) and any(isinstance(x,ast.Name) and x.id==name for x in node.targets):
            return ast.literal_eval(node.value)
    raise Hold("SOURCE_LITERAL_MISSING:"+name)

def bundle_bytes(files):
    tarout=io.BytesIO()
    with tarfile.open(fileobj=tarout,mode="w",format=tarfile.USTAR_FORMAT) as tar:
        for name in sorted(files):
            raw=files[name]
            need(len(raw)<=512*1024,"SOURCE_MODULE_TOO_BIG")
            ti=tarfile.TarInfo(name);ti.size=len(raw);ti.uid=0;ti.gid=0
            ti.uname="";ti.gname="";ti.mtime=0;ti.mode=0o600
            tar.addfile(ti,io.BytesIO(raw))
    output=io.BytesIO()
    with gzip.GzipFile(fileobj=output,mode="wb",filename="",mtime=0,compresslevel=9) as gz:
        gz.write(tarout.getvalue())
    return output.getvalue()

def build(repo,sha,out):
    repo=pathlib.Path(repo).resolve()
    need(bool(HEX40.fullmatch(sha)),"SOURCE_SHA_REQUIRED")
    need(git(repo,"rev-parse","HEAD").decode().strip()==sha,"SOURCE_HEAD_NOT_PINNED")
    need(not git(repo,"status","--porcelain","--untracked-files=no"),"SOURCE_WORKTREE_DIRTY")
    files={}
    for name in MODULES:
        path="scripts/"+name
        raw=git(repo,"show",sha+":"+path)
        need(len(raw)>0 and len(raw)<=512*1024,"SOURCE_FILE_BOUNDS")
        gitsha=git(repo,"rev-parse",sha+":"+path).decode().strip()
        need(blobid(raw)==gitsha,"SOURCE_OBJECT_IDENTITY")
        files[name]=raw
    trains=literal(files["aoe2_solo_website_root_phase.py"],"TRAINS")
    safe=trains.get("W1_SAFE")
    need(type(safe) is tuple and len(safe)==2 and bool(HEX40.fullmatch(safe[0])),"W1_SAFE_NOT_FINAL")
    need(literal(files["aoe2_solo_website_native_issuer.py"],"W1_SAFE")==safe[0],"ISSUER_SAFE_SHA_CONFLICT")
    need(literal(files["aoe2_solo_website_root_phase.py"],"KEY_FP")==KEY_FP,"OWNER_RSA_PIN_DRIFT")
    archive=bundle_bytes(files)
    targets={dest:hash256(files[name]) for name,dests in MODULES.items() for dest in dests}
    need(len(targets)==sum(map(len,MODULES.values())),"DUPLICATE_DESTINATION")
    manifest={"schema":"aoe2war.hel1.root-install.v2","controller_commit":sha,
      "w1_safe_candidate":safe[0],"w1_safe_previous":safe[1],
      "bundle_sha256":hash256(archive),"bundle_bytes":len(archive),
      "source_git_blobs":{n:blobid(files[n]) for n in sorted(files)},
      "source_sha256":{n:hash256(files[n]) for n in sorted(files)},
      "targets_sha256":dict(sorted(targets.items())),
      "owner_rsa_spki_sha256":KEY_FP,"original_lock":list(EXPECTED_LOCK),
      "ssh_key_fingerprints":FINGERPRINTS,"financial_release_authorized":False,
      "root_install_authorized":False}
    dest=pathlib.Path(out)
    need(dest.exists() and dest.is_dir() and not dest.is_symlink(),"OUTPUT_DIR_INVALID")
    for name,raw in [("root-helpers-v2.tar.gz",archive),("root-helpers-v2.manifest.json",canonical(manifest)+b"\n")]:
        fd=os.open(dest/name,os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o600)
        with os.fdopen(fd,"wb") as f:f.write(raw);f.flush();os.fsync(f.fileno())
    print(canonical({"status":"BUILT_UNAPPROVED","controller":sha,
                     "manifest_sha256":hash256(canonical(manifest)+b"\n"),"bundle_sha256":hash256(archive)}).decode())

def root_guard():
    need(sys.platform.startswith("linux") and socket.gethostname()==HOST and os.geteuid()==0,
         "EXPECTED_NATIVE_HEL1_ROOT")
    need(not any(k in os.environ for k in ("PYTHONPATH","PYTHONHOME")),"UNTRUSTED_PYTHON_ENV")

def protected(path,*,file=False):
    need(path.is_absolute(),"NOT_ABSOLUTE")
    for node in (path,*path.parents):
        st=node.lstat()
        need(not stat.S_ISLNK(st.st_mode) and st.st_uid==0 and not st.st_mode&0o022,
             "ROOT_ANCESTRY_UNPROTECTED:"+str(node))
    st=path.lstat()
    need(stat.S_ISREG(st.st_mode) if file else stat.S_ISDIR(st.st_mode),"PROTECTED_TYPE")

def read_file(path,limit,*,trusted=False):
    path=pathlib.Path(path)
    need(path.is_absolute() and not path.is_symlink(),"INPUT_LINK_OR_RELATIVE")
    if trusted:protected(path,file=True)
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
    try:
        before=os.fstat(fd)
        need(stat.S_ISREG(before.st_mode) and 0<before.st_size<=limit,"FILE_SIZE_OR_TYPE")
        data=os.read(fd,limit+1)
        after=os.fstat(fd)
        need(len(data)==before.st_size and
             (before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns)==
             (after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns),"INPUT_CHANGED_DURING_READ")
        return data
    finally:os.close(fd)

def unpack(archive):
    result={}
    with tarfile.open(fileobj=io.BytesIO(archive),mode="r:gz") as tar:
        for m in tar:
            need(m.isfile() and m.name in MODULES and m.name not in result and
                 m.name==pathlib.PurePosixPath(m.name).name and m.size<=512*1024,
                 "BUNDLE_UNEXPECTED_ENTRY")
            f=tar.extractfile(m);need(f is not None,"BUNDLE_MEMBER_UNREADABLE")
            raw=f.read(512*1024+1);need(len(raw)==m.size,"BUNDLE_TRUNCATED")
            result[m.name]=raw
    need(set(result)==set(MODULES),"INCOMPLETE_BUNDLE")
    return result

def source_admit(manifest,archive,source_commit):
    need(type(manifest) is dict and manifest.get("schema")=="aoe2war.hel1.root-install.v2",
         "MANIFEST_SCHEMA")
    need(manifest.get("controller_commit")==source_commit and bool(HEX40.fullmatch(source_commit)),"CONTROLLER_SHA_CONFLICT")
    need(type(manifest.get("w1_safe_candidate"))is str and bool(HEX40.fullmatch(manifest["w1_safe_candidate"])),"SAFE_SOURCE_UNPINNED")
    need(manifest.get("financial_release_authorized")is False and
         manifest.get("root_install_authorized")is False,"MANIFEST_AUTHORITY_ESCALATION")
    need(manifest.get("bundle_sha256")==hash256(archive) and manifest.get("bundle_bytes")==len(archive),"BUNDLE_SHA_MISMATCH")
    files=unpack(archive)
    need(set(manifest.get("source_git_blobs",{}))==set(files) and
         set(manifest.get("source_sha256",{}))==set(files),"SOURCE_SET_MISMATCH")
    for n,b in files.items():
        need(manifest["source_git_blobs"][n]==blobid(b) and
             manifest["source_sha256"][n]==hash256(b),"SOURCE_MEMBER_DRIFT:"+n)
    targets={t:hash256(files[n]) for n,tgts in MODULES.items() for t in tgts}
    need(manifest.get("targets_sha256")==dict(sorted(targets.items())),"TARGET_SET_DRIFT")
    need(files["aoe2_solo_website_native_issuer.py"].startswith(b"#!/usr/bin/python3 -I\n"),"NATIVE_ISSUER_ENTRYPOINT_INTERPRETER_DRIFT")
    need(files["aoe2_solo_website_producer_intake.py"].startswith(b"#!/usr/bin/python3 -I\n"),"NATIVE_INTAKE_ENTRYPOINT_INTERPRETER_DRIFT")
    trains=literal(files["aoe2_solo_website_root_phase.py"],"TRAINS")
    safe=trains.get("W1_SAFE")
    need(type(safe)is tuple and list(safe)==[manifest["w1_safe_candidate"],manifest["w1_safe_previous"]],"SAFE_ROOT_PHASE_DRIFT")
    need(literal(files["aoe2_solo_website_native_issuer.py"],"W1_SAFE")==safe[0],"ISSUER_SAFE_DRIFT")
    need(literal(files["aoe2_solo_website_root_phase.py"],"KEY_FP")==KEY_FP and
         manifest.get("owner_rsa_spki_sha256")==KEY_FP,"OWNER_RSA_PIN_MISMATCH")
    need(manifest.get("original_lock")==list(EXPECTED_LOCK),"LOCK_PIN_DRIFT")
    need(manifest.get("ssh_key_fingerprints")==FINGERPRINTS,"ROLE_KEY_PIN_DRIFT")
    return files,targets

def key_wire(pub):
    need(type(pub) is str and pub.startswith("ssh-ed25519 ") and pub.count(" ")==1,"ROLE_KEY_SCHEMA")
    enc=pub.split()[1]
    try:raw=base64.b64decode(enc,validate=True)
    except Exception as e:raise Hold("ROLE_KEY_B64") from e
    need(raw.startswith(b"\x00\x00\x00\x0bssh-ed25519\x00\x00\x00\x20") and len(raw)==51 and
         base64.b64encode(raw).decode()==enc,"ROLE_KEY_WIRE")
    return raw

def native_lock_and_keys():
    st=LOCK.lstat()
    need(stat.S_ISREG(st.st_mode) and
         (st.st_dev,st.st_ino,st.st_uid,stat.S_IMODE(st.st_mode))==EXPECTED_LOCK,"ORIGINAL_LOCK_IDENTITY_CHANGED")
    pending=[]
    for node in (LOCK.parent,*LOCK.parent.parents):
        info=node.lstat()
        need(stat.S_ISDIR(info.st_mode) and not stat.S_ISLNK(info.st_mode) and
             not info.st_mode&0o022,"LOCK_ANCESTOR_UNSAFE")
        if info.st_uid!=0:
            need(node in (LOCK.parent,LOCK.parent.parent) and info.st_uid==1000,"UNEXPECTED_LOCK_PARENT_OWNER")
            pending.append(str(node))
    approved=parse(read_file(CONFIG/"approved-ssh-keys.json",32768,trusted=True))
    need(type(approved) is dict and set(approved)==set(FINGERPRINTS),"ROLE_KEY_CATALOG")
    identities=set()
    for role in FINGERPRINTS:
        raw=key_wire(approved[role]);identities.add(raw)
        fp="SHA256:"+base64.b64encode(hashlib.sha256(raw).digest()).decode().rstrip("=")
        need(fp==FINGERPRINTS[role],"ROLE_KEY_IDENTITY_CHANGED:"+role)
    need(len(identities)==2,"SSH_ROLE_KEY_REUSE")
    return pending

def deployed_expected(files):
    return {t:files[n] for n,targets in MODULES.items() for t in targets}

def inspect_dest(payloads):
    present=[];absent=[]
    if DEST.exists():protected(DEST)
    for name,raw in sorted(payloads.items()):
        p=DEST/name
        if p.exists() or p.is_symlink():
            need(DEST.exists(),"UNEXPECTED_HELPER_PARENT")
            got=read_file(p,1024*1024,trusted=True)
            need(got==raw,"INSTALLED_HELPER_CONFLICT:"+name)
            present.append(name)
        else:absent.append(name)
    return present,absent

def trust_bytes(files):
    body={role:hash256(files[next(n for n,names in MODULES.items() if target in names)])
          for role,target in TRUST_MAP.items()}
    return canonical(body)+b"\n"

def install_receipt(manifest_hash,controller,targets):
    return canonical({"schema":"aoe2war.hel1.root-install.receipt.v2",
      "manifest_sha256":manifest_hash,"controller_commit":controller,
      "targets_sha256":dict(sorted(targets.items())),"root_only":True,
      "ssh_keys_installed":False,"release_authorized":False})+b"\n"

def permit(operation, manifest_hash,controller):
    approved=parse(read_file(APPROVAL,65536,trusted=True))
    need(type(approved) is dict and set(approved)=={"schema","payload","signature_base64"} and
         approved["schema"]=="aoe2war.hel1.root-install.permit.v2","INSTALL_APPROVAL_SCHEMA")
    body=approved["payload"]
    need(type(body) is dict and set(body)=={"operation","manifest_sha256","controller_commit","issued_at","expires_at"} and
         body["operation"]==operation and body["manifest_sha256"]==manifest_hash and
         body["controller_commit"]==controller,"OWNER_APPROVAL_SCOPE")
    def utc(x):
        need(type(x)is str and x.endswith("Z"),"APPROVAL_NOT_UTC")
        return datetime.fromisoformat(x[:-1]+"+00:00")
    now=datetime.now(timezone.utc);start=utc(body["issued_at"]);end=utc(body["expires_at"])
    need(start<=now<=end and timedelta(0)<end-start<=timedelta(minutes=15),"OWNER_APPROVAL_EXPIRED")
    pub=read_file(KEY,16384,trusted=True)
    with tempfile.TemporaryDirectory(prefix="aoe2-install-owner-") as td:
        k=pathlib.Path(td)/"key.pem";k.write_bytes(pub)
        der=subprocess.run(["/usr/bin/openssl","pkey","-pubin","-in",str(k),"-outform","DER"],capture_output=True,timeout=8)
        need(der.returncode==0 and hash256(der.stdout)==KEY_FP,"OWNER_RSA_PUBLIC_PIN")
        signed=pathlib.Path(td)/"message";signed.write_bytes(DOM+canonical(body))
        sg=pathlib.Path(td)/"signature"
        sg.write_bytes(base64.b64decode(approved["signature_base64"],validate=True))
        checked=subprocess.run(["/usr/bin/openssl","dgst","-sha256","-verify",str(k),"-signature",str(sg),str(signed)],capture_output=True,timeout=8)
        need(checked.returncode==0,"OWNER_RSA_INSTALL_PERMIT_INVALID")
    return hash256(read_file(APPROVAL,65536,trusted=True))

def consume_permit(permit_sha,operation,manifest_hash):
    # One-use durable permit marker under an already protected CONFIG.
    marker=CONFIG/("root-helper-install-v2-consumed-"+permit_sha+".json")
    need(not marker.exists() and not marker.is_symlink(),"OWNER_INSTALL_PERMIT_REPLAY")
    write_new(marker,canonical({"schema":"aoe2war.hel1.permit-consumed.v2",
       "operation":operation,"manifest_sha256":manifest_hash,"permit_sha256":permit_sha})+b"\n")
    return marker

def typed_consent(operation,controller):
    phrase="AUTHORIZE HEL1 "+operation.upper()+" ROOT HELPERS "+controller
    need(sys.stdin.isatty(),"INTERACTIVE_OWNER_TTY_REQUIRED")
    print("Owner must type exactly: "+phrase,flush=True)
    need(input("Owner authorization: ")==phrase,"OWNER_CONSENT_DENIED")

def write_new(path,raw,mode=0o600):
    need(path.parent.is_dir(),"MISSING_TRUSTED_PARENT")
    protected(path.parent)
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode)
    try:
        with os.fdopen(fd,"wb") as f:f.write(raw);f.flush();os.fsync(f.fileno())
        os.chown(path,0,0);os.chmod(path,mode)
    except BaseException:
        try:path.unlink()
        except OSError:pass
        raise

def check_absent_ssh():
    # Only uninstall helpers after C/F has separately removed BOTH restricted
    # role entries. This is deliberately stricter than simply checking a port.
    keys=pathlib.Path("/root/.ssh/authorized_keys")
    if keys.exists():
        raw=read_file(keys,262144,trusted=True)
        approved=parse(read_file(CONFIG/"approved-ssh-keys.json",32768,trusted=True))
        for role in FINGERPRINTS:
            need(approved[role].encode() not in raw,"SSH_ROLE_STILL_ENROLLED:"+role)

def assert_original_lease_idle():
    # Never remove a helper while F's original FD200 session or orphan build
    # guardian still holds the release lock. Do NOT close or unlock its OFD.
    before=LOCK.lstat()
    fd=os.open(LOCK,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
    try:
        got=os.fstat(fd)
        need((got.st_dev,got.st_ino,got.st_uid,stat.S_IMODE(got.st_mode))==EXPECTED_LOCK and
             (before.st_dev,before.st_ino)==(got.st_dev,got.st_ino),"ROLLBACK_LOCK_IDENTITY")
        try:fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError as e:raise Hold("ORIGINAL_FD200_SESSION_STILL_ACTIVE") from e
        finally:
            # Only a lock ACQUIRED ON THIS INDEPENDENT descriptor may be
            # unlocked; never touch the inherited FD200.
            pass
        fcntl.flock(fd,fcntl.LOCK_UN)
    finally:os.close(fd)

def run_native(a):
    root_guard()
    need(type(a.approved_manifest_sha256)is str and bool(HEX64.fullmatch(a.approved_manifest_sha256)),"REVIEWED_MANIFEST_SHA_REQUIRED")
    manifest_raw=read_file(a.manifest,65536)
    need(hash256(manifest_raw)==a.approved_manifest_sha256,"EXTERNAL_MANIFEST_PIN_MISMATCH")
    manifest=parse(manifest_raw)
    archive=read_file(a.bundle,12*1024*1024)
    files,targets=source_admit(manifest,archive,a.controller_sha)
    payloads=deployed_expected(files)
    before=native_lock_and_keys()
    present,absent=inspect_dest(payloads)
    expected_trust=trust_bytes(files)
    if TRUST.exists():need(read_file(TRUST,32768,trusted=True)==expected_trust,"ROOT_HELPER_TRUST_CONFLICT")
    if MANIFEST_RECEIPT.exists():
        need(read_file(MANIFEST_RECEIPT,65536,trusted=True)==install_receipt(a.approved_manifest_sha256,a.controller_sha,targets),"ROOT_INSTALL_RECEIPT_CONFLICT")
    if a.mode=="plan":
        print(canonical({"status":"REVIEWED_SOURCE_ONLY_PLAN_NOT_AUTHORIZED",
            "controller_commit":a.controller_sha,"w1_safe_candidate":manifest["w1_safe_candidate"],
            "manifest_sha256":a.approved_manifest_sha256,"helper_targets":len(payloads),
            "verified_installed":len(present),"missing":len(absent),
            "pending_lock_ancestors":before,"original_lock":list(EXPECTED_LOCK),
            "owner_install_approval":"NOT_CONSUMED","ssh_enrollment":False}).decode());return
    if a.mode=="verify":
        need(not absent and read_file(TRUST,32768,trusted=True)==expected_trust and
             read_file(MANIFEST_RECEIPT,65536,trusted=True)==install_receipt(a.approved_manifest_sha256,a.controller_sha,targets),"ROOT_INSTALL_INCOMPLETE")
        print("PASS: ROOT_HELPERS_MATCH_FINAL_REVIEWED_MANIFEST; SSH_FINANCE_RELEASE_NOT_ATTESTED");return
    need(a.mode in ("install","rollback"),"UNKNOWN_MUTATION")
    approval_sha=permit(a.mode,a.approved_manifest_sha256,a.controller_sha)
    typed_consent(a.mode,a.controller_sha)
    # All native identity and source guards repeated after owner consent.
    need(native_lock_and_keys()==before,"LOCK_ANCESTRY_CHANGED_DURING_APPROVAL")
    inspect_dest(payloads)
    consume_permit(approval_sha,a.mode,a.approved_manifest_sha256)
    if a.mode=="install":
        need(not present and not TRUST.exists() and not MANIFEST_RECEIPT.exists(),"EXISTING_ROOT_INSTALL_REQUIRES_NEW_REVIEW")
        created=[]
        try:
            if not DEST.exists():
                protected(DEST.parent);os.mkdir(DEST,0o755);created.append(DEST)
            protected(DEST)
            for name,raw in sorted(payloads.items()):
                p=DEST/name
                mode=0o555 if name=="solo-v1-native-admission" else (0o755 if name=="solo-v1-producer-intake" else 0o600)
                write_new(p,raw,mode);created.append(p)
            write_new(TRUST,expected_trust);created.append(TRUST)
            write_new(MANIFEST_RECEIPT,install_receipt(a.approved_manifest_sha256,a.controller_sha,targets));created.append(MANIFEST_RECEIPT)
            need(native_lock_and_keys()==before,"LOCK_CHANGED_AFTER_HELPERS")
            print("PASS: ROOT_HELPERS_INSTALLED; SSH_KEYS_NOT_ENROLLED; NATIVE_FINANCE_STILL_HOLD")
        except BaseException:
            # Before completed receipt, best-effort revert exactly created
            # paths only. Never mutate the original release.lock or keys.
            for p in reversed(created):
                try:
                    if p.is_dir():p.rmdir()
                    else:p.unlink()
                except OSError:pass
            raise
    else:
        check_absent_ssh()
        assert_original_lease_idle()
        need(not absent and TRUST.exists() and MANIFEST_RECEIPT.exists(),"ROOT_ROLLBACK_INCOMPLETE_SOURCE")
        # Roll back only exact newly installed bytes; never touch other root
        # commands, SSH configuration, source archive, lock or parent hardening.
        for name,raw in sorted(payloads.items()):
            need(read_file(DEST/name,1024*1024,trusted=True)==raw,"ROLLBACK_INSTALLED_BYTES_DRIFT")
        for name in sorted(payloads,reverse=True): (DEST/name).unlink()
        TRUST.unlink();MANIFEST_RECEIPT.unlink()
        need(native_lock_and_keys()==before,"ORIGINAL_LOCK_DRIFT_AFTER_ROLLBACK")
        print("PASS: EXACT_ROOT_HELPERS_ROLLED_BACK; ORIGINAL_LOCK_AND_SSH_PRESERVED")

def main(argv=None):
    p=argparse.ArgumentParser()
    p.add_argument("mode",choices=("build","plan","install","verify","rollback"))
    p.add_argument("--repo");p.add_argument("--output-dir");p.add_argument("--controller-sha")
    p.add_argument("--manifest");p.add_argument("--bundle");p.add_argument("--approved-manifest-sha256")
    a=p.parse_args(argv)
    if a.mode=="build":
        need(bool(a.repo and a.output_dir and a.controller_sha),"BUILD_PARAMETERS_REQUIRED")
        need(os.geteuid()!=0,"BUILD_MUST_BE_UNPRIVILEGED")
        build(a.repo,a.controller_sha,a.output_dir)
    else:
        need(bool(a.manifest and a.bundle and a.controller_sha),"NATIVE_PARAMETERS_REQUIRED")
        run_native(a)
if __name__=="__main__":
    try:main()
    except (Hold,OSError,ValueError,KeyError,TypeError,tarfile.TarError,
            subprocess.SubprocessError,EOFError,AttributeError) as e:
        print("HOLD:"+str(e),file=sys.stderr);sys.exit(2)
