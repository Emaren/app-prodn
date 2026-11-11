#!/usr/bin/env python3
"""Concrete bounded Linux host adapter for B's V22 SOURCE_INSTALL coordinator.

REVIEW ONLY. Not root-installed, not approved, not wired to an executable CLI.
All mutations are reached ONLY through methods called by a separately source-
pinned and Central-admitted root wrapper. No FINANCIAL file/SQL/key reads and
NO 3032/3030/3033/PAPER service changes, nft writes or nginx modifications.
"""
from __future__ import annotations

from contextlib import contextmanager
import datetime as dt
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
from urllib.request import Request, urlopen

HERE=Path(__file__).resolve().parent

def fixed_sibling(filename, name):
    p=HERE/filename
    spec=importlib.util.spec_from_file_location(name,p)
    if not spec or not spec.loader:raise RuntimeError("HOLD:SOURCE_MODULE_MISSING")
    mod=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

policy=fixed_sibling("r25_v22_root_install_admission_REVIEW_ONLY.py","b_v22_install_policy")
sigverify=fixed_sibling("r25_b_v22_central_signature_REVIEW_ONLY.py","b_v22_central_sig")
txn=fixed_sibling("r25_v22_three_source_transaction_REVIEW_ONLY.py","b_v22_transaction")

ROOT=Path("/root/aoe2war-b-v22-three-source-install-v1")
INPUT=ROOT/"packet.json"
OWNER=ROOT/"owner-receipt.json"
TRANS=ROOT/"transaction"
CENTRAL_COMMENT_API="https://api.github.com/repos/Emaren/app-prodn/issues/comments/"
LOCK=Path("/etc/aoe2war/web-prod-v22/steam-refresh-v22.lock")
TIMER="aoe2war-steam-egress-refresh.timer"
SERVICE="aoe2war-steam-egress-refresh.service"
V22=txn.PRODUCTION_TARGETS["v22"]
V20=Path("/usr/local/lib/aoe2war-web-prod/r25_steam_refresh_traffic_v20.py")
STAGE=Path("/var/lib/aoe2war-public-player-6662c33a-one-use-v1/events/0003.json")
WEB_UNIT=Path("/etc/systemd/system/aoe2hdbets-web-prod.service")
STEAM_UNIT=Path("/etc/systemd/system/aoe2war-steam-egress-refresh.service")
STEAM_TIMER_UNIT=Path("/etc/systemd/system/aoe2war-steam-egress-refresh.timer")
LOCK_DROPIN=Path("/etc/systemd/system/aoe2war-steam-egress-refresh.service.d/50-r25-v22-lock-only.conf")
GUARD=Path(policy.FENCE)
SENTINEL=Path(policy.SENTINEL)

def hold(tag):raise RuntimeError("HOLD:B_V22_HOST_"+tag)
def check(ok,tag):
    if not ok:hold(tag)
def sha(path:Path)->str:
    h=hashlib.sha256()
    fd=os.open(path,os.O_RDONLY|os.O_CLOEXEC|os.O_NOFOLLOW)
    with os.fdopen(fd,"rb") as f:
        for block in iter(lambda:f.read(65536),b""):h.update(block)
    return h.hexdigest()
def call(argv,timeout=35,expected=(0,)):
    p=subprocess.run(argv,capture_output=True,text=True,timeout=timeout)
    check(p.returncode in expected,"COMMAND_"+Path(argv[0]).name+"_"+str(p.returncode))
    return p.stdout
def systemctl_show(unit,prop):
    return call(["/usr/bin/systemctl","show",unit,"-p",prop,"--value"],12).strip()
def root_dir(p):
    st=p.lstat()
    check(stat.S_ISDIR(st.st_mode) and st.st_uid==0
          and stat.S_IMODE(st.st_mode)==0o700,"ROOT_DIR_"+p.name)
def root_source(p,mode=0o500):
    st=p.lstat()
    check(stat.S_ISREG(st.st_mode) and st.st_uid==0 and st.st_nlink==1
          and stat.S_IMODE(st.st_mode)==mode,"ROOT_SOURCE_"+p.name)
def b_value(path):
    return txn.strict_file(path,require_uid=0,require_mode=0o600,max_size=64_000)
def strict_json(raw):
    def no_duplicate_items(pairs):
        result={}
        for key,val in pairs:
            check(key not in result,"DUPLICATE_JSON_KEY")
            result[key]=val
        return result
    return json.loads(raw,object_pairs_hook=no_duplicate_items)
def root_stage():
    p=ROOT/"reviewed"
    root_dir(p)
    return {name:p/(name+".new.py") for name in txn.ORDER}

class HEL1SourceInstallHost:
    """Actual host methods; requires independently installed immutable root code."""
    def __init__(self):
        self.packet=None
        self.packet_hash=None
        self.owner_hash=None
        self.before=None

    def require_immutable_root_executor(self):
        check(os.geteuid()==0,"ROOT_REQUIRED")
        root_dir(ROOT)
        root_dir(TRANS)
        check(TRANS.stat().st_uid==0 and not any(TRANS.iterdir()),
              "UNCONSUMED_TRANSACTION_STATE_REQUIRED")
        for source in (
            "r25_b_v22_linux_host_adapter_REVIEW_ONLY.py",
            "r25_b_v22_source_install_coordinator_REVIEW_ONLY.py",
            "r25_v22_root_install_admission_REVIEW_ONLY.py",
            "r25_b_v22_central_signature_REVIEW_ONLY.py",
            "r25_v22_three_source_transaction_REVIEW_ONLY.py",
        ):
            root_source(HERE/source)
        st=HERE.lstat()
        check(stat.S_ISDIR(st.st_mode) and st.st_uid==0
              and not stat.S_IMODE(st.st_mode)&0o022,
              "ROOT_EXECUTOR_PARENT")
        root_source(INPUT,0o600)
        root_source(OWNER,0o600)
        # Independent Central signer is an external offline authority.
        # Its private key is never resident on this host.
        root_dir(sigverify.CENTRAL_OFFLINE_PUBLIC_PEM.parent)
        root_source(sigverify.CENTRAL_OFFLINE_PUBLIC_PEM,0o400)
        root_source(sigverify.CENTRAL_EXPECTED_MESSAGE,0o400)
        root_source(sigverify.CENTRAL_DETACHED_SIGNATURE,0o400)

    def validate_root_packet_and_independent_central(self):
        packet_bytes=b_value(INPUT)
        owner_bytes=b_value(OWNER)
        self.packet_hash=hashlib.sha256(packet_bytes).hexdigest()
        self.owner_hash=hashlib.sha256(owner_bytes).hexdigest()
        self.packet=strict_json(packet_bytes)
        owner=strict_json(owner_bytes)
        check(owner.get("schema")=="aoe2war.b.v22.owner-one-use-receipt.v1"
              and owner.get("scope")=="SOURCE_INSTALL_ONLY"
              and owner.get("approval")=="OWNER_LOCAL_INTERACTIVE_ROOT"
              and owner.get("financial_authorized") is False,
              "OWNER_RECEIPT_SCOPE")
        check(self.packet.get("central_comment_id") is not None
              and type(self.packet["central_comment_id"]) is int
              and self.packet["central_comment_id"]>=6000000000,
              "CENTRAL_COMMENT_ID")
        url=CENTRAL_COMMENT_API+str(self.packet["central_comment_id"])
        req=Request(url,headers={"Accept":"application/vnd.github+json",
                                 "User-Agent":"AoE2WAR-B-Source-Install-ReadOnly/1"})
        with urlopen(req,timeout=9) as stream:
            check(stream.status==200 and stream.geturl()==url,
                  "CENTRAL_API_TLS_OR_REDIRECT_STATUS")
            body=stream.read(32769)
        check(len(body)<=32768,"CENTRAL_API_TOO_LARGE")
        central=strict_json(body)
        independent=sigverify.verify_central_detached_signature(
            public_key=sigverify.CENTRAL_OFFLINE_PUBLIC_PEM,
            message=sigverify.CENTRAL_EXPECTED_MESSAGE,
            signature=sigverify.CENTRAL_DETACHED_SIGNATURE,
            exact_github_comment_body=central.get("body","").encode(),
            expected_public_sha256=sigverify.CENTRAL_OFFLINE_PUBLIC_KEY_SHA256,
            trusted_uid=0,openssl="/usr/bin/openssl")
        result=policy.validate_packet(
            self.packet,
            now=dt.datetime.now(dt.timezone.utc),
            root_bytes_sha=sha(HERE/"r25_b_v22_linux_host_adapter_REVIEW_ONLY.py"),
            actual_boot=Path("/proc/sys/kernel/random/boot_id").read_text().strip(),
            actual_host=os.uname().nodename,
            central_comment=central,
            packet_sha=self.packet_hash,
            owner_receipt_sha=self.owner_hash,
            actual_module_shas={
                name:sha(HERE/name)
                for name in (
                    "r25_b_v22_linux_host_adapter_REVIEW_ONLY.py",
                    "r25_b_v22_source_install_coordinator_REVIEW_ONLY.py",
                    "r25_v22_root_install_admission_REVIEW_ONLY.py",
                    "r25_b_v22_central_signature_REVIEW_ONLY.py",
                    "r25_v22_three_source_transaction_REVIEW_ONLY.py",
                )
            },
            actual_signer_key_sha=sigverify.CENTRAL_OFFLINE_PUBLIC_KEY_SHA256,
            signed_central_proof=independent,
            consumed=bool(list(TRANS.iterdir())),
        )
        check(result.get("status")=="PASS_EXACT_CENTRAL_SOURCE_INSTALL_POLICY_ONLY",
              "CENTRAL_SOURCE_INSTALL_NOT_ADMITTED")
        for name, path in root_stage().items():
            root_source(path,0o400)
            check(sha(path)==policy.PINNED[name][1],"NEW_SOURCE_BYTES_"+name)
        return result

    @contextmanager
    def held_original_v22_flock(self):
        st=LOCK.lstat()
        check(stat.S_ISREG(st.st_mode) and st.st_uid==0
              and st.st_nlink==1 and stat.S_IMODE(st.st_mode)==0o600
              and st.st_size<=4096,"SHARED_LOCK_PROVENANCE")
        fd=os.open(LOCK,os.O_RDWR|os.O_CLOEXEC|os.O_NOFOLLOW)
        try:
            fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
            got=os.fstat(fd)
            check((got.st_dev,got.st_ino)==(st.st_dev,st.st_ino),
                  "SHARED_LOCK_INODE_CHANGED")
            yield
        except BlockingIOError:
            hold("STEAM_REFRESH_ALREADY_HOLDS_FLOCK")
        finally:
            fcntl.flock(fd,fcntl.LOCK_UN)
            os.close(fd)

    def require_steam_oneshot_quiescent(self):
        check(systemctl_show(SERVICE,"ActiveState")=="inactive"
              and systemctl_show(SERVICE,"MainPID")=="0",
              "NATIVE_REFRESH_RUNNING")

    def verify_root_v20_inverse(self):
        check(sha(V20)==policy.V20_SHA,"ORIGINAL_V20_SOURCE_CHANGED")
        inverse=Path("/etc/aoe2war/web-prod-v22/original-steam-v20.service")
        root_source(inverse,0o400)
        check(sha(inverse)=="b976a10d5cc8b3c199974f1b85a912a67323e8b57b4f69325a1061428d20deb2",
              "ORIGINAL_V20_UNIT_INVERSE")

    def _snapshot(self):
        expected=policy.PID_BASE
        pids={}
        restarts={}
        for name in expected:
            check(systemctl_show(name,"ActiveState")=="active",
                  "PROTECTED_SERVICE_INACTIVE_"+name)
            pids[name]=int(systemctl_show(name,"MainPID"))
            restarts[name]=int(systemctl_show(name,"NRestarts"))
            check(systemctl_show(name,"NeedDaemonReload")=="no",
                  "PROTECTED_UNIT_PENDING_RELOAD_"+name)
        finance=[]
        listeners=call(["/usr/bin/ss","-H","-lnt"],12)
        for port in (8092,8093,8094,8095):
            if any(re.search(r":"+str(port)+r"$",row.split()[3])
                   for row in listeners.splitlines() if len(row.split())>=4):
                finance.append(port)
        masks={}
        for unit in ("wolochain-mainnet-settlement.service",
                     "wolochain-founder-rewards-settlement.service"):
            masks[unit]=(systemctl_show(unit,"LoadState")=="masked"
                         and systemctl_show(unit,"ActiveState")=="inactive"
                         and systemctl_show(unit,"MainPID")=="0")
        nginx=call(["/usr/sbin/nginx","-T"],15)
        def http(port,path):
            raw=call(["/usr/bin/curl","-sS","--noproxy","*","-m","8",
                      "-o","/dev/null","-w","%{http_code}",
                      f"http://127.0.0.1:{port}{path}"],12)
            return int(raw.strip())
        return {
          "host":os.uname().nodename,
          "boot":Path("/proc/sys/kernel/random/boot_id").read_text().strip(),
          "pids":pids, "nrestarts":restarts, "finance_listeners":finance,
          "c04_masked":masks,
          "nginx_selectors":nginx.count("proxy_pass http://127.0.0.1:3032"),
          "original_unit_sha256":sha(WEB_UNIT),
          "stage0003_sha256":sha(STAGE),
          "v20_sha256":sha(V20),
          "steam_unit_sha256":sha(STEAM_UNIT),
          "steam_timer_unit_sha256":sha(STEAM_TIMER_UNIT),
          "steam_lock_dropin_sha256":sha(LOCK_DROPIN),
          "steam_source_sha256":sha(Path(V22)),
          "public_3032_http":http(3032,"/players"),
          "original_3030_http":http(3030,"/players"),
          "public_bets_http":http(3032,"/api/bets"),
          "emergency_3033_http":http(3033,"/players"),
          "manager_reload_pending":(
            systemctl_show(SERVICE,"NeedDaemonReload")!="no"),
          "steam_timer_active":systemctl_show(TIMER,"ActiveState")=="active",
        }

    def verify_seven_pid_c04_finance_original_preflight(self):
        self.before=self._snapshot()
        policy.validate_protected_snapshot(self.before,self.before)
        check(self.before["steam_source_sha256"]==policy.PINNED["v22"][0],
              "OLD_NATIVE_V22_UNEXPECTED")

    def install_exact_persistent_condition_guard(self):
        check(not GUARD.exists() and not GUARD.is_symlink(),"FENCE_EXISTS_ALREADY")
        # Exact 60 override added alongside original protected 50 lock drop-in;
        # persistent condition survives host crash/reboot.
        txn.create_once(GUARD,policy.FENCE_BODY,mode=0o644)
        check(sha(GUARD)==policy.FENCE_SHA,"FENCE_CONTENT_UNEXPECTED")

    def daemon_reload_and_prove_negative_condition(self):
        call(["/usr/bin/systemctl","daemon-reload"],35)
        effective=call(["/usr/bin/systemctl","cat",SERVICE],10)
        check(effective.count(policy.FENCE_BODY.decode())==1
              and systemctl_show(SERVICE,"NeedDaemonReload")=="no",
              "FENCE_NOT_EFFECTIVE_IN_SYSTEMD")

    def create_root_only_install_sentinel(self):
        check(not SENTINEL.exists() and not SENTINEL.is_symlink(),
              "EXISTING_INSTALL_IN_PROGRESS")
        txn.create_once(SENTINEL,txn.canonical({
            "schema":"aoe2war.b.v22.source-install-failclosed-sentinel.v1",
            "packet_sha256":self.packet_hash,
            "owner_receipt_sha256":self.owner_hash,
            "financial_authorized":False,
            "public_activation":False,
        }),mode=0o600)
        check(systemctl_show(SERVICE,"NeedDaemonReload")=="no",
              "SYSTEMD_MANAGER_NOT_CURRENT")

    def stop_only_existing_steam_timer(self):
        check(SENTINEL.exists() and GUARD.exists(),"MISSING_PERSISTENT_FENCE")
        call(["/usr/bin/systemctl","stop",TIMER],35)
        check(systemctl_show(TIMER,"ActiveState")=="inactive",
              "TIMER_NOT_STOPPED")

    def native_new_v22_selftest_and_original_profile(self):
        check(sha(Path(V22))==policy.PINNED["v22"][1],"NEW_SOURCE_NOT_INSTALLED")
        for name,path in txn.PRODUCTION_TARGETS.items():
            check(sha(Path(path))==policy.PINNED[name][1],
                  "MIXED_SOURCE_"+name)
        result=call(["/usr/bin/python3","-I","-B",V22,"--phase","selftest"],60)
        check("PASS_STEAM_V22_IMMUTABLE_V20_AND_TWO_EXACT_PROFILE_PROOFS" in result,
              "NATIVE_V22_SELFTEST")
        check(sha(V20)==policy.V20_SHA,"V20_BINARY_CHANGED_POST")
        inspect=call(["/usr/bin/python3","-I","-B",V22,"--phase","inspect"],60)
        profile=json.loads(inspect)
        check(profile.get("status")=="PASS_STEAM_V22_PROTECTED_READONLY"
              and profile.get("active_profile")=="rollback"
              and profile.get("finance_authorized") is False,
              "ORIGINAL_V22_PROFILE_READONLY_NOT_ADMITTED")

    def verify_seven_pid_c04_finance_original_postflight(self):
        # During source swap timer is intentionally inactive under persistent
        # fence. Validate every other protected property before un-fencing.
        observed=self._snapshot()
        # The service is still under the durable source-install guard, timer
        # intentionally OFF; this distinct admission mode must check that
        # physical OFF state rather than counterfeit an active timer.
        policy.validate_protected_snapshot(
            self.before,observed,timer_can_be_paused=True)
        check(observed["steam_source_sha256"]==policy.PINNED["v22"][1],
              "NEW_NATIVE_SOURCE_NOT_EXACT")

    def seal_source_install_receipt_no_activation(self):
        receipt=ROOT/"source-installed-not-activated.json"
        check(self.packet_hash is not None,"NO_PACKET_AUTH")
        txn.create_once(receipt,txn.canonical({
            "schema":"aoe2war.b.v22.installed-source-not-public.v1",
            "packet_sha256":self.packet_hash,
            "source_shas":{k:v[1] for k,v in policy.PINNED.items()},
            "native_selftest":True,
            "financial_authorized":False,
            "public_activation":False,
        }),mode=0o600)

    def remove_exact_sentinel(self):
        raw=b_value(SENTINEL)
        obj=strict_json(raw)
        check(obj["packet_sha256"]==self.packet_hash,
              "SENTINEL_NOT_OWNED_BY_TRANSACTION")
        SENTINEL.unlink()
        txn.fsync_dir(SENTINEL.parent)

    def remove_own_exact_condition_guard(self):
        check(sha(GUARD)==policy.FENCE_SHA,"FENCE_REPLACED_EXTERNALLY")
        GUARD.unlink()
        txn.fsync_dir(GUARD.parent)

    def daemon_reload_restore_original_effective_unit(self):
        call(["/usr/bin/systemctl","daemon-reload"],35)
        effective=call(["/usr/bin/systemctl","cat",SERVICE],10)
        check(policy.FENCE_BODY.decode() not in effective
              and systemctl_show(SERVICE,"NeedDaemonReload")=="no",
              "FENCE_DID_NOT_RESTORE_ORIGINAL_UNIT")

    def restore_original_steam_timer(self):
        call(["/usr/bin/systemctl","start",TIMER],30)
        check(systemctl_show(TIMER,"ActiveState")=="active","TIMER_NOT_RESTORED")

    def verify_original_seven_pid_and_steam_refresh(self):
        end=self._snapshot()
        # Do not trigger an unapproved live nft/Steam refresh from here.
        policy.validate_protected_snapshot(self.before,end)

    def require_root_recovery_executor(self):
        check(os.geteuid()==0,"RECOVERY_ROOT_REQUIRED")
        root_dir(ROOT);root_dir(TRANS)
        root_source(INPUT,0o600)
        root_source(OWNER,0o600)
        for file in ("r25_b_v22_linux_host_adapter_REVIEW_ONLY.py",
                     "r25_b_v22_source_install_coordinator_REVIEW_ONLY.py",
                     "r25_v22_root_install_admission_REVIEW_ONLY.py",
                     "r25_b_v22_central_signature_REVIEW_ONLY.py",
                     "r25_v22_three_source_transaction_REVIEW_ONLY.py"):
            root_source(HERE/file)
        # Never accept an absent or owner-writable control directory.
        root_dir(HERE)

    def verify_existing_root_transaction_receipt(self):
        root_dir(ROOT);root_dir(TRANS)
        self.packet_hash=sha(INPUT)
        self.owner_hash=sha(OWNER)
        check(not (TRANS/"COMPLETED.json").exists(),
              "NO_INCOMPLETE_TRANSACTION_TO_RECOVER")
        # A crash between persistent sentinel and PREPARE_INTENT has not
        # touched any source: exact old-byte verification is the safe inverse.
        if not (TRANS/"PREPARE_INTENT.json").exists():
            self.verify_no_swap_was_started()
        raw=b_value(SENTINEL)
        marker=strict_json(raw)
        check(marker.get("packet_sha256")==self.packet_hash
              and marker.get("owner_receipt_sha256")==self.owner_hash
              and marker.get("financial_authorized") is False,
              "INVERSE_PROVENANCE_BAD")
        # Recovery is deliberately allowed after permit expiry, but ONLY
        # to exact original bytes already bound by the root receipt.
        self.before=self._snapshot()
        check(self.before["steam_timer_active"] is False,"RECOVERY_TIMER_MUST_BE_PAUSED")

    def require_persistent_guard_and_sentinel(self):
        check(sha(GUARD)==policy.FENCE_SHA,"MISSING_RECOVERY_GUARD")
        check(SENTINEL.exists(),"MISSING_RECOVERY_SENTINEL")
        effective=call(["/usr/bin/systemctl","cat",SERVICE],12)
        check(effective.count(policy.FENCE_BODY.decode())==1
              and systemctl_show(SERVICE,"NeedDaemonReload")=="no",
              "RECOVERY_GUARD_NOT_EFFECTIVE")

    def transaction_has_complete_inverse(self):
        return (TRANS/"PREPARED.json").exists() and (TRANS/"manifest.json").exists()

    def verify_no_swap_was_started(self):
        for key,path in txn.PRODUCTION_TARGETS.items():
            check(sha(Path(path))==policy.PINNED[key][0],
                  "UNPREPARED_RECOVERY_SOURCE_DRIFT_"+key)
        check(not any(TRANS.glob("SWAP_INTENT_*.json")),
              "UNPREPARED_RECOVERY_HAS_SWAP_INTENT")

    def cleanup_exact_abandoned_new_stages(self):
        """Remove only SHA-pinned new-stage residue after original inverse.

        A crash after PREPARE_INTENT but before PREPARED may leave a subset
        of staged files. Unknown bytes, owner, links or source drift HOLD.
        Never delete a working directory or blindly sweep temporary names.
        """
        self.verify_no_swap_was_started()
        for key,path in txn.PRODUCTION_TARGETS.items():
            original=Path(path)
            stage=original.with_name(original.name+".b-v22-new-stage")
            if not stage.exists() and not stage.is_symlink():
                continue
            raw=txn.strict_file(stage,require_uid=0)
            check(hashlib.sha256(raw).hexdigest()==policy.PINNED[key][1],
                  "UNKNOWN_ABANDONED_STAGE_"+key)
            check(stat.S_IMODE(stage.lstat().st_mode)==
                  stat.S_IMODE(original.lstat().st_mode),
                  "ABANDONED_STAGE_MODE_CHANGED_"+key)
            stage.unlink()
            txn.fsync_dir(stage.parent)
        for key in txn.ORDER:
            inverse=TRANS/(key+".inverse")
            if inverse.exists() or inverse.is_symlink():
                check(sha(inverse)==policy.PINNED[key][0],
                      "PARTIAL_INVERSE_BYTES_DRIFT_"+key)
        return True

    def native_original_v22_selftest_and_v20_fallback(self):
        for name,path in txn.PRODUCTION_TARGETS.items():
            check(sha(Path(path))==policy.PINNED[name][0],
                  "OLD_SOURCE_NOT_RESTORED_"+name)
        check(sha(V20)==policy.V20_SHA,"V20_INVERSE_CHANGED")
        raw=call(["/usr/bin/python3","-I","-B",V22,"--phase","selftest"],60)
        check("PASS_STEAM_V22_IMMUTABLE_V20_AND_TWO_EXACT_PROFILE_PROOFS" in raw,
              "ORIGINAL_V22_NATIVE_SELFTEST")

    def verify_original_recovery_protected_postflight(self):
        post=self._snapshot()
        check(post["steam_source_sha256"]==policy.PINNED["v22"][0],
              "RECOVERY_EXPECTED_OLD_SOURCE")
        checked=dict(post)
        checked["steam_timer_active"]=True
        policy.validate_protected_snapshot(checked,post,timer_can_be_paused=True)

    def seal_exact_inverse_receipt(self):
        txn.create_once(ROOT/"source-inverse-complete.json",txn.canonical({
            "schema":"aoe2war.b.v22.exact-original-source-inverse.v1",
            "original_shas":{k:v[0] for k,v in policy.PINNED.items()},
            "original_v20_preserved":True,
            "public_cutover":False,
            "financial_authorized":False,
        }),mode=0o600)

    def make_transaction(self):
        return txn.Transaction(
            {k:Path(p) for k,p in txn.PRODUCTION_TARGETS.items()},
            root_stage(),
            TRANS,
            trusted_uid=0,
        )

if __name__=="__main__":
    print("HOLD:REVIEW_ONLY_NO_LIVE_ROOT_INSTALL_CLI")
    sys.exit(3)
