"""Root-only native audit adapter: approved binary bytes and owner-approved pin.

NOT an attestation generator. The installed B/C/E/Doctor/restore auditor must
be separately reviewed, have actual native signed receipts and be explicitly
owner-enrolled. Root-authenticated JSON fields by themselves cannot pass.
"""
from __future__ import annotations
import base64, hashlib, json, os, pathlib, stat, subprocess
from aoe2_solo_website_root_phase import (
    POLICY, KEY, DOMAIN, Hold, need, canonical, digest, parse, trusted_key,
)
APPROVED=pathlib.Path("/etc/aoe2war/solo-owner-website-v1/native-audit-approval.json")
PROGRAM=pathlib.Path("/usr/local/libexec/aoe2war/solo-v1-native-admission")
# Audit policy is cryptographically distinct from per-attempt release consent.
APPROVAL_DOMAIN=b"AOE2WAR.SOLO_OWNER.NATIVE_AUDIT_INSTALL.V1\n"

def protected(path, max_size):
    need(path.is_absolute() and not path.is_symlink(),"linked native audit trust")
    for item in (path,*path.parents):
        need(not item.is_symlink(),"native audit linked ancestor")
        info=item.stat()
        need(info.st_uid==0 and not info.st_mode&0o022,"untrusted native auditor parent")
    s=path.stat()
    need(stat.S_ISREG(s.st_mode) and 0<s.st_size<=max_size,"invalid audit file")
    return path.read_bytes()

def owner_approved_installed_binary(candidate):
    envelope=parse(protected(APPROVED,65536))
    need(set(envelope)=={"schema","policy","payload","signature_base64"}and
         envelope["schema"]==1 and envelope["policy"]==POLICY and
         type(envelope["payload"])is dict,"audit installation authorization absent")
    body=envelope["payload"]
    need(set(body)=={"kind","candidate_sha","binary_sha256","approved_at",
                     "reviewed_controller_sha256","review_url","finance_release_authorized"}and
         body.get("kind")=="aoe2war.solo.native-audit.install.v1" and
         body["candidate_sha"]==candidate and
         body.get("finance_release_authorized")is False and
         body.get("review_url","").startswith("https://github.com/Emaren/app-prodn/pull/"),
         "unreviewed binary scope")
    from aoe2_solo_website_root_phase import verify_signature
    # Distinct signing domain prevents reuse of a release PRE_STAGE packet.
    try:signature=base64.b64decode(envelope["signature_base64"],validate=True)
    except (ValueError,TypeError)as exc:raise Hold("audit owner signature invalid")from exc
    trusted_key()
    import tempfile
    with tempfile.TemporaryDirectory(prefix="solo-native-install-")as temp:
        msg,path=pathlib.Path(temp)/"msg",pathlib.Path(temp)/"sig"
        msg.write_bytes(APPROVAL_DOMAIN+canonical(body))
        path.write_bytes(signature)
        p=subprocess.run(["/usr/bin/openssl","dgst","-sha256","-verify",str(KEY),
                          "-signature",str(path),str(msg)],capture_output=True,timeout=10)
    need(p.returncode==0,"owner did not approve exact native auditor binary")
    binary=protected(PROGRAM,262144)
    need(digest(binary)==body["binary_sha256"],"installed native audit binary drift")
    return binary

def audit(candidate,phase,attempt):
    owner_approved_installed_binary(candidate)
    # The pinned tool MUST validate signed B/C/E class+third-host evidence
    # and collect genuine current HEL1 snapshots, not owner-supplied JSON.
    result=subprocess.run([str(PROGRAM),"--read-only","--candidate",candidate,
                           "--phase",phase,"--attempt",attempt],
                          stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,
                          stderr=subprocess.PIPE,timeout=20,check=False)
    need(result.returncode==0 and 0<len(result.stdout)<=262144,
         "independent physical native audit HOLD")
    report=parse(result.stdout)
    need(set(report)=={"schema","policy","status","candidate_sha","phase",
                      "attempt_id","observed_at","doctor",
                      "recovery","finance","rollback","source_scope",
                      "mount","receipt_provenance"},
         "missing native audit evidence fields")
    need(report["schema"]==1 and report["policy"]==POLICY and
         report["status"]=="INDEPENDENT_NATIVE_VERIFIED" and
         report["candidate_sha"]==candidate and report["phase"]==phase and
         report["attempt_id"]==attempt,"foreign audit claim")
    from aoe2_solo_website_root_phase import utc
    from datetime import datetime,timezone,timedelta
    now=datetime.now(timezone.utc)
    need(timedelta(0)<=now-utc(report["observed_at"])<=timedelta(seconds=120),
         "native evidence stale")
    d=report["doctor"];r=report["recovery"];f=report["finance"]
    m=report["mount"];rb=report["rollback"]
    need(type(d)is dict and d.get("p0")==d.get("p1")==0 and
         d.get("signed")==True and type(d.get("native_receipt_sha256"))is str,
         "unsigned or failing Doctor")
    classes={"APP_DB","TRAFFIC_SQLITE_WAL","WOLO_CONSENSUS_FINANCE",
             "LOOP4_FINANCIAL","WATCHER_REPLAY_MEDIA",
             "RELEASE_ROLLBACK_CONFIG"}
    need(type(r)is dict and r.get("status")=="PHYSICALLY_ACCEPTED"and
         set(r.get("isolated_restored_classes",[]))==classes and
         r.get("different_physical_restore_host")is True and
         type(r.get("offhost_encrypted_readback_receipt_sha256"))is str,
         "missing full actual independent recovery")
    need(type(f)is dict and f.get("financial_movement_authorized")is False and
         f.get("wolo_finance_p1")=="HOLD" and type(f.get("protected"))is dict and
         type(f.get("native_receipt_sha256"))is str,
         "unsigned protected Wolo/HD/DE/settlement/custody identity")
    need(type(m)is dict and m.get("host")=="ubuntu-4gb-hel1-11" and
         m.get("mount")=="/mnt/HC_Volume_105319120" and m.get("mounted")is True and
         type(m.get("free_bytes"))is int and m["free_bytes"]>=30*2**30 and
         type(m.get("effective_used_pct"))in(int,float)and
         m["effective_used_pct"]<=88 and
         type(m.get("finish_used_pct"))in(int,float)and
         m["finish_used_pct"]<92,"physical volume gate")
    need(type(rb)is dict and rb.get("preserved")is True and
         type(rb.get("active_build_id"))is str and
         type(rb.get("previous_source_sha"))is str,
         "unsigned rollback evidence")
    need(type(report["source_scope"])is dict and
         report["source_scope"].get("status")=="INDEPENDENTLY_REVIEWED",
         "source/gate/finance transitive closure missing")
    need(type(report["receipt_provenance"])is dict and
         report["receipt_provenance"].get("signed_source_receipts_verified")is True and
         report["receipt_provenance"].get("original_root_measurements")is True,
         "no authenticated producer evidence")
    return report
