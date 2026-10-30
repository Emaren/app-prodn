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

def verify_financial_identity(finance):
    """Full current Wolo/HD/DE/staking/settlement/custody identity or HOLD."""
    import re
    hex64=re.compile(r"[a-f0-9]{64}\Z")
    def digest64(x):
        return type(x)is str and bool(hex64.fullmatch(x))
    protected=finance.get("protected")
    need(type(protected)is dict and
         set(protected)=={"8092","8093","writers"},
         "absent/extra protected finance identity groups")
    fields=("pid","start_time_ticks","uid","cgroup_sha256",
            "executable_sha256","unit_sha256","dropin_sha256",
            "environment_sha256","config_sha256","source_sha256")
    def identity(value,label):
        need(type(value)is dict and all(key in value for key in fields),
             "missing process identity: "+label)
        need(type(value["pid"])is int and value["pid"]>1 and
             type(value["start_time_ticks"])is int and
             value["start_time_ticks"]>0 and
             type(value["uid"])is int and value["uid"]>=0 and
             all(digest64(value[key]) for key in fields[3:]),
             "incomplete/executable-changed process: "+label)
    for port in ("8092","8093"):
        record=protected[port]
        identity(record,port)
        need(record.get("count")==1,
             "ambiguous multiple protected listener on "+port)
    writers=protected["writers"]
    need(type(writers)is dict and all(digest64(writers.get(k)) for k in
         ("hd_sha256","de_sha256","settlement_sha256",
          "staking_sha256","custody_sha256")),
         "missing required HD/DE/staking/settlement/custody state hashes")
    processes=writers.get("processes")
    required=("hd","de","settlement","staking","custody",
              "bet-stake-reconcile","challenge-reconcile",
              "replay-auto-recovery","trophy-tributes",
              "wolo-transfer-heartbeat")
    need(type(processes)is dict and set(processes)==set(required),
         "missing financial producer/process identity")
    for name in required:
        identity(processes[name],name)
    exposure=finance.get("exposure")
    need(type(exposure)is dict and all(digest64(exposure.get(k))
         for k in ("balances_sha256","pending_transactions_sha256",
                   "fees_sha256","liabilities_sha256",
                   "withdrawals_sha256","unknown_status_sha256",
                   "writer_db_state_sha256")),
         "financial balances/pending/UNKNOWN ledger proof incomplete")
    need(digest64(finance.get("native_receipt_sha256")) and
         finance.get("financial_movement_authorized") is False and
         finance.get("wolo_finance_p1")=="HOLD",
         "financial release or native receipt not authorized")
    # Role hashes alone do not enumerate the actual systemd units/oneshots.
    from aoe2_solo_website_financial_proof import verify_writer_census
    verify_writer_census(finance)
    return protected

def validate_stage_boundary(stage,phase,candidate,*,post_stage=False):
    need(type(stage)is dict, "native stage receipt class missing")
    if phase in ("PRE_ACTIVATE","POST_ROLLBACK") or post_stage:
        need(stage.get("status")=="STAGED" and
             stage.get("origin")=="HEL1_DURABLE_PROTECTED_STORE" and
             stage.get("release_sha")==candidate and
             type(stage.get("receipt"))is dict and
             type(stage.get("staged_build_id"))is str and
             bool(stage.get("staged_build_id")) and
             all(type(stage.get(k))is str and len(stage[k])==64 and
                 all(c in "0123456789abcdef" for c in stage[k])
                 for k in ("receipt_sha256","artifact_sha256",
                           "node_modules_sha256")) and
             stage["receipt"].get("artifact_sha256")==stage["artifact_sha256"] and
             stage["receipt"].get("candidate_node_modules_sha256")==
                 stage["node_modules_sha256"] and
             stage["receipt"].get("staged_build_id")==stage["staged_build_id"] and
             stage["receipt"].get("release_sha")==candidate,
             "native raw stage/artifact/dependency/BUILD_ID conflict")
    else:
        need(phase=="PRE_STAGE" and stage.get("status") in ("NOT_STAGED","UNKNOWN"),
             "PRE_STAGE cannot impersonate prior durable artifact")
    return True

def audit(candidate,phase,attempt,*,post_stage=False):
    owner_approved_installed_binary(candidate)
    # The pinned tool MUST validate signed B/C/E class+third-host evidence
    # and collect genuine current HEL1 snapshots, not owner-supplied JSON.
    result=subprocess.run([str(PROGRAM),"--read-only","--candidate",candidate,
                           "--phase",phase,"--attempt",attempt,
                           "--boundary","post-stage"if post_stage else "pre-phase"],
                          stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,
                          stderr=subprocess.PIPE,timeout=20,check=False)
    need(result.returncode==0 and 0<len(result.stdout)<=262144,
         "independent physical native audit HOLD")
    report=parse(result.stdout)
    need(set(report)=={"schema","policy","status","candidate_sha","phase",
                      "attempt_id","observed_at","doctor",
                      "recovery","finance","rollback","source_scope",
                      "mount","stage","receipt_provenance"},
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
    need(type(f)is dict,"financial native evidence absent")
    verify_financial_identity(f)
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
    validate_stage_boundary(report["stage"],phase,candidate,post_stage=post_stage)
    need(type(report["source_scope"])is dict and
         report["source_scope"].get("status")=="INDEPENDENTLY_REVIEWED",
         "source/gate/finance transitive closure missing")
    need(type(report["receipt_provenance"])is dict and
         report["receipt_provenance"].get("signed_source_receipts_verified")is True and
         report["receipt_provenance"].get("original_root_measurements")is True,
         "no authenticated producer evidence")
    from aoe2_solo_website_producer_receipts import verify_all
    verify_all(report)  # independent root-enrolled signed producer bytes
    # The native source signer must bind a recomputed transitive graph,
    # including GET/HEAD and prewarm effects, to this exact signed census.
    from aoe2_solo_website_financial_proof import verify_installed_source_review
    reviewed=pathlib.Path("/etc/aoe2war/solo-owner-website-v1/source-reviews") / (candidate+".json")
    # Independently enrolled root-protected review must contain real matching
    # closure and GET/HEAD/prewarm digests. It cannot be a status-only claim.
    verify_installed_source_review(report, protected(reviewed,65536))
    return report
